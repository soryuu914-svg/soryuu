import { askAI } from './client';
import type { Chapter } from '../../types';

const SUMMARY_SYSTEM_PROMPT = `你是网文剧情记录员。为本章写一段 60-100 字的事件流水摘要，供后续章节写作时参考。

硬性要求（违反即不合格）：
1. 只写"正文里实际发生的事件"，按时间顺序，用逗号/分号连接
2. 禁止评价、形容词堆砌与文学修辞（不要"精彩/紧张/震撼"）
3. 禁止元句式：不要"本章讲述了/描述了/主要讲/通过..."
4. 必须出现具体专名：至少 1 个人名 + 1 个关键物件或地点
5. 60-100 字，单段，不要换行，不要编号，不要标题
6. 不要写"待续/悬念"，钩子只记"章末发生了什么"

正例：叶尘在黑市买到断剑，回城被赵家三人围堵，他装败引出幕后管家，抢到半张地图后跳河逃走。
反例：本章讲述了主角获得金手指后的精彩历程，气氛紧张刺激，为后续发展埋下伏笔。`;

/** 摘要上下文（第二参数的对象写法） */
export interface SummaryContext {
  prevSummary?: string;
  volumeTitle?: string;
}

function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, '');
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

function cleanSummary(raw: string): string {
  let s = raw
    // 解包 markdown 代码块：保留块内内容（直接删除会把整段摘要清空 → 误判为"摘要过短"）
    .replace(/```[a-zA-Z]*\s*([\s\S]*?)```/g, '$1')
    // 兜底：模型只写了半个围栏
    .replace(/^\s*```[a-zA-Z]*\s*/, '')
    .replace(/```\s*$/, '')
    .replace(/^摘要[:：]\s*/i, '')
    .replace(/\s+/g, '')
    .trim();
  if (s.length > 100) {
    const cut = s.slice(0, 100);
    const lastPunct = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('，'), cut.lastIndexOf('；'));
    s = lastPunct > 40 ? cut.slice(0, lastPunct + 1) : cut;
  }
  return s;
}

/**
 * 生成单章摘要（60-100 字事件流水）
 *
 * @param chapter 本章
 * @param prevSummaryOrOptions 可直接传"上一章摘要"字符串；也可传 { prevSummary, volumeTitle }。
 *        后者与既有 UI 调用（ChapterPage）兼容，同时可附带卷名。
 */
export async function generateChapterSummary(
  chapter: Chapter,
  prevSummaryOrOptions?: string | SummaryContext,
): Promise<string> {
  const ctx: SummaryContext = typeof prevSummaryOrOptions === 'string'
    ? { prevSummary: prevSummaryOrOptions }
    : (prevSummaryOrOptions || {});

  const plain = stripHtml(chapter.content || '');
  if (!plain.trim()) throw new Error('EMPTY_CONTENT: 本章无正文，无法生成摘要');

  let body = plain;
  let downgraded = false;
  if (plain.length > 8000) {
    body = plain.slice(0, 2000) + '\n...\n' + plain.slice(-2000);
    downgraded = true;
  }

  const parts: string[] = [];
  const position = ctx.volumeTitle
    ? `第 ${chapter.index} 章 · ${chapter.title} · ${ctx.volumeTitle}`
    : `第 ${chapter.index} 章 · ${chapter.title}`;
  parts.push(`【本章位置】${position}`);
  if (chapter.outline) parts.push(`【章纲】${chapter.outline.slice(0, 200)}`);
  if (chapter.hook) parts.push(`【钩子】${chapter.hook.slice(0, 100)}`);
  if (chapter.climax) parts.push(`【爆点】${chapter.climax.slice(0, 100)}`);
  if (ctx.prevSummary) parts.push(`【上一章摘要】${ctx.prevSummary.slice(0, 100)}`);
  parts.push(`【本章正文】\n${body}`);

  const raw = await askAI({
    system: SUMMARY_SYSTEM_PROMPT,
    user: parts.join('\n\n'),
    temperature: 0.3,
    maxTokens: 512,
    disableThinking: true,
  });

  const cleaned = cleanSummary(raw);
  if (cleaned.length < 20) throw new Error('BAD_SUMMARY: 摘要过短或清洗后无效');
  return downgraded ? cleaned + '（长章降级摘要）' : cleaned;
}
