import { describe, expect, it, vi } from 'vitest';
import { WorkspaceMetaError } from '../../../workspace';
import { decideBootstrap, decideStartup, describeError, readyState } from '../gateMachine';
import { ProbeError } from '../types';
import type { GateState, WorkspaceProbe } from '../types';
import type { WorkspaceMeta } from '../../../workspace';

const VALID_META: WorkspaceMeta = {
  schemaVersion: 1,
  appVersion: '0.1.0',
  name: '测试工作区',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeProbe(handlers: {
  exists: (path: string) => boolean | Promise<boolean>;
  readMeta?: (root: string) => Promise<WorkspaceMeta>;
}): WorkspaceProbe {
  return {
    exists: (path) => Promise.resolve(handlers.exists(path)),
    readMeta: (root) => {
      if (!handlers.readMeta) return Promise.reject(new Error('本用例不应调用 readMeta'));
      return handlers.readMeta(root);
    },
  };
}

const R = 'C:\\ws';

describe('decideStartup —— 覆盖判定表', () => {
  it('① storedPath 为 null → need-select（首次启动）', async () => {
    const probe = makeProbe({ exists: () => false });
    const state = await decideStartup({ storedPath: null, probe });
    expect(state.stage).toBe('need-select');
    expect(state.workspacePath).toBeNull();
    expect(state.meta).toBeNull();
    expect(state.trace.length).toBeGreaterThan(0);
  });

  it('② storedPath 为空白串 → need-select', async () => {
    const probe = makeProbe({ exists: () => false });
    expect((await decideStartup({ storedPath: '   ', probe })).stage).toBe('need-select');
  });

  it('③ exists=false → invalid / missing', async () => {
    const probe = makeProbe({ exists: () => false });
    const state = await decideStartup({ storedPath: R, probe });
    expect(state.stage).toBe('invalid');
    expect(state.reason).toBe('missing');
    expect(state.workspacePath).toBe(R);
  });

  it('④ exists 抛错（越界 / 权限）→ invalid / forbidden（★ 不能当成 missing）', async () => {
    const probe = makeProbe({
      exists: () => {
        throw new Error('forbidden path: C:\\ws');
      },
    });
    const state = await decideStartup({ storedPath: R, probe });
    expect(state.stage).toBe('invalid');
    expect(state.reason).toBe('forbidden');
    expect(state.message).toContain('forbidden path');
  });

  it('⑤ 目录在但没有 workspace.json → invalid / no-workspace-file', async () => {
    const probe = makeProbe({
      exists: () => true,
      readMeta: () => Promise.reject(new ProbeError('no-workspace-file', '缺少 workspace.json')),
    });
    const state = await decideStartup({ storedPath: R, probe });
    expect(state.stage).toBe('invalid');
    expect(state.reason).toBe('no-workspace-file');
  });

  it('⑥ JSON 解析失败 → invalid / corrupt', async () => {
    const probe = makeProbe({
      exists: () => true,
      readMeta: () => Promise.reject(new WorkspaceMetaError('parse-error', '不是合法 JSON')),
    });
    const state = await decideStartup({ storedPath: R, probe });
    expect(state.reason).toBe('corrupt');
  });

  it('⑦ 字段缺失 / 非法 → invalid / corrupt', async () => {
    const probe = makeProbe({
      exists: () => true,
      readMeta: () => Promise.reject(new WorkspaceMetaError('missing-field', "缺少 'name'", 'name')),
    });
    expect((await decideStartup({ storedPath: R, probe })).reason).toBe('corrupt');
  });

  it('⑧ schemaVersion 过高 → invalid / schema-too-new（明确拒绝，不提供强制打开）', async () => {
    const probe = makeProbe({
      exists: () => true,
      readMeta: () => Promise.reject(new WorkspaceMetaError('schema-too-new', '版本过高')),
    });
    const state = await decideStartup({ storedPath: R, probe });
    expect(state.reason).toBe('schema-too-new');
  });

  it('⑨ schemaVersion 非法（<1）→ invalid / schema-too-old', async () => {
    const probe = makeProbe({
      exists: () => true,
      readMeta: () => Promise.reject(new WorkspaceMetaError('schema-too-old', '版本非法')),
    });
    expect((await decideStartup({ storedPath: R, probe })).reason).toBe('schema-too-old');
  });

  it('⑩ 合法 → ready，并带出 meta', async () => {
    const probe = makeProbe({ exists: () => true, readMeta: () => Promise.resolve(VALID_META) });
    const state = await decideStartup({ storedPath: R, probe });
    expect(state.stage).toBe('ready');
    expect(state.workspacePath).toBe(R);
    expect(state.meta).toEqual(VALID_META);
  });

  it('⑪ 其他未知错误 → invalid / unknown', async () => {
    const probe = makeProbe({
      exists: () => true,
      readMeta: () => Promise.reject(new Error('磁盘 I/O 崩了')),
    });
    const state = await decideStartup({ storedPath: R, probe });
    expect(state.reason).toBe('unknown');
    expect(state.message).toContain('磁盘 I/O 崩了');
  });

  it('⑫ readMeta 抛含 forbidden 文本的错 → 归为 forbidden', async () => {
    const probe = makeProbe({
      exists: () => true,
      readMeta: () => Promise.reject(new Error('forbidden path: C:\\ws\\workspace.json')),
    });
    expect((await decideStartup({ storedPath: R, probe })).reason).toBe('forbidden');
  });

  it('trace 记录关键步骤（排查“卡住”用）', async () => {
    const probe = makeProbe({ exists: () => true, readMeta: () => Promise.resolve(VALID_META) });
    const state = await decideStartup({ storedPath: R, probe });
    expect(state.trace.some((line) => line.includes('storedPath='))).toBe(true);
    expect(state.trace.some((line) => line.includes('exists=true'))).toBe(true);
    expect(state.trace.some((line) => line.includes('ready'))).toBe(true);
  });
});

describe('decideBootstrap —— 降级与兜底', () => {
  it('kill switch 打开 → bypassed / kill-switch，且完全不读 store', async () => {
    const readStoredPath = vi.fn(() => Promise.resolve('C:\\ws'));
    const probe = makeProbe({ exists: () => true, readMeta: () => Promise.resolve(VALID_META) });
    const state = await decideBootstrap({
      isTauri: true,
      gateDisabled: true,
      readStoredPath,
      probe,
    });
    expect(state.stage).toBe('bypassed');
    expect(state.bypassReason).toBe('kill-switch');
    expect(readStoredPath).not.toHaveBeenCalled();
  });

  it('浏览器环境（非 Tauri）→ bypassed / browser，不阻塞应用', async () => {
    const readStoredPath = vi.fn(() => Promise.resolve('C:\\ws'));
    const probe = makeProbe({ exists: () => true, readMeta: () => Promise.resolve(VALID_META) });
    const state = await decideBootstrap({
      isTauri: false,
      gateDisabled: false,
      readStoredPath,
      probe,
    });
    expect(state.stage).toBe('bypassed');
    expect(state.bypassReason).toBe('browser');
    expect(readStoredPath).not.toHaveBeenCalled();
  });

  it('读 store 抛错 → 当作「没有记录」，走 need-select 并提示（★ 绝不让用户卡死）', async () => {
    const probe = makeProbe({ exists: () => true, readMeta: () => Promise.resolve(VALID_META) });
    const state = await decideBootstrap({
      isTauri: true,
      gateDisabled: false,
      readStoredPath: () => Promise.reject(new Error('store 文件损坏')),
      probe,
    });
    expect(state.stage).toBe('need-select');
    expect(state.bypassReason).toBe('store-unreadable');
    expect(state.message).toBeTruthy();
  });

  it('读 store 正常 → 交给判定表（这里走 ready）', async () => {
    const probe = makeProbe({ exists: () => true, readMeta: () => Promise.resolve(VALID_META) });
    const state = await decideBootstrap({
      isTauri: true,
      gateDisabled: false,
      readStoredPath: () => Promise.resolve(R),
      probe,
    });
    expect(state.stage).toBe('ready');
    expect(state.meta).toEqual(VALID_META);
  });

  it('store 有记录但目录已被删 → invalid / missing（含三个出口所需的 workspacePath）', async () => {
    const probe = makeProbe({ exists: () => false });
    const state = await decideBootstrap({
      isTauri: true,
      gateDisabled: false,
      readStoredPath: () => Promise.resolve(R),
      probe,
    });
    expect(state.stage).toBe('invalid');
    expect(state.reason).toBe('missing');
    expect(state.workspacePath).toBe(R);
  });
});

describe('describeError', () => {
  it('Error → `name: message`', () => {
    expect(describeError(new TypeError('boom'))).toBe('TypeError: boom');
  });

  it('非 Error → String()', () => {
    expect(describeError('plain')).toBe('plain');
    expect(describeError(42)).toBe('42');
  });
});

describe('readyState', () => {
  it('构造 ready 状态（统一出口）', () => {
    const state: GateState = readyState(R, VALID_META, ['用户完成选择']);
    expect(state.stage).toBe('ready');
    expect(state.workspacePath).toBe(R);
    expect(state.meta).toEqual(VALID_META);
    expect(state.trace).toEqual(['用户完成选择']);
  });
});
