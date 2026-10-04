import { db } from './index';
import type { Volume, Chapter } from '../types';

// === Volume 卷管理 ===

// 创建卷
export async function addVolume(volume: Omit<Volume, 'id'>): Promise<number> {
  return await db.volumes.add(volume);
}

// 获取项目下的所有卷
export async function getVolumesByProject(projectId: number): Promise<Volume[]> {
  return await db.volumes
    .where('projectId')
    .equals(projectId)
    .sortBy('order');
}

// 根据 ID 获取卷
export async function getVolumeById(id: number): Promise<Volume | undefined> {
  return await db.volumes.get(id);
}

// 更新卷
export async function updateVolume(id: number, updates: Partial<Volume>): Promise<number> {
  return await db.volumes.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

// 删除卷（会同时删除该卷下的所有章节）
export async function deleteVolume(id: number): Promise<void> {
  await db.transaction('rw', [db.volumes, db.chapters], async () => {
    // 删除该卷下的所有章节
    await db.chapters.where('volumeId').equals(id).delete();
    // 删除卷本身
    await db.volumes.delete(id);
  });
}

// === Chapter 章节管理 ===

// 创建章节
export async function addChapter(chapter: Omit<Chapter, 'id'>): Promise<number> {
  return await db.chapters.add(chapter);
}

// 获取项目下的所有章节
export async function getChaptersByProject(projectId: number): Promise<Chapter[]> {
  return await db.chapters
    .where('projectId')
    .equals(projectId)
    .sortBy('order');
}

// 获取卷下的所有章节
export async function getChaptersByVolume(volumeId: number): Promise<Chapter[]> {
  return await db.chapters
    .where('volumeId')
    .equals(volumeId)
    .sortBy('order');
}

// 根据 ID 获取章节
export async function getChapterById(id: number): Promise<Chapter | undefined> {
  return await db.chapters.get(id);
}

// 更新章节
export async function updateChapter(id: number, updates: Partial<Chapter>): Promise<number> {
  return await db.chapters.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

// 删除章节
export async function deleteChapter(id: number): Promise<void> {
  await db.chapters.delete(id);
}

// === Chapter 摘要（长篇记忆） ===

// 更新章节摘要
// 刻意不走 updateChapter：避免刷新 updatedAt，保住"最后编辑时间"的语义
// （章节 updatedAt 被摘要生成刷新会让项目列表的"最近更新"排序产生漂移）
export async function updateChapterSummary(id: number, summary: string): Promise<number> {
  return db.chapters.update(id, {
    summary,
    summaryAt: Date.now(),
    summaryDirty: false,
  });
}
