/**
 * 工作区引擎 —— Node 版 `FileSystem` / `PathProvider` 实现（批 2 专用）
 *
 * ★ 这个文件 import 了 `node:fs/promises` 与 `node:path`，**只能跑在 Node 里**：
 *   - 单测（vitest）
 *   - "真目录生成骨架"的验证脚本
 *   - 将来的 CLI / 迁移工具
 *   ⛔ 前端代码**不要**从这里 import —— 见 `index.ts` 顶部的说明。
 *
 * Tauri 版实现（`@tauri-apps/plugin-fs` + `@tauri-apps/api/path`）留到批 3，
 * 届时只需再写一个实现同一组接口的模块，引擎与业务代码零改动。
 */

import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { FileSystem, PathProvider } from './types';

/** 用 `node:fs/promises` 实现 `FileSystem`。 */
export function createNodeFileSystem(): FileSystem {
  return {
    async exists(path: string): Promise<boolean> {
      try {
        await stat(path);
        return true;
      } catch {
        // ENOENT 是最常见的情况；其余错误（如 EACCES）也一并当"不可用"，与 Tauri 的 exists() 语义一致
        return false;
      }
    },

    async readTextFile(path: string): Promise<string> {
      return await readFile(path, 'utf8');
    },

    async writeTextFile(path: string, data: string): Promise<void> {
      await writeFile(path, data, 'utf8');
    },

    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
      await mkdir(path, { recursive: options?.recursive ?? false });
    },

    async rename(from: string, to: string): Promise<void> {
      // Node 在 Windows 上走 MoveFileEx(REPLACE_EXISTING) → 能覆盖已存在的目标文件
      await rename(from, to);
    },

    async remove(path: string, options?: { recursive?: boolean }): Promise<void> {
      await rm(path, { recursive: options?.recursive ?? false, force: true });
    },
  };
}

/** 用 `node:path` 实现 `PathProvider`。 */
export function createNodePathProvider(): PathProvider {
  return {
    join: (...parts: string[]): string => join(...parts),
    dirname: (path: string): string => dirname(path),
    basename: (path: string): string => basename(path),
    resolve: (...parts: string[]): string => resolve(...parts),
  };
}

/** 单例，方便脚本直接用。 */
export const nodeFs: FileSystem = createNodeFileSystem();
export const nodePaths: PathProvider = createNodePathProvider();
