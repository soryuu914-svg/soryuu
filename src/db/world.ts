import { db } from './index';
import type { WorldSetting } from '../types';

// 创建世界观设定
export async function addWorldSetting(setting: Omit<WorldSetting, 'id'>): Promise<number> {
  return await db.worldSettings.add(setting);
}

// 获取项目下的所有世界观设定
export async function getWorldSettingsByProject(projectId: number): Promise<WorldSetting[]> {
  return await db.worldSettings.where('projectId').equals(projectId).toArray();
}

// 根据 ID 获取世界观设定
export async function getWorldSettingById(id: number): Promise<WorldSetting | undefined> {
  return await db.worldSettings.get(id);
}

// 更新世界观设定
export async function updateWorldSetting(id: number, updates: Partial<WorldSetting>): Promise<number> {
  return await db.worldSettings.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

// 删除世界观设定
export async function deleteWorldSetting(id: number): Promise<void> {
  await db.worldSettings.delete(id);
}
