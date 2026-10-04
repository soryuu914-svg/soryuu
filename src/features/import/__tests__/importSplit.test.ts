import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAPTER_REGEX,
  DEFAULT_SPLIT_RULE,
  normalizeNewlines,
  normalizeRegexInput,
  previewOf,
  splitChapters,
  stripChapterNumberPrefix,
  stripHeadingPrefix,
  titleFromFileName,
  totalChars,
  tryCompileRegex,
  type SplitRule,
} from '../importSplit';

/** 快捷构造一条正则规则 */
function regexRule(regexSource = DEFAULT_CHAPTER_REGEX): SplitRule {
  return { mode: 'regex', regexSource, delimiter: '---' };
}

const SAMPLE = [
  '第一章 风起',
  '风起了。',
  '',
  '第二章 落雨',
  '下雨了。',
  '',
  '第三章 归人',
  '他回来了。',
  '',
].join('\n');

describe('normalizeNewlines', () => {
  it('CRLF / CR 统一成 LF', () => {
    expect(normalizeNewlines('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  it('去掉 UTF-8 BOM（否则首行正则匹配不上）', () => {
    expect(normalizeNewlines('\uFEFF第一章')).toBe('第一章');
  });

  it('剔除控制字符，但保留制表符与换行', () => {
    expect(normalizeNewlines('a\u0000b\u001Fc\td\ne')).toBe('abc\td\ne');
  });
});

describe('stripHeadingPrefix', () => {
  it('去掉 Markdown 井号', () => {
    expect(stripHeadingPrefix('## 第一章 风起')).toBe('第一章 风起');
    expect(stripHeadingPrefix('#第一章')).toBe('第一章');
  });

  it('没有井号时原样返回', () => {
    expect(stripHeadingPrefix('第一章 风起')).toBe('第一章 风起');
  });
});

describe('stripChapterNumberPrefix', () => {
  it('去掉「第 X 章」前缀', () => {
    expect(stripChapterNumberPrefix('第一章 风起')).toBe('风起');
    expect(stripChapterNumberPrefix('第 12 章 落雨')).toBe('落雨');
    expect(stripChapterNumberPrefix('第三节 论道')).toBe('论道');
    expect(stripChapterNumberPrefix('第五回 收徒')).toBe('收徒');
  });

  it('去掉编号后面的分隔符', () => {
    expect(stripChapterNumberPrefix('第一章：风起')).toBe('风起');
    expect(stripChapterNumberPrefix('第1章、风起')).toBe('风起');
    expect(stripChapterNumberPrefix('第一章-风起')).toBe('风起');
  });

  it('去掉后什么都不剩时保留原样（避免空标题）', () => {
    expect(stripChapterNumberPrefix('第一章')).toBe('第一章');
  });

  it('不匹配时原样返回', () => {
    expect(stripChapterNumberPrefix('风起')).toBe('风起');
  });
});

describe('normalizeRegexInput', () => {
  it('支持 /.../flags 包裹写法', () => {
    expect(normalizeRegexInput('/^Chapter\\s+\\d+/i')).toEqual({
      source: '^Chapter\\s+\\d+',
      flags: 'i',
    });
  });

  it('去掉 g / y —— 逐行 test 时它们会让 lastIndex 推进、隔行漏匹配', () => {
    expect(normalizeRegexInput('/^第.+章/gm').flags).toBe('m');
    expect(normalizeRegexInput('/^第.+章/y').flags).toBe('');
  });

  it('裸源码原样返回', () => {
    expect(normalizeRegexInput('^第.+章')).toEqual({ source: '^第.+章', flags: '' });
  });
});

describe('tryCompileRegex', () => {
  it('合法正则编译成功', () => {
    const compiled = tryCompileRegex('^第[一二三]+章');
    expect('regex' in compiled).toBe(true);
  });

  it('非法正则返回可读错误而不是抛异常', () => {
    const compiled = tryCompileRegex('^第[一章');
    expect('error' in compiled).toBe(true);
    if ('error' in compiled) expect(compiled.error).toContain('正则写错了');
  });

  it('空串报「请填写」', () => {
    const compiled = tryCompileRegex('   ');
    expect('error' in compiled).toBe(true);
    if ('error' in compiled) expect(compiled.error).toContain('请填写');
  });
});

describe('previewOf', () => {
  it('折掉换行与连续空白', () => {
    expect(previewOf('第一行\n\n第二行    第三行')).toBe('第一行 第二行 第三行');
  });

  it('超过上限时截断并加省略号', () => {
    const text = '甲'.repeat(60);
    expect(previewOf(text, 50)).toBe(`${'甲'.repeat(50)}…`);
  });

  it('刚好等于上限时不截断', () => {
    expect(previewOf('甲'.repeat(50), 50)).toBe('甲'.repeat(50));
  });
});

describe('titleFromFileName', () => {
  it('去掉扩展名', () => {
    expect(titleFromFileName('我的修仙传.txt')).toBe('我的修仙传');
    expect(titleFromFileName('我的修仙传.MD')).toBe('我的修仙传');
    expect(titleFromFileName('草稿.markdown')).toBe('草稿');
  });

  it('带路径时只取文件名', () => {
    expect(titleFromFileName('C:\\稿子\\第一版.md')).toBe('第一版');
  });

  it('拿不到名字时用兜底', () => {
    expect(titleFromFileName('.txt')).toBe('未命名作品');
    expect(titleFromFileName('')).toBe('未命名作品');
    expect(titleFromFileName('a.txt', '自定义兜底')).toBe('a');
  });
});

describe('splitChapters —— 正则模式', () => {
  it('默认规则按「第 X 章」切出 3 章', () => {
    const result = splitChapters(SAMPLE, DEFAULT_SPLIT_RULE);
    expect(result.error).toBeNull();
    expect(result.markerCount).toBe(3);
    expect(result.chapterCount).toBe(3);
    expect(result.chapters.map((c) => c.title)).toEqual(['风起', '落雨', '归人']);
    expect(result.chapters.map((c) => c.body)).toEqual(['风起了。', '下雨了。', '他回来了。']);
  });

  it('中文数字 / 阿拉伯数字 / 回 / 节 都能认', () => {
    const text = ['第十二章 甲', 'x', '第3回 乙', 'y', '第五节 丙', 'z'].join('\n');
    const result = splitChapters(text, regexRule());
    expect(result.chapterCount).toBe(3);
    expect(result.chapters.map((c) => c.title)).toEqual(['甲', '乙', '丙']);
  });

  it('首个标题之前的正文单独成「前言」', () => {
    const text = ['这是一段卷首语。', '', '第一章 风起', '风起了。'].join('\n');
    const result = splitChapters(text, regexRule());
    expect(result.markerCount).toBe(1);
    expect(result.chapterCount).toBe(2);
    expect(result.chapters[0]).toEqual({ title: '前言', body: '这是一段卷首语。' });
  });

  it('标题之前只有空行时不凭空多出一章', () => {
    const text = ['', '', '第一章 风起', '风起了。'].join('\n');
    const result = splitChapters(text, regexRule());
    expect(result.chapterCount).toBe(1);
    expect(result.chapters[0].title).toBe('风起');
  });

  it('stripNumbering: false 时保留完整标题', () => {
    const result = splitChapters(SAMPLE, DEFAULT_SPLIT_RULE, { stripNumbering: false });
    expect(result.chapters.map((c) => c.title)).toEqual(['第一章 风起', '第二章 落雨', '第三章 归人']);
  });

  it('标题行只有「第一章」时不会变成空标题', () => {
    const text = ['第一章', '甲', '第二章', '乙'].join('\n');
    const result = splitChapters(text, regexRule());
    expect(result.chapters.map((c) => c.title)).toEqual(['第一章', '第二章']);
  });

  it('CRLF 与 BOM 都能正确处理', () => {
    const text = '\uFEFF第一章 风起\r\n风起了。\r\n第二章 落雨\r\n下雨了。';
    const result = splitChapters(text, regexRule());
    expect(result.chapterCount).toBe(2);
    expect(result.chapters[0].title).toBe('风起');
    expect(result.chapters[1].body).toBe('下雨了。');
  });

  it('行内的「第X章」不算标题（只认行首）', () => {
    const text = ['他说第一章真好看。', '第一章 风起', '风起了。'].join('\n');
    const result = splitChapters(text, regexRule());
    expect(result.markerCount).toBe(1);
    expect(result.chapters[0].title).toBe('前言');
  });

  it('MD 文件会去掉井号前缀', () => {
    const text = ['# 第一章 风起', '风起了。', '## 第二章 落雨', '下雨了。'].join('\n');
    const result = splitChapters(text, regexRule('^#{1,6}\\s*第[一二三四五六七八九十0-9]+章'), {
      stripHeadingPrefix: true,
    });
    expect(result.chapters.map((c) => c.title)).toEqual(['风起', '落雨']);
  });

  it('一条都匹配不上 → 0 章（交给 UI 引导用户换规则）', () => {
    const result = splitChapters('完全没有章节标记的散文。\n第二段。', regexRule());
    expect(result.markerCount).toBe(0);
    expect(result.chapterCount).toBe(0);
    expect(result.error).toBeNull();
  });

  it('正则写错 → error，且不产出章节', () => {
    const result = splitChapters('第一章 风起', regexRule('^第[一章'));
    expect(result.chapterCount).toBe(0);
    expect(result.error).toContain('正则写错了');
  });

  it('空文本 → 0 章', () => {
    const result = splitChapters('', DEFAULT_SPLIT_RULE);
    expect(result.chapterCount).toBe(0);
  });

  it('末章没有结尾换行也能收进内容', () => {
    const result = splitChapters('第一章 风起\n风起了。', regexRule());
    expect(result.chapters[0].body).toBe('风起了。');
  });
});

describe('splitChapters —— 分隔符模式', () => {
  const rule: SplitRule = { mode: 'delimiter', regexSource: DEFAULT_CHAPTER_REGEX, delimiter: '---' };

  it('按 --- 切，每段第一行当标题', () => {
    const text = ['风起', '风起了。', '---', '落雨', '下雨了。'].join('\n');
    const result = splitChapters(text, rule);
    expect(result.markerCount).toBe(1);
    expect(result.chapterCount).toBe(2);
    expect(result.chapters).toEqual([
      { title: '风起', body: '风起了。' },
      { title: '落雨', body: '下雨了。' },
    ]);
  });

  it('第一行过长（>40 字）时自动编号，整段都当正文', () => {
    const long = '这是一段非常长的开头第一行文字用来测试自动编号逻辑'.repeat(3);
    const text = [long, '正文第二行。', '---', '乙', '正文。'].join('\n');
    const result = splitChapters(text, rule);
    expect(result.chapters[0].title).toBe('第 1 章');
    expect(result.chapters[0].body.startsWith(long)).toBe(true);
  });

  it('分隔符前后空段不产出空章', () => {
    const text = ['---', '甲', '---', '', '---  ', '乙', '---'].join('\n');
    const result = splitChapters(text, rule);
    expect(result.markerCount).toBe(4); // 标记照数，只是不产出空章
    expect(result.chapterCount).toBe(2);
    // 单行段落不拿内容当标题（否则正文就空了），改成自动编号
    expect(result.chapters).toEqual([
      { title: '第 1 章', body: '甲' },
      { title: '第 2 章', body: '乙' },
    ]);
  });

  it('分隔符前后带空格也能匹配（按 trim 后相等判定）', () => {
    const text = ['甲', '内容', '   ---   ', '乙', '内容'].join('\n');
    const result = splitChapters(text, rule);
    expect(result.chapterCount).toBe(2);
  });

  it('分隔符为空 → error', () => {
    const result = splitChapters('任意内容', { ...rule, delimiter: '   ' });
    expect(result.error).toBe('请填写分隔符');
    expect(result.chapterCount).toBe(0);
  });

  it('一段只有一行时整行当正文、标题自动编号（不丢内容）', () => {
    const text = ['孤零零的一行。', '---', '乙', '第二段。'].join('\n');
    const result = splitChapters(text, rule);
    expect(result.chapters[0].title).toBe('第 1 章');
    expect(result.chapters[0].body).toBe('孤零零的一行。');
  });
});

describe('splitChapters —— 整篇一章', () => {
  const rule: SplitRule = { mode: 'single', regexSource: DEFAULT_CHAPTER_REGEX, delimiter: '---' };

  it('整篇作为一章「正文」', () => {
    const result = splitChapters(SAMPLE, rule);
    expect(result.chapterCount).toBe(1);
    expect(result.chapters[0].title).toBe('正文');
    expect(result.chapters[0].body).toContain('第二章 落雨');
  });

  it('空文本 → 0 章', () => {
    expect(splitChapters('   \n\n  ', rule).chapterCount).toBe(0);
  });
});

describe('totalChars', () => {
  it('合计正文长度', () => {
    expect(totalChars([{ title: 'a', body: '123' }, { title: 'b', body: '45' }])).toBe(5);
  });

  it('空数组为 0', () => {
    expect(totalChars([])).toBe(0);
  });
});

/* ────────────────────────────────────────────────────────────
 * lineRanges：仅供 .docx 导入使用（默认关闭，TXT/MD 的返回形状不变）
 * ──────────────────────────────────────────────────────────── */

describe('splitChapters —— lineRanges（.docx 专用）', () => {
  it('默认不产出 startLine / endLine（TXT/MD 形状不变）', () => {
    const result = splitChapters(SAMPLE, DEFAULT_SPLIT_RULE);
    expect(result.chapters[0].startLine).toBeUndefined();
    expect(result.chapters[0].endLine).toBeUndefined();
  });

  it('正则模式：区间从标题行的下一行开始（标题行不进正文），到下一章标题行之前结束', () => {
    // SAMPLE 共 9 行：0 第一章 / 3 第二章 / 6 第三章
    const result = splitChapters(SAMPLE, DEFAULT_SPLIT_RULE, { lineRanges: true });
    expect(result.chapters.map((c) => [c.startLine, c.endLine])).toEqual([
      [1, 3],
      [4, 6],
      [7, 9],
    ]);
  });

  it('正则模式：末章区间覆盖到文本末尾（含结尾空行）', () => {
    const result = splitChapters('第一章 风起\n风起了。', regexRule(), { lineRanges: true });
    expect(result.chapters[0].startLine).toBe(1); // 0 是标题行，不算正文
    expect(result.chapters[0].endLine).toBe(2);
  });

  it('正则模式：只有标题、没有正文的章 → 空区间', () => {
    const result = splitChapters('第一章\n第二章\n乙', regexRule(), { lineRanges: true });
    expect(result.chapters[0].startLine).toBe(1);
    expect(result.chapters[0].endLine).toBe(1);
  });

  it('正则模式：前言区间是 [0, 第一个标题行)', () => {
    const text = ['这是一段卷首语。', '', '第一章 风起', '风起了。'].join('\n');
    const result = splitChapters(text, regexRule(), { lineRanges: true });
    expect(result.chapters[0].title).toBe('前言');
    expect(result.chapters[0].startLine).toBe(0);
    expect(result.chapters[0].endLine).toBe(2);
    // 前言是合成标题，源文本里没有这一行 → 区间从 0 起，全是正文
    expect(result.chapters[1].startLine).toBe(3);
    expect(result.chapters[1].endLine).toBe(4);
  });

  it('分隔符模式：区间自动跳过段首尾空行与标题行', () => {
    const text = ['', '甲', '内容', '', '---', '', '', '乙', '内容', ''].join('\n');
    const rule: SplitRule = { mode: 'delimiter', regexSource: DEFAULT_CHAPTER_REGEX, delimiter: '---' };
    const result = splitChapters(text, rule, { lineRanges: true });
    expect(result.chapters.map((c) => [c.startLine, c.endLine])).toEqual([
      [2, 3],
      [8, 9],
    ]);
  });

  it('分隔符模式：自动编号的段（首行过长）区间包含首行本身', () => {
    const long = '这是一段非常长的开头第一行文字用来测试自动编号逻辑'.repeat(3);
    const text = [long, '正文第二行。'].join('\n');
    const rule: SplitRule = { mode: 'delimiter', regexSource: DEFAULT_CHAPTER_REGEX, delimiter: '---' };
    const result = splitChapters(text, rule, { lineRanges: true });
    expect(result.chapters[0].title).toBe('第 1 章');
    expect(result.chapters[0].startLine).toBe(0);
    expect(result.chapters[0].endLine).toBe(2);
  });

  it('整篇一章：区间是整篇 [0, 行数)', () => {
    const rule: SplitRule = { mode: 'single', regexSource: DEFAULT_CHAPTER_REGEX, delimiter: '---' };
    const result = splitChapters(SAMPLE, rule, { lineRanges: true });
    expect(result.chapters[0].startLine).toBe(0);
    expect(result.chapters[0].endLine).toBe(SAMPLE.split('\n').length);
  });

  it('整篇一章 + 空文本：没有章节，也就没有区间', () => {
    const rule: SplitRule = { mode: 'single', regexSource: DEFAULT_CHAPTER_REGEX, delimiter: '---' };
    expect(splitChapters('   \n\n  ', rule, { lineRanges: true }).chapters).toEqual([]);
  });

  it('开启 lineRanges 不影响 title / body 与章节数', () => {
    const withRanges = splitChapters(SAMPLE, DEFAULT_SPLIT_RULE, { lineRanges: true });
    const without = splitChapters(SAMPLE, DEFAULT_SPLIT_RULE);
    expect(withRanges.chapters.map((c) => [c.title, c.body])).toEqual(without.chapters.map((c) => [c.title, c.body]));
    expect(withRanges.chapterCount).toBe(without.chapterCount);
  });
});

describe('titleFromFileName —— Word 扩展名', () => {
  it('去掉 .docx / .doc', () => {
    expect(titleFromFileName('我的修仙传.docx')).toBe('我的修仙传');
    expect(titleFromFileName('旧稿.doc')).toBe('旧稿');
  });

  it('扩展名大小写都认', () => {
    expect(titleFromFileName('草稿.DOCX')).toBe('草稿');
  });

  it('只剩扩展名时用兜底名', () => {
    expect(titleFromFileName('.docx')).toBe('未命名作品');
  });
});
