/**
 * TXT / MD 导入 —— 纯文本 → 编辑器 HTML
 *
 * 编辑器的正文是**HTML**（TipTap），而导入的源文件是纯文本 ⇒ 必须转换。
 *
 * 两条路线：
 *   - TXT：只按空行分段，每段包 `<p>`，段内换行还原成 `<br>`
 *   - MD ：额外解析 `#` 标题 / `**` 加粗 / `*` 斜体 / `~~` 删除线 / `` ` `` 行内代码
 *          / `>` 引用 / `-` `1.` 列表 / `---` 分隔线
 *
 * 为什么不装库（marked / markdown-it）：见报告说明 —— 只用到「标题+加粗+斜体」这几条，
 * 自己写 100 行可控、零依赖、可在 node 里直接单测；装满ICU的解析器还要担心它产出的
 * 标签是不是 TipTap 认得的（表格/HTML 块/脚注等都会被 TipTap 过滤掉，反而多一层不确定性）。
 *
 * ★ 安全：**先整体转义 HTML 再套 Markdown 规则**，所以稿子里写 `<script>` 只会原样显示成文字。
 *   顺序不能反 —— 先套规则再转义会把我们自己生成的 `<p>` 也转义掉。
 *
 * ★ 与 `ExportPage.htmlToPlainText` 是互逆的一对：导入 → 编辑 → 导出应能还原出可读文本。
 *   但**编辑器工具栏不支持**的标记（斜体外的 `_`、表格、图片、链接）会被丢弃，这是有意的取舍。
 */

import { normalizeNewlines } from './importSplit';

/** 转义 HTML 特殊字符（含引号，宁可多转不可少转） */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** 还原上面那个 escapeHtml（用于算字数 / 以后做搜索） */
export function unescapeHtml(html: string): string {
  return html.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (matched) => ENTITY_MAP[matched] ?? matched);
}

/**
 * 行内标记渲染。**入参必须是已经转义过的文本**。
 * 行内代码先摘成占位符，否则 `` `a*b*c` `` 里面的 `*` 会被当成斜体。
 */
function renderInline(escaped: string): string {
  const codes: string[] = [];
  let out = escaped.replace(/`([^`]+)`/g, (_matched, code: string) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });

  out = out
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>');

  return out.replace(/\u0000(\d+)\u0000/g, (_matched, i: string) => `<code>${codes[Number(i)] ?? ''}</code>`);
}

/** TXT：按空行分段，段内单换行 → `<br>` */
export function plainTextToHtml(text: string): string {
  const normalized = normalizeNewlines(text);
  const blocks = normalized.split(/\n{2,}/);
  const out: string[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) continue;
    out.push(`<p>${escapeHtml(lines.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }

  return out.join('');
}

/** 标题最多到 h3 —— 编辑器 CSS 只写了 h1~h3 的样式，更深的层级显示不出来 */
const MAX_HEADING_LEVEL = 3;

/** MD：行扫描状态机（段落 / 列表 / 引用三种块状态） */
export function markdownToHtml(text: string): string {
  const lines = normalizeNewlines(text).split('\n');
  const out: string[] = [];

  let paragraph: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const body = renderInline(escapeHtml(paragraph.join('\n'))).replace(/\n/g, '<br>');
    out.push(`<p>${body}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list === null) return;
    out.push(`</${list}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    const body = quote.map((line) => renderInline(escapeHtml(line))).join('<br>');
    out.push(`<blockquote><p>${body}</p></blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    closeList();
    flushQuote();
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flushAll();
      continue;
    }

    // 分隔线：--- / *** / ___ （同一字符 ≥3 个占满整行）
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushAll();
      out.push('<hr>');
      continue;
    }

    // 标题：#{1,6} + 空格
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const content = heading[2].trim();
      if (content.length > 0) {
        const level = Math.min(heading[1].length, MAX_HEADING_LEVEL);
        out.push(`<h${level}>${renderInline(escapeHtml(content))}</h${level}>`);
      }
      continue;
    }

    // 引用：> 开头，连续多行合并成一个 blockquote
    const quoteLine = /^\s*>\s?(.*)$/.exec(line);
    if (quoteLine) {
      flushParagraph();
      closeList();
      quote.push(quoteLine[1]);
      continue;
    }

    // 无序列表
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      flushQuote();
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${renderInline(escapeHtml(bullet[1]))}</li>`);
      continue;
    }

    // 有序列表
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      flushParagraph();
      flushQuote();
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${renderInline(escapeHtml(ordered[1]))}</li>`);
      continue;
    }

    // 普通段落行
    flushQuote();
    closeList();
    paragraph.push(line.trim());
  }

  flushAll();
  return out.join('');
}

/** 统一入口：按文件类型选转换器 */
export function toEditorHtml(text: string, options: { markdown?: boolean } = {}): string {
  return options.markdown === true ? markdownToHtml(text) : plainTextToHtml(text);
}

/**
 * 估算编辑器里的字数。
 *
 * 口径对齐 `editor.getText().length`（ChapterPage 保存时用的就是这个）：
 * 块级元素之间补 `\n\n`、`<br>` 还原成 `\n`，再去标签、去实体。
 * 这是个近似值（TipTap 的具体分隔符行为可能略有差异），只用于导入时的初始字数。
 */
export function countEditorWords(html: string): number {
  const plain = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|div)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '');
  return unescapeHtml(plain).replace(/\n{3,}/g, '\n\n').trim().length;
}
