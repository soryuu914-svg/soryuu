import { describe, expect, it } from 'vitest';
import {
  countEditorWords,
  escapeHtml,
  markdownToHtml,
  plainTextToHtml,
  toEditorHtml,
  unescapeHtml,
} from '../textToEditorHtml';

describe('escapeHtml / unescapeHtml', () => {
  it('转义 HTML 特殊字符', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('往返回原', () => {
    expect(unescapeHtml(escapeHtml('甲 & <乙> "丙"'))).toBe('甲 & <乙> "丙"');
  });
});

describe('plainTextToHtml（TXT 路线）', () => {
  it('空行分段，每段一个 <p>', () => {
    expect(plainTextToHtml('甲\n\n乙\n\n丙')).toBe('<p>甲</p><p>乙</p><p>丙</p>');
  });

  it('段内单换行 → <br>', () => {
    expect(plainTextToHtml('甲\n乙')).toBe('<p>甲<br>乙</p>');
  });

  it('连续空行只算一次分段', () => {
    expect(plainTextToHtml('甲\n\n\n\n乙')).toBe('<p>甲</p><p>乙</p>');
  });

  it('行首尾空白会被修掉', () => {
    expect(plainTextToHtml('   甲   \n  乙  ')).toBe('<p>甲<br>乙</p>');
  });

  it('★ HTML 被转义，稿子里的标签只会显示成文字', () => {
    const html = plainTextToHtml('<script>alert(1)</script>\n\n正文');
    expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p><p>正文</p>');
    expect(html).not.toContain('<script>');
  });

  it('CRLF 与 BOM 都能吃', () => {
    expect(plainTextToHtml('\uFEFF甲\r\n\r\n乙')).toBe('<p>甲</p><p>乙</p>');
  });

  it('空文本 → 空串', () => {
    expect(plainTextToHtml('')).toBe('');
    expect(plainTextToHtml('\n\n  \n')).toBe('');
  });
});

describe('markdownToHtml（MD 路线）', () => {
  it('# 标题 → h1', () => {
    expect(markdownToHtml('# 风起')).toBe('<h1>风起</h1>');
    expect(markdownToHtml('## 落雨')).toBe('<h2>落雨</h2>');
    expect(markdownToHtml('### 归人')).toBe('<h3>归人</h3>');
  });

  it('★ 四级及以上标题压到 h3（编辑器 CSS 只写了 h1~h3）', () => {
    expect(markdownToHtml('#### 很深的标题')).toBe('<h3>很深的标题</h3>');
    expect(markdownToHtml('###### 更深的标题')).toBe('<h3>更深的标题</h3>');
  });

  it('标题与正文各占一块', () => {
    expect(markdownToHtml('# 风起\n他回来了。')).toBe('<h1>风起</h1><p>他回来了。</p>');
  });

  it('** 加粗 / * 斜体', () => {
    expect(markdownToHtml('**粗**')).toBe('<p><strong>粗</strong></p>');
    expect(markdownToHtml('*斜*')).toBe('<p><em>斜</em></p>');
    expect(markdownToHtml('***又粗又斜***')).toBe('<p><strong><em>又粗又斜</em></strong></p>');
  });

  it('__ 加粗（不处理单个下划线，避免误伤 snake_case）', () => {
    expect(markdownToHtml('__粗__')).toBe('<p><strong>粗</strong></p>');
    expect(markdownToHtml('a_b_c')).toBe('<p>a_b_c</p>');
  });

  it('~~ 删除线 → <s>（StarterKit 的 Strike 就是这个标签）', () => {
    expect(markdownToHtml('~~删掉~~')).toBe('<p><s>删掉</s></p>');
  });

  it('--- 分隔线 → <hr>', () => {
    expect(markdownToHtml('甲\n\n---\n\n乙')).toBe('<p>甲</p><hr><p>乙</p>');
    expect(markdownToHtml('***')).toBe('<hr>');
  });

  it('> 引用 → blockquote', () => {
    expect(markdownToHtml('> 这是一句引用')).toBe('<blockquote><p>这是一句引用</p></blockquote>');
  });

  it('连续引用行合并进同一个 blockquote', () => {
    expect(markdownToHtml('> 甲\n> 乙')).toBe('<blockquote><p>甲<br>乙</p></blockquote>');
  });

  it('- 无序列表 / 1. 有序列表', () => {
    expect(markdownToHtml('- 甲\n- 乙')).toBe('<ul><li>甲</li><li>乙</li></ul>');
    expect(markdownToHtml('1. 甲\n2. 乙')).toBe('<ol><li>甲</li><li>乙</li></ol>');
  });

  it('列表结束后回到普通段落', () => {
    expect(markdownToHtml('- 甲\n\n普通段落')).toBe('<ul><li>甲</li></ul><p>普通段落</p>');
  });

  it('★ 行内代码里的 * 不会被当成斜体', () => {
    const html = markdownToHtml('`a*b*c`');
    expect(html).toBe('<p><code>a*b*c</code></p>');
    expect(html).not.toContain('<em>');
  });

  it('段落内多行合成一个 <p> 并用 <br> 连接', () => {
    expect(markdownToHtml('甲\n乙')).toBe('<p>甲<br>乙</p>');
  });

  it('★ HTML 被转义，井号后面没有空格时不当作标题', () => {
    expect(markdownToHtml('<img src=x onerror=alert(1)>')).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt;</p>',
    );
    // CommonMark 也要求 # 后有空格才是标题
    expect(markdownToHtml('#')).toBe('<p>#</p>');
    // 有空格但内容为空 → 不产出空标题
    expect(markdownToHtml('#   ')).toBe('');
  });

  it('中文正文与全角标点原样保留', () => {
    const html = markdownToHtml('《仙途》第一卷：风起（上）');
    expect(html).toBe('<p>《仙途》第一卷：风起（上）</p>');
  });

  it('空文本 → 空串', () => {
    expect(markdownToHtml('')).toBe('');
    expect(markdownToHtml('\n\n')).toBe('');
  });
});

describe('toEditorHtml', () => {
  it('markdown: true 走 Markdown 转换', () => {
    expect(toEditorHtml('# 风起', { markdown: true })).toBe('<h1>风起</h1>');
  });

  it('默认（不传）走纯文本转换，井号原样保留', () => {
    expect(toEditorHtml('# 风起')).toBe('<p># 风起</p>');
  });
});

describe('countEditorWords', () => {
  it('对齐 editor.getText() 口径：块之间算 \\n\\n', () => {
    expect(countEditorWords('<p>a</p><p>b</p>')).toBe(4); // "a\n\nb"
    expect(countEditorWords('<p>甲</p>')).toBe(1);
  });

  it('<br> 算一个换行', () => {
    expect(countEditorWords('<p>甲<br>乙</p>')).toBe(3); // "甲\n乙"
  });

  it('标题/段落之间算空行', () => {
    expect(countEditorWords('<h1>标题</h1><p>正文一段。</p>')).toBe(9); // "标题\n\n正文一段。"
  });

  it('列表项之间算空行', () => {
    expect(countEditorWords('<ul><li>甲</li><li>乙</li></ul>')).toBe(4); // "甲\n\n乙"
  });

  it('实体还原后再计数', () => {
    expect(countEditorWords('<p>a&amp;b</p>')).toBe(3); // "a&b"
  });

  it('分隔线不占字数', () => {
    expect(countEditorWords('<p>甲</p><hr>')).toBe(1);
  });

  it('空 HTML / 只有标签 → 0', () => {
    expect(countEditorWords('')).toBe(0);
    expect(countEditorWords('<p></p>')).toBe(0);
  });
});
