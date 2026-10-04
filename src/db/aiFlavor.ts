import { db } from './index';
import type { AiFlavorSample, AiFlavorMark } from '../types';

export async function getAllSamples() {
  return await db.aiFlavorSamples.orderBy('createdAt').reverse().toArray();
}

export async function addSample(data: Omit<AiFlavorSample, 'id'>) {
  return await db.aiFlavorSamples.add(data);
}

export async function updateSample(id: number, updates: Partial<AiFlavorSample>) {
  return await db.aiFlavorSamples.update(id, updates);
}

export async function deleteSample(id: number) {
  // 级联删除关联标记
  await db.aiFlavorMarks.where('sampleId').equals(id).delete();
  return await db.aiFlavorSamples.delete(id);
}

export async function getMarksBySampleId(sampleId: number) {
  return await db.aiFlavorMarks.where('sampleId').equals(sampleId).toArray();
}

export async function addMark(data: Omit<AiFlavorMark, 'id'>) {
  return await db.aiFlavorMarks.add(data);
}

export async function updateMark(id: number, updates: Partial<AiFlavorMark>) {
  return await db.aiFlavorMarks.update(id, updates);
}

export async function deleteMark(id: number) {
  return await db.aiFlavorMarks.delete(id);
}
