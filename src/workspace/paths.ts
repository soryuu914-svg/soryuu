/**
 * 工作区引擎 —— 路径层（批 2）
 *
 * 职责：
 *   1. 目录 / 文件**常量**（§6 的目录结构）
 *   2. `slugify()` —— 文件名 slug 化（保留中文，只去 Windows 非法字符）
 *   3. 序号补零（`42` → `0042.json`、`vol-01`）
 *   4. **24 张表 → 落盘位置** 的完整映射（§6.1）+ 路径解析函数
 *
 * ★ 所有路径拼接都走注入的 `PathProvider`，本文件**不出现** `node:path` 或手拼分隔符。
 */

import type {
  BookLocation,
  PathProvider,
  RecordAddress,
  TableLayout,
  WorkspaceLayoutOptions,
} from './types';

// ─────────────────────────────────────────────────────────────
// 1. 目录 / 文件常量（§6）
// ─────────────────────────────────────────────────────────────

/** 工作区根下的身份文件。 */
export const WORKSPACE_FILE = 'workspace.json';
/** 公共资料库目录（16 张全局表）。 */
export const LIBRARY_DIR = '_library';
/** 作品目录集合。 */
export const BOOKS_DIR = 'books';
/** 软删回收站（保留 30 天）。 */
export const TRASH_DIR = '_trash';
/** 落盘操作日志（崩溃恢复用）。 */
export const JOURNAL_DIR = '_journal';
/** 迁移记录 / 索引等元数据。 */
export const META_DIR = '_meta';

/** 作品目录内的正文子目录。 */
export const CHAPTERS_DIR = 'chapters';
/** 卷目录前缀。 */
export const VOLUME_DIR_PREFIX = 'vol-';
/** 本地书库正文子目录（相对工作区根，含 `_library/` 前缀）。 */
export const LOCAL_BOOKS_DIR = `${LIBRARY_DIR}/local-books`;

/**
 * 骨架建成后，工作区根的 6 个顶层项（顺序与 §6 一致）。
 * 验收标准"顶层恰好 6 项"直接以它为准。
 */
export const SKELETON_TOP_LEVEL = [
  WORKSPACE_FILE,
  LIBRARY_DIR,
  BOOKS_DIR,
  TRASH_DIR,
  JOURNAL_DIR,
  META_DIR,
] as const;

/** 骨架只会创建这 5 个目录（`workspace.json` 是文件）。 */
export const SKELETON_DIRS = [
  LIBRARY_DIR,
  BOOKS_DIR,
  TRASH_DIR,
  JOURNAL_DIR,
  META_DIR,
] as const;

// ─────────────────────────────────────────────────────────────
// 2. slug 化
// ─────────────────────────────────────────────────────────────

/** 清洗后为空时的兜底名。 */
export const DEFAULT_SLUG = 'untitled';

/** Windows 不允许作为**独立**文件名的保留设备名。 */
const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

/** Windows 文件名非法字符：`\ / : * ? " < > |`（§8f）。 */
const ILLEGAL_CHARS = /[\\/:*?"<>|]/g;
/** 控制字符（含 0x7f）。★ 刻意匹配控制字符 —— 它们不能出现在文件名里。 */
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
/** 允许保留的字符：字母（含中文）/ 数字 / `_` / `-`；其余一律折成 `-`。 */
const DISALLOWED_RUN = /[^\p{L}\p{N}_-]+/gu;

export interface SlugifyOptions {
  /**
   * 最大长度（按 **码点** 计，不是 UTF-16 单元 —— 避免把代理对截断）。
   * 默认 `60`：Windows 单段名上限 255，这里留足余量给 `-`、书名后缀和 `.json`。
   */
  maxLength?: number;
  /** 清洗后为空时的兜底，默认 `'untitled'`。 */
  fallback?: string;
}

/**
 * 把任意字符串（书名 / 目录名）转动成**可用于文件名**的 slug。
 *
 * 规则（顺序即执行顺序）：
 *   1. NFKC 归一化（全角 `Ａ` → `A`，兼容字符统一）
 *   2. 删控制字符
 *   3. 非法字符 `\ / : * ? " < > |` → `-`
 *   4. 其余"非 字母/数字/`_`/`-`"（含空格、标点、emoji）→ `-`
 *   5. 折叠连续 `-`，去掉首尾的 `-` 和 `_`
 *   6. 去掉**结尾的点**（Windows 不允许）
 *   7. 超长截断（按码点，并清掉截断后残留的尾部 `-`）
 *   8. 命中 Windows 保留设备名 → 前缀 `_`
 *   9. 空 → `fallback`
 *
 * ★ **中文原样保留**（`\p{L}` 覆盖 CJK）。方案 §6 的示例目录名
 * `1-修仙世界从凡人到仙帝` 就是中文 slug，不做拼音化。
 */
export function slugify(input: string, options: SlugifyOptions = {}): string {
  const maxLength = options.maxLength ?? 60;
  const fallback = options.fallback ?? DEFAULT_SLUG;

  let s = String(input).normalize('NFKC');
  s = s.replace(CONTROL_CHARS, '');
  s = s.replace(ILLEGAL_CHARS, '-');
  s = s.replace(DISALLOWED_RUN, '-');
  s = s.replace(/-{2,}/g, '-');
  s = s.replace(/^[-_]+/, '').replace(/[-_]+$/, '');
  s = s.replace(/\.+$/, '');

  if ([...s].length > maxLength) {
    s = [...s].slice(0, maxLength).join('').replace(/[-_]+$/, '');
  }

  if (s === '') return fallback;
  if (WINDOWS_RESERVED_NAMES.has(s.toUpperCase())) return `_${s}`;
  return s;
}

// ─────────────────────────────────────────────────────────────
// 3. 序号 / 文件名格式化
// ─────────────────────────────────────────────────────────────

/** 章节文件名的补零宽度（`42` → `0042.json`）。 */
export const CHAPTER_NUMBER_WIDTH = 4;
/** 卷目录名的补零宽度（`1` → `vol-01`）。 */
export const VOLUME_NUMBER_WIDTH = 2;

/**
 * 左补零到指定宽度。
 * 超出宽度**不截断**（`10000` → `'10000'`），避免序号撞车。
 */
export function padNumber(value: number, width: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`padNumber: value 必须是有限数字，收到 ${String(value)}`);
  }
  const n = Math.trunc(value);
  if (n < 0) {
    throw new RangeError(`padNumber: 不支持负数序号，收到 ${String(value)}`);
  }
  const s = String(n);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

/** 章节 / 记录的落盘文件名：`42` → `'0042.json'`。 */
export function chapterFileName(index: number): string {
  return `${padNumber(index, CHAPTER_NUMBER_WIDTH)}.json`;
}

/** 卷目录名：`1` → `'vol-01'`。 */
export function volumeDirName(volumeIndex: number): string {
  return `${VOLUME_DIR_PREFIX}${padNumber(volumeIndex, VOLUME_NUMBER_WIDTH)}`;
}

/**
 * 作品目录名：`(1, '修仙世界从凡人到仙帝')` → `'1-修仙世界从凡人到仙帝'`。
 * ★ 目录名只为人眼友好，**权威寻址一律用 `projectId`**（§6.1 注）。
 */
export function bookDirName(projectId: number | string, title: string): string {
  const id = slugify(String(projectId), { fallback: 'book' });
  return `${id}-${slugify(title)}`;
}

/** 本地书库正文目录名（`bookId` 一般就是数字）。 */
export function localBookDirName(localBookId: number | string): string {
  return slugify(String(localBookId), { fallback: 'book' });
}

/** 日期 → `YYYY-MM-DD`（**本地时区**，不是 UTC，避免跨日错位）。 */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = padNumber(date.getMonth() + 1, 2);
  const d = padNumber(date.getDate(), 2);
  return `${y}-${m}-${d}`;
}

/**
 * 日志文件名：`'2026-09-24.log'`。
 * 传 `Date` 用本地时区格式化；传字符串则要求已是 `YYYY-MM-DD`。
 */
export function journalFileName(when: Date | string = new Date()): string {
  if (typeof when === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(when)) {
      throw new RangeError(`journalFileName: 期望 'YYYY-MM-DD'，收到 '${when}'`);
    }
    return `${when}.log`;
  }
  if (!(when instanceof Date) || Number.isNaN(when.getTime())) {
    throw new RangeError('journalFileName: 收到无效的 Date');
  }
  return `${toLocalDateString(when)}.log`;
}

// ─────────────────────────────────────────────────────────────
// 4. 24 张表 → 落盘位置（§6.1）
// ─────────────────────────────────────────────────────────────

/**
 * 全部 24 张表，**顺序与 `src/db/index.ts` 里 Dexie 的声明顺序一致**。
 *
 * ⚠️ 这是"人工同步"的清单：`src/db/index.ts` 新增表时，这里和 `buildTableLayout()`
 * 都要补上（批 2 不 import `src/db/*`，避免把 Dexie 依赖拖进引擎）。
 */
export const ALL_TABLE_NAMES = [
  'projects',
  'characters',
  'worldSettings',
  'volumes',
  'chapters',
  'foreshadows',
  'bookAnalyses',
  'prompts',
  'libraryItems',
  'rejectionCases',
  'rejectionMarks',
  'rejectionRules',
  'ruleCategories',
  'inspirations',
  'plotCards',
  'sceneCards',
  'writingStyles',
  'localBooks',
  'bookChapters',
  'bookBookmarks',
  'aiFlavorSamples',
  'aiFlavorMarks',
  'writingPractices',
  'writingStyleCard',
] as const;

/**
 * 构造"表 → 落盘位置"映射。做成函数是为了让 `rejectionCases` 的归属可配置（§11.4）。
 * 不传参时使用批 2 的既定默认值。
 */
export function buildTableLayout(
  options: WorkspaceLayoutOptions = {},
): Record<string, TableLayout> {
  const rejectionCases: TableLayout = options.rejectionCasesPerBook
    ? { granularity: 'single-file', scope: 'book', file: 'rejection-cases.json' }
    : { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/rejection-cases.json` };

  return {
    // ── 每作品表（7 张）：落 books/<id>-<slug>/
    projects: { granularity: 'single-file', scope: 'book', file: 'project.json' },
    characters: { granularity: 'single-file', scope: 'book', file: 'characters.json' },
    worldSettings: { granularity: 'single-file', scope: 'book', file: 'world-settings.json' },
    volumes: { granularity: 'single-file', scope: 'book', file: 'volumes.json' },
    foreshadows: { granularity: 'single-file', scope: 'book', file: 'foreshadows.json' },
    plotCards: { granularity: 'single-file', scope: 'book', file: 'plot-cards.json' },
    sceneCards: { granularity: 'single-file', scope: 'book', file: 'scene-cards.json' },
    chapters: {
      granularity: 'per-record',
      scope: 'book',
      dir: CHAPTERS_DIR,
      bucket: 'volume',
    },

    // ── 全局表（17 张）：落 _library/
    bookAnalyses: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/book-analyses.json` },
    prompts: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/prompts.json` },
    libraryItems: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/library-items.json` },
    rejectionCases,
    rejectionMarks: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/rejection-marks.json` },
    rejectionRules: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/rejection-rules.json` },
    ruleCategories: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/rule-categories.json` },
    inspirations: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/inspirations.json` },
    writingStyles: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/writing-styles.json` },
    localBooks: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/local-books.json` },
    bookChapters: {
      granularity: 'per-record',
      scope: 'library',
      dir: LOCAL_BOOKS_DIR,
      bucket: 'book',
    },
    bookBookmarks: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/bookmarks.json` },
    aiFlavorSamples: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/ai-flavor-samples.json` },
    aiFlavorMarks: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/ai-flavor-marks.json` },
    writingPractices: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/writing-practices.json` },
    writingStyleCard: { granularity: 'single-file', scope: 'library', file: `${LIBRARY_DIR}/writing-style-card.json` },
  };
}

/** 默认布局（`rejectionCases` 落全局 `_library/`）。 */
export const TABLE_LAYOUT: Record<string, TableLayout> = buildTableLayout();

/** 查某张表的落盘布局；表名不认识时返回 `undefined`。 */
export function tableLayoutFor(
  table: string,
  options?: WorkspaceLayoutOptions,
): TableLayout | undefined {
  if (!options) return TABLE_LAYOUT[table];
  return buildTableLayout(options)[table];
}

// ─────────────────────────────────────────────────────────────
// 5. 路径解析
// ─────────────────────────────────────────────────────────────

/** 工作区根的顶层路径。 */
export function workspaceFilePath(paths: PathProvider, root: string): string {
  return paths.join(root, WORKSPACE_FILE);
}

/** 作品目录：`<root>/books/<projectId>-<slug>/`。 */
export function resolveBookDir(
  paths: PathProvider,
  root: string,
  book: BookLocation,
): string {
  return paths.join(root, BOOKS_DIR, bookDirName(book.projectId, book.title));
}

/**
 * 解析"整表一文件"的表。
 * @throws 表不存在 / 表是逐记录粒度 / 是作品表但没给 `book`
 */
export function resolveSingleFilePath(
  paths: PathProvider,
  root: string,
  table: string,
  book?: BookLocation,
  options?: WorkspaceLayoutOptions,
): string {
  const layout = tableLayoutFor(table, options);
  if (!layout) throw new Error(`resolveSingleFilePath: 未知的表 '${table}'`);
  if (layout.granularity !== 'single-file') {
    throw new Error(`resolveSingleFilePath: 表 '${table}' 是逐记录粒度，请用 resolveRecordFilePath`);
  }
  if (layout.scope === 'library') {
    return paths.join(root, layout.file);
  }
  if (!book) throw new Error(`resolveSingleFilePath: 表 '${table}' 属于作品，必须提供 book`);
  return paths.join(resolveBookDir(paths, root, book), layout.file);
}

/**
 * 解析"逐记录一文件"的表（`chapters` / `bookChapters`）。
 * @throws 表不存在 / 表不是逐记录粒度 / 缺 `book` / 缺 `volumeIndex` / 缺 `localBookId`
 */
export function resolveRecordFilePath(
  paths: PathProvider,
  root: string,
  table: string,
  address: RecordAddress,
  book?: BookLocation,
  options?: WorkspaceLayoutOptions,
): string {
  const layout = tableLayoutFor(table, options);
  if (!layout) throw new Error(`resolveRecordFilePath: 未知的表 '${table}'`);
  if (layout.granularity !== 'per-record') {
    throw new Error(`resolveRecordFilePath: 表 '${table}' 不是逐记录粒度，请用 resolveSingleFilePath`);
  }

  const fileName = chapterFileName(address.index);

  if (layout.scope === 'book') {
    // 目前只有 chapters：books/<id>-<slug>/chapters/vol-XX/0042.json
    if (!book) throw new Error(`resolveRecordFilePath: 表 '${table}' 属于作品，必须提供 book`);
    if (layout.bucket === 'volume') {
      if (address.volumeIndex === undefined) {
        throw new Error(`resolveRecordFilePath: 表 '${table}' 按卷分桶，必须提供 address.volumeIndex`);
      }
      return paths.join(
        resolveBookDir(paths, root, book),
        layout.dir,
        volumeDirName(address.volumeIndex),
        fileName,
      );
    }
    return paths.join(resolveBookDir(paths, root, book), layout.dir, fileName);
  }

  // scope === 'library'：目前只有 bookChapters
  // _library/local-books/<bookId>/0001.json
  if (address.localBookId === undefined) {
    throw new Error(`resolveRecordFilePath: 表 '${table}' 需要 address.localBookId`);
  }
  return paths.join(root, layout.dir, localBookDirName(address.localBookId), fileName);
}

/** 便捷函数：作品章节路径 `books/<id>-<slug>/chapters/vol-XX/NNNN.json`。 */
export function resolveChapterFilePath(
  paths: PathProvider,
  root: string,
  book: BookLocation,
  address: Required<Pick<RecordAddress, 'index' | 'volumeIndex'>>,
): string {
  return resolveRecordFilePath(paths, root, 'chapters', address, book);
}

/** 便捷函数：本地书库章节路径 `_library/local-books/<bookId>/NNNN.json`。 */
export function resolveLocalBookChapterPath(
  paths: PathProvider,
  root: string,
  localBookId: number | string,
  index: number,
): string {
  return resolveRecordFilePath(paths, root, 'bookChapters', { index, localBookId });
}

/** 日志文件路径 `_journal/YYYY-MM-DD.log`。 */
export function resolveJournalFilePath(
  paths: PathProvider,
  root: string,
  when: Date | string = new Date(),
): string {
  return paths.join(root, JOURNAL_DIR, journalFileName(when));
}
