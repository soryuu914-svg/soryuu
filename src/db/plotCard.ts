import { db } from './index';
import type { PlotCard } from '../types';

/**
 * 获取指定项目的所有剧情卡
 */
export async function getPlotCardsByProject(projectId: number): Promise<PlotCard[]> {
  return await db.plotCards.where('projectId').equals(projectId).toArray();
}

/**
 * 根据 ID 获取剧情卡
 */
export async function getPlotCardById(id: number): Promise<PlotCard | undefined> {
  return await db.plotCards.get(id);
}

/**
 * 添加剧情卡
 */
export async function addPlotCard(card: Omit<PlotCard, 'id'>): Promise<number> {
  return await db.plotCards.add({
    ...card,
    createdAt: Date.now(),
  });
}

/**
 * 更新剧情卡
 */
export async function updatePlotCard(id: number, updates: Partial<PlotCard>): Promise<number> {
  return await db.plotCards.update(id, updates);
}

/**
 * 删除剧情卡
 */
export async function deletePlotCard(id: number): Promise<void> {
  await db.plotCards.delete(id);
}
