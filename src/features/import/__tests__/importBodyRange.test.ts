import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAPTER_REGEX,
  DEFAULT_SPLIT_RULE,
  splitChapters,
  type RawChapter,
  type SplitRule,
} from '../importSplit';
import { planImport } from '../planImport';

/**
 * 回归测试：**标题行不得进入正文**
 *
 * bug 现象：导入后章节名是「第一章」，正文里又出现一遍「第一章」，字数因此偏大。
 *
 * 语义约定（本文件是它的守卫）：
 *   1. 被当作章标题的那一行 → 只进 `title`，不进 `body`，也不进渲染出来的 `content`
 *   2. `body === lines.slice(startLine, endLine).join('\n').trim()`
 *   3. 自动编号的章（第一行不是标题）例外：那一行本来就算正文，仍留在区间里
 *
 * `.docx` 路径尤其依赖第 2 条：它靠行区间回推段落，区间一旦含标题行，
 * 标题段落就会被渲染成 `<h1>` 塞进正文（详见 `docx.test.ts` 的端到端用例）。
 */

const REPRO_TXT = ['第一章', '郑雄醒来。', '第二章', '天亮了。'].join('\n');

const DELIMITER_RULE: SplitRule = {
  mode: 'delimiter',
  regexSource: DEFAULT_CHAPTER_REGEX,
  delimiter: '---',
};
const SINGLE_RULE: SplitRule = {
  mode: 'single',
  regexSource: DEFAULT_CHAPTER_REGEX,
  delimiter: '---',
};

/** 把 r 当作标题行来用：取某一行（0 基） */
function lineAt(text: string, index: number): string {
  return text.split('\n')[index] ?? '';
}

describe('★ 标题行不进正文', () => {
  it('按章标题切：标题行是分隔行，正文从下一行起', () => {
    const result = splitChapters(REPRO_TXT, DEFAULT_SPLIT_RULE);
    expect(result.chapters.map((c) => c.title)).toEqual(['第一章', '第二章']);
    expect(result.chapters.map((c) => c.body)).toEqual(['郑雄醒来。', '天亮了。']);
  });

  it('按章标题切：正文里不含标题行的文字', () => {
    const result = splitChapters(REPRO_TXT, DEFAULT_SPLIT_RULE);
    expect(result.chapters[0].body.includes('第一章')).toBe(false);
    expect(result.chapters[1].body.includes('第二章')).toBe(false);
  });

  it('标题与正文同一行时，标题整行进 title，正文从下一行起', () => {
    const text = ['第一章 郑雄醒来', '他睁开了眼。'].join('\n');
    const result = splitChapters(text, DEFAULT_SPLIT_RULE);
    expect(result.chapters[0].title).toBe('郑雄醒来');
    expect(result.chapters[0].body).toBe('他睁开了眼。');
  });

  it('按分隔符切：分隔符行与标题行都不进正文', () => {
    const result = splitChapters(
      ['第一章', '郑雄醒来。', '---', '第二章', '天亮了。'].join('\n'),
      DELIMITER_RULE,
    );
    expect(result.chapters.map((c) => c.body)).toEqual(['郑雄醒来。', '天亮了。']);
    expect(result.chapters[0].body.includes('---')).toBe(false);
  });

  it('按分隔符切：第一行没被当成标题（自动编号）时，那一行仍算正文', () => {
    const long = '这是一段非常长的开头第一行文字用来测试自动编号逻辑'.repeat(3);
    const result = splitChapters([long, '第二行。'].join('\n'), DELIMITER_RULE);
    expect(result.chapters[0].title).toBe('第 1 章');
    expect(result.chapters[0].body.startsWith(long)).toBe(true);
  });

  it('整篇一章：没有标题行，全文（含「第 X 章」行）都算正文', () => {
    const result = splitChapters(REPRO_TXT, SINGLE_RULE);
    expect(result.chapters[0].title).toBe('正文');
    expect(result.chapters[0].body).toBe(REPRO_TXT);
  });

  it('入库的 content 里也不含标题行', () => {
    const result = splitChapters(REPRO_TXT, DEFAULT_SPLIT_RULE);
    const plan = planImport({ projectName: '甲', chapters: result.chapters, now: 1 });
    expect(plan.chapters.map((c) => c.content)).toEqual(['<p>郑雄醒来。</p>', '<p>天亮了。</p>']);
  });

  it('★ 字数不再把标题行算进去', () => {
    const result = splitChapters(REPRO_TXT, DEFAULT_SPLIT_RULE);
    const plan = planImport({ projectName: '甲', chapters: result.chapters, now: 1 });
    // 「郑雄醒来。」= 5 字，「天亮了。」= 4 字；若把标题算进去会多出 6 字
    expect(plan.stats.wordCount).toBe(9);
  });
});

describe('★ 行区间不变量：body === lines.slice(startLine, endLine).trim()', () => {
  const cases: Array<{ name: string; text: string; rule: SplitRule }> = [
    { name: '正则 / 标题独占一行', text: REPRO_TXT, rule: DEFAULT_SPLIT_RULE },
    {
      name: '正则 / 标题与正文同行',
      text: ['第一章 风起', '风起了。', '第二章 落雨', '下雨了。'].join('\n'),
      rule: DEFAULT_SPLIT_RULE,
    },
    {
      name: '正则 / 带前言',
      text: ['卷首语。', '', '第一章 风起', '风起了。'].join('\n'),
      rule: DEFAULT_SPLIT_RULE,
    },
    {
      name: '正则 / 标题后紧跟下一章（空正文）',
      text: ['第一章', '第二章', '乙', '第三章', '丙'].join('\n'),
      rule: DEFAULT_SPLIT_RULE,
    },
    {
      name: '正则 / CRLF + 结尾空行',
      text: '第一章 风起\r\n风起了。\r\n\r\n',
      rule: DEFAULT_SPLIT_RULE,
    },
    {
      name: '分隔符 / 含空段',
      text: ['', '甲', '内容', '', '---', '', '', '乙', '内容', ''].join('\n'),
      rule: DELIMITER_RULE,
    },
    { name: '整篇一章', text: REPRO_TXT, rule: SINGLE_RULE },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const lines = testCase.text.replace(/\r\n?/g, '\n').split('\n');
      const result = splitChapters(testCase.text, testCase.rule, { lineRanges: true });
      expect(result.chapters.length).toBeGreaterThan(0);
      const derived = result.chapters.map((chapter: RawChapter) =>
        lines.slice(chapter.startLine ?? 0, chapter.endLine ?? 0).join('\n').trim(),
      );
      expect(result.chapters.map((c) => c.body)).toEqual(derived);
    });
  }

  it('正则模式：区间首行绝不再是标题行', () => {
    const headingRe = new RegExp(DEFAULT_CHAPTER_REGEX);
    const result = splitChapters(REPRO_TXT, DEFAULT_SPLIT_RULE, { lineRanges: true });
    for (const chapter of result.chapters) {
      const start = chapter.startLine ?? 0;
      expect(headingRe.test(lineAt(REPRO_TXT, start))).toBe(false);
      expect(chapter.endLine).toBeGreaterThanOrEqual(start);
    }
  });

  it('只有标题没有正文的章 → 空区间（不是把标题行圈回来）', () => {
    const result = splitChapters(['第一章', '第二章', '乙'].join('\n'), DEFAULT_SPLIT_RULE, {
      lineRanges: true,
    });
    expect(result.chapters[0].startLine).toBe(1);
    expect(result.chapters[0].endLine).toBe(1);
    expect(result.chapters[0].body).toBe('');
  });
});
