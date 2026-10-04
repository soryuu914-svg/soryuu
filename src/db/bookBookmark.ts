import { db } from './index';
import type { BookBookmark } from '../types';

// 添加标记
export async function addBookBookmark(bookmark: Omit<BookBookmark, 'id'>) {
  return await db.bookBookmarks.add(bookmark as BookBookmark);
}

// 获取某本书的所有标记
export async function getBookmarksByBook(bookId: number) {
  return await db.bookBookmarks.where('bookId').equals(bookId).toArray();
}

// 获取所有标记
export async function getAllBookBookmarks() {
  return await db.bookBookmarks.toArray();
}

// 更新标记
export async function updateBookBookmark(id: number, updates: Partial<BookBookmark>) {
  return await db.bookBookmarks.update(id, updates);
}

// 删除标记
export async function deleteBookBookmark(id: number) {
  return await db.bookBookmarks.delete(id);
}
