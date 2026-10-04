import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createNodeFileSystem, createNodePathProvider } from '../node-fs';
import { JOURNAL_DIR, SKELETON_TOP_LEVEL, WORKSPACE_FILE } from '../paths';
import { createSkeleton } from '../skeleton';
import { WorkspaceMetaError, readWorkspaceMeta } from '../workspace-json';

const fs = createNodeFileSystem();
const paths = createNodePathProvider();

const APP_VERSION = '0.1.0';
/** 固定时间，便于断言文件名与 ISO 字符串。 */
const NOW = new Date(2026, 8, 24, 10, 30, 0);

let tmpBase: string;
let wsRoot: string;

beforeEach(async () => {
  tmpBase = await mkdtemp(join(tmpdir(), 'wb-batch2-skeleton-'));
  wsRoot = join(tmpBase, '我的工作区');
});

afterEach(async () => {
  await rm(tmpBase, { recursive: true, force: true });
});

describe('createSkeleton', () => {
  it('顶层恰好 6 项（§6）', async () => {
    const result = await createSkeleton(fs, paths, wsRoot, { appVersion: APP_VERSION, now: NOW });

    expect(result.root).toBe(wsRoot);
    const entries = (await readdir(wsRoot)).sort();
    expect(entries).toEqual([...SKELETON_TOP_LEVEL].sort());
    expect(entries.length).toBe(6);
  });

  it('建出 5 个目录 + workspace.json + 当天 journal', async () => {
    const result = await createSkeleton(fs, paths, wsRoot, { appVersion: APP_VERSION, now: NOW });

    expect(result.createdDirs.length).toBe(5);
    expect(result.createdFiles).toEqual([
      join(wsRoot, WORKSPACE_FILE),
      join(wsRoot, JOURNAL_DIR, '2026-09-24.log'),
    ]);
    expect(result.metaWritten).toBe(true);
    expect(result.skipped).toEqual([]);
  });

  it('workspace.json 内容正确', async () => {
    const result = await createSkeleton(fs, paths, wsRoot, { appVersion: APP_VERSION, now: NOW });

    expect(result.meta.schemaVersion).toBe(1);
    const meta = await readWorkspaceMeta(fs, join(wsRoot, WORKSPACE_FILE));
    expect(meta.schemaVersion).toBe(1);
    expect(meta.appVersion).toBe(APP_VERSION);
    expect(meta.name).toBe('我的工作区'); // 默认取目录名
    expect(meta.createdAt).toBe(NOW.toISOString());
    expect(meta.updatedAt).toBe(NOW.toISOString());
  });

  it('name / schemaVersion 可覆盖', async () => {
    const result = await createSkeleton(fs, paths, wsRoot, {
      appVersion: APP_VERSION,
      name: '我的网文库',
      schemaVersion: 1,
      now: NOW,
    });
    expect(result.meta.name).toBe('我的网文库');
    expect(result.meta.schemaVersion).toBe(1);
  });

  it('journal 文件有内容', async () => {
    await createSkeleton(fs, paths, wsRoot, { appVersion: APP_VERSION, now: NOW });

    const journalDir = join(wsRoot, JOURNAL_DIR);
    expect(await readdir(journalDir)).toEqual(['2026-09-24.log']);
    const text = await fs.readTextFile(join(journalDir, '2026-09-24.log'));
    expect(text).toContain('workspace created');
    expect(text).toContain(`appVersion=${APP_VERSION}`);
  });

  it('不留 .tmp 残留', async () => {
    await createSkeleton(fs, paths, wsRoot, { appVersion: APP_VERSION, now: NOW });
    const entries = await readdir(wsRoot);
    expect(entries.some((n) => n.endsWith('.tmp'))).toBe(false);
    expect(entries).not.toContain(`${WORKSPACE_FILE}.tmp`);
  });

  it('幂等：同一天重复调用，什么都不做', async () => {
    const first = await createSkeleton(fs, paths, wsRoot, { appVersion: APP_VERSION, now: NOW });
    const second = await createSkeleton(fs, paths, wsRoot, { appVersion: '9.9.9', now: NOW });

    expect(second.metaWritten).toBe(false);
    expect(second.createdDirs).toEqual([]);
    expect(second.createdFiles).toEqual([]);
    expect(second.skipped.length).toBe(7); // 5 目录 + workspace.json + journal

    const meta = await readWorkspaceMeta(fs, join(wsRoot, WORKSPACE_FILE));
    expect(meta.appVersion).toBe(APP_VERSION); // 没被 9.9.9 覆盖
    expect(meta.createdAt).toBe(first.meta.createdAt);
  });

  it('换成另一天再调用，只会新增当天的 journal 文件', async () => {
    await createSkeleton(fs, paths, wsRoot, { appVersion: APP_VERSION, now: NOW });
    const next = await createSkeleton(fs, paths, wsRoot, {
      appVersion: APP_VERSION,
      now: new Date(2026, 8, 25, 9, 0, 0),
    });

    expect(next.metaWritten).toBe(false);
    expect(next.createdFiles).toEqual([join(wsRoot, JOURNAL_DIR, '2026-09-25.log')]);
    expect((await readdir(join(wsRoot, JOURNAL_DIR))).sort()).toEqual([
      '2026-09-24.log',
      '2026-09-25.log',
    ]);
  });

  it('overwrite: true 才重写', async () => {
    await createSkeleton(fs, paths, wsRoot, { appVersion: APP_VERSION, now: NOW });
    const later = new Date(2026, 9, 1, 8, 0, 0);
    const second = await createSkeleton(fs, paths, wsRoot, {
      appVersion: '0.2.0',
      now: later,
      overwrite: true,
    });

    expect(second.metaWritten).toBe(true);
    expect(second.meta.appVersion).toBe('0.2.0');
    expect(second.meta.createdAt).toBe(later.toISOString());
  });

  it('已有 workspace.json 损坏时不静默覆盖，而是抛错', async () => {
    const metaFile = join(wsRoot, WORKSPACE_FILE);
    await createSkeleton(fs, paths, wsRoot, { appVersion: APP_VERSION, now: NOW });
    await fs.writeTextFile(metaFile, '{ 这显然不是 JSON');

    await expect(
      createSkeleton(fs, paths, wsRoot, { appVersion: APP_VERSION, now: NOW }),
    ).rejects.toBeInstanceOf(WorkspaceMetaError);

    expect(await fs.readTextFile(metaFile)).toBe('{ 这显然不是 JSON');
  });

  it('journal: false 时不写日志文件', async () => {
    const result = await createSkeleton(fs, paths, wsRoot, {
      appVersion: APP_VERSION,
      now: NOW,
      journal: false,
    });
    expect(result.createdFiles).toEqual([join(wsRoot, WORKSPACE_FILE)]);
    expect(await readdir(join(wsRoot, JOURNAL_DIR))).toEqual([]);
  });

  it('参数非法时拒绝执行', async () => {
    await expect(createSkeleton(fs, paths, wsRoot, { appVersion: '' })).rejects.toThrow(/appVersion/);
    await expect(createSkeleton(fs, paths, '  ', { appVersion: APP_VERSION })).rejects.toThrow(/root/);
  });
});
