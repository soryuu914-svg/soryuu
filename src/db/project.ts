import { db } from './index';
import type { Project } from '../types';

// 创建项目
export async function addProject(project: Omit<Project, 'id'>): Promise<number> {
  return await db.projects.add(project);
}

// 获取所有项目
export async function getAllProjects(): Promise<Project[]> {
  return await db.projects.orderBy('updatedAt').reverse().toArray();
}

// 根据 ID 获取项目
export async function getProjectById(id: number): Promise<Project | undefined> {
  return await db.projects.get(id);
}

// 更新项目
export async function updateProject(id: number, updates: Partial<Project>): Promise<number> {
  return await db.projects.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

// 删除项目（会级联删除关联数据）
export async function deleteProject(id: number): Promise<void> {
  await db.transaction('rw', [
    db.projects,
    db.characters,
    db.worldSettings,
    db.volumes,
    db.chapters,
    db.foreshadows,
  ], async () => {
    // 删除项目关联的所有数据
    await db.characters.where('projectId').equals(id).delete();
    await db.worldSettings.where('projectId').equals(id).delete();
    await db.volumes.where('projectId').equals(id).delete();
    await db.chapters.where('projectId').equals(id).delete();
    await db.foreshadows.where('projectId').equals(id).delete();
    // 删除项目本身
    await db.projects.delete(id);
  });
}
