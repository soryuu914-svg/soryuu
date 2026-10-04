// 所有类型定义

export interface Project {
  id?: number;
  name: string;
  description?: string;
  genre?: string; // 题材（玄幻/都市/悬疑…）
  globalStructure?: string; // 全书结构：三幕式/英雄之旅/起承转合/双线并行/群像式
  goldenFinger?: string; // 金手指
  coreInspirationId?: number; // 当前作品的核心灵感 ID
  createdAt: number;
  updatedAt: number;
}

export interface Character {
  id?: number;
  projectId: number;
  name: string;
  alias?: string; // 别名
  role?: 'protagonist' | 'heroine' | 'supporting' | 'antagonist'; // 角色定位
  identity?: string; // 身份
  appearance?: string; // 外貌
  personality?: string; // 性格
  motivation?: string; // 目标/动机
  abilities?: string; // 能力
  growth?: string; // 成长线
  tags?: string[]; // 人物标签
  description?: string; // 简介（向后兼容）
  createdAt: number;
  updatedAt: number;
}

export interface WorldSetting {
  id?: number;
  projectId: number;
  category?:
    // 地理类
    | '大陆/区域' | '城市/城镇' | '秘境/禁地' | '山川/地貌'
    // 势力类
    | '宗门/门派' | '家族' | '王朝/帝国' | '组织/商会' | '邪派/魔道'
    // 力量体系类
    | '修炼境界' | '功法/武技' | '血脉/体质' | '神通/秘术'
    // 物品类
    | '武器/法宝' | '丹药' | '灵材/灵物'
    // 历史类
    | '上古事件' | '王朝更迭' | '传说/人物'
    // 种族类
    | '妖族' | '魔族'
    // 其他类
    | '天道/规则' | '禁忌/诅咒' | '自定义'
    // 向后兼容旧分类
    | 'geography' | 'faction' | 'power' | 'item' | 'history' | 'race' | 'other';
  name: string; // 名称
  description?: string; // 详细描述
  rules?: string; // 硬性规则
  tags?: string[]; // 标签
  systemName?: string; // 体系名（仅修炼境界等链式分类使用）
  title: string; // 向后兼容
  content?: string; // 向后兼容
  createdAt: number;
  updatedAt: number;
}

export interface Volume {
  id?: number;
  projectId: number;
  index: number; // 序号
  title: string; // 卷名
  summary?: string; // 简介
  hook?: string; // 本卷钩子：结尾留什么悬念，引向下一卷
  climax?: string; // 本卷爆点：本卷最高潮的一场戏
  volumeStructure?: string; // 卷结构：七点结构法/单元剧/双线交叉/闭环式/递进式
  name: string; // 向后兼容
  order: number; // 向后兼容
  createdAt: number;
  updatedAt: number;
}

export interface Chapter {
  id?: number;
  projectId: number;
  volumeId?: number;
  index: number; // 序号
  title: string;
  outline?: string; // 细纲
  hook?: string; // 本章钩子：结尾留什么悬念，引向下一章
  climax?: string; // 本章爆点：本章最爽/最激烈的一个点
  chapterStructure?: string; // 章结构：悬念前置/倒叙开场/多线切换/单线推进/对话推进/动作开场
  emotion?: string; // 主情绪：紧张/压抑/热血/温情/悬疑/爽快/悲壮/轻松/震撼/平淡
  emotionIntensity?: number; // 情绪强度 1-5
  content?: string; // 正文
  summary?: string;        // 章节摘要：60-100 字事件流水，供长篇记忆注入
  summaryAt?: number;      // 摘要生成时间戳
  summaryDirty?: boolean;  // 正文改动后置 true，UI 显示"已过期"
  wordCount?: number; // 字数
  status?: 'todo' | 'draft' | 'finished'; // 状态
  order: number; // 向后兼容
  todayWords?: number; // 本章今日新增字数
  lastUpdatedDate?: string; // 'YYYY-MM-DD' 最后更新日期
  chapterGoal?: number; // 本章目标字数，默认 3000
  createdAt: number;
  updatedAt: number;
}

export interface Foreshadow {
  id?: number;
  projectId: number;
  chapterId?: number;
  content: string;
  status: 'pending' | 'resolved';
  resolvedChapterId?: number;  // 在第几章回收（可选，便于追踪时间线）
  resolvedAt?: number;         // 回收时间戳
  createdAt: number;
  updatedAt: number;
}

export interface BookAnalysis {
  id?: number;
  title: string;
  sourceText: string; // 原始文本，限制5000字
  style: string; // 文风
  structure: string; // 结构
  pacing: string; // 节奏
  highlights: string[]; // 核心爽点
  outlineSample: string; // 大纲结构
  characters: string; // 主要角色原型
  tags: string[]; // 标签
  createdAt: number;
}

export interface Prompt {
  id?: number;
  title: string; // 提示词标题
  category: string; // 分类：写作风格/续写/扩写/润色/审稿/拆书/生成/其他
  content: string; // 提示词正文（system prompt）
  description: string; // 一句话说明
  isBuiltin: boolean; // 是否为预置提示词
  tags: string[]; // 标签
  createdAt: number;
}

export interface LibraryItem {
  id?: number;
  type: 'character' | 'worldSetting'; // 后续可扩展
  name: string; // 名称
  content: any; // 原始数据快照（JSON，存原来 Character 或 WorldSetting 的全部字段）
  tags: string[];
  sourceProjectName?: string; // 来自哪本书
  createdAt: number;
}

export interface RejectionCase {
  id?: number;
  projectId?: number;     // 为空表示全局避雷，不绑定作品
  title: string;
  platform: string;       // 起点/番茄/晋江/知乎/其他
  rejectedText: string;   // 被拒的原文
  analysis: string;       // AI 整体分析（后续步骤用）
  rules: string[];        // 提炼的避雷规则
  tags: string[];
  createdAt: number;
}

export interface RejectionMark {
  id?: number;
  caseId: number;
  text: string;           // 被标记的原文片段
  startIndex: number;
  endIndex: number;
  issueType: string;      // 节奏拖沓/人设崩/爽点不足/文笔问题/疑似违规/其他
  userNote: string;
  aiAnalysis: string;     // AI 分析结果（后续步骤用）
  createdAt: number;
}

export interface Inspiration {
  id?: number;
  title: string;          // 标题，如"系统流+重生+打脸"
  content: string;        // 核心创意描述
  type: string;           // 类型：脑洞 / 情节转折 / 冲突设计 / 结局设计 / 其他
  tags: string[];         // 标签
  createdAt: number;
}

export interface PlotCard {
  id?: number;
  projectId: number;
  title: string;          // 如"主角初次打脸"
  description: string;    // 剧情要点
  tags: string[];
  createdAt: number;
}

export interface SceneCard {
  id?: number;
  projectId: number;
  title: string;          // 如"深夜的荒山古庙"
  description: string;    // 场景描述、氛围、细节
  atmosphere: string;     // 氛围关键词，如"阴森、雨声、破败"
  tags: string[];
  createdAt: number;
}

export interface WritingStyle {
  id?: number;
  type: 'technique' | 'style';   // technique=写作技巧, style=文风
  title: string;                  // 如"钩子·悬念式"
  description: string;            // 一句话说明
  content: string;                // 注入 AI prompt 的内容（核心）
  category?: string;              // 技巧分类：钩子/爆点/节奏/人物/描写/冲突/开篇
  isBuiltin: boolean;             // 是否预置
  tags: string[];
  createdAt: number;
}

export interface LocalBook {
  id?: number;
  title: string;
  author?: string;
  totalChapters: number;
  totalWords: number;
  createdAt: number;
}

export interface BookChapter {
  id?: number;
  bookId: number;
  index: number;
  title: string;
  content: string;
  wordCount: number;
  createdAt: number;
}

export interface BookBookmark {
  id?: number;
  bookId: number;
  bookTitle: string;
  chapterIndex: number;
  chapterTitle: string;
  text: string;
  note: string;
  category: string;          // 金句/点子/人物描写/世界观/战斗描写/情感描写/其他
  tags: string[];
  createdAt: number;
}

// ===== AI 避雷词库（规则独立成表 + 分类） =====
export interface RejectionRule {
  id?: number;
  category: string;      // 分类名（用词/句式/情节/题材/其他 或自定义）
  content: string;       // 规则内容
  enabled: boolean;      // 启用状态
  createdAt: number;
}

export interface RuleCategory {
  id?: number;
  name: string;          // 分类名
  isDefault: boolean;    // 预设分类不可删
  order: number;         // 排序
  createdAt: number;
}

// ===== AI 味学习（样本 + 标记） =====
export interface AiFlavorSample {
  id?: number;
  title: string;        // 样本标题（如"剑起青云 第三章草稿"）
  content: string;      // AI 生成的原文
  createdAt: number;
}

export interface AiFlavorMark {
  id?: number;
  sampleId: number;     // 关联样本
  text: string;         // 被标记的原文片段
  startIndex: number;   // 在 content 中的起始位置
  endIndex: number;     // 结束位置
  reason: string;       // ★ 用户写的"为什么是 AI 味"
  createdAt: number;
}

export interface WritingPractice {
  id?: number;
  prompt: string;          // AI 出的题目
  content: string;         // 用户写的练笔
  wordCount: number;       // 字数
  aiAnalysis: string;      // AI 对这段的文风分析
  createdAt: number;
}

export interface WritingStyleCard {
  id?: number;
  content: string;         // 我的文风卡文本
  sampleCount: number;     // 生成时基于几个样本
  updatedAt: number;
}
