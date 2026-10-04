/**
 * .docx 导入 —— 零依赖解析器
 *
 * 为什么自己写而不用 mammoth（结论来自实测，见评估报告）：
 *   - 只用到「段落 / 标题 / 加粗 / 斜体」这几件事，mammoth 会让产物体积 +34%
 *     （brotli 296 KB → 396 KB），自写模块不到 10 KB；
 *   - 同一份 200 章稿子（0.62 MB docx）：自写 24~52 ms，mammoth 148 ms，
 *     两者输出的纯文本**逐字节一致** —— 说明自写没有精度损失。
 *
 * .docx 本质就是一个普通 ZIP，正文在 `word/document.xml`：
 *   ① ZIP：读中央目录 → 定位条目 → 用原生 `DecompressionStream('deflate-raw')` 解压
 *      （ZIP method 8 就是「裸 deflate」，没有 zlib 头尾，正好对应 deflate-raw）
 *   ② XML：docx 的 XML 结构极规整，正则扫段落 / run 足够，不需要完整 XML 解析器
 *
 * ★ 零依赖、纯函数 + 原生 API ⇒ **零 DOM、零 Dexie、零 Tauri 依赖**，可以在 node 里直接单测。
 *
 * ⚠️ 与 mammoth 一样，**Word 的自动编号列表（`<w:numPr>` 的编号）、表格结构、图片无法保留**：
 *   编号会退化成「没有编号的普通段落」，表格会退化成连续的普通段落，图片整段丢弃。
 *   这是 .docx → 结构文本的**固有损失**，不是实现缺陷（表格与列表里的**文字**不会丢）。
 */

/** ZIP 三处签名 */
const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

/** EOCD 固定部分长度（不含注释） */
const EOCD_MIN_LENGTH = 22;
/** ZIP 注释最长 65535 → 从尾部最多回看 22 + 65535 字节 */
const EOCD_MAX_SCAN = EOCD_MIN_LENGTH + 0xffff;
/** ZIP64 的占位值（真 .docx 不会用到，遇到就直接给友好提示） */
const ZIP64_COUNT_MARKER = 0xffff;
const ZIP64_OFFSET_MARKER = 0xffffffff;

/** 正文条目 */
export const DOCX_MAIN_ENTRY = 'word/document.xml';
/** 样式表条目（可能不存在） */
export const DOCX_STYLES_ENTRY = 'word/styles.xml';

/** 标题最多到 h3 —— 编辑器 CSS 只写了 h1~h3 的样式，更深的层级显示不出来 */
export const DOCX_MAX_HEADING_LEVEL = 3;

/** Word 97-2003（.doc）的 OLE2 复合文档文件头 */
const OLE2_HEADER = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** .doc 的友好提示（对话框按扩展名拦截时也用这一句，保证口径一致） */
export const DOC_LEGACY_HINT =
  '这是 Word 97-2003 的老格式（.doc），本功能只支持 .docx。请用 Word 或 WPS 打开它，另存为 .docx 之后再来导入。';

const NO_DECOMPRESSION_HINT =
  '当前环境不支持解压 .docx（缺少 DecompressionStream）。请升级浏览器，或改用桌面版。';

/** 一个 run（Word 里「一段格式一致的连续文字」）：加粗 / 斜体是 run 级别的属性 */
export interface DocRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

/** 一个段落：`level` 为 0 表示正文，1~3 表示一级/二级/三级标题 */
export interface DocBlock {
  text: string;
  level: number;
  segments: DocRun[];
}

/** 段落模型摊平成文本后的结果：一行 = 段落里的一段（`<w:br/>` 会额外占一行） */
export interface DocxText {
  text: string;
  /** 第 i 行来自第 `lineBlockIndex[i]` 个 block —— 用来把「行区间」映射回「段落区间」 */
  lineBlockIndex: number[];
}

const UTF8_DECODER = new TextDecoder('utf-8');

function decodeUtf8(bytes: Uint8Array): string {
  return UTF8_DECODER.decode(bytes);
}

/** 是不是 Word 97-2003 的 .doc（OLE2 复合文档） */
export function isOle2Document(bytes: Uint8Array): boolean {
  if (bytes.byteLength < OLE2_HEADER.length) return false;
  return OLE2_HEADER.every((byte, i) => bytes[i] === byte);
}

/** 当前环境能不能解压（浏览器 / WebView2 / node 18+ 都有；老环境兜底给提示） */
export function canDecompress(): boolean {
  return typeof DecompressionStream === 'function';
}

function clampHeadingLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  return Math.min(Math.floor(level), DOCX_MAX_HEADING_LEVEL);
}

function clampIndex(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 从 ZIP 里取出一个条目的**原始字节**；条目不存在时返回 `null`（不是抛错）。
 *
 * 结构错误（读不到 EOCD / 中央目录坏了）才抛错，且错误信息都是给用户看的中文。
 */
export async function readZipEntry(bytes: Uint8Array, entryName: string): Promise<Uint8Array | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // ① 从尾部往前找 EOCD；顺带做合理性校验，避免把 deflate 数据里偶然出现的
  //    0x06054b50 当成真的结尾记录
  let eocd = -1;
  const scanFloor = Math.max(0, bytes.byteLength - EOCD_MAX_SCAN);
  for (let i = bytes.byteLength - EOCD_MIN_LENGTH; i >= scanFloor; i--) {
    if (view.getUint32(i, true) !== EOCD_SIG) continue;
    const candidateCount = view.getUint16(i + 10, true);
    const candidateOffset = view.getUint32(i + 16, true);
    const candidateSize = view.getUint32(i + 12, true);
    const plausible =
      candidateOffset + candidateSize <= i && (candidateCount === 0 || candidateOffset + 46 <= i);
    if (plausible) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('这个文件不是有效的 .docx（读不到压缩包结尾记录）。可能文件已损坏，或者是别的格式改了后缀名。');
  }

  const entryCount = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entryCount === ZIP64_COUNT_MARKER || centralOffset === ZIP64_OFFSET_MARKER) {
    throw new Error('这个 .docx 用了 ZIP64 格式，暂不支持。');
  }

  let p = centralOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > bytes.byteLength || view.getUint32(p, true) !== CDH_SIG) {
      throw new Error('这个 .docx 已损坏（压缩包中央目录读不出来）。');
    }
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decodeUtf8(bytes.subarray(p + 46, p + 46 + nameLength));

    if (name === entryName) {
      return await extractEntry(bytes, view, localOffset, compressedSize, method);
    }
    p += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

/** 读本地文件头 → 取出数据段 → 按 method 解压 */
async function extractEntry(
  bytes: Uint8Array,
  view: DataView,
  localOffset: number,
  compressedSize: number,
  method: number,
): Promise<Uint8Array> {
  if (localOffset + 30 > bytes.byteLength || view.getUint32(localOffset, true) !== LFH_SIG) {
    throw new Error('这个 .docx 已损坏（压缩包条目头读不出来）。');
  }
  // ⚠️ 本地头的 name/extra 长度可能与中央目录不一致，必须重新读
  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + nameLength + extraLength;
  // 拷一份（不别名外部 buffer）：`new Uint8Array(view)` 得到的才是 `Uint8Array<ArrayBuffer>`，
  // 能直接喂给 `Blob`；顺带也让 method 0 那条路不必再拷一次
  const compressed = new Uint8Array(bytes.subarray(dataStart, dataStart + compressedSize));

  if (method === 0) return compressed; // stored，已经是独立副本
  if (method !== 8) throw new Error(`这个 .docx 用了不支持的压缩方式（method ${method}）。`);
  if (!canDecompress()) throw new Error(NO_DECOMPRESSION_HINT);

  try {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new Error('解压 .docx 失败，文件可能已损坏。');
  }
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * 解 XML 文本节点里的转义。
 * - 数字实体 `&#26085;` / `&#x65E5;`
 * - 命名实体 `&amp;` `&lt;` `&gt;` `&quot;` `&apos;`
 * - `_x005F_` 是「下划线本身」的转义，还原成 `_`
 * - `_x000D_` 是 Word 在段内插的回车标记，正文里不该出现，直接丢掉
 */
export function decodeXmlText(text: string): string {
  return text
    .replace(/_x005F_/gi, '_')
    .replace(/_x000[dD]_/g, '')
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_matched, hex: string) => codePointOrEmpty(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_matched, dec: string) => codePointOrEmpty(Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_matched, name: string) => XML_ENTITIES[name]);
}

function codePointOrEmpty(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** 样式名 → 标题级别：兼容英文「heading 1」与中文「标题 1 / 標題 1」 */
function headingLevelFromName(name: string): number {
  const match = /^(?:heading|标题|標題)\s*([1-9])(?:\s|$)/i.exec(name.trim());
  return match ? clampHeadingLevel(Number(match[1])) : 0;
}

/** styleId 本身兜底：Word 中文版内置样式 id 就是 "1"~"9"，英文版是 "Heading1" */
function headingLevelFromStyleId(styleId: string): number {
  const match = /^(?:heading\s*)?([1-9])$/i.exec(styleId.trim());
  return match ? clampHeadingLevel(Number(match[1])) : 0;
}

/** 一个 `<w:style>` 的样式体 → 标题级别（0 = 不是标题样式） */
function headingLevelFromStyleBody(styleBody: string): number {
  // ① 最可靠：大纲级别（outlineLvl 0 = 1 级标题），与语言无关、WPS/Word 都写
  const outline = /<w:outlineLvl\b[^>]*w:val="([0-8])"/.exec(styleBody);
  if (outline) return clampHeadingLevel(Number(outline[1]) + 1);
  // ② 兜底：样式名
  const nameMatch = /<w:name\b[^>]*w:val="([^"]+)"/.exec(styleBody);
  return nameMatch ? headingLevelFromName(nameMatch[1]) : 0;
}

/**
 * 扫 `word/styles.xml`，得到 `styleId → 标题级别` 的映射。
 *
 * ⚠️ 只认 `w:type="paragraph"` 的样式；属性顺序不固定，所以先把整个开始标签切下来再逐个取，
 *    不用「按固定顺序」的一条大正则（那样遇到 styleId 写在 type 前面的文档就全废了）。
 */
export function headingLevelFromStyles(stylesXml: string): Map<string, number> {
  const levels = new Map<string, number>();
  if (!stylesXml) return levels;

  const styleRe = /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g;
  let match: RegExpExecArray | null;
  while ((match = styleRe.exec(stylesXml)) !== null) {
    const attrs = match[1];
    const styleBody = match[2];
    if (!/w:type="paragraph"/.test(attrs)) continue;
    const idMatch = /w:styleId="([^"]+)"/.exec(attrs);
    if (!idMatch) continue;
    const level = headingLevelFromStyleBody(styleBody);
    if (level > 0) levels.set(idMatch[1], level);
  }
  return levels;
}

const SELF_CLOSING_RUN_RE = /<w:r\b(?![a-zA-Z])[^>]*\/>/g;
const RUN_RE = /<w:r\b(?![a-zA-Z])[^>]*>([\s\S]*?)<\/w:r>/g;
const REVISION_TEXT_RE = /<w:(?:delText|instrText)\b[^>]*\/>|<w:(?:delText|instrText)\b[^>]*>[\s\S]*?<\/w:(?:delText|instrText)>/g;
const RUN_PROPS_RE = /<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/;
const INLINE_RE = /<w:(?:br|cr)\b[^>]*\/>|<w:tab\b[^>]*\/>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;

/** `<w:b/>` / `<w:i/>` 这类开关：没有 `w:val` 或 `w:val` 不是 0/false/off/none 才算「开」 */
function isToggleOn(runProps: string, tag: 'b' | 'i'): boolean {
  const match = new RegExp(`<w:${tag}\\b([^>]*?)\\/?>`).exec(runProps);
  if (!match) return false;
  return !/w:val="(?:0|false|off|none)"/.test(match[1]);
}

/** 一个 run 的纯文本：`<w:br/>`→换行、`<w:tab/>`→制表符、`<w:t>`→解码后的文字 */
function runText(runXml: string): string {
  // 修订删除（delText）与域代码（instrText）都不是正文，先整段摘掉
  const body = runXml.replace(REVISION_TEXT_RE, '');

  let out = '';
  let match: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(body)) !== null) {
    if (/^<w:tab/.test(match[0])) out += '\t';
    else if (/^<w:t\b/.test(match[0])) out += decodeXmlText(match[1]);
    else out += '\n'; // <w:br/> 或 <w:cr/>
  }
  return out;
}

/** 把一个 `<w:p>` 的内容拆成一串 run（保留每个 run 的加粗 / 斜体） */
export function runsToText(paragraphXml: string): DocRun[] {
  const cleaned = paragraphXml.replace(SELF_CLOSING_RUN_RE, '');
  const segments: DocRun[] = [];

  let match: RegExpExecArray | null;
  RUN_RE.lastIndex = 0;
  while ((match = RUN_RE.exec(cleaned)) !== null) {
    const runXml = match[1];
    const text = runText(runXml);
    if (text.length === 0) continue;
    const props = RUN_PROPS_RE.exec(runXml);
    const runProps = props ? props[1] : '';
    segments.push({
      text,
      bold: isToggleOn(runProps, 'b'),
      italic: isToggleOn(runProps, 'i'),
    });
  }
  return segments;
}

/** 段落级别：段落自带的 outlineLvl > 段落样式 > styleId 本身兜底 */
function paragraphHeadingLevel(paragraphXml: string, styleLevels: Map<string, number>): number {
  const directOutline = /<w:outlineLvl\b[^>]*w:val="([0-8])"/.exec(paragraphXml);
  if (directOutline) return clampHeadingLevel(Number(directOutline[1]) + 1);

  const styleMatch = /<w:pStyle\b[^>]*w:val="([^"]+)"/.exec(paragraphXml);
  if (!styleMatch) return 0;
  const styleId = styleMatch[1];
  const fromStyles = styleLevels.get(styleId);
  return fromStyles === undefined ? headingLevelFromStyleId(styleId) : fromStyles;
}

const PARAGRAPH_RE = /<w:p\b(?![a-zA-Z])[^>]*>([\s\S]*?)<\/w:p>/g;

/**
 * 扫 `word/document.xml` 得到段落模型。
 *
 * 说明：
 * - 空段落（只有空白）一律不产出 —— 免得变成一堆空 `<p>` 或空 `<h1>`
 * - 自闭合的 `<w:p/>` 直接不产出（同上）
 * - 表格单元格、文本框、内容控件里的 `<w:p>` 也会被扫到 ⇒ 表格文字不丢，
 *   但会退化成连续的普通段落（结构保不住，已在 UI 里显式提示）
 */
export function parseDocumentXml(docXml: string, styleLevels: Map<string, number>): DocBlock[] {
  const blocks: DocBlock[] = [];

  let match: RegExpExecArray | null;
  PARAGRAPH_RE.lastIndex = 0;
  while ((match = PARAGRAPH_RE.exec(docXml)) !== null) {
    const paragraphXml = match[1];
    const segments = runsToText(paragraphXml);
    const text = segments.map((segment) => segment.text).join('');
    if (text.trim().length === 0) continue;
    blocks.push({ text, level: paragraphHeadingLevel(paragraphXml, styleLevels), segments });
  }
  return blocks;
}

/**
 * 主入口：.docx 字节 → 段落模型。
 *
 * 抛出的错误信息都是可以直接显示给用户的中文（不是 docx / .doc / 损坏 / 不支持）。
 */
export async function parseDocx(data: ArrayBuffer): Promise<DocBlock[]> {
  const bytes = new Uint8Array(data);
  if (bytes.byteLength === 0) throw new Error('这个文件是空的，没有内容可以导入。');
  if (isOle2Document(bytes)) throw new Error(DOC_LEGACY_HINT);

  const documentRaw = await readZipEntry(bytes, DOCX_MAIN_ENTRY);
  if (!documentRaw) {
    throw new Error('这个文件里没有 Word 正文（word/document.xml），可能不是 .docx 文件。');
  }

  let stylesXml = '';
  try {
    const stylesRaw = await readZipEntry(bytes, DOCX_STYLES_ENTRY);
    if (stylesRaw) stylesXml = decodeUtf8(stylesRaw);
  } catch {
    // 没有 styles.xml（或它坏了）不影响正文解析，只是少一层「标题 1」样式识别
  }

  return parseDocumentXml(decodeUtf8(documentRaw), headingLevelFromStyles(stylesXml));
}

/**
 * 段落模型摊平成文本：**一个段落占一行**，段落内部由 `<w:br/>` 产生的换行也各占一行。
 *
 * 这份文本用来走「切分章节」的既有流程（按行做正则 / 分隔符判断），
 * `lineBlockIndex` 则把切出来的行区间映射回段落区间，供渲染 HTML 用。
 */
export function docxBlocksToText(blocks: DocBlock[]): DocxText {
  const lines: string[] = [];
  const lineBlockIndex: number[] = [];

  for (let index = 0; index < blocks.length; index++) {
    const parts = blocks[index].text.split('\n');
    for (const part of parts) {
      lines.push(part);
      lineBlockIndex.push(index);
    }
  }

  return { text: lines.join('\n'), lineBlockIndex };
}

/**
 * 按 `[startLine, endLine)` 行区间取出对应的段落（越界会自动收敛到有效范围）。
 *
 * ★ `endLine <= startLine` 直接返回空数组：这代表「这一章只有标题、没有正文」。
 *   不能靠下面的 clamp 兜（clamp 后 `endLine-1` 会缩到 startLine 上，
 *   把**标题那个块**又抓回来 —— 正好是「标题重复进正文」那个 bug 的翻版）。
 */
export function sliceBlocksByLines(
  blocks: DocBlock[],
  lineBlockIndex: number[],
  startLine: number,
  endLine: number,
): DocBlock[] {
  if (blocks.length === 0 || lineBlockIndex.length === 0) return [];
  if (endLine <= startLine) return [];
  const lastLine = lineBlockIndex.length - 1;
  const from = lineBlockIndex[clampIndex(startLine, 0, lastLine)];
  const to = lineBlockIndex[clampIndex(endLine - 1, 0, lastLine)];
  if (to < from) return [];
  return blocks.slice(from, to + 1);
}
