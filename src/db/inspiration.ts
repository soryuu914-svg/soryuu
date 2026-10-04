import { db } from './index';
import type { Inspiration } from '../types';

/**
 * 添加灵感
 */
export async function addInspiration(inspiration: Omit<Inspiration, 'id'>) {
  return await db.inspirations.add({
    ...inspiration,
    createdAt: Date.now(),
  });
}

/**
 * 获取所有灵感
 */
export async function getAllInspirations(): Promise<Inspiration[]> {
  return await db.inspirations.orderBy('createdAt').reverse().toArray();
}

/**
 * 根据类型筛选灵感
 */
export async function getInspirationsByType(type: string): Promise<Inspiration[]> {
  return await db.inspirations
    .where('type')
    .equals(type)
    .reverse()
    .sortBy('createdAt');
}

/**
 * 更新灵感
 */
export async function updateInspiration(id: number, updates: Partial<Inspiration>) {
  return await db.inspirations.update(id, updates);
}

/**
 * 删除灵感
 */
export async function deleteInspiration(id: number) {
  return await db.inspirations.delete(id);
}
