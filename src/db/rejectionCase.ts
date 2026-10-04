import { db } from './index';
import type { RejectionCase } from '../types';

/**
 * 获取所有拒稿案例
 */
export async function getAllRejectionCases(): Promise<RejectionCase[]> {
  return await db.rejectionCases.orderBy('createdAt').reverse().toArray();
}

/**
 * 根据 ID 获取拒稿案例
 */
export async function getRejectionCaseById(id: number): Promise<RejectionCase | undefined> {
  return await db.rejectionCases.get(id);
}

/**
 * 根据作品 ID 获取拒稿案例
 */
export async function getRejectionCasesByProject(projectId: number): Promise<RejectionCase[]> {
  return await db.rejectionCases.where('projectId').equals(projectId).toArray();
}

/**
 * 添加拒稿案例
 */
export async function addRejectionCase(data: Omit<RejectionCase, 'id'>): Promise<number> {
  return await db.rejectionCases.add(data);
}

/**
 * 更新拒稿案例
 */
export async function updateRejectionCase(
  id: number,
  updates: Partial<Omit<RejectionCase, 'id'>>
): Promise<void> {
  await db.rejectionCases.update(id, updates);
}

/**
 * 删除拒稿案例（同时删除关联的标记）
 */
export async function deleteRejectionCase(id: number): Promise<void> {
  // 先删除关联的所有标记
  await db.rejectionMarks.where('caseId').equals(id).delete();
  // 再删除案例本身
  await db.rejectionCases.delete(id);
}

/**
 * 获取生效的避雷规则（词库中「已启用」的规则正文）
 * @param _projectId 仅为兼容旧调用签名保留；词库规则全局共享，不再按作品隔离
 * @returns 去重后的规则正文列表
 */
export async function getActiveRules(_projectId?: number): Promise<string[]> {
  const rules = await db.rejectionRules.orderBy('createdAt').toArray();
  const enabled = rules.filter(r => r.enabled !== false);
  return Array.from(new Set(enabled.map(r => r.content)));
}
