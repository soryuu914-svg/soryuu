import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createNodeFileSystem, createNodePathProvider } from '../node-fs';
import { WORKSPACE_SCHEMA_VERSION } from '../types';
import type { WorkspaceMeta } from '../types';
import {
  WorkspaceMetaError,
  createWorkspaceMeta,
  parseWorkspaceMeta,
  readWorkspaceMeta,
  touchWorkspaceMeta,
  validateWorkspaceMeta,
  writeWorkspaceMeta,
} from '../workspace-json';

const fs = createNodeFileSystem();
const paths = createNodePathProvider();

/** 一份合法的 workspace.json 内容。 */
const VALID: WorkspaceMeta = {
  schemaVersion: WORKSPACE_SCHEMA_VERSION,
  appVersion: '0.1.0',
  name: '我的工作区',
  createdAt: '2026-09-24T02:30:00.000Z',
  updatedAt: '2026-09-24T02:30:00.000Z',
};

/** 断言会抛 `WorkspaceMetaError`，并把错误对象还给调用方以便检查 code / field。 */
function catchMetaError(fn: () => unknown): WorkspaceMetaError {
  try {
    fn();
  } catch (error) {
    if (error instanceof WorkspaceMetaError) return error;
    throw new Error(`抛出的不是 WorkspaceMetaError：${String(error)}`);
  }
  throw new Error('期望抛出 WorkspaceMetaError，但没有抛');
}

describe('validateWorkspaceMeta', () => {
  it('合法内容原样通过', () => {
    expect(validateWorkspaceMeta(VALID)).toEqual(VALID);
  });

  it('保留未知的顶层键（不吞用户加过的字段）', () => {
    const withExtra = { ...VALID, myNote: '手写的备注', nested: { x: 1 } };
    const result = validateWorkspaceMeta(withExtra);
    expect(result).toEqual(withExtra);
  });

  it('顶层不是对象 → not-object', () => {
    for (const bad of [null, undefined, [], 'x', 42, true]) {
      const err = catchMetaError(() => validateWorkspaceMeta(bad));
      expect(err.code, `输入 ${JSON.stringify(bad)}`).toBe('not-object');
    }
  });

  it('schemaVersion 缺失 → missing-field', () => {
    const rest: Record<string, unknown> = { ...VALID };
    delete rest.schemaVersion;
    const err = catchMetaError(() => validateWorkspaceMeta(rest));
    expect(err.code).toBe('missing-field');
    expect(err.field).toBe('schemaVersion');
  });

  it('schemaVersion 类型不对 → invalid-field', () => {
    for (const bad of ['1', 1.5, null, true]) {
      const err = catchMetaError(() => validateWorkspaceMeta({ ...VALID, schemaVersion: bad }));
      expect(err.code, `schemaVersion=${String(bad)}`).toBe('invalid-field');
      expect(err.field).toBe('schemaVersion');
    }
  });

  it('★ schemaVersion 高于当前支持 → schema-too-new（拒绝打开）', () => {
    const err = catchMetaError(() => validateWorkspaceMeta({ ...VALID, schemaVersion: 99 }));
    expect(err.code).toBe('schema-too-new');
    expect(err.field).toBe('schemaVersion');
    expect(err.message).toContain('99');
    expect(err.message).toContain('升级');
  });

  it('schemaVersion < 1 → schema-too-old', () => {
    for (const bad of [0, -1]) {
      const err = catchMetaError(() => validateWorkspaceMeta({ ...VALID, schemaVersion: bad }));
      expect(err.code).toBe('schema-too-old');
    }
  });

  it('必需字符串字段缺失 / 空 → missing-field / invalid-field', () => {
    for (const key of ['appVersion', 'name', 'createdAt', 'updatedAt'] as const) {
      const missing: Record<string, unknown> = { ...VALID };
      delete missing[key];
      const errMissing = catchMetaError(() => validateWorkspaceMeta(missing));
      expect(errMissing.code).toBe('missing-field');
      expect(errMissing.field).toBe(key);

      const empty = catchMetaError(() => validateWorkspaceMeta({ ...VALID, [key]: '   ' }));
      expect(empty.code).toBe('invalid-field');
      expect(empty.field).toBe(key);

      const wrongType = catchMetaError(() => validateWorkspaceMeta({ ...VALID, [key]: 123 }));
      expect(wrongType.code).toBe('invalid-field');
    }
  });

  it('migratedFrom 合法 / 非法', () => {
    const ok = {
      ...VALID,
      migratedFrom: { source: 'indexeddb', version: 19, migratedAt: '2026-09-24T03:00:00.000Z' },
    };
    expect(validateWorkspaceMeta(ok)).toEqual(ok);

    const notObject = catchMetaError(() => validateWorkspaceMeta({ ...VALID, migratedFrom: 'x' }));
    expect(notObject.field).toBe('migratedFrom');

    const noSource = catchMetaError(() => validateWorkspaceMeta({ ...VALID, migratedFrom: { migratedAt: 'x' } }));
    expect(noSource.code).toBe('invalid-field');
    expect(noSource.field).toBe('migratedFrom.source');

    const badVersion = catchMetaError(() =>
      validateWorkspaceMeta({
        ...VALID,
        migratedFrom: { source: 'indexeddb', migratedAt: 'x', version: 1.5 },
      }),
    );
    expect(badVersion.field).toBe('migratedFrom.version');
  });

  it('stats 合法 / 非法', () => {
    const ok = { ...VALID, stats: { projects: 3, chapters: 120, words: 360000 } };
    expect(validateWorkspaceMeta(ok)).toEqual(ok);
    // 部分字段也可以
    expect(validateWorkspaceMeta({ ...VALID, stats: { chapters: 1 } })).toBeDefined();

    const notObject = catchMetaError(() => validateWorkspaceMeta({ ...VALID, stats: [] }));
    expect(notObject.field).toBe('stats');

    const negative = catchMetaError(() => validateWorkspaceMeta({ ...VALID, stats: { chapters: -1 } }));
    expect(negative.code).toBe('invalid-field');
    expect(negative.field).toBe('stats.chapters');

    const wrongType = catchMetaError(() => validateWorkspaceMeta({ ...VALID, stats: { words: '3' } }));
    expect(wrongType.field).toBe('stats.words');
  });
});

describe('parseWorkspaceMeta', () => {
  it('合法 JSON 文本 → 对象', () => {
    expect(parseWorkspaceMeta(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('JSON 语法错 → parse-error', () => {
    const err = catchMetaError(() => parseWorkspaceMeta('{ 这不是 JSON'));
    expect(err.code).toBe('parse-error');
  });

  it('JSON 合法但结构错 → 结构类错误（不是 parse-error）', () => {
    const err = catchMetaError(() => parseWorkspaceMeta('{"schemaVersion": 1}'));
    expect(err.code).toBe('missing-field');
  });
});

describe('createWorkspaceMeta / touchWorkspaceMeta', () => {
  it('默认值：schemaVersion 取当前值，createdAt === updatedAt === now', () => {
    const now = new Date('2026-09-24T02:30:00.000Z');
    const meta = createWorkspaceMeta({ appVersion: '0.1.0', name: 'ws', now });
    expect(meta.schemaVersion).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(meta.createdAt).toBe('2026-09-24T02:30:00.000Z');
    expect(meta.updatedAt).toBe('2026-09-24T02:30:00.000Z');
  });

  it('可注入 createdAt（保留原创建时间）', () => {
    const meta = createWorkspaceMeta({
      appVersion: '0.1.0',
      name: 'ws',
      createdAt: '2020-01-01T00:00:00.000Z',
      now: new Date('2026-09-24T02:30:00.000Z'),
    });
    expect(meta.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(meta.updatedAt).toBe('2026-09-24T02:30:00.000Z');
  });

  it('touch 只刷新 updatedAt，且不改原对象', () => {
    const base = createWorkspaceMeta({ appVersion: '0.1.0', name: 'ws', now: new Date('2020-01-01T00:00:00.000Z') });
    const touched = touchWorkspaceMeta(base, new Date('2026-09-24T02:30:00.000Z'));
    expect(touched.updatedAt).toBe('2026-09-24T02:30:00.000Z');
    expect(touched.createdAt).toBe(base.createdAt);
    expect(base.updatedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(touched).not.toBe(base);
  });
});

describe('read / write（真目录）', () => {
  let tmpBase: string;
  let file: string;

  beforeEach(async () => {
    tmpBase = await mkdtemp(join(tmpdir(), 'wb-batch2-wsjson-'));
    file = join(tmpBase, 'workspace.json');
  });

  afterEach(async () => {
    await rm(tmpBase, { recursive: true, force: true });
  });

  it('写 → 读 往返一致，且无 .tmp 残留', async () => {
    await writeWorkspaceMeta(fs, paths, file, VALID);
    expect(await readWorkspaceMeta(fs, file)).toEqual(VALID);
    expect(await fs.exists(`${file}.tmp`)).toBe(false);
  });

  it('写入前会校验，非法内容不落盘', async () => {
    const bad = { ...VALID, schemaVersion: 99 };
    await expect(writeWorkspaceMeta(fs, paths, file, bad)).rejects.toBeInstanceOf(WorkspaceMetaError);
    expect(await fs.exists(file)).toBe(false);
  });

  it('文件不存在时抛的是原生 fs 错误（不是 WorkspaceMetaError）', async () => {
    let caught: unknown;
    try {
      await readWorkspaceMeta(fs, join(tmpBase, 'not-exist.json'));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught instanceof WorkspaceMetaError).toBe(false);
  });

  it('内容被写坏后读取 → parse-error', async () => {
    await fs.writeTextFile(file, 'not json at all');
    let caught: unknown;
    try {
      await readWorkspaceMeta(fs, file);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceMetaError);
    expect((caught as WorkspaceMetaError).code).toBe('parse-error');
  });
});
