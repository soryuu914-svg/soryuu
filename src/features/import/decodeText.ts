/**
 * TXT / MD 导入 —— 文本编码探测与解码
 *
 * 为什么需要这个：需求里写「编码默认 UTF-8」，但本项目的真实场景是
 * **「网文作者从记事本/其他工具迁稿进来」** —— Windows 记事本另存为时默认是
 * ANSI（简体中文下就是 GBK）。GBK 的中文字节按 UTF-8 解出来是一片 `\uFFFD`（乱码），
 * 直接导入等于把稿子毁了。所以这里做一次「BOM → UTF-8 → GBK」的探测，
 * 拿不准时降级到「哪个解出来的坏字少用哪个」，并且把结论显示给用户。
 *
 * 纯函数：只吃 `Uint8Array`，零 DOM、零文件系统依赖 ⇒ node 环境可直接单测。
 */

/** 下拉框里可选的编码（auto = 自动探测） */
export type TextEncodingChoice =
  | 'auto'
  | 'utf-8'
  | 'gbk'
  | 'gb18030'
  | 'big5'
  | 'utf-16le'
  | 'utf-16be';

export const ENCODING_OPTIONS: Array<{ value: TextEncodingChoice; label: string }> = [
  { value: 'auto', label: '自动探测（推荐）' },
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'gbk', label: 'GBK / ANSI（记事本默认）' },
  { value: 'gb18030', label: 'GB18030（GBK 超集）' },
  { value: 'big5', label: 'Big5（繁体）' },
  { value: 'utf-16le', label: 'UTF-16 LE' },
  { value: 'utf-16be', label: 'UTF-16 BE' },
];

export interface DecodeResult {
  /** 解码后的文本（BOM 已剥离、CRLF 未动，交给切分模块统一处理） */
  text: string;
  /** 实际使用的解码器 label */
  encoding: string;
  /** 是否命中 BOM */
  bom: boolean;
  /** 解不出来的字符数（U+FFFD 的个数）—— >0 表示编码选错了 */
  brokenChars: number;
  /** 给用户看的一句人话（只在有问题时非 null） */
  warning: string | null;
}

/** 解码器是否可用（WebView2 / Chromium / Node 都带完整 ICU，正常都可用；拿不到就退化） */
const supportedCache = new Map<string, boolean>();

export function isEncodingSupported(label: string): boolean {
  const cached = supportedCache.get(label);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    new TextDecoder(label as string);
    ok = true;
  } catch {
    ok = false;
  }
  supportedCache.set(label, ok);
  return ok;
}

/** 识别 BOM，返回编码与 BOM 字节数 */
export function detectBom(bytes: Uint8Array): { encoding: string; bomLength: number } | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8', bomLength: 3 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', bomLength: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'utf-16be', bomLength: 2 };
  }
  return null;
}

/** U+FFFD 的个数 */
export function countBrokenChars(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (ch === '\uFFFD') count++;
  }
  return count;
}

/** 按指定 label 解码；fatal=true 时遇到非法字节直接抛错 */
function tryDecode(bytes: Uint8Array, label: string, fatal: boolean): string | null {
  if (!isEncodingSupported(label)) return null;
  try {
    return new TextDecoder(label, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

/** 先按 utf-8 严格解一次，成功就说明是 UTF-8（纯 ASCII 也归 UTF-8，与 GBK 结果一致） */
function looksLikeUtf8(bytes: Uint8Array): boolean {
  const strict = tryDecode(bytes, 'utf-8', true);
  if (strict === null) return false;
  return countBrokenChars(strict) === 0;
}

/** 自动探测：BOM → 严格 UTF-8 → strict GB18030 → 坏字少的那个 */
export function detectEncoding(bytes: Uint8Array): { encoding: string; bom: boolean } {
  const bom = detectBom(bytes);
  if (bom) return { encoding: bom.encoding, bom: true };
  if (looksLikeUtf8(bytes)) return { encoding: 'utf-8', bom: false };
  const strictGb = tryDecode(bytes, 'gb18030', true);
  if (strictGb !== null) return { encoding: 'gb18030', bom: false };
  // 都不严格可解（截断/混合文件）→ 比坏字数
  const looseUtf8 = tryDecode(bytes, 'utf-8', false) ?? '';
  const looseGb = tryDecode(bytes, 'gb18030', false) ?? '';
  const brokenUtf8 = countBrokenChars(looseUtf8);
  const brokenGb = countBrokenChars(looseGb);
  return { encoding: brokenGb < brokenUtf8 ? 'gb18030' : 'utf-8', bom: false };
}

const ENCODING_LABELS: Record<string, string> = {
  'utf-8': 'UTF-8',
  gbk: 'GBK',
  gb18030: 'GB18030',
  big5: 'Big5',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
};

export function encodingLabel(encoding: string): string {
  return ENCODING_LABELS[encoding] ?? encoding.toUpperCase();
}

/**
 * 主入口：把文件字节解成文本。
 *
 * @param choice `auto` 走探测；其余按用户指定（指定了但解不出来会退回 UTF-8 兜底并给警告）
 */
export function decodeBytes(bytes: Uint8Array, choice: TextEncodingChoice = 'auto'): DecodeResult {
  // BOM 只认一次：切片长度按 BOM 自己的编码算，否则「文件是 UTF-16 但用户手选 UTF-8」会把字节切错
  const bomInfo = detectBom(bytes);
  const payload = bomInfo ? bytes.subarray(bomInfo.bomLength) : bytes;

  let encoding: string;
  let warningFromChoice: string | null = null;

  if (choice === 'auto') {
    encoding = detectEncoding(bytes).encoding;
  } else if (isEncodingSupported(choice)) {
    encoding = choice;
  } else {
    encoding = 'utf-8';
    warningFromChoice = `这个环境不支持 ${encodingLabel(choice)} 解码，已改用 UTF-8，请检查正文是否乱码。`;
  }

  const text = tryDecode(payload, encoding, false) ?? tryDecode(payload, 'utf-8', false) ?? '';
  const brokenChars = countBrokenChars(text);

  let warning: string | null = warningFromChoice;
  if (warning === null && brokenChars > 0) {
    warning =
      `有 ${brokenChars} 个字符解不出来，当前按 ${encodingLabel(encoding)} 解码。` +
      `如果正文里出现 \uFFFD 这类乱码符号，请在上方换一个编码（简体中文稿子通常是 GBK / ANSI）。`;
  } else if (warning === null && text.length === 0) {
    warning = '这个文件是空的，换个文件试试。';
  }

  return { text, encoding, bom: bomInfo !== null, brokenChars, warning };
}
