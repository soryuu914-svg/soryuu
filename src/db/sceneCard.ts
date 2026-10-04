import { db } from './index';
import type { SceneCard } from '../types';

/**
 * 获取指定项目的所有场景卡
 */
export async function getSceneCardsByProject(projectId: number): Promise<SceneCard[]> {
  return await db.sceneCards.where('projectId').equals(projectId).toArray();
}

/**
 * 根据 ID 获取场景卡
 */
export async function getSceneCardById(id: number): Promise<SceneCard | undefined> {
  return await db.sceneCards.get(id);
}

/**
 * 添加场景卡
 */
export async function addSceneCard(card: Omit<SceneCard, 'id'>): Promise<number> {
  return await db.sceneCards.add({
    ...card,
    createdAt: Date.now(),
  });
}

/**
 * 更新场景卡
 */
export async function updateSceneCard(id: number, updates: Partial<SceneCard>): Promise<number> {
  return await db.sceneCards.update(id, updates);
}

/**
 * 删除场景卡
 */
export async function deleteSceneCard(id: number): Promise<void> {
  await db.sceneCards.delete(id);
}
