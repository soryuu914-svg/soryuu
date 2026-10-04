/**
 * 工作区引擎 —— 目录骨架创建（批 2）
 *
 * 按 `TAURI_WORKSPACE_PLAN.md` §6 建出工作区根：
 *
 * ```
 * <root>/
 * ├─ workspace.json
 * ├─ _library/      # 16 张全局表
 * ├─ books/         # 每作品一个目录
 * ├─ _trash/        # 软删回收站
 * ├─ _journal/      # 落盘日志（另写一条当天的 log）
 * └─ _meta/         # 索引 / 迁移记录
 * ```
 *
 * ★ **骨架边界（批 2 定 v1）**：只建**顶层 6 项**。
 *   `books/<projectId>-<slug>/` 需要 `projectId`，而建骨架时还没有作品
 *   → 作品子目录留到批 4 按需创建（方案文档 R4）。
 *   同理不预建 `_library/local-books/<bookId>/`。
 *
 * 幂等：重复调用不会覆盖已有 `workspace.json`（除非显式 `overwrite: true`），
 * 已存在的目录会被记进 `skipped` 而不是报错。
 */

import { atomicWriteTextFile } from './atomic-write';
import { SKELETON_DIRS, resolveJournalFilePath, workspaceFilePath } from './paths';
import { createWorkspaceMeta, readWorkspaceMeta, writeWorkspaceMeta } from './workspace-json';
import type { FileSystem, PathProvider, WorkspaceMeta } from './types';

export interface CreateSkeletonOptions {
  /** **必填**：写入 `workspace.json` 的应用版本（取自 `package.json` 的 `version`）。 */
  appVersion: string;
  /** 工作区显示名。默认取目录名。 */
  name?: string;
  /** 默认 `WORKSPACE_SCHEMA_VERSION`。 */
  schemaVersion?: number;
  /** 是否写一条 `_journal/<YYYY-MM-DD>.log`（默认 `true`）。 */
  journal?: boolean;
  /** `workspace.json` 已存在时是否覆盖（默认 `false` = 跳过并保留原文件）。 */
  overwrite?: boolean;
  /** 注入当前时间，便于测试。默认 `new Date()`。 */
  now?: Date;
}

export interface SkeletonResult {
  /** 工作区根（原样回传）。 */
  root: string;
  /** 本次**新建**的目录（绝对路径）。 */
  createdDirs: string[];
  /** 本次**新建**的文件（绝对路径）。 */
  createdFiles: string[];
  /** 因为已存在而**没有动过**的路径。 */
  skipped: string[];
  /** 最终生效的 `workspace.json` 内容。 */
  meta: WorkspaceMeta;
  /** `workspace.json` 是否是本次写入的。 */
  metaWritten: boolean;
}

/**
 * 创建工作区骨架。
 *
 * @throws root 为空 / 未提供 appVersion / 已存在的 `workspace.json` 内容非法
 *（最后一种刻意**不静默覆盖** —— 宁可报错，也不要用空骨架盖掉用户数据）
 */
export async function createSkeleton(
  fs: FileSystem,
  paths: PathProvider,
  root: string,
  options: CreateSkeletonOptions,
): Promise<SkeletonResult> {
  if (typeof root !== 'string' || root.trim() === '') {
    throw new Error('createSkeleton: root 不能为空');
  }
  if (typeof options?.appVersion !== 'string' || options.appVersion.trim() === '') {
    throw new Error('createSkeleton: 必须提供非空的 appVersion');
  }

  const now = options.now ?? new Date();

  await fs.mkdir(root, { recursive: true });

  const createdDirs: string[] = [];
  const createdFiles: string[] = [];
  const skipped: string[] = [];

  // ── 1. 5 个子目录
  for (const dir of SKELETON_DIRS) {
    const full = paths.join(root, dir);
    if (await fs.exists(full)) {
      skipped.push(full);
    } else {
      await fs.mkdir(full, { recursive: true });
      createdDirs.push(full);
    }
  }

  // ── 2. workspace.json
  const metaFile = workspaceFilePath(paths, root);
  let meta: WorkspaceMeta;
  let metaWritten = false;

  if (!options.overwrite && (await fs.exists(metaFile))) {
    // 已存在：读回来做一次校验（损坏则抛错，让上层决定怎么处理）
    meta = await readWorkspaceMeta(fs, metaFile);
    skipped.push(metaFile);
  } else {
    meta = createWorkspaceMeta({
      appVersion: options.appVersion,
      name: options.name ?? paths.basename(root),
      schemaVersion: options.schemaVersion,
      now,
    });
    await writeWorkspaceMeta(fs, paths, metaFile, meta);
    createdFiles.push(metaFile);
    metaWritten = true;
  }

  // ── 3. 当天的 journal 文件（可选）
  if (options.journal !== false) {
    const journalFile = resolveJournalFilePath(paths, root, now);
    if (await fs.exists(journalFile)) {
      skipped.push(journalFile);
    } else {
      await atomicWriteTextFile(
        fs,
        paths,
        journalFile,
        `${now.toISOString()} workspace created (schemaVersion=${meta.schemaVersion}, appVersion=${meta.appVersion})\n`,
      );
      createdFiles.push(journalFile);
    }
  }

  return { root, createdDirs, createdFiles, skipped, meta, metaWritten };
}
