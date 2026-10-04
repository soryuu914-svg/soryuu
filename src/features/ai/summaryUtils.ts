import type { Chapter } from '../../types';

/**
 * 【全书前情摘要】注入层的纯函数实现
 * 说明：本文件刻意不做任何"运行时 import"（只有 import type），
 *       便于纯逻辑被脚本直接运行。
 * 摘要文本本身的生成/清洗逻辑在 summarizer.ts。
 */

/** 摘要层注入预算（按中文字符数计） */
export const MEMORY_BUDGET = {
  expand: 600, // 局部扩写：只给精简前情，避免偏题
  default: 1500, // 续写 / 整章生成
};

/** 摘要层跳过"最近 2 章"：第4层已注入其细纲与上一章结尾，避免重复占位 */
export const MEMORY_MIN_GAP = 3;

/** 单条记忆行最多取摘要的前 N 字（超出时按最近标点收尾） */
export const MEMORY_LINE_MAX_CHARS = 80;

/**
 * 按标点收尾的截断：避免在词/句中间硬切（如"赵无极跪"这种断气感）
 * - 未超长：原样返回
 * - 超长：在 max 内找最近的 。，； 收尾；若标点太靠前（不足 max/2）则退化为硬切
 */
function smartTruncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastPunct = Math.max(
    cut.lastIndexOf('。'),
    cut.lastIndexOf('，'),
    cut.lastIndexOf('；'),
  );
  return lastPunct > max * 0.5 ? cut.slice(0, lastPunct + 1) : cut;
}

export interface MemoryBlockResult {
  block: string;
  chapterCount: number;
}

/**
 * 组装【全书前情摘要】层
 * - 只取"当前章之前至少 MEMORY_MIN_GAP 章"的已生成摘要（跳过最近 2 章，避免与第4层重复）
 * - 从最近往更早遍历，在字数预算内尽量多取
 * - 输出按时间顺序（最后一条最近）
 */
export function buildMemoryBlock(
  chapters: Array<Pick<Chapter, 'index' | 'title' | 'summary'>>,
  currentIndex: number,
  budget: number = MEMORY_BUDGET.default,
): MemoryBlockResult {
  if (!Number.isFinite(budget) || budget <= 0 || !Number.isFinite(currentIndex)) {
    return { block: '', chapterCount: 0 };
  }

  const eligible = (chapters || [])
    .filter(ch => typeof ch.index === 'number' && ch.index <= currentIndex - MEMORY_MIN_GAP)
    .filter(ch => typeof ch.summary === 'string' && ch.summary.trim().length > 0)
    .sort((a, b) => a.index - b.index);

  const picked: string[] = [];
  let used = 0;

  for (let i = eligible.length - 1; i >= 0; i--) {
    const ch = eligible[i];
    const text = smartTruncate((ch.summary || '').trim(), MEMORY_LINE_MAX_CHARS);
    const line = `第${ch.index}章 ${ch.title}：${text}`;
    if (used + line.length > budget) break;
    picked.unshift(line);
    used += line.length;
  }

  if (picked.length === 0) return { block: '', chapterCount: 0 };

  const block = `\n【全书前情摘要（按时间顺序，最后一条最近）】\n${picked.join('\n')}\n`;
  return { block, chapterCount: picked.length };
}
