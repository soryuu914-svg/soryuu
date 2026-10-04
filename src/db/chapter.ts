import { db } from './index';
import type { Foreshadow } from '../types';

// 创建伏笔
export async function addForeshadow(foreshadow: Omit<Foreshadow, 'id'>): Promise<number> {
  return await db.foreshadows.add(foreshadow);
}

// 获取项目下的所有伏笔
export async function getForeshadowsByProject(projectId: number): Promise<Foreshadow[]> {
  return await db.foreshadows.where('projectId').equals(projectId).toArray();
}

// 获取章节的所有伏笔
export async function getForeshadowsByChapter(chapterId: number): Promise<Foreshadow[]> {
  return await db.foreshadows.where('chapterId').equals(chapterId).toArray();
}

// 获取待解决的伏笔
export async function getPendingForeshadows(projectId: number): Promise<Foreshadow[]> {
  return await db.foreshadows
    .where('projectId')
    .equals(projectId)
    .filter(f => f.status === 'pending')
    .toArray();
}

// 根据 ID 获取伏笔
export async function getForeshadowById(id: number): Promise<Foreshadow | undefined> {
  return await db.foreshadows.get(id);
}

// 更新伏笔
export async function updateForeshadow(id: number, updates: Partial<Foreshadow>): Promise<number> {
  return await db.foreshadows.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

// 标记伏笔为已解决
// resolvedChapterId：在哪个章节回收（可选；独立页不传时留空，正文入口会传当前章）
export async function resolveForeshadow(
  id: number,
  resolvedChapterId?: number,
): Promise<number> {
  return await db.foreshadows.update(id, {
    status: 'resolved',
    resolvedChapterId,
    resolvedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

// 删除伏笔
export async function deleteForeshadow(id: number): Promise<void> {
  await db.foreshadows.delete(id);
}
