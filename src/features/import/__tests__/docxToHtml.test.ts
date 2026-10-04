import { describe, expect, it } from 'vitest';
import { docxBlockToHtml, docxBlocksToHtml, docxRunToHtml } from '../docxToHtml';
import type { DocBlock, DocRun } from '../docx';

function run(text: string, options: { bold?: boolean; italic?: boolean } = {}): DocRun {
  return { text, bold: options.bold === true, italic: options.italic === true };
}

function block(text: string, options: { level?: number; segments?: DocRun[] } = {}): DocBlock {
  return {
    text,
    level: options.level ?? 0,
    segments: options.segments ?? [run(text)],
  };
}

describe('docxRunToHtml', () => {
  it('普通文字原样输出', () => {
    expect(docxRunToHtml(run('风起了。'))).toBe('风起了。');
  });

  it('加粗包 <strong>', () => {
    expect(docxRunToHtml(run('重点', { bold: true }))).toBe('<strong>重点</strong>');
  });

  it('斜体包 <em>', () => {
    expect(docxRunToHtml(run('书名', { italic: true }))).toBe('<em>书名</em>');
  });

  it('又粗又斜 → <strong><em> 嵌套（strong 在外）', () => {
    expect(docxRunToHtml(run('重点', { bold: true, italic: true }))).toBe('<strong><em>重点</em></strong>');
  });

  it('run 内的换行变 <br>', () => {
    expect(docxRunToHtml(run('甲\n乙'))).toBe('甲<br>乙');
  });

  it('转义顺序正确：先转义文字，再包标签', () => {
    expect(docxRunToHtml(run('<script>alert(1)</script>'))).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('加粗且含特殊字符时，我们自己的标签不会被转义', () => {
    expect(docxRunToHtml(run('a&b', { bold: true }))).toBe('<strong>a&amp;b</strong>');
  });

  it('引号也会被转义', () => {
    expect(docxRunToHtml(run('他说"好"'))).toBe('他说&quot;好&quot;');
  });

  it('空文字输出空串（不产出空标签外的东西）', () => {
    expect(docxRunToHtml(run(''))).toBe('');
    expect(docxRunToHtml(run('', { bold: true }))).toBe('<strong></strong>');
  });
});

describe('docxBlockToHtml', () => {
  it('level 0 → <p>', () => {
    expect(docxBlockToHtml(block('风起了。'))).toBe('<p>风起了。</p>');
  });

  it('level 1 / 2 / 3 → h1 / h2 / h3', () => {
    expect(docxBlockToHtml(block('第一章 风起', { level: 1 }))).toBe('<h1>第一章 风起</h1>');
    expect(docxBlockToHtml(block('第一节', { level: 2 }))).toBe('<h2>第一节</h2>');
    expect(docxBlockToHtml(block('卷一', { level: 3 }))).toBe('<h3>卷一</h3>');
  });

  it('level 超出范围时收敛（>3 压到 h3，负数当正文）', () => {
    expect(docxBlockToHtml(block('太深了', { level: 7 }))).toBe('<h3>太深了</h3>');
    expect(docxBlockToHtml(block('负数', { level: -2 }))).toBe('<p>负数</p>');
  });

  it('level 是小数时向下取整', () => {
    expect(docxBlockToHtml(block('怪值', { level: 1.9 }))).toBe('<h1>怪值</h1>');
  });

  it('多 segment 按顺序拼接', () => {
    const docxBlock = block('这一段用加粗和斜体混排。', {
      segments: [run('这一段用'), run('加粗', { bold: true }), run('和'), run('斜体', { italic: true }), run('混排。')],
    });
    expect(docxBlockToHtml(docxBlock)).toBe(
      '<p>这一段用<strong>加粗</strong>和<em>斜体</em>混排。</p>',
    );
  });

  it('段内硬换行 → <br>', () => {
    const docxBlock = block('硬换行前\n硬换行后', { segments: [run('硬换行前\n硬换行后')] });
    expect(docxBlockToHtml(docxBlock)).toBe('<p>硬换行前<br>硬换行后</p>');
  });

  it('标题 + 加粗：<h1> 里还能嵌 <strong>', () => {
    expect(docxBlockToHtml(block('第一章 风起', { level: 1, segments: [run('第一章 风起', { bold: true })] }))).toBe(
      '<h1><strong>第一章 风起</strong></h1>',
    );
  });

  it('segments 为空时用 block.text 兜底（仍然转义）', () => {
    expect(docxBlockToHtml({ text: 'a<b', level: 0, segments: [] })).toBe('<p>a&lt;b</p>');
  });

  it('正文里的 HTML 标签只当文字（不会被 TipTap 当成标签）', () => {
    expect(docxBlockToHtml(block('<iframe src="x"></iframe>'))).toBe(
      '<p>&lt;iframe src=&quot;x&quot;&gt;&lt;/iframe&gt;</p>',
    );
  });
});

describe('docxBlocksToHtml', () => {
  it('多个段落按顺序拼接成一段 HTML', () => {
    const blocks = [
      block('第一章 风起', { level: 1 }),
      block('风起了。'),
      block('这一段用加粗和斜体混排。', {
        segments: [run('这一段用'), run('加粗', { bold: true }), run('和'), run('斜体', { italic: true }), run('混排。')],
      }),
      block('硬换行前\n硬换行后', { segments: [run('硬换行前\n硬换行后')] }),
    ];
    expect(docxBlocksToHtml(blocks)).toBe(
      '<h1>第一章 风起</h1>' +
        '<p>风起了。</p>' +
        '<p>这一段用<strong>加粗</strong>和<em>斜体</em>混排。</p>' +
        '<p>硬换行前<br>硬换行后</p>',
    );
  });

  it('空数组 → 空串', () => {
    expect(docxBlocksToHtml([])).toBe('');
  });

  it('相邻空段落不产出空 <p>（上游已经过滤，这里只要不凭空造标签）', () => {
    expect(docxBlocksToHtml([block('甲'), block('乙')])).toBe('<p>甲</p><p>乙</p>');
  });
});
