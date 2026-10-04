/**
 * 启动门卫 —— 类型定义（批 3b）
 *
 * ★ 本目录（`src/features/workspace/`）是「启动门卫 + 选择 UI」的表现/编排层，
 *   **不是**批 2 的引擎本体。引擎（`src/workspace/`）保持后端无关；
 *   本目录负责：
 *     1. 探测运行环境（Tauri / 浏览器）
 *     2. 读「上次的工作区路径」（Tauri store）
 *     3. 决定启动路径（抽成纯函数，可在 vitest 里跑全部分支）
 *     4. 渲染「选择 / 失效」UI
 */
import type { WorkspaceMeta } from '../../workspace';

/** 门卫所处阶段 */
export type GateStage =
  | 'checking' // 异步校验中（加载态）
  | 'need-select' // 首次启动 / 用户取消 / 主动切换
  | 'invalid' // 有记录但不可用（需用户决策）
  | 'ready' // 校验通过，进入主界面
  | 'bypassed' // 浏览器预览 / kill switch（不阻塞应用）
  | 'error'; // 意外错误（可重试）

/** `invalid` 的具体原因（决定提示文案与引导出口） */
export type InvalidReason =
  | 'missing' // 路径不存在（文件夹被删 / 移走 / 拔盘）
  | 'no-workspace-file' // 路径在，但不是工作区（没有 workspace.json）
  | 'forbidden' // fs 授权丢失（persisted-scope 未生效 / 权限被改）
  | 'corrupt' // workspace.json 解析失败或字段非法
  | 'schema-too-new' // 版本高于当前应用支持
  | 'schema-too-old' // 版本号非法（< 1）
  | 'unknown'; // 其他未预期错误

/** bypass（不阻塞直接进主界面）的原因 */
export type BypassReason = 'browser' | 'kill-switch' | 'store-unreadable';

export interface GateState {
  stage: GateStage;
  /** 当前（或尝试打开的）工作区根路径 */
  workspacePath: string | null;
  meta: WorkspaceMeta | null;
  reason?: InvalidReason;
  /** 面向用户的一句话说明 */
  message?: string;
  bypassReason?: BypassReason;
  /** 关键步骤留痕，用于排查「卡在加载态」这类问题 */
  trace: string[];
}

/** 初始（加载中）状态 */
export const CHECKING_STATE: GateState = {
  stage: 'checking',
  workspacePath: null,
  meta: null,
  trace: [],
};

/**
 * 门卫需要的**最小**探测能力。
 * 抽成接口是为了让 `decideStartup` 能在 vitest 里覆盖全部判定分支，不必真机试错。
 */
export interface WorkspaceProbe {
  exists(path: string): Promise<boolean>;
  /** 读并校验 `<root>/workspace.json`；失败必须抛错（并尽量带上分类信息） */
  readMeta(root: string): Promise<WorkspaceMeta>;
}

/**
 * `probe.readMeta` 用它传递「已分类的失败原因」。
 *
 * 为什么不复用引擎的 `WorkspaceMetaError`：批 2 的 `readWorkspaceMeta(fs, filePath)`
 * 在**文件不存在**时会把 `FileSystem` 的原生错误直接抛出（不做包装），
 * 而「目录在、但没有 workspace.json」恰恰是门卫必须区分的一种情况。
 */
export class ProbeError extends Error {
  readonly reason: InvalidReason;

  constructor(reason: InvalidReason, message: string) {
    super(message);
    this.name = 'ProbeError';
    this.reason = reason;
  }
}
