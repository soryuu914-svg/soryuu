import { db } from './index';
import type { LocalBook, BookChapter } from '../types';

// ===== LocalBook CRUD =====

export async function addLocalBook(book: LocalBook): Promise<number> {
  return await db.localBooks.add(book);
}

export async function getAllLocalBooks(): Promise<LocalBook[]> {
  return await db.localBooks.orderBy('createdAt').reverse().toArray();
}

export async function getLocalBookById(id: number): Promise<LocalBook | undefined> {
  return await db.localBooks.get(id);
}

export async function deleteLocalBook(id: number): Promise<void> {
  await db.localBooks.delete(id);
  // 级联删除该书的所有章节
  await deleteBookChaptersByBookId(id);
}

// ===== BookChapter CRUD =====

export async function addBookChapter(chapter: BookChapter): Promise<number> {
  return await db.bookChapters.add(chapter);
}

export async function getChaptersByBook(bookId: number): Promise<BookChapter[]> {
  return await db.bookChapters.where('bookId').equals(bookId).sortBy('index');
}

export async function getBookChapterById(id: number): Promise<BookChapter | undefined> {
  return await db.bookChapters.get(id);
}

export async function deleteBookChaptersByBookId(bookId: number): Promise<void> {
  const chapters = await db.bookChapters.where('bookId').equals(bookId).toArray();
  const ids = chapters.map(ch => ch.id!);
  await db.bookChapters.bulkDelete(ids);
}
