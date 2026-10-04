/**
 * 工作区引擎 —— 公共类型定义（批 2）
 *
 * ★ 设计约束：本目录 **不 import 任何 `@tauri-apps/*`**。
 * 文件系统与路径能力一律通过下面两个接口注入：
 *   - `FileSystem`   —— 批 2 只提供 Node 实现（见 `node-fs.ts`），Tauri 实现留到批 3
 *   - `PathProvider` —— 批 2 用 `node:path`，批 3 换成 `@tauri-apps/api/path`
 *
 * 这样引擎本体是"纯逻辑 + 注入能力"，可以在 Node 里跑真实单测，
 * 也不会把"必须先装 Tauri 插件"变成批 2 的前置条件。
 */

/** `workspace.json` 的当前 schema 版本。做**破坏性**结构变更时必须 +1。 */
export const WORKSPACE_SCHEMA_VERSION = 1;

/**
 * 文件系统抽象。
 * 方法语义刻意与 `@tauri-apps/plugin-fs` 对齐，批 3 可以直接把实现换掉、引擎零改动。
 */
export interface FileSystem {
  /**
   * 路径是否存在（文件 / 目录都算 true）。
   * 实现应把"不存在"（ENOENT）当成 false 而非抛错。
   */
  exists(path: string): Promise<boolean>;
  /** 以 UTF-8 读取整个文本文件。文件不存在应抛错。 */
  readTextFile(path: string): Promise<string>;
  /** 以 UTF-8 覆写整个文本文件。父目录必须已存在（需要时由调用方先 `mkdir`）。 */
  writeTextFile(path: string, data: string): Promise<void>;
  /** 建目录。`recursive` 默认 false（与 Tauri 的默认语义保持一致）。 */
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  /**
   * 重命名 / 移动。
   * ⚠️ 跨卷移动可能失败（EXDEV）—— 原子写依赖"同卷 rename 原子"这一前提（§8e）。
   */
  rename(from: string, to: string): Promise<void>;
  /** 删除文件或目录。`recursive` 默认 false。 */
  remove(path: string, options?: { recursive?: boolean }): Promise<void>;
}

/**
 * 路径能力抽象。
 * §8f 的硬要求：**禁止在引擎里手拼 `/` 或 `\`**，一律走这里。
 */
export interface PathProvider {
  join(...parts: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  resolve(...parts: string[]): string;
}

/** 迁移来源信息（`workspace.json` 里的 `migratedFrom`）。 */
export interface WorkspaceMigratedFrom {
  /** 来源标识，例如 `'indexeddb'`。 */
  source: string;
  /** 来源库版本（IndexedDB 场景下是 Dexie 的 `verno`）。 */
  version?: number;
  /** 迁移完成时间（ISO 8601）。 */
  migratedAt: string;
}

/**
 * 可选统计快照（用于加速启动展示）。
 * 只是"缓存性"数据，丢了不影响正确性，所以全部可选。
 */
export interface WorkspaceStats {
  projects?: number;
  chapters?: number;
  words?: number;
}

/**
 * `workspace.json` 的结构 —— 工作区的"身份证"。
 * 对应 `TAURI_WORKSPACE_PLAN.md` §6。
 */
export interface WorkspaceMeta {
  /** 必须等于（或低于）`WORKSPACE_SCHEMA_VERSION`，高于则拒绝打开。 */
  schemaVersion: number;
  /** 写入这份文件的**应用版本**，取自 `package.json` 的 `version`。 */
  appVersion: string;
  /** 工作区显示名。 */
  name: string;
  /** 创建时间（ISO 8601）。 */
  createdAt: string;
  /** 最后写入时间（ISO 8601）。 */
  updatedAt: string;
  migratedFrom?: WorkspaceMigratedFrom;
  stats?: WorkspaceStats;
}

// ─────────────────────────────────────────────────────────────
// 表 → 落盘位置 的映射类型（对应 §6.1）
// ─────────────────────────────────────────────────────────────

/**
 * 落盘作用域：全局资料库 `_library/` 或单个作品目录 `books/<id>-<slug>/`。
 *
 * ★ **相对基准的统一规则**（`file` / `dir` 字段都遵循）：
 *   - `scope: 'library'` → 相对**工作区根**（因此包含 `_library/` 前缀）
 *   - `scope: 'book'`    → 相对**该作品目录**（因此不含 `books/<id>-<slug>/` 前缀）
 * 这样两种作用域各自的"前缀"只由 `paths.ts` 的解析函数负责拼，映射表里不出现 `books/*`。
 */
export type TableScope = 'library' | 'book';

/** 落盘粒度：整表一个 JSON 文件 / 每条记录一个文件（逐章）。 */
export type TableGranularity = 'single-file' | 'per-record';

/** 整表重写；落在 `_library/` 下。`file` 是**相对工作区根**的路径。 */
export interface LibrarySingleFileLayout {
  granularity: 'single-file';
  scope: 'library';
  /** 例：`_library/inspirations.json` */
  file: string;
}

/** 整表重写；落在某个作品目录下。`file` 是**相对作品目录**的文件名。 */
export interface BookSingleFileLayout {
  granularity: 'single-file';
  scope: 'book';
  /** 例：`characters.json` */
  file: string;
}

/**
 * 逐记录一文件（如 `chapters`、`bookChapters`）。
 * `dir` 相对（工作区根 / 作品目录，取决于 `scope`）。
 */
export interface PerRecordLayout {
  granularity: 'per-record';
  scope: TableScope;
  /** 例：`chapters`（scope=book）或 `_library/local-books`（scope=library）。相对基准见 `TableScope` 的说明。 */
  dir: string;
  /** 分桶维度：按卷 `vol-XX/` / 按书 `<bookId>/` / 不分桶。 */
  bucket: 'volume' | 'book' | 'none';
}

export type TableLayout = LibrarySingleFileLayout | BookSingleFileLayout | PerRecordLayout;

/** 作品定位信息。`projectId` 是**权威寻址**，`title` 只用于生成人眼友好的目录名。 */
export interface BookLocation {
  projectId: number | string;
  /** 书名（中文原样保留，slug 化时只去非法字符）。 */
  title: string;
}

/** 逐记录表的"第几条记录"定位信息。 */
export interface RecordAddress {
  /** 记录序号（章节序号 / 本地书章节序号），用于文件名补零成 `0042.json`。 */
  index: number;
  /** `chapters` 需要：所属卷序号 → `vol-01/`。 */
  volumeIndex?: number;
  /** `bookChapters` 需要：所属本地书 id。 */
  localBookId?: number | string;
}

/**
 * 布局开关（把 §11.4 的遗留决策项做成可配置，而不是写死）。
 */
export interface WorkspaceLayoutOptions {
  /**
   * `rejectionCases` 是否按作品分目录。
   * ★ 批 2 按用户拍板取 **`false`**（与普通全局表一致，落 `_library/rejection-cases.json`）。
   * §11.4 遗留 #4 仍未决，所以留成开关，改配置即可，不必改引擎。
   */
  rejectionCasesPerBook?: boolean;
}
