import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ATOMIC_TMP_SUFFIX, atomicWriteJson, atomicWriteTextFile, tmpPathFor } from '../atomic-write';
import { createNodeFileSystem, createNodePathProvider } from '../node-fs';
import type { FileSystem } from '../types';

const fs = createNodeFileSystem();
const paths = createNodePathProvider();

let tmpBase: string;
let file: string;

beforeEach(async () => {
  tmpBase = await mkdtemp(join(tmpdir(), 'wb-batch2-atomic-'));
  file = join(tmpBase, 'a.json');
});

afterEach(async () => {
  await rm(tmpBase, { recursive: true, force: true });
});

describe('atomicWriteTextFile', () => {
  it('tmpPathFor / 后缀常量', () => {
    expect(ATOMIC_TMP_SUFFIX).toBe('.tmp');
    expect(tmpPathFor('/x/a.json')).toBe('/x/a.json.tmp');
  });

  it('写出正确内容，且不留 .tmp', async () => {
    await atomicWriteTextFile(fs, paths, file, 'hello');
    expect(await readFile(file, 'utf8')).toBe('hello');
    expect(await fs.exists(tmpPathFor(file))).toBe(false);
    expect((await readdir(tmpBase)).sort()).toEqual(['a.json']);
  });

  it('能覆盖已存在文件（Windows 上 Node 的 rename 带 replace 语义）', async () => {
    await atomicWriteTextFile(fs, paths, file, 'v1');
    await atomicWriteTextFile(fs, paths, file, 'v2');
    expect(await readFile(file, 'utf8')).toBe('v2');
    expect((await readdir(tmpBase)).sort()).toEqual(['a.json']);
  });

  it('自动创建父目录', async () => {
    const deep = join(tmpBase, 'x', 'y', 'c.json');
    await atomicWriteTextFile(fs, paths, deep, 'deep');
    expect(await readFile(deep, 'utf8')).toBe('deep');
  });

  it('★ 写 tmp 中途失败：目标文件仍是旧内容，且无 .tmp 残留', async () => {
    await atomicWriteTextFile(fs, paths, file, 'old');

    const brokenWrite: FileSystem = {
      ...fs,
      writeTextFile: async () => {
        throw new Error('ENOSPC: 磁盘已满');
      },
    };

    await expect(atomicWriteTextFile(brokenWrite, paths, file, 'new')).rejects.toThrow('磁盘已满');

    expect(await readFile(file, 'utf8')).toBe('old');
    expect(await fs.exists(tmpPathFor(file))).toBe(false);
    expect((await readdir(tmpBase)).sort()).toEqual(['a.json']);
  });

  it('★ rename 阶段失败：目标文件仍是旧内容，tmp 被清理', async () => {
    await atomicWriteTextFile(fs, paths, file, 'old');

    const brokenRename: FileSystem = {
      ...fs,
      rename: async () => {
        throw new Error('EXDEV: 跨设备移动');
      },
    };

    await expect(atomicWriteTextFile(brokenRename, paths, file, 'new')).rejects.toThrow('EXDEV');

    expect(await readFile(file, 'utf8')).toBe('old');
    expect(await fs.exists(tmpPathFor(file))).toBe(false);
    expect((await readdir(tmpBase)).sort()).toEqual(['a.json']);
  });

  it('目标原本不存在时，失败不会凭空造出目标文件', async () => {
    const target = join(tmpBase, 'b.json');
    const brokenWrite: FileSystem = {
      ...fs,
      writeTextFile: async () => {
        throw new Error('boom');
      },
    };

    await expect(atomicWriteTextFile(brokenWrite, paths, target, 'x')).rejects.toThrow('boom');
    expect(await fs.exists(target)).toBe(false);
    expect((await readdir(tmpBase)).sort()).toEqual([]);
  });

  it('清理失败不会盖住原始错误（不抛错）', async () => {
    // remove 永远失败 → bestEffortRemove 必须吞掉，不能改变抛出的错误类型
    const stubbornRemove: FileSystem = {
      ...fs,
      remove: async () => {
        throw new Error('remove 失败');
      },
      writeTextFile: async () => {
        throw new Error('原始错误');
      },
    };

    await expect(atomicWriteTextFile(stubbornRemove, paths, file, 'x')).rejects.toThrow('原始错误');
  });
});

describe('atomicWriteJson', () => {
  it('2 空格缩进 + 结尾换行，且可解析回原对象', async () => {
    const value = { b: 1, a: [{ c: true }] };
    await atomicWriteJson(fs, paths, file, value);

    const text = await readFile(file, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toBe(`${JSON.stringify(value, null, 2)}\n`);
    expect(JSON.parse(text)).toEqual(value);
    expect(await fs.exists(tmpPathFor(file))).toBe(false);
  });

  it('中文不被转义（便于人眼核对）', async () => {
    await atomicWriteJson(fs, paths, file, { name: '写作台' });
    const text = await readFile(file, 'utf8');
    expect(text).toContain('写作台');
  });
});
