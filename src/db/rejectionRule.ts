import { db } from './index';
import type { RejectionRule, RuleCategory } from '../types';

// ==================== 规则 ====================

// 获取所有规则（按创建时间倒序）
export async function getAllRules(): Promise<RejectionRule[]> {
  return db.rejectionRules.orderBy('createdAt').reverse().toArray();
}

// 按分类获取规则（走 category 索引）
export async function getRulesByCategory(category: string): Promise<RejectionRule[]> {
  return db.rejectionRules.where('category').equals(category).sortBy('createdAt');
}

// 新增规则（enabled 与 createdAt 由这里统一写入、覆盖传入值，默认启用）
export async function addRule(data: Omit<RejectionRule, 'id'>): Promise<number> {
  return db.rejectionRules.add({
    ...data,
    enabled: true,
    createdAt: Date.now(),
  });
}

// 批量新增规则（同批次用 now+index 保证顺序稳定，enabled/createdAt 同上被覆盖）
export async function addRules(dataList: Omit<RejectionRule, 'id'>[]): Promise<void> {
  const now = Date.now();
  await db.rejectionRules.bulkAdd(
    dataList.map((data, index) => ({
      ...data,
      enabled: true,
      createdAt: now + index,
    }))
  );
}

// 更新规则
export async function updateRule(id: number, updates: Partial<RejectionRule>): Promise<number> {
  return db.rejectionRules.update(id, updates);
}

// 切换启用状态
export async function toggleRule(id: number, enabled: boolean): Promise<number> {
  return db.rejectionRules.update(id, { enabled });
}

// 删除规则
export async function deleteRule(id: number): Promise<void> {
  return db.rejectionRules.delete(id);
}

// 删除某分类下的全部规则（删分类时级联清理，避免留下不可见的孤儿规则）
export async function deleteRulesByCategory(category: string): Promise<number> {
  return db.rejectionRules.where('category').equals(category).delete();
}

// ==================== 分类 ====================

// 获取所有分类（按 order 升序）
export async function getAllCategories(): Promise<RuleCategory[]> {
  return db.ruleCategories.orderBy('order').toArray();
}

// 新增分类（isDefault 与 createdAt 由这里统一写入、覆盖传入值，恒为非预设）
export async function addCategory(data: Omit<RuleCategory, 'id'>): Promise<number> {
  return db.ruleCategories.add({
    ...data,
    isDefault: false,
    createdAt: Date.now(),
  });
}

// 删除分类：预设分类拒绝删除，其余直接删除
export async function deleteCategory(id: number): Promise<void> {
  const category = await db.ruleCategories.get(id);
  if (!category) return;
  if (category.isDefault) {
    throw new Error('预设分类不可删除');
  }
  await db.ruleCategories.delete(id);
}

