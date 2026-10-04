/**
 * 工作区引擎 —— `workspace.json` 的读 / 写 / 校验（批 2）
 *
 * 校验的重点在 `schemaVersion`：
 *   - **高于**当前支持版本 → **拒绝**（提示升级应用）。宁可不打开，也不能用旧代码去改新结构。
 *   - 低于 1（非法值）→ 拒绝。
 *   - 字段缺失 / 类型错 → 拒绝，并指明是哪个字段。
 *
 * 所有写入都走 `atomicWriteJson`（§8e）。
 */

import { atomicWriteJson } from './atomic-write';
import { WORKSPACE_SCHEMA_VERSION } from './types';
import type {
  FileSystem,
  PathProvider,
  WorkspaceMeta,
  WorkspaceMigratedFrom,
  WorkspaceStats,
} from './types';

/** 校验失败的原因分类，便于上层做不同提示。 */
export type WorkspaceMetaErrorCode =
  | 'parse-error'
  | 'not-object'
  | 'missing-field'
  | 'invalid-field'
  | 'schema-too-new'
  | 'schema-too-old';

/** `workspace.json` 不可用（解析失败 / 结构非法 / 版本不被支持）。 */
export class WorkspaceMetaError extends Error {
  readonly code: WorkspaceMetaErrorCode;
  /** 出问题的字段路径，例如 `'stats.chapters'`。 */
  readonly field: string | undefined;

  constructor(code: WorkspaceMetaErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'WorkspaceMetaError';
    this.code = code;
    this.field = field;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function missingField(field: string): WorkspaceMetaError {
  return new WorkspaceMetaError('missing-field', `workspace.json 缺少必需字段 '${field}'`, field);
}

function invalidField(field: string, reason: string): WorkspaceMetaError {
  return new WorkspaceMetaError('invalid-field', `workspace.json 的字段 '${field}' 非法：${reason}`, field);
}

function requireNonEmptyString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (value === undefined) throw missingField(field);
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalidField(field, '必须是非空字符串');
  }
  return value;
}

const STATS_NUMBER_FIELDS = ['projects', 'chapters', 'words'] as const;

/**
 * 校验一个**已经 JSON.parse 过**的值。
 *
 * 返回值会**保留未知的顶层键**：这样手工加过的备注字段
 * 在"读 → 改 → 写"一轮后不会莫名其妙消失。已知字段则保证类型正确。
 */
export function validateWorkspaceMeta(value: unknown): WorkspaceMeta {
  if (!isPlainObject(value)) {
    throw new WorkspaceMetaError('not-object', 'workspace.json 的顶层必须是一个对象');
  }

  // ── schemaVersion
  const schemaVersion = value.schemaVersion;
  if (schemaVersion === undefined) throw missingField('schemaVersion');
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    throw invalidField('schemaVersion', '必须是整数');
  }
  if (schemaVersion > WORKSPACE_SCHEMA_VERSION) {
    throw new WorkspaceMetaError(
      'schema-too-new',
      `这个工作区的 schemaVersion=${schemaVersion}，高于当前「写作台」支持的 ${WORKSPACE_SCHEMA_VERSION}。` +
        '它可能由更新版本创建，请先升级应用再打开，以免破坏数据。',
      'schemaVersion',
    );
  }
  if (schemaVersion < 1) {
    throw new WorkspaceMetaError(
      'schema-too-old',
      `workspace.json 的 schemaVersion=${schemaVersion} 不是合法的版本号（应为 >= 1）`,
      'schemaVersion',
    );
  }

  // ── 必需字符串字段
  const appVersion = requireNonEmptyString(value, 'appVersion');
  const name = requireNonEmptyString(value, 'name');
  const createdAt = requireNonEmptyString(value, 'createdAt');
  const updatedAt = requireNonEmptyString(value, 'updatedAt');

  // ── 组装：显式列出已知字段（而不是 `{ ...value } as WorkspaceMeta`），
  //    这样将来加字段时编译器会逼你在这里补一行，不会有字段被静默漏掉。
  const meta: WorkspaceMeta = { schemaVersion, appVersion, name, createdAt, updatedAt };

  // ── 可选：migratedFrom（在已收窄的块内就地构造，无需双重断言）
  const migratedFrom = value.migratedFrom;
  if (migratedFrom !== undefined) {
    if (!isPlainObject(migratedFrom)) throw invalidField('migratedFrom', '必须是对象');
    if (typeof migratedFrom.source !== 'string' || migratedFrom.source.trim() === '') {
      throw invalidField('migratedFrom.source', '必须是非空字符串');
    }
    if (typeof migratedFrom.migratedAt !== 'string' || migratedFrom.migratedAt.trim() === '') {
      throw invalidField('migratedFrom.migratedAt', '必须是非空字符串');
    }
    const version = migratedFrom.version;
    if (version !== undefined && (typeof version !== 'number' || !Number.isInteger(version))) {
      throw invalidField('migratedFrom.version', '必须是整数');
    }
    // 索引签名取值是 unknown；上面的 typeof 已校验过，所以这里的 as 是"从 unknown 收窄"
    const migrated: WorkspaceMigratedFrom = {
      source: migratedFrom.source as string,
      migratedAt: migratedFrom.migratedAt as string,
    };
    if (version !== undefined) migrated.version = version as number;
    meta.migratedFrom = migrated;
  }

  // ── 可选：stats
  const stats = value.stats;
  if (stats !== undefined) {
    if (!isPlainObject(stats)) throw invalidField('stats', '必须是对象');
    const parsedStats: WorkspaceStats = {};
    for (const key of STATS_NUMBER_FIELDS) {
      const n = stats[key];
      if (n === undefined) continue;
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
        throw invalidField(`stats.${key}`, '必须是非负数字');
      }
      parsedStats[key] = n;
    }
    meta.stats = parsedStats;
  }

  // ── 保留未知的顶层键（手工加过的备注等不会被"读-改-写"一轮吃掉）。
  //    用 Reflect.set 而不是下标赋值，避免为了动态键把 any/断言引进类型系统。
  for (const [key, extra] of Object.entries(value)) {
    if (!Object.hasOwn(meta, key)) Reflect.set(meta, key, extra);
  }

  return meta;
}

/** 解析 `workspace.json` 的文本内容。JSON 语法错 → `code: 'parse-error'`。 */
export function parseWorkspaceMeta(raw: string): WorkspaceMeta {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new WorkspaceMetaError('parse-error', `workspace.json 不是合法 JSON：${reason}`);
  }
  return validateWorkspaceMeta(parsed);
}

/**
 * 读 + 校验。
 * ⚠️ 文件**不存在**时会把 `FileSystem.readTextFile` 的原生错误直接抛出（不做包装），
 * 让调用方能区分"没有工作区"和"工作区损坏"。
 */
export async function readWorkspaceMeta(
  fs: FileSystem,
  filePath: string,
): Promise<WorkspaceMeta> {
  const raw = await fs.readTextFile(filePath);
  return parseWorkspaceMeta(raw);
}

export interface CreateWorkspaceMetaInput {
  /** 写入本文件的应用版本（取自 `package.json` 的 `version`）。 */
  appVersion: string;
  /** 工作区显示名。 */
  name: string;
  /** 默认 `WORKSPACE_SCHEMA_VERSION`。 */
  schemaVersion?: number;
  /** 便于测试注入；默认 `now`。 */
  createdAt?: string;
  /** 便于测试注入，默认 `new Date()`。 */
  now?: Date;
}

/** 造一份合法的 `WorkspaceMeta`。 */
export function createWorkspaceMeta(input: CreateWorkspaceMetaInput): WorkspaceMeta {
  const iso = (input.now ?? new Date()).toISOString();
  return {
    schemaVersion: input.schemaVersion ?? WORKSPACE_SCHEMA_VERSION,
    appVersion: input.appVersion,
    name: input.name,
    createdAt: input.createdAt ?? iso,
    updatedAt: iso,
  };
}

/** 原子写 `workspace.json`（写前会先校验一遍，防止把非法结构落盘）。 */
export async function writeWorkspaceMeta(
  fs: FileSystem,
  paths: PathProvider,
  filePath: string,
  meta: WorkspaceMeta,
): Promise<void> {
  const validated = validateWorkspaceMeta(meta);
  await atomicWriteJson(fs, paths, filePath, validated);
}

/** 返回一个 `updatedAt` 被刷新到 `now` 的副本（不改原对象）。 */
export function touchWorkspaceMeta(meta: WorkspaceMeta, now: Date = new Date()): WorkspaceMeta {
  return { ...meta, updatedAt: now.toISOString() };
}
