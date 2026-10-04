import { describe, expect, it } from 'vitest';

import { nodePaths } from '../node-fs';
import {
  ALL_TABLE_NAMES,
  TABLE_LAYOUT,
  bookDirName,
  buildTableLayout,
  chapterFileName,
  journalFileName,
  localBookDirName,
  padNumber,
  resolveBookDir,
  resolveChapterFilePath,
  resolveJournalFilePath,
  resolveLocalBookChapterPath,
  resolveRecordFilePath,
  resolveSingleFilePath,
  slugify,
  tableLayoutFor,
  volumeDirName,
  workspaceFilePath,
} from '../paths';

/** 把 Windows 的 `\` 折成 `/`，让断言跨平台可读。 */
const norm = (p: string): string => p.replace(/\\/g, '/');

const ROOT = 'C:/ws';
const BOOK = { projectId: 1, title: '修仙世界从凡人到仙帝' };

describe('slugify', () => {
  it('保留中文（不做拼音化）', () => {
    expect(slugify('修仙世界从凡人到仙帝')).toBe('修仙世界从凡人到仙帝');
  });

  it('把 Windows 非法字符 \\ / : * ? " < > | 折成 -', () => {
    expect(slugify('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });

  it('空白串折成单个 -', () => {
    expect(slugify('我的   书')).toBe('我的-书');
    expect(slugify('  我的书  ')).toBe('我的书');
  });

  it('NFKC 归一化：全角字母数字转半角', () => {
    expect(slugify('ＡＢＣ１２３')).toBe('ABC123');
  });

  it('删掉控制字符', () => {
    expect(slugify('a\u0000b\u001fc\u007fd')).toBe('abcd');
  });

  it('emoji 等不允许的字符折成 -，并在首尾被清掉', () => {
    expect(slugify('书名🔥')).toBe('书名');
    expect(slugify('🔥书名🔥')).toBe('书名');
  });

  it('结尾的点被清掉（Windows 不允许）', () => {
    expect(slugify('x.')).toBe('x');
    expect(slugify('x...')).toBe('x');
  });

  it('折叠连续 -，不留首尾 - 或 _', () => {
    expect(slugify('a---b')).toBe('a-b');
    expect(slugify('-a-')).toBe('a');
    expect(slugify('__a__')).toBe('a');
  });

  it('空 / 全非法 → 兜底名', () => {
    expect(slugify('')).toBe('untitled');
    expect(slugify('   ')).toBe('untitled');
    expect(slugify('///')).toBe('untitled');
    expect(slugify('', { fallback: 'book' })).toBe('book');
  });

  it('Windows 保留设备名加 _ 前缀', () => {
    expect(slugify('CON')).toBe('_CON');
    expect(slugify('con')).toBe('_con');
    expect(slugify('com1')).toBe('_com1');
    expect(slugify('LPT9')).toBe('_LPT9');
  });

  it('只是包含保留词的不受影响', () => {
    expect(slugify('CONSOLE')).toBe('CONSOLE');
    expect(slugify('com10')).toBe('com10');
  });

  it('超长按码点截断，且不留尾部 -', () => {
    const long = 'あ'.repeat(100);
    expect([...slugify(long, { maxLength: 10 })].length).toBe(10);

    const withDash = `${'a'.repeat(9)}-bbb`;
    expect(slugify(withDash, { maxLength: 10 })).toBe('a'.repeat(9));
  });

  it('不截断代理对（emoji 被折算，但中文/星号平面字符不炸）', () => {
    const s = '𠀋'.repeat(5); // U+2000B，星号平面
    expect(slugify(s, { maxLength: 3 })).toBe('𠀋'.repeat(3));
  });
});

describe('序号补零 / 文件名格式化', () => {
  it('padNumber', () => {
    expect(padNumber(42, 4)).toBe('0042');
    expect(padNumber(7, 2)).toBe('07');
    expect(padNumber(0, 2)).toBe('00');
    expect(padNumber(10000, 4)).toBe('10000'); // 超出宽度不截断，避免撞车
    expect(padNumber(3.9, 2)).toBe('03'); // 取整
  });

  it('padNumber 拒绝非法输入', () => {
    expect(() => padNumber(-1, 4)).toThrow(RangeError);
    expect(() => padNumber(Number.NaN, 4)).toThrow(RangeError);
    expect(() => padNumber(Number.POSITIVE_INFINITY, 4)).toThrow(RangeError);
  });

  it('chapterFileName：0042.json', () => {
    expect(chapterFileName(42)).toBe('0042.json');
    expect(chapterFileName(1)).toBe('0001.json');
    expect(chapterFileName(12345)).toBe('12345.json');
  });

  it('volumeDirName：vol-01', () => {
    expect(volumeDirName(1)).toBe('vol-01');
    expect(volumeDirName(12)).toBe('vol-12');
  });

  it('bookDirName / localBookDirName', () => {
    expect(bookDirName(1, '修仙世界从凡人到仙帝')).toBe('1-修仙世界从凡人到仙帝');
    expect(bookDirName('p-7', '书名')).toBe('p-7-书名');
    expect(bookDirName(1, '///')).toBe('1-untitled');
    expect(localBookDirName(7)).toBe('7');
  });

  it('journalFileName', () => {
    expect(journalFileName('2026-09-24')).toBe('2026-09-24.log');
    expect(journalFileName(new Date(2026, 8, 24, 23, 59))).toBe('2026-09-24.log');
    expect(() => journalFileName('2026/09/24')).toThrow(RangeError);
    expect(() => journalFileName(new Date('nope'))).toThrow(RangeError);
  });
});

describe('24 张表 → 落盘位置（§6.1）', () => {
  it('表清单与布局表都是 24 项且一一对应', () => {
    expect(ALL_TABLE_NAMES.length).toBe(24);
    expect(Object.keys(TABLE_LAYOUT).length).toBe(24);

    for (const name of ALL_TABLE_NAMES) {
      expect(TABLE_LAYOUT[name], `表 '${name}' 缺布局`).toBeDefined();
    }
    for (const name of Object.keys(TABLE_LAYOUT)) {
      expect(ALL_TABLE_NAMES as readonly string[]).toContain(name);
    }
  });

  it('每作品表落 books/<id>-<slug>/（7 张）', () => {
    const bookTables: Record<string, string> = {
      projects: 'project.json',
      characters: 'characters.json',
      worldSettings: 'world-settings.json',
      volumes: 'volumes.json',
      foreshadows: 'foreshadows.json',
      plotCards: 'plot-cards.json',
      sceneCards: 'scene-cards.json',
    };
    for (const [table, file] of Object.entries(bookTables)) {
      expect(TABLE_LAYOUT[table]).toEqual({ granularity: 'single-file', scope: 'book', file });
    }
  });

  it('chapters 是逐章一文件、按卷分桶', () => {
    expect(TABLE_LAYOUT.chapters).toEqual({
      granularity: 'per-record',
      scope: 'book',
      dir: 'chapters',
      bucket: 'volume',
    });
  });

  it('bookChapters 逐章一文件、按书分桶，落在 _library/local-books', () => {
    expect(TABLE_LAYOUT.bookChapters).toEqual({
      granularity: 'per-record',
      scope: 'library',
      dir: '_library/local-books',
      bucket: 'book',
    });
  });

  it('全局表的 file 都带 _library/ 前缀', () => {
    for (const [table, layout] of Object.entries(TABLE_LAYOUT)) {
      if (layout.granularity !== 'single-file' || layout.scope !== 'library') continue;
      expect(layout.file.startsWith('_library/'), `表 '${table}' 的 file='${layout.file}'`).toBe(true);
    }
  });

  it('抽查若干映射与 §6.1 一致', () => {
    expect(TABLE_LAYOUT.localBooks).toEqual({
      granularity: 'single-file',
      scope: 'library',
      file: '_library/local-books.json',
    });
    expect(TABLE_LAYOUT.bookBookmarks).toEqual({
      granularity: 'single-file',
      scope: 'library',
      file: '_library/bookmarks.json',
    });
    expect(TABLE_LAYOUT.writingStyleCard).toEqual({
      granularity: 'single-file',
      scope: 'library',
      file: '_library/writing-style-card.json',
    });
    expect(TABLE_LAYOUT.prompts).toEqual({
      granularity: 'single-file',
      scope: 'library',
      file: '_library/prompts.json',
    });
    expect(TABLE_LAYOUT.bookAnalyses).toEqual({
      granularity: 'single-file',
      scope: 'library',
      file: '_library/book-analyses.json',
    });
  });

  it('rejectionCases 默认落全局，可配置为按作品（§11.4 遗留开关）', () => {
    expect(TABLE_LAYOUT.rejectionCases).toEqual({
      granularity: 'single-file',
      scope: 'library',
      file: '_library/rejection-cases.json',
    });
    expect(buildTableLayout({ rejectionCasesPerBook: true }).rejectionCases).toEqual({
      granularity: 'single-file',
      scope: 'book',
      file: 'rejection-cases.json',
    });
  });

  it('tableLayoutFor：未知表返回 undefined，带 options 时按 options 解析', () => {
    expect(tableLayoutFor('not-a-table')).toBeUndefined();
    expect(tableLayoutFor('rejectionCases', { rejectionCasesPerBook: true })).toEqual({
      granularity: 'single-file',
      scope: 'book',
      file: 'rejection-cases.json',
    });
    expect(tableLayoutFor('rejectionCases')).toEqual(TABLE_LAYOUT.rejectionCases);
  });
});

describe('路径解析', () => {
  it('workspaceFilePath / resolveBookDir', () => {
    expect(norm(workspaceFilePath(nodePaths, ROOT))).toBe('C:/ws/workspace.json');
    expect(norm(resolveBookDir(nodePaths, ROOT, BOOK))).toBe('C:/ws/books/1-修仙世界从凡人到仙帝');
  });

  it('整表一文件：全局表不带 book', () => {
    expect(norm(resolveSingleFilePath(nodePaths, ROOT, 'inspirations'))).toBe('C:/ws/_library/inspirations.json');
    expect(norm(resolveSingleFilePath(nodePaths, ROOT, 'localBooks'))).toBe('C:/ws/_library/local-books.json');
  });

  it('整表一文件：作品表要 book', () => {
    expect(norm(resolveSingleFilePath(nodePaths, ROOT, 'characters', BOOK))).toBe(
      'C:/ws/books/1-修仙世界从凡人到仙帝/characters.json',
    );
    expect(norm(resolveSingleFilePath(nodePaths, ROOT, 'projects', BOOK))).toBe(
      'C:/ws/books/1-修仙世界从凡人到仙帝/project.json',
    );
  });

  it('整表一文件：错用参数会报错', () => {
    expect(() => resolveSingleFilePath(nodePaths, ROOT, 'chapters')).toThrow(/逐记录/);
    expect(() => resolveSingleFilePath(nodePaths, ROOT, 'characters')).toThrow(/必须提供 book/);
    expect(() => resolveSingleFilePath(nodePaths, ROOT, 'nope')).toThrow(/未知的表/);
  });

  it('逐章：chapters/vol-XX/NNNN.json', () => {
    expect(norm(resolveChapterFilePath(nodePaths, ROOT, BOOK, { index: 42, volumeIndex: 1 }))).toBe(
      'C:/ws/books/1-修仙世界从凡人到仙帝/chapters/vol-01/0042.json',
    );
    expect(norm(resolveChapterFilePath(nodePaths, ROOT, BOOK, { index: 61, volumeIndex: 2 }))).toBe(
      'C:/ws/books/1-修仙世界从凡人到仙帝/chapters/vol-02/0061.json',
    );
  });

  it('逐章：本地书 _library/local-books/<bookId>/NNNN.json', () => {
    expect(norm(resolveLocalBookChapterPath(nodePaths, ROOT, 7, 3))).toBe(
      'C:/ws/_library/local-books/7/0003.json',
    );
    expect(
      norm(resolveRecordFilePath(nodePaths, ROOT, 'bookChapters', { index: 1, localBookId: 'abc' })),
    ).toBe('C:/ws/_library/local-books/abc/0001.json');
  });

  it('逐章：错用参数会报错', () => {
    expect(() => resolveRecordFilePath(nodePaths, ROOT, 'chapters', { index: 1 }, BOOK)).toThrow(
      /volumeIndex/,
    );
    expect(() => resolveRecordFilePath(nodePaths, ROOT, 'chapters', { index: 1, volumeIndex: 1 })).toThrow(
      /必须提供 book/,
    );
    expect(() => resolveRecordFilePath(nodePaths, ROOT, 'bookChapters', { index: 1 })).toThrow(
      /localBookId/,
    );
    expect(() => resolveRecordFilePath(nodePaths, ROOT, 'characters', { index: 1 })).toThrow(/不是逐记录/);
    expect(() => resolveRecordFilePath(nodePaths, ROOT, 'nope', { index: 1 })).toThrow(/未知的表/);
  });

  it('journal 路径', () => {
    expect(norm(resolveJournalFilePath(nodePaths, ROOT, '2026-09-24'))).toBe('C:/ws/_journal/2026-09-24.log');
  });

  it('中文书名 / 深层目录不出错', () => {
    const deep = { projectId: 99, title: '《我的  书》/ 第二部' };
    expect(norm(resolveBookDir(nodePaths, ROOT, deep))).toBe('C:/ws/books/99-我的-书-第二部');
  });
});
