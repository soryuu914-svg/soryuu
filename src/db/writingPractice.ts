import { db } from './index';
import type { WritingPractice, WritingStyleCard } from '../types';

// ===== 练习 =====
export async function getAllPractices(): Promise<WritingPractice[]> {
  return await db.writingPractices.orderBy('createdAt').reverse().toArray();
}

export async function addPractice(data: Omit<WritingPractice, 'id'>): Promise<number> {
  return await db.writingPractices.add(data);
}

export async function updatePractice(id: number, updates: Partial<WritingPractice>): Promise<void> {
  await db.writingPractices.update(id, updates);
}

export async function deletePractice(id: number): Promise<void> {
  await db.writingPractices.delete(id);
}

export async function getPracticeCount(): Promise<number> {
  return await db.writingPractices.count();
}

// ===== 文风卡 =====
export async function getStyleCard(): Promise<WritingStyleCard | undefined> {
  return await db.writingStyleCard.orderBy('updatedAt').reverse().first();
}

export async function saveStyleCard(content: string, sampleCount: number): Promise<void> {
  const existing = await getStyleCard();
  if (existing?.id) {
    await db.writingStyleCard.update(existing.id, {
      content,
      sampleCount,
      updatedAt: Date.now(),
    });
  } else {
    await db.writingStyleCard.add({
      content,
      sampleCount,
      updatedAt: Date.now(),
    });
  }
}

// 同步文风卡到写作工具箱（title='我的文风'，type='style'）
export async function syncStyleCardToToolbox(content: string): Promise<void> {
  const existing = await db.writingStyles
    .filter(w => w.type === 'style' && w.title === '我的文风')
    .first();

  if (existing?.id) {
    await db.writingStyles.update(existing.id, {
      content,
      createdAt: existing.createdAt,
    });
  } else {
    await db.writingStyles.add({
      type: 'style',
      title: '我的文风',
      description: '从写作练习中提炼的个人文风',
      content,
      category: '',
      isBuiltin: false,
      tags: ['我的文风'],
      createdAt: Date.now(),
    });
  }
}
