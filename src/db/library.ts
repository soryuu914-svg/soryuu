import { db } from './index';
import type { LibraryItem } from '../types';

// 添加资料库项
export async function addLibraryItem(item: Omit<LibraryItem, 'id'>): Promise<number> {
  return await db.libraryItems.add(item);
}

// 获取所有资料库项（可选按类型筛选）
export async function getAllLibraryItems(type?: 'character' | 'worldSetting'): Promise<LibraryItem[]> {
  if (type) {
    return await db.libraryItems.where('type').equals(type).reverse().sortBy('createdAt');
  }
  return await db.libraryItems.orderBy('createdAt').reverse().toArray();
}

// 根据 ID 获取资料库项
export async function getLibraryItemById(id: number): Promise<LibraryItem | undefined> {
  return await db.libraryItems.get(id);
}

// 删除资料库项
export async function deleteLibraryItem(id: number): Promise<void> {
  await db.libraryItems.delete(id);
}

// 更新资料库项
export async function updateLibraryItem(id: number, updates: Partial<Omit<LibraryItem, 'id'>>): Promise<void> {
  await db.libraryItems.update(id, updates);
}

// 搜索资料库项（按名称或标签）
export async function searchLibraryItems(query: string, type?: 'character' | 'worldSetting'): Promise<LibraryItem[]> {
  const allItems = await getAllLibraryItems(type);
  const lowerQuery = query.toLowerCase();

  return allItems.filter(item =>
    item.name.toLowerCase().includes(lowerQuery) ||
    item.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
    (item.sourceProjectName && item.sourceProjectName.toLowerCase().includes(lowerQuery))
  );
}

// 同步到资料库（首次创建时自动同步）
export async function syncToLibrary(
  content: any,
  type: 'character' | 'worldSetting',
  sourceProjectName?: string
): Promise<void> {
  const name = content.name;

  // 检查是否已存在（按 type + name）
  const existing = await db.libraryItems
    .filter(item => item.type === type && item.name === name)
    .first();

  if (existing) {
    // 已存在，保留最初版本，不更新
    return;
  }

  // 不存在，新增
  await db.libraryItems.add({
    type,
    name,
    content,
    tags: content.tags || [],
    sourceProjectName,
    createdAt: Date.now(),
  });
}
