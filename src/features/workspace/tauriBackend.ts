/**
 * Tauri 后端实现（批 3b）
 *
 * ★ 硬约束：所有 `@tauri-apps/plugin-*` 与 `@tauri-apps/api/*` 的**运行时**引用
 *   一律走动态 `import()`。
 *
 *   原因：浏览器 dev 下这些包的顶层 import 虽然大概率安全（`invoke` 是调用时才读
 *   `__TAURI_INTERNALS__`），但动态 import 能让「浏览器路径完全不执行任何 Tauri 代码」
 *   成为**可证明的事实**，而不是「估计没问题」。
 *   类型则用 `import type`（编译后完全擦除，不产生运行时 import）。
 */
import pkg from '../../../package.json';
import {
  WORKSPACE_FILE,
  createSkeleton,
  portablePath,
  readWorkspaceMeta,
  workspaceFilePath,
} from '../../workspace';
import { ProbeError } from './types';
import type { FileSystem, SkeletonResult, WorkspaceMeta } from '../../workspace';
import type { WorkspaceProbe } from './types';
import type { Store } from '@tauri-apps/plugin-store';

/** 应用版本号（唯一来源：`package.json`） */
const APP_VERSION: string = pkg.version;

/** plugin-store 的落盘文件（位于 Tauri 的 `appDataDir`，**不在**工作区里） */
const STORE_FILE = 'preferences.json';
const KEY_WORKSPACE_PATH = 'workspacePath';

// ─────────────────────────────────────────────────────────────
// 插件模块懒加载（结果缓存，只 import 一次）
// ─────────────────────────────────────────────────────────────

type FsModule = typeof import('@tauri-apps/plugin-fs');
type StoreModule = typeof import('@tauri-apps/plugin-store');

let fsModulePromise: Promise<FsModule> | null = null;
let storeModulePromise: Promise<StoreModule> | null = null;

function loadFsModule(): Promise<FsModule> {
  fsModulePromise ??= import('@tauri-apps/plugin-fs');
  return fsModulePromise;
}

function loadStoreModule(): Promise<StoreModule> {
  storeModulePromise ??= import('@tauri-apps/plugin-store');
  return storeModulePromise;
}

// ─────────────────────────────────────────────────────────────
// FileSystem（喂给批 2 引擎）
// ─────────────────────────────────────────────────────────────

/** 用 `@tauri-apps/plugin-fs` 实现批 2 的 `FileSystem` 接口 */
export function createTauriFileSystem(): FileSystem {
  return {
    async exists(path) {
      const { exists } = await loadFsModule();
      return exists(path);
    },
    async readTextFile(path) {
      const { readTextFile } = await loadFsModule();
      return readTextFile(path);
    },
    async writeTextFile(path, data) {
      const { writeTextFile } = await loadFsModule();
      await writeTextFile(path, data);
    },
    async mkdir(path, options) {
      const { mkdir } = await loadFsModule();
      await mkdir(path, options);
    },
    async rename(from, to) {
      const { rename } = await loadFsModule();
      await rename(from, to);
    },
    async remove(path, options) {
      const { remove } = await loadFsModule();
      await remove(path, options);
    },
  };
}

const tauriFs: FileSystem = createTauriFileSystem();

// ─────────────────────────────────────────────────────────────
// 探测能力
// ─────────────────────────────────────────────────────────────

/**
 * 造一个基于 Tauri fs 的 probe。
 *
 * ★ `readMeta` 会先把「目录在、但没有 workspace.json」这一种情况翻译成
 *   `ProbeError('no-workspace-file')` —— 因为批 2 的 `readWorkspaceMeta` 在文件不存在时
 *   抛的是 `FileSystem` 的原生错误，门卫无法据此区分「不是工作区」和「读取失败」。
 */
export function createTauriProbe(fs: FileSystem = tauriFs): WorkspaceProbe {
  return {
    exists: (path) => fs.exists(path),
    async readMeta(root: string): Promise<WorkspaceMeta> {
      const metaFile = workspaceFilePath(portablePath, root);
      if (!(await fs.exists(metaFile))) {
        throw new ProbeError(
          'no-workspace-file',
          `这个目录里没有 ${WORKSPACE_FILE}，它还不是一个工作区。`,
        );
      }
      return readWorkspaceMeta(fs, metaFile);
    },
  };
}

export const tauriProbe: WorkspaceProbe = createTauriProbe();

// ─────────────────────────────────────────────────────────────
// store（记住工作区路径）
// ─────────────────────────────────────────────────────────────

let storePromise: Promise<Store> | null = null;

function openStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = loadStoreModule()
      .then(({ load }) => load(STORE_FILE, { autoSave: false }))
      .catch((error: unknown) => {
        storePromise = null; // 失败后允许下次重试
        throw error;
      });
  }
  return storePromise;
}

/** 读上次的工作区路径；没有则返回 `null`。抛错表示 store 本体不可读。 */
export async function readStoredPath(): Promise<string | null> {
  const store = await openStore();
  const value = await store.get<string>(KEY_WORKSPACE_PATH);
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** 记住工作区路径 */
export async function saveStoredPath(path: string): Promise<void> {
  const store = await openStore();
  await store.set(KEY_WORKSPACE_PATH, path);
  // ⚠️ `autoSave` 的默认行为文档表述含糊（这里显式传 false）→ 一律显式 save()
  await store.save();
}

// ─────────────────────────────────────────────────────────────
// dialog + 引擎
// ─────────────────────────────────────────────────────────────

/**
 * 弹目录选择框，返回**规范化后**的绝对路径；用户取消返回 `null`。
 *
 * ★ `recursive: true` 是决定性开关 —— 官方注释原文：
 *   「If `directory` is true, indicates that it will be read recursively later.
 *     Defines whether **subdirectories will be allowed on the scope** or not.」
 *   默认是 `false`（只授权顶层目录），那样连 `<root>/workspace.json` 都写不进去。
 */
export async function pickDirectory(title?: string): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({
    directory: true,
    multiple: false,
    recursive: true,
    title,
  });
  if (picked === null || picked === undefined) return null;
  const path = Array.isArray(picked) ? picked[0] : picked;
  if (typeof path !== 'string' || path.trim() === '') return null;
  return normalizePicked(path);
}

/**
 * 入口处**一次性**异步规范化（Tauri 的 path API 是异步的，每个调用都是一次 IPC）。
 * 此后全程交给同步的 `portablePath`。
 */
async function normalizePicked(picked: string): Promise<string> {
  try {
    const { resolve } = await import('@tauri-apps/api/path');
    const resolved = await resolve(picked);
    return typeof resolved === 'string' && resolved !== '' ? resolved : picked;
  } catch {
    return picked;
  }
}

/** 在工作区根建骨架（写 `workspace.json` + 5 个子目录 + 当天 journal） */
export async function createWorkspaceAt(root: string, name?: string): Promise<SkeletonResult> {
  return createSkeleton(tauriFs, portablePath, root, {
    appVersion: APP_VERSION,
    name,
  });
}

/** 供 UI 显示用：应用版本 */
export const appVersion: string = APP_VERSION;
