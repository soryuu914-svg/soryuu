/**
 * 工作区引擎（批 2）—— 统一出口
 *
 * 这里导出的都是**后端无关的纯逻辑**（路径 / 骨架 / 原子写 / workspace.json），
 * 依赖的 `FileSystem` 与 `PathProvider` 由调用方注入。
 *
 * ⛔ **刻意不导出 `./node-fs`**：那个模块依赖 `node:fs/promises`，
 * 一旦被前端代码 import 就会把 Node 内置模块拖进浏览器构建。
 * Node 侧（单测 / 脚本）请直接 `import { nodeFs, nodePaths } from './node-fs'`。
 */

export * from './types';
export * from './paths';
export * from './atomic-write';
export * from './workspace-json';
export * from './skeleton';
// 纯字符串的同步 PathProvider（批 3 新增，零依赖、浏览器/Tauri 通用）
export * from './portable-path';
