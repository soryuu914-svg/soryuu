/**
 * TXT / MD 导入 —— 章节切分
 *
 * 纯字符串处理，**零 DOM、零 Dexie、零 Tauri 依赖** ⇒ 可以在 node 环境下直接单测。
 *
 * 三种切分方式，对应「网文作者从记事本/其他工具迁稿」的三种真实形态：
 *   - `regex`     按章标题行切（默认规则：`^第[一二三四五六七八九十百千0-9]+[章回节]`）
 *   - `delimiter` 按分隔符切（如 `---`），标题取每段第一行，过长则自动编号
 *   - `single`    整篇作为一章（兜底：完全找不到规律时也能导进来）
 */

/** 切分方式 */
export type SplitMode = 'regex' | 'delimiter' | 'single';

/** 一条切分规则（可直接序列化，便于以后记住用户上次的选择） */
export interface SplitRule {
  mode: SplitMode;
  /** regex 模式用：正则源码（允许 `/.../flags` 包裹写法） */
  regexSource: string;
  /** delimiter 模式用：分隔符（按「整行 trim 后相等」判定） */
  delimiter: string;
}

/** 切出来的一章（还是纯文本，尚未转 HTML、尚未入库） */
export interface RawChapter {
  title: string;
  body: string;
  /**
   * 该章**正文**首行在源文本里的行号（0 基，含）。仅 `splitChapters` 传 `lineRanges: true` 时填充。
   *
   * ★ 不含标题行：标题只进 `title`，不进 `body`、也不进渲染出来的正文 HTML。
   *   所以被当作标题的那一行（行号 = `startLine - 1`）**不在**区间里。
   *   自动编号的章（第一行不是标题）则从该行本身起算。
   *
   * 不变量：`body === lines.slice(startLine, endLine).join('\n').trim()`
   * 用途：`.docx` 导入时源文本是「一个段落一行」，拿到行区间就能回推出对应的段落区间，
   * 从而渲染出带标题 / 加粗的 HTML（见 `docx.ts` 的 `sliceBlocksByLines`）。
   */
  startLine?: number;
  /** 结束行号（0 基，**不含**） */
  endLine?: number;
  /**
   * 已经渲染好的编辑器 HTML。
   * `.docx` 导入时由 `docxToHtml.ts` 直接产出（含 h1~h3 / strong / em），
   * `planImport` 会优先用它，避免再被 `toEditorHtml` 二次转义。
   */
  html?: string;
}

export interface SplitResult {
  chapters: RawChapter[];
  /** 命中「章标题行 / 分隔符」的次数（判定规则是否真的生效） */
  markerCount: number;
  /** 实际产出的章节数（可能比 markerCount 多 1，因为有「前言」） */
  chapterCount: number;
  usedMode: SplitMode;
  /** 规则本身的问题（正则写错、分隔符为空）—— 非 null 时 chapters 为空 */
  error: string | null;
}

/** 默认章标题正则（进度要求里指定的规则原文） */
export const DEFAULT_CHAPTER_REGEX = '^第[一二三四五六七八九十百千0-9]+[章回节]';

/** 默认分隔符 */
export const DEFAULT_DELIMITER = '---';

export const DEFAULT_SPLIT_RULE: SplitRule = {
  mode: 'regex',
  regexSource: DEFAULT_CHAPTER_REGEX,
  delimiter: DEFAULT_DELIMITER,
};

/** delimiter 模式下，第一行短于这个长度才当标题，否则自动编号 */
const AUTO_TITLE_MAX_LEN = 40;

/**
 * 统一换行符并清掉会破坏渲染的控制字符。
 * - UTF-8 BOM（\uFEFF）清掉，否则第一个章标题前面会多一个不可见字符、正则匹配不上
 * - CRLF / CR → LF
 * - 保留 \t \n，其余 C0 控制字符与 DEL 全部剔除
 */
export function normalizeNewlines(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/** 去掉行首的 Markdown 标题井号（`## 第一章 风起` → `第一章 风起`） */
export function stripHeadingPrefix(line: string): string {
  return line.replace(/^\s*#{1,6}\s*/, '');
}

/**
 * 去掉章标题里的编号前缀。
 *
 * 为什么：侧栏本来就是「第 N 章」+ 标题两行显示，
 * 标题再留着「第一章 风起」就会变成「第 1 章 / 第一章 风起」，重复且难看。
 * 去掉后 → 「第 1 章 / 风起」。
 * 若去掉后什么都不剩（标题本来就只有「第一章」），保留原样，避免出现空标题。
 */
export function stripChapterNumberPrefix(title: string): string {
  const stripped = title.replace(/^\s*第\s*[一二三四五六七八九十百千0-9]+\s*[章回节]\s*[：:、.．\-—·]?\s*/, '').trim();
  return stripped.length > 0 ? stripped : title.trim();
}

/**
 * 规范化用户输入的正则：允许 `/^第..章/i` 包裹写法。
 * ⚠️ 一定去掉 `g` / `y`：带这两个 flag 的正则 `test()` 会推进 `lastIndex`，
 * 逐行判断时会隔一行漏一行。
 * ⚠️ 不擅自补 `u`：`u` 模式下 `\-`、`\ ` 这类写法会直接报错，
 * 会把用户本来能用的正则弄挂。中文都在 BMP 内，不加 `u` 也能正常匹配。
 */
export function normalizeRegexInput(raw: string): { source: string; flags: string } {
  const trimmed = raw.trim();
  const wrapped = /^\/(.+)\/([a-zA-Z]*)$/s.exec(trimmed);
  const source = wrapped ? wrapped[1] : trimmed;
  const flags = (wrapped ? wrapped[2] : '').replace(/[gy]/g, '');
  return { source, flags };
}

/** 编译正则；失败时返回可读的错误信息（不抛异常，交给 UI 显示） */
export function tryCompileRegex(raw: string): { regex: RegExp } | { error: string } {
  const { source, flags } = normalizeRegexInput(raw);
  if (!source) return { error: '请填写章标题正则' };
  try {
    return { regex: new RegExp(source, flags) };
  } catch (error) {
    return { error: `正则写错了：${error instanceof Error ? error.message : String(error)}` };
  }
}

/** 章节预览文案：折掉所有换行与连续空白，最多保留 limit 个字 */
export function previewOf(text: string, limit = 50): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

/** 从文件名推作品名（去掉扩展名；拿不到就用兜底名） */
export function titleFromFileName(fileName: string, fallback = '未命名作品'): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const withoutExt = base.replace(/\.(txt|md|markdown|text|docx|doc)$/i, '');
  const trimmed = withoutExt.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/** 这批切分结果大约多少字（纯文本口径） */
export function totalChars(chapters: RawChapter[]): number {
  return chapters.reduce((sum, chapter) => sum + chapter.body.length, 0);
}

/**
 * 按分隔符切。
 * 每段若「第一行足够短（≤40 字）且后面还有内容」则把第一行当标题，其余当正文；
 * 否则整段当正文、标题自动编成 `第 N 章`。
 * 分隔符前后的空白不算内容，不会产出空章。
 *
 * `withRanges` 为真时给每章带上 `[startLine, endLine)`，且**区间内只有正文**：
 * - 第一行被当成标题时 → 区间从第二行开始（标题行只进 `title`）
 * - 第一行没被当成标题（自动编号）时 → 区间从第一行开始（那一行本来就算正文）
 */
function splitByDelimiter(
  lines: string[],
  delimiter: string,
  withRanges: boolean,
): { chapters: RawChapter[]; markerCount: number } {
  // 先只记「段的边界」，跑一遍就能同时得到内容和行号
  const bounds: Array<{ from: number; to: number }> = [];
  let from = 0;
  let markerCount = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === delimiter) {
      markerCount++;
      bounds.push({ from, to: i });
      from = i + 1;
    }
  }
  bounds.push({ from, to: lines.length });

  const chapters: RawChapter[] = [];
  for (const bound of bounds) {
    // 去掉首尾空行，但保留段落之间的空行
    let start = bound.from;
    let end = bound.to;
    while (start < end && lines[start].trim() === '') start++;
    while (end > start && lines[end - 1].trim() === '') end--;
    if (start >= end) continue;

    const head = lines[start].trim();
    const rest = lines.slice(start + 1, end);
    const hasBody = rest.some((line) => line.trim() !== '');
    const hasTitle = head.length <= AUTO_TITLE_MAX_LEN && hasBody;
    const chapter: RawChapter = hasTitle
      ? { title: head, body: rest.join('\n').trim() }
      : { title: `第 ${chapters.length + 1} 章`, body: lines.slice(start, end).join('\n').trim() };

    if (withRanges) {
      // 标题行不进区间 —— 否则 .docx 渲染时标题会重复出现在正文里
      chapter.startLine = hasTitle ? start + 1 : start;
      chapter.endLine = end;
    }
    chapters.push(chapter);
  }

  return { chapters, markerCount };
}

/**
 * 按正则切：命中的整行就是章标题，到下一条命中之前的所有行是正文。
 * 第一条命中之前若有正文，单独作为「前言」一章（没有内容就不产出，避免凭空多一章）。
 *
 * `withRanges` 为真时给每章带上 `[startLine, endLine)`，且**区间内只有正文**
 * （从标题行的**下一行**开始 —— 标题行只进 `title`，不能在正文 HTML 里再出现一次）。
 */
function splitByRegex(
  lines: string[],
  regex: RegExp,
  stripHash: boolean,
  withRanges: boolean,
): { chapters: RawChapter[]; markerCount: number } {
  const chapters: RawChapter[] = [];
  const preamble: string[] = []; // 第一个标题行之前的内容
  let preambleEnd = 0; // 第一个标题行的行号（= 前言区间的右端，不含）
  let title: string | null = null;
  let body: string[] = [];
  let markerCount = 0;
  let titleLine = 0; // 当前这一章标题行所在的行号

  const flush = (endLine: number) => {
    if (title === null) return;
    const chapter: RawChapter = { title, body: body.join('\n').trim() };
    if (withRanges) {
      // ★ 正文从标题行的**下一行**开始：标题行本身已经进了 title
      chapter.startLine = titleLine + 1;
      chapter.endLine = endLine;
    }
    chapters.push(chapter);
    body = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (regex.test(line)) {
      if (title === null) preambleEnd = i; // 记下第一处标题行 → 前言区间的右端
      flush(i); // 先把上一章收掉
      markerCount++;
      titleLine = i;
      const raw = line.trim();
      const cleaned = stripHash ? stripHeadingPrefix(raw).trim() : raw;
      // 极端情况：标题行只剩井号 → 自动编号，避免出现空标题
      title = cleaned.length > 0 ? cleaned : `第 ${markerCount} 章`;
      continue;
    }
    if (title === null) {
      preamble.push(line);
    } else {
      body.push(line);
    }
  }
  flush(lines.length); // 收掉最后一章

  // 标题之前的正文（有实质文字才算）→ 前言一章，插到最前面
  if (chapters.length > 0) {
    const head = preamble.join('\n').trim();
    if (head.length > 0) {
      const preambleChapter: RawChapter = { title: '前言', body: head };
      if (withRanges) {
        // 「前言」是合成标题，源文本里没有这一行 → 区间从 0 开始，全是正文
        preambleChapter.startLine = 0;
        preambleChapter.endLine = preambleEnd;
      }
      chapters.unshift(preambleChapter);
    }
  }

  return { chapters, markerCount };
}

/** 批量规整标题：去掉「第 X 章」这类编号前缀（预览里看到的就是最终入库的样子） */
function finalizeTitles(chapters: RawChapter[]): RawChapter[] {
  return chapters.map((chapter) => ({
    ...chapter,
    title: stripChapterNumberPrefix(chapter.title),
  }));
}

/**
 * 主入口：把整篇文本切成章节。
 *
 * @param options.stripHeadingPrefix MD 文件传 true，标题行里的 `##` 会被去掉
 * @param options.stripNumbering   默认 true：标题里多余的「第 X 章」前缀会被去掉
 * @param options.lineRanges       默认 false：为 true 时给每章带上 `startLine` / `endLine`。
 *   仅 `.docx` 导入需要（源文本是「一段一行」的段落模型，靠行区间回推段落区间渲染 HTML）；
 *   TXT/MD 不传，保持返回对象形状与批次 2 完全一致。
 */
export function splitChapters(
  text: string,
  rule: SplitRule,
  options: { stripHeadingPrefix?: boolean; stripNumbering?: boolean; lineRanges?: boolean } = {},
): SplitResult {
  const normalized = normalizeNewlines(text);
  const lines = normalized.split('\n');
  const stripNumbering = options.stripNumbering !== false;
  const withRanges = options.lineRanges === true;

  if (rule.mode === 'single') {
    const body = normalized.trim();
    const chapters: RawChapter[] = body
      ? [{ title: '正文', body, ...(withRanges ? { startLine: 0, endLine: lines.length } : {}) }]
      : [];
    return {
      chapters,
      markerCount: 0,
      chapterCount: chapters.length,
      usedMode: 'single',
      error: null,
    };
  }

  if (rule.mode === 'delimiter') {
    const delimiter = rule.delimiter.trim();
    if (!delimiter) {
      return {
        chapters: [],
        markerCount: 0,
        chapterCount: 0,
        usedMode: 'delimiter',
        error: '请填写分隔符',
      };
    }
    const { chapters, markerCount } = splitByDelimiter(lines, delimiter, withRanges);
    const finalChapters = stripNumbering ? finalizeTitles(chapters) : chapters;
    return {
      chapters: finalChapters,
      markerCount,
      chapterCount: finalChapters.length,
      usedMode: 'delimiter',
      error: null,
    };
  }

  const compiled = tryCompileRegex(rule.regexSource);
  if ('error' in compiled) {
    return {
      chapters: [],
      markerCount: 0,
      chapterCount: 0,
      usedMode: 'regex',
      error: compiled.error,
    };
  }
  const { chapters, markerCount } = splitByRegex(
    lines,
    compiled.regex,
    options.stripHeadingPrefix === true,
    withRanges,
  );
  const finalChapters = stripNumbering ? finalizeTitles(chapters) : chapters;
  return {
    chapters: finalChapters,
    markerCount,
    chapterCount: finalChapters.length,
    usedMode: 'regex',
    error: null,
  };
}
