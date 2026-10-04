import { db } from './index';
import type { Character } from '../types';

// 创建人物
export async function addCharacter(character: Omit<Character, 'id'>): Promise<number> {
  return await db.characters.add(character);
}

// 获取项目下的所有人物
export async function getCharactersByProject(projectId: number): Promise<Character[]> {
  return await db.characters.where('projectId').equals(projectId).toArray();
}

// 根据 ID 获取人物
export async function getCharacterById(id: number): Promise<Character | undefined> {
  return await db.characters.get(id);
}

// 更新人物
export async function updateCharacter(id: number, updates: Partial<Character>): Promise<number> {
  return await db.characters.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

// 删除人物
export async function deleteCharacter(id: number): Promise<void> {
  await db.characters.delete(id);
}
