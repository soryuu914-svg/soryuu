import Dexie, { type Table } from 'dexie';
import type {
  Project,
  Character,
  WorldSetting,
  Volume,
  Chapter,
  Foreshadow,
  BookAnalysis,
  Prompt,
  LibraryItem,
  RejectionCase,
  RejectionMark,
  RejectionRule,
  RuleCategory,
  AiFlavorSample,
  AiFlavorMark,
  Inspiration,
  PlotCard,
  SceneCard,
  WritingStyle,
  LocalBook,
  BookChapter,
  BookBookmark,
  WritingPractice,
  WritingStyleCard,
} from '../types';

// 定义数据库类
export class NovelDB extends Dexie {
  projects!: Table<Project, number>;
  characters!: Table<Character, number>;
  worldSettings!: Table<WorldSetting, number>;
  volumes!: Table<Volume, number>;
  chapters!: Table<Chapter, number>;
  foreshadows!: Table<Foreshadow, number>;
  bookAnalyses!: Table<BookAnalysis, number>;
  prompts!: Table<Prompt, number>;
  libraryItems!: Table<LibraryItem, number>;
  rejectionCases!: Table<RejectionCase, number>;
  rejectionMarks!: Table<RejectionMark, number>;
  rejectionRules!: Table<RejectionRule, number>;
  ruleCategories!: Table<RuleCategory, number>;
  inspirations!: Table<Inspiration, number>;
  plotCards!: Table<PlotCard, number>;
  sceneCards!: Table<SceneCard, number>;
  writingStyles!: Table<WritingStyle, number>;
  localBooks!: Table<LocalBook, number>;
  bookChapters!: Table<BookChapter, number>;
  bookBookmarks!: Table<BookBookmark, number>;
  aiFlavorSamples!: Table<AiFlavorSample, number>;
  aiFlavorMarks!: Table<AiFlavorMark, number>;
  writingPractices!: Table<WritingPractice, number>;
  writingStyleCard!: Table<WritingStyleCard, number>;

  constructor() {
    super('NovelDB');

    // 版本 1：初始化所有表
    this.version(1).stores({
      projects: '++id, name, createdAt, updatedAt',
      characters: '++id, projectId, name, createdAt, updatedAt',
      worldSettings: '++id, projectId, title, createdAt, updatedAt',
      volumes: '++id, projectId, order, createdAt, updatedAt',
      chapters: '++id, projectId, volumeId, order, createdAt, updatedAt',
      foreshadows: '++id, projectId, chapterId, status, createdAt, updatedAt',
    });

    // 版本 2：新增拆书分析表
    this.version(2).stores({
      bookAnalyses: '++id, title, createdAt',
    });

    // 版本 3：新增提示词库表
    this.version(3).stores({
      prompts: '++id, category, isBuiltin, createdAt',
    });

    // 版本 4：新增资料库表
    this.version(4).stores({
      libraryItems: '++id, type, name, createdAt',
    });

    // 版本 5：新增审核避雷表
    this.version(5).stores({
      rejectionCases: '++id, projectId, platform, createdAt',
      rejectionMarks: '++id, caseId, createdAt',
    });

    // 版本 6：章节表新增今日字数统计字段
    this.version(6).stores({
      chapters: '++id, projectId, volumeId, order, todayWords, lastUpdatedDate, createdAt, updatedAt',
    });

    // 版本 7：卷和章节表新增钩子和爆点字段
    this.version(7).stores({
      volumes: '++id, projectId, order, createdAt, updatedAt',
      chapters: '++id, projectId, volumeId, order, todayWords, lastUpdatedDate, createdAt, updatedAt',
    });

    // 版本 8：作品、卷、章节表新增叙事结构字段
    this.version(8).stores({
      projects: '++id, name, createdAt, updatedAt',
      volumes: '++id, projectId, order, createdAt, updatedAt',
      chapters: '++id, projectId, volumeId, order, todayWords, lastUpdatedDate, createdAt, updatedAt',
    });

    // 版本 9：新增避雷规则表
    this.version(9).stores({
      rejectionRules: '++id, projectId, enabled, createdAt',
    });

    // 版本 10：新增灵感库表
    this.version(10).stores({
      inspirations: '++id, type, createdAt',
    });

    // 版本 11：项目表新增核心灵感字段
    this.version(11).stores({
      projects: '++id, name, coreInspirationId, createdAt, updatedAt',
    });

    // 版本 12：新增剧情卡和场景卡表
    this.version(12).stores({
      plotCards: '++id, projectId, createdAt',
      sceneCards: '++id, projectId, createdAt',
    });

    // 版本 13：新增写作工具箱表
    this.version(13).stores({
      writingStyles: '++id, type, isBuiltin, createdAt',
    });

    // 版本 14：章节表新增情绪基调字段
    this.version(14).stores({
      chapters: '++id, projectId, volumeId, order, todayWords, lastUpdatedDate, createdAt, updatedAt',
    });

    // 版本 15：新增本地书库表
    this.version(15).stores({
      localBooks: '++id, title, createdAt',
      bookChapters: '++id, bookId, index, createdAt',
    });

    // 版本 16：新增书籍标记表
    this.version(16).stores({
      bookBookmarks: '++id, bookId, category, createdAt',
    });

    // 版本 17：重定义避雷规则表 + 新增分类表
    this.version(17).stores({
      rejectionRules: '++id, category, enabled, createdAt',
      ruleCategories: '++id, name, order, createdAt',
    });

    // 版本 18：新增 AI 味学习表
    this.version(18).stores({
      aiFlavorSamples: '++id, createdAt',
      aiFlavorMarks: '++id, sampleId, createdAt',
    });

    // 版本 19：新增写作练习 + 文风卡
    this.version(19).stores({
      writingPractices: '++id, createdAt',
      writingStyleCard: '++id, updatedAt',
    });
  }
}

// 导出数据库实例
export const db = new NovelDB();

/**
 * 一次性：清空旧案例数据 + 写入 5 个预设分类
 * 在 RejectionsPage 首次挂载时调用
 */
export async function initRuleLibrary() {
  // 只在首次运行（用 localStorage 标记防 StrictMode 双执行）
  const INIT_KEY = 'rule-library-initialized-v1';
  if (localStorage.getItem(INIT_KEY)) {
    return;
  }

  // 立即置位标记：必须放在任何 await 之前，
  // 否则 StrictMode 的两次 effect 会并发通过检查（首个 await 还没回来时标记尚未写入），
  // 导致分类被写入两遍（就是之前产生 10 条脏数据的原因）
  localStorage.setItem(INIT_KEY, '1');

  // 清空旧数据
  await db.rejectionCases.clear();
  await db.rejectionMarks.clear();
  await db.ruleCategories.clear();

  // 写入 5 个预设分类
  const now = Date.now();
  const defaults = [
    { name: '用词', isDefault: true, order: 1, createdAt: now },
    { name: '句式', isDefault: true, order: 2, createdAt: now },
    { name: '情节', isDefault: true, order: 3, createdAt: now },
    { name: '题材', isDefault: true, order: 4, createdAt: now },
    { name: '其他', isDefault: true, order: 5, createdAt: now },
  ];
  await db.ruleCategories.bulkAdd(defaults);
}

/**
 * 检查分类脏数据：条数异常时清空重写为 5 条预设分类
 * 注意：这里额外加了一次性 localStorage 守卫（FIX_KEY）——
 *       否则每次进页面只要分类数 ≠ 5 就会被重置，会把用户自建的第 6 个分类也清掉。
 */
export async function checkAndFixCategories() {
  const FIX_KEY = 'rule-categories-fixed-v1';
  if (localStorage.getItem(FIX_KEY)) {
    return;
  }
  localStorage.setItem(FIX_KEY, '1');

  const count = await db.ruleCategories.count();
  if (count !== 5) {
    await db.ruleCategories.clear();
    const now = Date.now();
    const defaults = [
      { name: '用词', isDefault: true, order: 1, createdAt: now },
      { name: '句式', isDefault: true, order: 2, createdAt: now },
      { name: '情节', isDefault: true, order: 3, createdAt: now },
      { name: '题材', isDefault: true, order: 4, createdAt: now },
      { name: '其他', isDefault: true, order: 5, createdAt: now },
    ];
    await db.ruleCategories.bulkAdd(defaults);
    console.log('已修复分类脏数据');
  }
}
