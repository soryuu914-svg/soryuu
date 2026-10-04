/**
 * TXT / MD 导入 —— 落库计划与执行
 *
 * 拆成「算」和「写」两步，是为了让写入形状可以在 node 里直接单测（不碰 Dexie）：
 *   - `planImport()`  纯函数：输入作品名 + 切好的章节 → 输出三张表的**待写对象**
 *   - `executeImport()` 唯一有副作用的函数：一个事务里把三者写进去
 *
 * ★ 关键设计：**必须建一卷。**
 *   `ChapterPage` 的目录是 `volumes.map(vol => chaptersByVolume[vol.id])`，
 *   `OutlinePage` 也是这样 —— 没有 `volumeId` 的章节会落进 `chaptersByVolume[0]` 这个
 *   永远不被渲染的分组，**导进来的正文会「既看不见也点不开」**。
 *   所以导入统一先建一卷「正文」，所有章节挂到它下面。
 */

import type { Chapter, Project, Volume } from '../../types';
import { db } from '../../db/index';
import { addChapter, addVolume } from '../../db/outline';
import { addProject } from '../../db/project';
import type { RawChapter } from './importSplit';
import { countEditorWords, toEditorHtml } from './textToEditorHtml';

/** 导入时自动建的卷名 */
export const IMPORT_VOLUME_TITLE = '正文';

/** 作品名兜底 */
const FALLBACK_PROJECT_NAME = '未命名作品';

export type PlannedProject = Omit<Project, 'id'>;
export type PlannedVolume = Omit<Volume, 'id' | 'projectId'>;
export type PlannedChapter = Omit<Chapter, 'id' | 'projectId' | 'volumeId'>;

export interface ImportPlanInput {
  /** 作品名（空则兜底） */
  projectName: string;
  /** 可选题材 */
  genre?: string;
  /** 可选简介 */
  description?: string;
  /** 切分好的章节（`.docx` 时每章可能已带渲染好的 `html`） */
  chapters: RawChapter[];
  /** 按 Markdown 解析正文格式 */
  markdown?: boolean;
  /** 时间戳（测试里固定住用） */
  now?: number;
  /** 卷名（默认「正文」） */
  volumeTitle?: string;
}

export interface ImportPlanStats {
  chapterCount: number;
  /** 正文字数合计（按编辑器口径估算） */
  wordCount: number;
  /** 正文字符数合计（源文本口径，含空白） */
  charCount: number;
}

export interface ImportPlan {
  project: PlannedProject;
  volume: PlannedVolume;
  chapters: PlannedChapter[];
  stats: ImportPlanStats;
}

/**
 * 生成待写入的数据形状。
 *
 * ★ 兼容字段必须双写（见项目约定）：`Volume` 的 `index/title` 与 `name/order`、
 *   `Chapter` 的 `index` 与 `order` —— 少给一个就过不了类型检查，也会让按 `order` 排序的
 *   `getChaptersByProject` 拿到 undefined。
 */
export function planImport(input: ImportPlanInput): ImportPlan {
  const now = input.now ?? Date.now();
  const projectName = input.projectName.trim() || FALLBACK_PROJECT_NAME;
  const volumeTitle = input.volumeTitle?.trim() || IMPORT_VOLUME_TITLE;
  const markdown = input.markdown === true;

  const project: PlannedProject = {
    name: projectName,
    description: input.description?.trim() || undefined,
    genre: input.genre?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  const volume: PlannedVolume = {
    index: 1,
    title: volumeTitle,
    name: volumeTitle,
    order: 1,
    createdAt: now,
    updatedAt: now,
  };

  const chapters: PlannedChapter[] = input.chapters.map((raw, i) => {
    // ★ `.docx` 导入时 `raw.html` 已经渲染好了（含 h1~h3 / strong / em / br），直接用 ——
    //   不能丢给 `toEditorHtml`，那条路会「先整体转义再套格式」，把我们的标签转成字面量。
    const content = raw.html ?? toEditorHtml(raw.body, { markdown });
    const index = i + 1;
    const title = raw.title.trim() || `第 ${index} 章`;
    return {
      index,
      title,
      content,
      outline: '',
      hook: '',
      climax: '',
      chapterStructure: '',
      emotion: '',
      wordCount: countEditorWords(content),
      order: index,
      createdAt: now,
      updatedAt: now,
    };
  });

  const stats: ImportPlanStats = {
    chapterCount: chapters.length,
    wordCount: chapters.reduce((sum, chapter) => sum + (chapter.wordCount ?? 0), 0),
    charCount: input.chapters.reduce((sum, chapter) => sum + chapter.body.length, 0),
  };

  return { project, volume, chapters, stats };
}

/**
 * 写入数据库，返回新建的作品 id。
 *
 * 一个事务写三张表：不给「作品建好了、章节写一半失败」留下半拉子数据。
 * 事务内直接调 `addProject/addVolume/addChapter`（Dexie 是 zone 式的，
 * 这些 helper 里的 `db.xxx.add` 会自动并入当前事务 —— `OutlinePage` 的批量创建也是这么写的）。
 */
export async function executeImport(plan: ImportPlan): Promise<number> {
  let projectId = 0;

  await db.transaction('rw', db.projects, db.volumes, db.chapters, async () => {
    projectId = await addProject(plan.project);
    const volumeId = await addVolume({ ...plan.volume, projectId });

    for (const chapter of plan.chapters) {
      await addChapter({ ...chapter, projectId, volumeId });
    }
  });

  return projectId;
}
