import { db } from './index';
import type { BookAnalysis } from '../types';

// 创建拆书分析
export async function addBookAnalysis(analysis: Omit<BookAnalysis, 'id'>): Promise<number> {
  return await db.bookAnalyses.add(analysis);
}

// 获取所有拆书分析
export async function getAllBookAnalyses(): Promise<BookAnalysis[]> {
  return await db.bookAnalyses.orderBy('createdAt').reverse().toArray();
}

// 根据 ID 获取拆书分析
export async function getBookAnalysisById(id: number): Promise<BookAnalysis | undefined> {
  return await db.bookAnalyses.get(id);
}

// 更新拆书分析
export async function updateBookAnalysis(id: number, updates: Partial<BookAnalysis>): Promise<number> {
  return await db.bookAnalyses.update(id, updates);
}

// 删除拆书分析
export async function deleteBookAnalysis(id: number): Promise<void> {
  await db.bookAnalyses.delete(id);
}

// 根据标签搜索
export async function searchBookAnalysesByTag(tag: string): Promise<BookAnalysis[]> {
  const all = await getAllBookAnalyses();
  return all.filter(analysis => analysis.tags.includes(tag));
}
