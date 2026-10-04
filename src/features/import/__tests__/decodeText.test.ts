import { describe, expect, it } from 'vitest';
import {
  countBrokenChars,
  decodeBytes,
  detectBom,
  detectEncoding,
  encodingLabel,
  ENCODING_OPTIONS,
  isEncodingSupported,
} from '../decodeText';

/** '第一章 风起' 的 GBK 字节（记事本 ANSI 存中文就是这个形状） */
const GBK_SAMPLE = Uint8Array.from([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x20, 0xb7, 0xe7, 0xc6, 0xf0]);

/** '《书名》' 的 GBK 字节（全角标点） */
const GBK_PUNCT = Uint8Array.from([0xa1, 0xb6, 0xca, 0xe9, 0xc3, 0xfb, 0xa1, 0xb7]);

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('detectBom', () => {
  it('识别 UTF-8 BOM', () => {
    expect(detectBom(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41]))).toEqual({
      encoding: 'utf-8',
      bomLength: 3,
    });
  });

  it('识别 UTF-16 LE / BE BOM', () => {
    expect(detectBom(Uint8Array.from([0xff, 0xfe, 0x41, 0x00]))?.encoding).toBe('utf-16le');
    expect(detectBom(Uint8Array.from([0xfe, 0xff, 0x00, 0x41]))?.encoding).toBe('utf-16be');
  });

  it('没有 BOM 返回 null', () => {
    expect(detectBom(utf8('第一章'))).toBeNull();
    expect(detectBom(new Uint8Array(0))).toBeNull();
  });
});

describe('isEncodingSupported', () => {
  it('GBK / GB18030 这类中文编码可用（WebView2 与 Node 都带完整 ICU）', () => {
    expect(isEncodingSupported('gbk')).toBe(true);
    expect(isEncodingSupported('gb18030')).toBe(true);
    expect(isEncodingSupported('utf-8')).toBe(true);
  });

  it('乱写的编码名判定为不可用', () => {
    expect(isEncodingSupported('nonsense-enc')).toBe(false);
  });
});

describe('countBrokenChars', () => {
  it('数出 U+FFFD 的个数', () => {
    expect(countBrokenChars('ab\uFFFD\uFFFDc')).toBe(2);
    expect(countBrokenChars('正常中文')).toBe(0);
  });
});

describe('encodingLabel', () => {
  it('给出人类可读的编码名', () => {
    expect(encodingLabel('utf-8')).toBe('UTF-8');
    expect(encodingLabel('gb18030')).toBe('GB18030');
  });

  it('未知编码名退化成大写', () => {
    expect(encodingLabel('foo')).toBe('FOO');
  });
});

describe('ENCODING_OPTIONS', () => {
  it('第一项是自动探测', () => {
    expect(ENCODING_OPTIONS[0].value).toBe('auto');
  });

  it('包含 GBK（记事本默认）', () => {
    expect(ENCODING_OPTIONS.some((o) => o.value === 'gbk')).toBe(true);
  });
});

describe('detectEncoding', () => {
  it('UTF-8 文本判定为 utf-8', () => {
    expect(detectEncoding(utf8('第一章 风起')).encoding).toBe('utf-8');
  });

  it('纯 ASCII 归到 utf-8', () => {
    expect(detectEncoding(utf8('Chapter 1')).encoding).toBe('utf-8');
  });

  it('★ GBK 字节不会被误判成 UTF-8（UTF-8 严格解码会失败）', () => {
    const detected = detectEncoding(GBK_SAMPLE);
    expect(detected.encoding).not.toBe('utf-8');
    expect(detected.encoding).toBe('gb18030');
  });

  it('带 BOM 时直接按 BOM 判定', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('第一章')]);
    expect(detectEncoding(withBom)).toEqual({ encoding: 'utf-8', bom: true });
  });
});

describe('decodeBytes —— 自动探测', () => {
  it('UTF-8 文本原样解出', () => {
    const result = decodeBytes(utf8('第一章 风起\n风起了。'));
    expect(result.encoding).toBe('utf-8');
    expect(result.text).toBe('第一章 风起\n风起了。');
    expect(result.brokenChars).toBe(0);
    expect(result.warning).toBeNull();
  });

  it('去掉 UTF-8 BOM，正文首字符干净', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('第一章 风起')]);
    const result = decodeBytes(withBom);
    expect(result.bom).toBe(true);
    expect(result.text).toBe('第一章 风起');
    expect(result.text.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('★ GBK 稿子能正确解出中文，一个坏字都没有', () => {
    const result = decodeBytes(GBK_SAMPLE);
    expect(result.text).toBe('第一章 风起');
    expect(result.brokenChars).toBe(0);
    expect(result.warning).toBeNull();
  });

  it('★ GBK 全角标点也能正确解出', () => {
    expect(decodeBytes(GBK_PUNCT).text).toBe('《书名》');
  });

  it('UTF-16 LE + BOM 能解出（切片长度按 BOM 自己的编码算）', () => {
    const text = '第一章';
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      bytes[2 + i * 2] = code & 0xff;
      bytes[3 + i * 2] = code >> 8;
    }
    const result = decodeBytes(bytes);
    expect(result.encoding).toBe('utf-16le');
    expect(result.text).toBe(text);
    expect(result.brokenChars).toBe(0);
  });

  it('空文件给「文件是空的」提示', () => {
    const result = decodeBytes(new Uint8Array(0));
    expect(result.text).toBe('');
    expect(result.warning).toContain('空的');
  });
});

describe('decodeBytes —— 用户手选编码', () => {
  it('手选 GBK 解 GBK 稿子', () => {
    const result = decodeBytes(GBK_SAMPLE, 'gbk');
    expect(result.encoding).toBe('gbk');
    expect(result.text).toBe('第一章 风起');
  });

  it('★ 把 GBK 稿子当 UTF-8 解 → 有坏字 + 给出换编码的提示', () => {
    const result = decodeBytes(GBK_SAMPLE, 'utf-8');
    expect(result.brokenChars).toBeGreaterThan(0);
    expect(result.warning).toContain('解不出来');
    expect(result.warning).toContain('GBK');
  });

  it('手选环境不支持的编码 → 退回 UTF-8 并给警告', () => {
    // 用一个必然不可用的名字（类型上断言，测的是运行时的兜底分支）
    const result = decodeBytes(utf8('正文'), 'nonsense-enc' as never);
    expect(result.encoding).toBe('utf-8');
    expect(result.text).toBe('正文');
    expect(result.warning).toContain('不支持');
  });
});
