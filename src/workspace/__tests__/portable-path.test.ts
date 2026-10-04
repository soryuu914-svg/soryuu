import { describe, expect, it } from 'vitest';
import {
  basename,
  detectSeparator,
  dirname,
  join,
  normalizeIncoming,
  portablePath,
  resolve,
} from '../portable-path';

describe('normalizeIncoming', () => {
  it('把反斜杠统一成正斜杠', () => {
    expect(normalizeIncoming('C:\\Users\\a\\b')).toBe('C:/Users/a/b');
  });

  it('折叠 3 个及以上连续斜杠（只留 2 个给 UNC）', () => {
    expect(normalizeIncoming('a///b')).toBe('a//b');
    expect(normalizeIncoming('a/////b')).toBe('a//b');
  });

  it('保留 UNC 前导双斜杠', () => {
    expect(normalizeIncoming('\\\\server\\share')).toBe('//server/share');
    expect(normalizeIncoming('//server/share')).toBe('//server/share');
  });

  it('剔除控制字符', () => {
    expect(normalizeIncoming('a\u0000b\u001fc')).toBe('abc');
  });

  it('空串安全', () => {
    expect(normalizeIncoming('')).toBe('');
  });
});

describe('detectSeparator', () => {
  it('含反斜杠判定为反斜杠风格', () => {
    expect(detectSeparator('C:\\a')).toBe('\\');
  });

  it('只含正斜杠判定为正斜杠风格', () => {
    expect(detectSeparator('C:/a')).toBe('/');
  });

  it('无分隔符默认正斜杠', () => {
    expect(detectSeparator('abc')).toBe('/');
  });
});

describe('join', () => {
  it('反斜杠风格的根 → 输出反斜杠', () => {
    expect(join('C:\\ws', 'workspace.json')).toBe('C:\\ws\\workspace.json');
  });

  it('正斜杠风格的根 → 输出正斜杠', () => {
    expect(join('C:/ws', 'workspace.json')).toBe('C:/ws/workspace.json');
  });

  it('盘符根', () => {
    expect(join('C:\\', 'ws', 'books')).toBe('C:\\ws\\books');
  });

  it('POSIX 根', () => {
    expect(join('/', 'ws', 'books')).toBe('/ws/books');
  });

  it('中文路径原样保留（不做 slugify）', () => {
    expect(join('C:\\我的网文', 'books', '1-修仙世界从凡人到仙帝', 'chapters')).toBe(
      'C:\\我的网文\\books\\1-修仙世界从凡人到仙帝\\chapters',
    );
  });

  it('尾部斜杠与重复斜杠被折叠', () => {
    expect(join('C:\\ws\\', '/books/', 'x')).toBe('C:\\ws\\books\\x');
  });

  it('空段被忽略', () => {
    expect(join('', 'a', '', 'b')).toBe('a/b');
  });

  it('全部为空 → 空串', () => {
    expect(join()).toBe('');
    expect(join('', '')).toBe('');
  });

  it('解析 . 与 ..', () => {
    expect(join('C:\\ws\\a', '..', 'b')).toBe('C:\\ws\\b');
    expect(join('C:\\ws', '.', 'b')).toBe('C:\\ws\\b');
  });

  it('绝对段不丢弃前面的段（对齐 path.join 而非 resolve）', () => {
    expect(join('C:\\ws', '/books')).toBe('C:\\ws\\books');
  });

  it('UNC', () => {
    expect(join('\\\\server\\share', 'books', 'x.json')).toBe(
      '\\\\server\\share\\books\\x.json',
    );
  });

  it('深层目录（24 表 → 文件映射会用到）', () => {
    expect(join('C:\\ws', 'books', '1-书', 'chapters', 'vol-01', '0042.json')).toBe(
      'C:\\ws\\books\\1-书\\chapters\\vol-01\\0042.json',
    );
  });

  it('混合风格时以第一个含分隔符的入参为准', () => {
    expect(join('C:/ws', '\\books')).toBe('C:/ws/books');
    expect(join('C:\\ws', '/books')).toBe('C:\\ws\\books');
  });
});

describe('dirname', () => {
  it('反斜杠风格', () => {
    expect(dirname('C:\\ws\\books\\x.json')).toBe('C:\\ws\\books');
  });

  it('盘符根保持（C:\\ws 的父目录是 C:\\）', () => {
    expect(dirname('C:\\ws')).toBe('C:\\');
    expect(dirname('C:\\')).toBe('C:\\');
  });

  it('正斜杠风格', () => {
    expect(dirname('C:/ws/books')).toBe('C:/ws');
  });

  it('POSIX 根', () => {
    expect(dirname('/a/b')).toBe('/a');
    expect(dirname('/a')).toBe('/');
    expect(dirname('/')).toBe('/');
  });

  it('相对路径无父目录 → .（与 Node 一致）', () => {
    expect(dirname('a')).toBe('.');
    expect(dirname('')).toBe('.');
  });

  it('中文', () => {
    expect(dirname('C:\\我的网文\\books\\0042.json')).toBe('C:\\我的网文\\books');
  });
});

describe('basename', () => {
  it('普通路径', () => {
    expect(basename('C:\\ws\\books\\0042.json')).toBe('0042.json');
    expect(basename('C:/ws/books')).toBe('books');
  });

  it('中文工作区名（批 2 skeleton 用它做默认名）', () => {
    expect(basename('C:\\Users\\x\\Desktop\\写作台工作区')).toBe('写作台工作区');
    expect(basename('C:\\Users\\x\\Desktop\\写作台工作区\\')).toBe('写作台工作区');
  });

  it('根路径 → 空串（与 Node 一致）', () => {
    expect(basename('C:\\')).toBe('');
    expect(basename('/')).toBe('');
    expect(basename('')).toBe('');
  });
});

describe('resolve', () => {
  it('语义等同 join（前端无 cwd，不做绝对化）', () => {
    expect(resolve('C:\\ws', 'books', 'x.json')).toBe(join('C:\\ws', 'books', 'x.json'));
    expect(resolve('C:\\ws', 'books')).toBe('C:\\ws\\books');
  });
});

describe('portablePath 接口实现', () => {
  it('四个方法都是函数（可直接喂给批 2 引擎）', () => {
    expect(typeof portablePath.join).toBe('function');
    expect(typeof portablePath.dirname).toBe('function');
    expect(typeof portablePath.basename).toBe('function');
    expect(typeof portablePath.resolve).toBe('function');
  });

  it('复现批 2 paths.ts 的真实组合调用形态', () => {
    const root = 'C:\\Users\\70354\\Desktop\\写作台工作区';
    const bookDir = join(root, 'books', '1-修仙世界从凡人到仙帝');
    expect(bookDir).toBe(
      'C:\\Users\\70354\\Desktop\\写作台工作区\\books\\1-修仙世界从凡人到仙帝',
    );

    const chapterPath = join(bookDir, 'chapters', 'vol-01', '0042.json');
    expect(chapterPath).toBe(
      'C:\\Users\\70354\\Desktop\\写作台工作区\\books\\1-修仙世界从凡人到仙帝\\chapters\\vol-01\\0042.json',
    );

    // 与 dirname/basename 往返一致（atomic-write 会对目标路径取 dirname 建父目录）
    expect(dirname(chapterPath)).toBe(
      'C:\\Users\\70354\\Desktop\\写作台工作区\\books\\1-修仙世界从凡人到仙帝\\chapters\\vol-01',
    );
    expect(basename(chapterPath)).toBe('0042.json');

    // workspace.json 就在根下
    expect(join(root, 'workspace.json')).toBe(
      'C:\\Users\\70354\\Desktop\\写作台工作区\\workspace.json',
    );
  });
});
