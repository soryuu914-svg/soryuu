/**
 * .docx 导入 —— 段落模型 → 编辑器 HTML
 *
 * 映射关系（对应 Word 里作者的常规写法）：
 *   - 标题段落（`level` 1~3）→ `<h1>` ~ `<h3>`
 *   - 加粗 run → `<strong>`、斜体 run → `<em>`、段内换行 → `<br>`
 *   - 其余段落 → `<p>`
 *
 * ★ 为什么不用 `toEditorHtml`：`textToEditorHtml.ts` 的那条路会**先把整段文本转义**再套
 *   Markdown 规则 —— 它面向的是「纯文本源文件」。docx 这边我们已经拿到了结构化的段落与
 *   run，直接生成 HTML 更准，也不需要「先转义再解析 Markdown」这一层（会二次转义）。
 *   两边共用同一个 `escapeHtml`，转义口径保持一致。
 *
 * ★ 与 mammoth 的对照（实测）：产出的标签集完全一致（h1/p/strong/em/br），
 *   所以喂给 TipTap 的效果也一样 —— 而本模块零依赖、不到 mammoth 的 1/40 体积。
 */

import { DOCX_MAX_HEADING_LEVEL, type DocBlock, type DocRun } from './docx';
import { escapeHtml } from './textToEditorHtml';

/** 一个 run → 行内 HTML（转义在前、包标签在后，避免把标签自己转义掉） */
export function docxRunToHtml(run: DocRun): string {
  const escaped = escapeHtml(run.text).replace(/\n/g, '<br>');
  let html = escaped;
  if (run.italic) html = `<em>${html}</em>`;
  if (run.bold) html = `<strong>${html}</strong>`;
  return html;
}

/** 一个段落 → 块级 HTML */
export function docxBlockToHtml(block: DocBlock): string {
  const inner =
    block.segments.length > 0
      ? block.segments.map(docxRunToHtml).join('')
      : escapeHtml(block.text).replace(/\n/g, '<br>');
  const level = Math.min(Math.max(Math.floor(block.level), 0), DOCX_MAX_HEADING_LEVEL);
  return level > 0 ? `<h${level}>${inner}</h${level}>` : `<p>${inner}</p>`;
}

/** 一串段落 → 编辑器 HTML（就是 `Chapter.content` 要存的东西） */
export function docxBlocksToHtml(blocks: DocBlock[]): string {
  return blocks.map(docxBlockToHtml).join('');
}
