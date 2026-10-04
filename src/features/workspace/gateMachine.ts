/**
 * 启动门卫 —— 决策纯函数（批 3b）
 *
 * 把「该走哪条路」从 UI 里抽出来，全部输入靠注入
 * ⇒ 判定表可以在 vitest 里逐条覆盖，不必反复真机试错。
 *
 * ★ 本文件**不 import 任何 `@tauri-apps/*`**（只依赖批 2 的纯逻辑），
 *   所以单测可以直接跑在 node 环境里。
 */
import { WorkspaceMetaError } from '../../workspace';
import { ProbeError } from './types';
import type { GateState, InvalidReason, WorkspaceProbe } from './types';
import type { WorkspaceMeta } from '../../workspace';

/** 把任意异常转成可读的一行（错误对象 / 字符串 / 其他） */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/** 文本里是否含「授权 / 越界」特征（Tauri fs 的 `forbidden path` 走这条） */
function looksLikeForbidden(message: string): boolean {
  return /forbidden|not allowed|denied|permission|\u6743\u9650|\u8d8a\u754c/i.test(message);
}

function invalidState(
  workspacePath: string,
  reason: InvalidReason,
  trace: string[],
  message?: string,
): GateState {
  return { stage: 'invalid', workspacePath, meta: null, reason, message, trace };
}

/** 把 `probe.readMeta` 抛出的异常分类成 `InvalidReason` */
function classifyMetaFailure(error: unknown): { reason: InvalidReason; message: string } {
  if (error instanceof ProbeError) {
    return { reason: error.reason, message: error.message };
  }
  if (error instanceof WorkspaceMetaError) {
    const reason: InvalidReason =
      error.code === 'schema-too-new'
        ? 'schema-too-new'
        : error.code === 'schema-too-old'
          ? 'schema-too-old'
          : 'corrupt';
    return { reason, message: error.message };
  }
  const message = describeError(error);
  return { reason: looksLikeForbidden(message) ? 'forbidden' : 'unknown', message };
}

/**
 * 判定表（`TAURI_WORKSPACE_BATCH3_PLAN.md` §3a）：
 *
 * | storedPath | `exists(root)` | `workspace.json` | → stage | reason |
 * |---|---|---|---|---|
 * | 空 | — | — | `need-select` | — |
 * | 有 | `false` | — | `invalid` | `missing` |
 * | 有 | 抛「越界 / 权限」错 | — | `invalid` | `forbidden` |
 * | 有 | `true` | 不存在 | `invalid` | `no-workspace-file` |
 * | 有 | `true` | 解析失败 / 字段非法 | `invalid` | `corrupt` |
 * | 有 | `true` | `schemaVersion` 过高 | `invalid` | `schema-too-new` |
 * | 有 | `true` | 合法且版本可接受 | **`ready`** | — |
 */
export async function decideStartup(input: {
  storedPath: string | null;
  probe: WorkspaceProbe;
  trace?: string[];
}): Promise<GateState> {
  const trace = input.trace ?? [];
  const storedPath = (input.storedPath ?? '').trim();

  if (storedPath === '') {
    trace.push('store 无记录 → 首次启动');
    return { stage: 'need-select', workspacePath: null, meta: null, trace };
  }
  trace.push(`storedPath=${storedPath}`);

  // ── ① 探测根目录是否存在
  let rootExists: boolean;
  try {
    rootExists = await input.probe.exists(storedPath);
  } catch (error) {
    // ★ `exists()` 对**越界**路径会抛错（`forbidden path`），而不是返回 false。
    //   若把这种情况当成「文件夹没了」，用户会被误导去新建工作区 ——
    //   而真实原因只是授权丢了，正确引导应是「重新选择同一个文件夹」（重选即重新授权）。
    const message = describeError(error);
    trace.push(`exists() 抛错 → 视为授权丢失：${message}`);
    return invalidState(storedPath, 'forbidden', trace, message);
  }
  trace.push(`exists=${rootExists}`);

  if (!rootExists) {
    trace.push('目录不存在');
    return invalidState(storedPath, 'missing', trace);
  }

  // ── ② 读并校验 workspace.json
  try {
    const meta = await input.probe.readMeta(storedPath);
    trace.push(`读 meta 成功：schemaVersion=${meta.schemaVersion} → ready`);
    return { stage: 'ready', workspacePath: storedPath, meta, trace };
  } catch (error) {
    const { reason, message } = classifyMetaFailure(error);
    trace.push(`读 meta 失败 → ${reason}：${message}`);
    return invalidState(storedPath, reason, trace, message);
  }
}

export interface BootstrapInput {
  /** 是否运行在 Tauri 里（浏览器 → bypass，绝不阻塞） */
  isTauri: boolean;
  /** kill switch 是否打开（`VITE_WORKSPACE_GATE=off`） */
  gateDisabled: boolean;
  /** 读「上次的工作区路径」；抛错表示 store 不可读 */
  readStoredPath: () => Promise<string | null>;
  probe: WorkspaceProbe;
}

/**
 * 启动编排：kill switch → 环境降级 → 读 store → 判定。
 *
 * ★ 任何一步失败都返回**可展示的 state**，绝不向外 throw ——
 *   `ErrorBoundary` 不捕获 Promise rejection，throw 会变成静默失败（白屏或永远加载）。
 */
export async function decideBootstrap(input: BootstrapInput): Promise<GateState> {
  const trace: string[] = [];

  if (input.gateDisabled) {
    trace.push('kill switch：VITE_WORKSPACE_GATE=off → bypass');
    return { stage: 'bypassed', workspacePath: null, meta: null, bypassReason: 'kill-switch', trace };
  }

  if (!input.isTauri) {
    trace.push('非 Tauri 环境（浏览器 dev）→ bypass，不阻塞应用');
    return { stage: 'bypassed', workspacePath: null, meta: null, bypassReason: 'browser', trace };
  }

  let storedPath: string | null = null;
  try {
    storedPath = await input.readStoredPath();
    trace.push(`store 读取完成：${storedPath ?? '(空)'}`);
  } catch (error) {
    // ★ 读 store 失败绝不阻塞：当作「没有记录」→ 让用户重新选。
    const message = describeError(error);
    trace.push(`读 store 失败，按「无记录」处理：${message}`);
    return {
      stage: 'need-select',
      workspacePath: null,
      meta: null,
      bypassReason: 'store-unreadable',
      message: '读取上次的工作区记录失败，请重新选择工作区。',
      trace,
    };
  }

  return decideStartup({ storedPath, probe: input.probe, trace });
}

/** 选择 / 新建成功后构造 `ready` 状态（统一出口，便于 UI 复用） */
export function readyState(path: string, meta: WorkspaceMeta, trace: string[] = []): GateState {
  return { stage: 'ready', workspacePath: path, meta, trace };
}
