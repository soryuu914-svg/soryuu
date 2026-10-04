import { describe, expect, it } from 'vitest';
import {
  DOCX_MAX_HEADING_LEVEL,
  DOC_LEGACY_HINT,
  decodeXmlText,
  docxBlocksToText,
  headingLevelFromStyles,
  isOle2Document,
  parseDocx,
  readZipEntry,
  runsToText,
  sliceBlocksByLines,
  type DocBlock,
} from '../docx';
import { docxBlocksToHtml } from '../docxToHtml';
import { DEFAULT_SPLIT_RULE, splitChapters, type RawChapter } from '../importSplit';
import { planImport } from '../planImport';

/* ────────────────────────────────────────────────────────────
 * 测试夹具：手搓一个**结构合法**的 ZIP
 *
 * 不装任何依赖，也不依赖 Python —— 上位机只要 `CompressionStream`（Node 18+ 就有）。
 * CRC32 一律填 0：本解析器不校验它（真实 ZIP 里这个字段存在，但我们只用签名 + 长度定位）。
 * ──────────────────────────────────────────────────────────── */

interface ZipEntryInput {
  name: string;
  content: string;
  /** 0 = stored（默认），8 = deflate；其它值用来测「不支持的压缩方式」分支 */
  method?: number;
}

function pushU16(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushU32(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function pushBytes(target: number[], bytes: Uint8Array): void {
  for (const byte of bytes) target.push(byte);
}

async function deflateRaw(raw: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function buildZip(entries: ZipEntryInput[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const output: number[] = [];
  const central: number[] = [];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const uncompressed = encoder.encode(entry.content);
    const method = entry.method ?? 0;
    const payload = method === 8 ? await deflateRaw(uncompressed) : uncompressed;
    const localOffset = output.length;

    // 本地文件头（30 字节定长 + name + extra）
    pushU32(output, 0x04034b50);
    pushU16(output, 20);
    pushU16(output, 0);
    pushU16(output, method);
    pushU16(output, 0);
    pushU16(output, 0);
    pushU32(output, 0); // crc32
    pushU32(output, payload.byteLength);
    pushU32(output, uncompressed.byteLength);
    pushU16(output, nameBytes.byteLength);
    pushU16(output, 0);
    pushBytes(output, nameBytes);
    pushBytes(output, payload);

    // 中央目录条目（46 字节定长 + name + extra + comment）
    pushU32(central, 0x02014b50);
    pushU16(central, 20);
    pushU16(central, 20);
    pushU16(central, 0);
    pushU16(central, method);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU32(central, 0); // crc32
    pushU32(central, payload.byteLength);
    pushU32(central, uncompressed.byteLength);
    pushU16(central, nameBytes.byteLength);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU32(central, 0);
    pushU32(central, localOffset);
    pushBytes(central, nameBytes);
  }

  const centralOffset = output.length;
  const centralSize = central.length;
  output.push(...central);

  pushU32(output, 0x06054b50);
  pushU16(output, 0);
  pushU16(output, 0);
  pushU16(output, entries.length);
  pushU16(output, entries.length);
  pushU32(output, centralSize);
  pushU32(output, centralOffset);
  pushU16(output, 0);

  return new Uint8Array(output);
}

function findBytes(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i + needle.length <= haystack.byteLength; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

const CENTRAL_HEADER_BYTES = [0x50, 0x4b, 0x01, 0x02];

/** 把中央目录头签名改坏 → 应报「已损坏」 */
function corruptCentralDirectory(zip: Uint8Array): Uint8Array {
  const copy = new Uint8Array(zip);
  const at = findBytes(copy, CENTRAL_HEADER_BYTES);
  if (at < 0) throw new Error('夹具里找不到中央目录头');
  copy[at] = 0x00;
  return copy;
}

/** OLE2（Word 97-2003 .doc）文件头 */
function ole2Buffer(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer as ArrayBuffer;
}

/* ── docx 内容夹具 ─────────────────────────────────────────── */

const DOC_OPEN = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function runXml(text: string, options: { bold?: boolean; italic?: boolean } = {}): string {
  const props: string[] = [];
  if (options.bold) props.push('<w:b/>');
  if (options.italic) props.push('<w:i/>');
  const rPr = props.length > 0 ? `<w:rPr>${props.join('')}</w:rPr>` : '';
  return `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}

/** 按顺序拼出 `<w:body>` 内容 */
function documentXml(bodyXml: string): string {
  return `${DOC_OPEN}<w:document xmlns:w="${W_NS}"><w:body>${bodyXml}<w:sectPr/></w:body></w:document>`;
}

/** 标准 styles.xml：英文 heading 1/2（带 outlineLvl）+ 一个自定义样式 a3 */
const STYLES_XML = [
  DOC_OPEN,
  `<w:styles xmlns:w="${W_NS}">`,
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>',
  '<w:style w:type="paragraph" w:styleId="a3"><w:name w:val="custom chapter style"/></w:style>',
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>',
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>',
  '</w:styles>',
].join('');

async function buildDocx(bodyXml: string, stylesXml?: string): Promise<Uint8Array> {
  const entries: ZipEntryInput[] = [
    { name: '[Content_Types].xml', content: `${DOC_OPEN}<Types/>` },
    { name: 'word/document.xml', content: documentXml(bodyXml) },
  ];
  if (stylesXml !== undefined) entries.push({ name: 'word/styles.xml', content: stylesXml });
  return buildZip(entries);
}

/* ════════════════════════════════════════════════════════════
 * isOle2Document
 * ════════════════════════════════════════════════════════════ */

describe('isOle2Document', () => {
  it('识别 Word 97-2003 的 OLE2 文件头', () => {
    expect(isOle2Document(ole2Buffer())).toBe(true);
  });

  it('普通 ZIP（.docx）不是 OLE2', async () => {
    const zip = await buildZip([{ name: 'a.xml', content: 'x' }]);
    expect(isOle2Document(zip)).toBe(false);
  });

  it('空字节数组也能安全判断（不越界读）', () => {
    expect(isOle2Document(new Uint8Array(0))).toBe(false);
    expect(isOle2Document(new Uint8Array([0xd0, 0xcf]))).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════
 * decodeXmlText
 * ════════════════════════════════════════════════════════════ */

describe('decodeXmlText', () => {
  it('解命名实体（含 apos / quot）', () => {
    expect(decodeXmlText('a&amp;b&lt;c&gt;d&quot;e&apos;f')).toBe('a&b<c>d"e\'f');
  });

  it('解十进制实体', () => {
    expect(decodeXmlText('&#31532;&#19968;&#31456;')).toBe('第一章');
  });

  it('解十六进制实体（大小写都认）', () => {
    expect(decodeXmlText('&#x7B2C;&#X4E00;')).toBe('第\u4e00');
    expect(decodeXmlText('&#x7B2C;')).toBe('第');
  });

  it('丢掉 Word 的段内回车标记 _x000D_', () => {
    expect(decodeXmlText('甲_x000D_乙')).toBe('甲乙');
  });

  it('_x005F_ 还原成下划线本身', () => {
    expect(decodeXmlText('a_x005F_b')).toBe('a_b');
  });

  it('普通文字原样返回', () => {
    expect(decodeXmlText('第一章 风起')).toBe('第一章 风起');
  });

  it('非法码点不会崩（越界实体被丢弃）', () => {
    expect(decodeXmlText('&#1114112;ok')).toBe('ok');
  });
});

/* ════════════════════════════════════════════════════════════
 * readZipEntry
 * ════════════════════════════════════════════════════════════ */

describe('readZipEntry', () => {
  it('读 stored（method 0）条目', async () => {
    const zip = await buildZip([{ name: 'word/document.xml', content: '<a/>' }]);
    const raw = await readZipEntry(zip, 'word/document.xml');
    expect(raw).not.toBeNull();
    expect(new TextDecoder().decode(raw as Uint8Array)).toBe('<a/>');
  });

  it('读 deflate（method 8）条目 —— 走 DecompressionStream("deflate-raw")', async () => {
    const content = '<w:p>压缩过的正文</w:p>'.repeat(50);
    const zip = await buildZip([{ name: 'word/document.xml', content, method: 8 }]);
    const raw = await readZipEntry(zip, 'word/document.xml');
    expect(raw).not.toBeNull();
    expect(new TextDecoder().decode(raw as Uint8Array)).toBe(content);
  });

  it('多条目时能定位到中间那个', async () => {
    const zip = await buildZip([
      { name: '[Content_Types].xml', content: 'A' },
      { name: 'word/document.xml', content: 'B' },
      { name: 'word/styles.xml', content: 'C' },
    ]);
    const raw = await readZipEntry(zip, 'word/styles.xml');
    expect(new TextDecoder().decode(raw as Uint8Array)).toBe('C');
  });

  it('条目不存在 → 返回 null（不是抛错）', async () => {
    const zip = await buildZip([{ name: 'word/document.xml', content: 'x' }]);
    expect(await readZipEntry(zip, 'word/missing.xml')).toBeNull();
  });

  it('中文内容能正确解码（UTF-8）', async () => {
    const zip = await buildZip([{ name: 'word/document.xml', content: '第一章 风起 · 落雨' }]);
    const raw = await readZipEntry(zip, 'word/document.xml');
    expect(new TextDecoder().decode(raw as Uint8Array)).toBe('第一章 风起 · 落雨');
  });

  it('不是 ZIP（乱码字节）→ 抛「不是有效的 .docx」', async () => {
    const junk = new Uint8Array(64).fill(0x41);
    await expect(readZipEntry(junk, 'word/document.xml')).rejects.toThrow(/不是有效的 \.docx/);
  });

  it('中央目录签名被破坏 → 抛「已损坏」', async () => {
    const zip = await buildZip([{ name: 'word/document.xml', content: '<a/>' }]);
    await expect(readZipEntry(corruptCentralDirectory(zip), 'word/document.xml')).rejects.toThrow(/已损坏/);
  });
});

/* ════════════════════════════════════════════════════════════
 * headingLevelFromStyles
 * ════════════════════════════════════════════════════════════ */

describe('headingLevelFromStyles', () => {
  it('英文样式名 heading N 能识别', () => {
    const levels = headingLevelFromStyles(STYLES_XML);
    expect(levels.get('Heading1')).toBe(1);
    expect(levels.get('Heading2')).toBe(2);
  });

  it('中文样式名「标题 N」也能识别', () => {
    const xml = `<w:styles><w:style w:type="paragraph" w:styleId="1"><w:name w:val="标题 1"/></w:style><w:style w:type="paragraph" w:styleId="2"><w:name w:val="標題 2"/></w:style></w:styles>`;
    const levels = headingLevelFromStyles(xml);
    expect(levels.get('1')).toBe(1);
    expect(levels.get('2')).toBe(2);
  });

  it('outlineLvl 优先于样式名（名字看不出来也是标题）', () => {
    const xml = `<w:styles><w:style w:type="paragraph" w:styleId="X1"><w:name w:val="Body Text"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style></w:styles>`;
    expect(headingLevelFromStyles(xml).get('X1')).toBe(2);
  });

  it('outlineLvl 一旦出现就不再退回按名字判断', () => {
    const xml = `<w:styles><w:style w:type="paragraph" w:styleId="X1"><w:name w:val="heading 3"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>`;
    expect(headingLevelFromStyles(xml).get('X1')).toBe(1);
  });

  it('outlineLvl 只认 0~8（9 是「正文」不登记）', () => {
    const xml = `<w:styles><w:style w:type="paragraph" w:styleId="Body"><w:name w:val="Normal"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style></w:styles>`;
    expect(headingLevelFromStyles(xml).has('Body')).toBe(false);
  });

  it('级别超过 3 压到 3（编辑器只有 h1~h3 样式）', () => {
    const xml = `<w:styles><w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/></w:style></w:styles>`;
    expect(headingLevelFromStyles(xml).get('Heading5')).toBe(DOCX_MAX_HEADING_LEVEL);
  });

  it('非段落样式（w:type="table"）被忽略', () => {
    const xml = `<w:styles><w:style w:type="table" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
    expect(headingLevelFromStyles(xml).has('Heading1')).toBe(false);
  });

  it('没有 w:name 也不带 outlineLvl 的样式不登记', () => {
    const xml = `<w:styles><w:style w:type="paragraph" w:styleId="Blank"/></w:styles>`;
    expect(headingLevelFromStyles(xml).size).toBe(0);
  });

  it('属性顺序颠倒（styleId 写在 type 之前）仍能识别', () => {
    const xml = `<w:styles><w:style w:styleId="Heading1" w:type="paragraph"><w:name w:val="heading 1"/></w:style></w:styles>`;
    expect(headingLevelFromStyles(xml).get('Heading1')).toBe(1);
  });

  it('自定义样式名（custom chapter style）不误判成标题', () => {
    expect(headingLevelFromStyles(STYLES_XML).has('a3')).toBe(false);
  });

  it('空串 → 空 Map（没有 styles.xml 的情况）', () => {
    expect(headingLevelFromStyles('').size).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════
 * runsToText
 * ════════════════════════════════════════════════════════════ */

describe('runsToText', () => {
  it('单个 run 拆成一段', () => {
    const segments = runsToText(runXml('风起了。'));
    expect(segments).toEqual([{ text: '风起了。', bold: false, italic: false }]);
  });

  it('多个 run 按顺序拼接（格式各归各的）', () => {
    const xml = runXml('这一句是') + runXml('加粗', { bold: true }) + runXml('，这里是') + runXml('斜体', { italic: true });
    expect(runsToText(xml)).toEqual([
      { text: '这一句是', bold: false, italic: false },
      { text: '加粗', bold: true, italic: false },
      { text: '，这里是', bold: false, italic: false },
      { text: '斜体', bold: false, italic: true },
    ]);
  });

  it('又粗又斜同时标记', () => {
    expect(runsToText(runXml('重点', { bold: true, italic: true }))).toEqual([
      { text: '重点', bold: true, italic: true },
    ]);
  });

  it('w:val="0" / "false" / "off" / "none" 都算关闭', () => {
    const xml =
      '<w:r><w:rPr><w:b w:val="0"/><w:i w:val="false"/></w:rPr><w:t>甲</w:t></w:r>' +
      '<w:r><w:rPr><w:b w:val="off"/><w:i w:val="none"/></w:rPr><w:t>乙</w:t></w:r>';
    expect(runsToText(xml)).toEqual([
      { text: '甲', bold: false, italic: false },
      { text: '乙', bold: false, italic: false },
    ]);
  });

  it('w:val="1" 算打开', () => {
    expect(runsToText('<w:r><w:rPr><w:b w:val="1"/></w:rPr><w:t>粗</w:t></w:r>')[0].bold).toBe(true);
  });

  it('<w:bCs>（复杂文种加粗）不会被当成粗体', () => {
    expect(runsToText('<w:r><w:rPr><w:bCs/></w:rPr><w:t>甲</w:t></w:r>')[0].bold).toBe(false);
  });

  it('<w:br/> 变成换行', () => {
    const xml = '<w:r><w:t>硬换行前</w:t><w:br/><w:t>硬换行后</w:t></w:r>';
    expect(runsToText(xml)[0].text).toBe('硬换行前\n硬换行后');
  });

  it('<w:cr/> 也变成换行', () => {
    expect(runsToText('<w:r><w:t>甲</w:t><w:cr/><w:t>乙</w:t></w:r>')[0].text).toBe('甲\n乙');
  });

  it('<w:tab/> 变成制表符', () => {
    expect(runsToText('<w:r><w:t>甲</w:t><w:tab/><w:t>乙</w:t></w:r>')[0].text).toBe('甲\t乙');
  });

  it('修订删除的 <w:delText> 被丢弃（不算正文）', () => {
    const xml = '<w:r><w:t>保留</w:t></w:r><w:r><w:delText>删掉的</w:delText></w:r>';
    expect(runsToText(xml).map((s) => s.text)).toEqual(['保留']);
  });

  it('域代码 <w:instrText> 被丢弃', () => {
    const xml = '<w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:t>正文</w:t></w:r>';
    expect(runsToText(xml).map((s) => s.text)).toEqual(['正文']);
  });

  it('<w:t> 里的实体在 run 阶段就解掉', () => {
    expect(runsToText('<w:r><w:t>A&amp;B</w:t></w:r>')[0].text).toBe('A&B');
  });

  it('空 run（没有文字）不产出 segment', () => {
    expect(runsToText('<w:r><w:rPr><w:b/></w:rPr></w:r><w:r><w:t>甲</w:t></w:r>')).toEqual([
      { text: '甲', bold: false, italic: false },
    ]);
  });

  it('自闭合的 <w:r/> 不会把后面那个 run 吞掉', () => {
    const xml = '<w:r/><w:r><w:t>甲</w:t></w:r>';
    expect(runsToText(xml).map((s) => s.text)).toEqual(['甲']);
  });

  it('没有任何 run → 空数组', () => {
    expect(runsToText('')).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════
 * parseDocx（主流程）
 * ════════════════════════════════════════════════════════════ */

describe('parseDocx —— 标题识别', () => {
  it('Heading1 / Heading2 段落变成 level 1 / 2', async () => {
    const docx = await buildDocx(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${runXml('第一章 风起')}</w:p>` +
        `<w:p>${runXml('风起了。')}</w:p>` +
        `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${runXml('第一节 雨')}</w:p>`,
      STYLES_XML,
    );
    const blocks = await parseDocx(toArrayBuffer(docx));
    expect(blocks.map((block) => block.level)).toEqual([1, 0, 2]);
    expect(blocks.map((block) => block.text)).toEqual(['第一章 风起', '风起了。', '第一节 雨']);
  });

  it('自定义段落样式（有名字但不是标题）→ level 0', async () => {
    const docx = await buildDocx(
      `<w:p><w:pPr><w:pStyle w:val="a3"/></w:pPr>${runXml('第一章 落雨')}</w:p>` + `<w:p>${runXml('下雨了。')}</w:p>`,
      STYLES_XML,
    );
    const blocks = await parseDocx(toArrayBuffer(docx));
    expect(blocks.map((block) => block.level)).toEqual([0, 0]);
  });

  it('段落自己带 outlineLvl 时也能认出标题（不依赖 styles.xml）', async () => {
    const docx = await buildDocx(
      `<w:p><w:pPr><w:outlineLvl w:val="2"/></w:pPr>${runXml('卷三 归人')}</w:p>` + `<w:p>${runXml('他回来了。')}</w:p>`,
    );
    const blocks = await parseDocx(toArrayBuffer(docx));
    expect(blocks[0].level).toBe(3);
  });

  it('没有 styles.xml 时用 styleId 本身兜底（Heading2 → 2）', async () => {
    const docx = await buildDocx(
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${runXml('第二节')}</w:p>`,
    );
    const blocks = await parseDocx(toArrayBuffer(docx));
    expect(blocks[0].level).toBe(2);
  });

  it('中文版 Word 的 styleId「1」也能当兜底', async () => {
    const docx = await buildDocx(`<w:p><w:pPr><w:pStyle w:val="1"/></w:pPr>${runXml('第一章')}</w:p>`);
    const blocks = await parseDocx(toArrayBuffer(docx));
    expect(blocks[0].level).toBe(1);
  });

  it('未知 styleId 不会被误判成标题', async () => {
    const docx = await buildDocx(`<w:p><w:pPr><w:pStyle w:val="a3"/></w:pPr>${runXml('正文')}</w:p>`);
    const blocks = await parseDocx(toArrayBuffer(docx));
    expect(blocks[0].level).toBe(0);
  });
});

describe('parseDocx —— 段落取舍', () => {
  it('空段落（<w:p></w:p>）不产出 block', async () => {
    const docx = await buildDocx(`<w:p></w:p>${`<w:p>${runXml('甲')}</w:p>`}<w:p></w:p>`);
    const blocks = await parseDocx(toArrayBuffer(docx));
    expect(blocks.map((block) => block.text)).toEqual(['甲']);
  });

  it('只有空白的段落也不产出（不生成空 <p>）', async () => {
    const docx = await buildDocx(`<w:p>${runXml('   ')}</w:p><w:p>${runXml('甲')}</w:p>`);
    expect((await parseDocx(toArrayBuffer(docx))).map((block) => block.text)).toEqual(['甲']);
  });

  it('空的标题段落也不产出（不生成空 <h1>）', async () => {
    const docx = await buildDocx(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr></w:p><w:p>${runXml('甲')}</w:p>`,
      STYLES_XML,
    );
    expect((await parseDocx(toArrayBuffer(docx))).map((block) => block.text)).toEqual(['甲']);
  });

  it('自闭合的 <w:p/> 不产出、也不吞掉后面的段落', async () => {
    const docx = await buildDocx(`<w:p/>${`<w:p>${runXml('甲')}</w:p>`}<w:p/>`);
    expect((await parseDocx(toArrayBuffer(docx))).map((block) => block.text)).toEqual(['甲']);
  });

  it('段落顺序保持不变', async () => {
    const docx = await buildDocx(['甲', '乙', '丙', '丁'].map((text) => `<w:p>${runXml(text)}</w:p>`).join(''));
    expect((await parseDocx(toArrayBuffer(docx))).map((block) => block.text)).toEqual(['甲', '乙', '丙', '丁']);
  });

  it('加粗 / 斜体保留在 segments 里', async () => {
    const docx = await buildDocx(
      `<w:p>${runXml('这一段用')}${runXml('加粗', { bold: true })}${runXml('和')}${runXml('斜体', { italic: true })}${runXml('混排。')}</w:p>`,
    );
    const blocks = await parseDocx(toArrayBuffer(docx));
    expect(blocks[0].text).toBe('这一段用加粗和斜体混排。');
    expect(blocks[0].segments.filter((segment) => segment.bold).map((segment) => segment.text)).toEqual(['加粗']);
    expect(blocks[0].segments.filter((segment) => segment.italic).map((segment) => segment.text)).toEqual(['斜体']);
  });

  it('段内硬换行 <> 保留在 block.text 里', async () => {
    const docx = await buildDocx('<w:p><w:r><w:t>硬换行前</w:t><w:br/><w:t>硬换行后</w:t></w:r></w:p>');
    expect((await parseDocx(toArrayBuffer(docx)))[0].text).toBe('硬换行前\n硬换行后');
  });

  it('表格单元格里的段落也会被读出来（退化成普通段落，文字不丢）', async () => {
    const docx = await buildDocx(
      '<w:tbl><w:tr><w:tc>' +
        `<w:p>${runXml('甲')}</w:p></w:tc><w:tc><w:p>${runXml('乙')}</w:p>` +
        '</w:tc></w:tr></w:tbl>',
    );
    expect((await parseDocx(toArrayBuffer(docx))).map((block) => block.text)).toEqual(['甲', '乙']);
  });

  it('<w:hyperlink> 里的 run 一样会被读到', async () => {
    const docx = await buildDocx(
      '<w:p><w:hyperlink r:id="rId1"><w:r><w:t>链接文字</w:t></w:r></w:hyperlink></w:p>',
    );
    expect((await parseDocx(toArrayBuffer(docx)))[0].text).toBe('链接文字');
  });

  it('deflate 压缩过的 .docx 也能读（走解压分支）', async () => {
    const bodyXml = Array.from({ length: 40 }, (_unused, i) => `<w:p>${runXml(`第 ${i + 1} 段`)}</w:p>`).join('');
    const zip = await buildZip([
      { name: 'word/document.xml', content: documentXml(bodyXml), method: 8 },
      { name: 'word/styles.xml', content: STYLES_XML, method: 8 },
    ]);
    const blocks = await parseDocx(toArrayBuffer(zip));
    expect(blocks).toHaveLength(40);
    expect(blocks[39].text).toBe('第 40 段');
  });
});

describe('parseDocx —— 错误处理', () => {
  it('空 buffer → 抛「文件是空的」', async () => {
    await expect(parseDocx(new ArrayBuffer(0))).rejects.toThrow(/空的/);
  });

  it('.doc（OLE2）→ 抛「另存为 .docx」的提示', async () => {
    await expect(parseDocx(toArrayBuffer(ole2Buffer()))).rejects.toThrow(/另存为 \.docx/);
  });

  it('.doc 的提示文案与 DOC_LEGACY_HINT 一致（对话框共用同一句）', async () => {
    await expect(parseDocx(toArrayBuffer(ole2Buffer()))).rejects.toThrow(DOC_LEGACY_HINT);
  });

  it('不是 ZIP → 抛「不是有效的 .docx」', async () => {
    await expect(parseDocx(toArrayBuffer(new Uint8Array(128).fill(0x20)))).rejects.toThrow(/不是有效的 \.docx/);
  });

  it('ZIP 里没有 word/document.xml → 抛「没有 Word 正文」', async () => {
    const zip = await buildZip([{ name: 'hello.txt', content: 'x' }]);
    await expect(parseDocx(toArrayBuffer(zip))).rejects.toThrow(/没有 Word 正文/);
  });

  it('不支持的压缩方式（method 12）→ 抛「不支持的压缩方式」', async () => {
    const zip = await buildZip([{ name: 'word/document.xml', content: 'x', method: 12 }]);
    await expect(parseDocx(toArrayBuffer(zip))).rejects.toThrow(/不支持的压缩方式/);
  });

  it('中央目录损坏 → 抛「已损坏」', async () => {
    const zip = await buildDocx(`<w:p>${runXml('甲')}</w:p>`);
    await expect(parseDocx(toArrayBuffer(corruptCentralDirectory(zip)))).rejects.toThrow(/已损坏/);
  });

  it('styles.xml 损坏时不影响正文解析（降级而不是失败）', async () => {
    const zip = await buildZip([
      { name: 'word/document.xml', content: documentXml(`<w:p>${runXml('甲')}</w:p>`) },
      { name: 'word/styles.xml', content: 'x', method: 12 },
    ]);
    const blocks = await parseDocx(toArrayBuffer(zip));
    expect(blocks.map((block) => block.text)).toEqual(['甲']);
  });

  it('损坏的 .docx 依然不返回任何 block（错误信息可读）', async () => {
    await expect(parseDocx(toArrayBuffer(new Uint8Array([0x50, 0x4b, 0x03, 0x04])))).rejects.toThrow(
      /不是有效的 \.docx/,
    );
  });
});

/* ════════════════════════════════════════════════════════════
 * docxBlocksToText / sliceBlocksByLines
 * ════════════════════════════════════════════════════════════ */

function makeBlock(text: string, level = 0): DocBlock {
  return { text, level, segments: [{ text, bold: false, italic: false }] };
}

describe('docxBlocksToText', () => {
  it('一段一行，行号与段落号对应', () => {
    const blocks = [makeBlock('第一章 风起'), makeBlock('风起了。'), makeBlock('第二章 落雨', 1)];
    const result = docxBlocksToText(blocks);
    expect(result.text).toBe('第一章 风起\n风起了。\n第二章 落雨');
    expect(result.lineBlockIndex).toEqual([0, 1, 2]);
  });

  it('含硬换行的段落占多行，且每行都指回同一个 block', () => {
    const blocks = [makeBlock('甲\n乙'), makeBlock('丙')];
    const result = docxBlocksToText(blocks);
    expect(result.text).toBe('甲\n乙\n丙');
    expect(result.lineBlockIndex).toEqual([0, 0, 1]);
  });

  it('空数组 → 空文本', () => {
    expect(docxBlocksToText([])).toEqual({ text: '', lineBlockIndex: [] });
  });
});

describe('sliceBlocksByLines', () => {
  const blocks = [makeBlock('第一章 风起', 1), makeBlock('风起了。'), makeBlock('第二章 落雨', 1), makeBlock('下雨了。')];
  const { lineBlockIndex } = docxBlocksToText(blocks);

  it('取中间一段（含边界）', () => {
    const sliced = sliceBlocksByLines(blocks, lineBlockIndex, 1, 3);
    expect(sliced.map((block) => block.text)).toEqual(['风起了。', '第二章 落雨']);
  });

  it('取整段', () => {
    expect(sliceBlocksByLines(blocks, lineBlockIndex, 0, 4)).toHaveLength(4);
  });

  it('单行区间', () => {
    expect(sliceBlocksByLines(blocks, lineBlockIndex, 2, 3).map((b) => b.text)).toEqual(['第二章 落雨']);
  });

  it('越界区间自动收敛（不崩）', () => {
    expect(sliceBlocksByLines(blocks, lineBlockIndex, -5, 999)).toHaveLength(4);
  });

  it('endLine 落在 startLine 之前 → 空数组', () => {
    expect(sliceBlocksByLines(blocks, lineBlockIndex, 3, 1)).toEqual([]);
  });

  it('空输入 → 空数组', () => {
    expect(sliceBlocksByLines([], [], 0, 2)).toEqual([]);
    expect(sliceBlocksByLines(blocks, [], 0, 2)).toEqual([]);
  });

  it('含硬换行的段落：按行切出来仍能拿到完整段落', () => {
    const multiline = [makeBlock('甲\n乙'), makeBlock('丙')];
    const index = docxBlocksToText(multiline).lineBlockIndex;
    expect(sliceBlocksByLines(multiline, index, 1, 2).map((b) => b.text)).toEqual(['甲\n乙']);
  });

  it('★ 空区间（endLine === startLine）返回空数组，不会把上一行抓回来', () => {
    // 只有标题、没有正文的章：startLine === endLine，clamp 兜不住，必须显式短路
    expect(sliceBlocksByLines(blocks, lineBlockIndex, 1, 1)).toEqual([]);
    expect(sliceBlocksByLines(blocks, lineBlockIndex, 0, 0)).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════
 * ★ 端到端：.docx 的章标题不能重复出现在正文里
 *
 * 复现的 bug：章节名 =「第一章」，正文里又出现一遍「第一章」（h1），字数因此偏大。
 * 根因：`startLine` 当时把标题行也圈进了区间 → 切片时标题段落被渲染成 `<h1>` 塞进正文。
 * ════════════════════════════════════════════════════════════ */

describe('★ 端到端：docx 标题不重复进正文', () => {
  /** 走一遍 ImportDialog 里那套 useMemo 链：段落 → 文本+索引 → 切章 → 按区间渲染 HTML */
  async function buildContents(bodyXml: string): Promise<{ titles: string[]; contents: string[]; wordCount: number }> {
    const zip = await buildDocx(bodyXml, STYLES_XML);
    const blocks = await parseDocx(toArrayBuffer(zip));
    const plain = docxBlocksToText(blocks);
    const split = splitChapters(plain.text, DEFAULT_SPLIT_RULE, { lineRanges: true });
    const chapters: RawChapter[] = split.chapters.map((chapter) => {
      const slice = sliceBlocksByLines(
        blocks,
        plain.lineBlockIndex,
        chapter.startLine ?? 0,
        chapter.endLine ?? 0,
      );
      return { ...chapter, html: docxBlocksToHtml(slice) };
    });
    const plan = planImport({ projectName: '甲', chapters, now: 1 });
    return {
      titles: plan.chapters.map((c) => c.title),
      contents: plan.chapters.map((c) => c.content ?? ''),
      wordCount: plan.stats.wordCount,
    };
  }

  it('★ 标题段落只进 title，不进正文 HTML', async () => {
    const result = await buildContents(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${runXml('第一章')}</w:p>` +
        `<w:p>${runXml('郑雄醒来。')}</w:p>` +
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${runXml('第二章')}</w:p>` +
        `<w:p>${runXml('天亮了。')}</w:p>`,
    );
    expect(result.titles).toEqual(['第一章', '第二章']);
    expect(result.contents).toEqual(['<p>郑雄醒来。</p>', '<p>天亮了。</p>']);
    expect(result.contents.join('')).not.toContain('<h1>');
  });

  it('★ 字数不再把标题行算进去', async () => {
    const result = await buildContents(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${runXml('第一章')}</w:p>` +
        `<w:p>${runXml('郑雄醒来。')}</w:p>`,
    );
    expect(result.wordCount).toBe(5); // 「郑雄醒来。」；含标题要多 3 字
  });

  it('章内的 h2 小节标题仍然保留在正文里（只剥章标题那一行）', async () => {
    // ⚠️ 小节名故意不含「章 / 回 / 节」：默认正则 `[章回节]` 会把「第一节 雨」也当成章标题
    const result = await buildContents(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${runXml('第一章')}</w:p>` +
        `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${runXml('雨夜')}</w:p>` +
        `<w:p>${runXml('下雨了。')}</w:p>`,
    );
    expect(result.contents).toEqual(['<h2>雨夜</h2><p>下雨了。</p>']);
    expect(result.titles).toEqual(['第一章']);
  });

  it('用「第 X 节」的小节标题会被默认规则当成章标题（既有行为，不是本 bug）', async () => {
    const result = await buildContents(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${runXml('第一章')}</w:p>` +
        `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${runXml('第一节 雨')}</w:p>` +
        `<w:p>${runXml('下雨了。')}</w:p>`,
    );
    expect(result.titles).toEqual(['第一章', '雨']);
    expect(result.contents).toEqual(['', '<p>下雨了。</p>']);
  });

  it('只有标题、没有正文的章 → content 为空（不会把标题捞回来）', async () => {
    const result = await buildContents(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${runXml('第一章')}</w:p>` +
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${runXml('第二章')}</w:p>` +
        `<w:p>${runXml('乙')}</w:p>`,
    );
    expect(result.contents[0]).toBe('');
    expect(result.contents[1]).toBe('<p>乙</p>');
  });

  it('加粗 / 斜体在正文里照样保留（剥标题不影响 run 级格式）', async () => {
    const result = await buildContents(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${runXml('第一章')}</w:p>` +
        `<w:p>${runXml('这里用')}${runXml('加粗', { bold: true })}${runXml('和')}${runXml('斜体', { italic: true })}</w:p>`,
    );
    expect(result.contents).toEqual(['<p>这里用<strong>加粗</strong>和<em>斜体</em></p>']);
  });
});
