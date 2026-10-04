/**
 * 工作区引擎 —— 原子写（批 2）
 *
 * 背景（§8e）：直接 `writeTextFile` 到目标路径，一旦断电 / 崩溃就会留下**半截 JSON**，
 * 下次解析失败 → 整本数据读不出来。JSON 方案没有事务，所以必须靠"写临时文件 + rename"。
 *
 * 策略：
 *   1. 先确保父目录存在
 *   2. 写 `<target>.tmp`
 *   3. `rename(<target>.tmp, <target>)` —— 同卷 rename 通常原子
 *   4. 任一步失败：尽力清掉 `.tmp`，**目标文件保持原样**，然后把错误抛出去
 *
 * ⚠️ 两个已知边界（批 2 只保证接口语义，不保证底层实现）：
 *   - 跨卷 rename 会 EXDEV（工作区与临时文件必须同卷）
 *   - Tauri 的 `fs.rename` 是否与 Node 一样"可覆盖已存在文件"未经真机验证
 *     → 归入批 3 复验（方案文档 R3 / R8）
 */

import type { FileSystem, PathProvider } from './types';

/** 临时文件后缀。用固定后缀（而非随机名）是为了崩溃后能一眼看出残留。 */
export const ATOMIC_TMP_SUFFIX = '.tmp';

/** 删文件时吞掉错误 —— 清理是"尽力而为"，不能让它盖住真正的失败原因。 */
async function bestEffortRemove(fs: FileSystem, path: string): Promise<void> {
  try {
    await fs.remove(path);
  } catch {
    // 忽略：可能本来就不存在，或平台不允许删
  }
}

/** 目标文件对应的临时路径。 */
export function tmpPathFor(targetPath: string): string {
  return `${targetPath}${ATOMIC_TMP_SUFFIX}`;
}

/**
 * 原子地写入文本。
 *
 * @param fs     文件系统实现
 * @param paths  路径能力
 * @param targetPath 目标文件绝对路径（父目录不存在会自动创建）
 * @param data   要写入的完整文本（覆盖语义）
 */
export async function atomicWriteTextFile(
  fs: FileSystem,
  paths: PathProvider,
  targetPath: string,
  data: string,
): Promise<void> {
  await fs.mkdir(paths.dirname(targetPath), { recursive: true });

  const tmp = tmpPathFor(targetPath);

  try {
    await fs.writeTextFile(tmp, data);
  } catch (error) {
    // 写临时文件失败：目标文件从未被碰过，清掉可能写了一半的 tmp 即可
    await bestEffortRemove(fs, tmp);
    throw error;
  }

  try {
    await fs.rename(tmp, targetPath);
  } catch (error) {
    // rename 失败：目标文件仍是旧内容（这是本函数的核心保证），清掉 tmp
    await bestEffortRemove(fs, tmp);
    throw error;
  }
}

/**
 * 原子地写入 JSON（2 空格缩进 + 结尾换行，便于 git diff 与人眼阅读）。
 */
export async function atomicWriteJson(
  fs: FileSystem,
  paths: PathProvider,
  targetPath: string,
  value: unknown,
): Promise<void> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await atomicWriteTextFile(fs, paths, targetPath, text);
}
