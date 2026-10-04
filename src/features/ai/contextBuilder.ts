import { db } from '../../db/index';
import { getProjectById } from '../../db/project';
import { getChaptersByProject } from '../../db/outline';
import { getActiveRules } from '../../db/rejectionCase';
import { getAllBookBookmarks } from '../../db/bookBookmark';
import { getPendingForeshadows } from '../../db/chapter';
import type { Chapter } from '../../types';
import { buildMemoryBlock, MEMORY_BUDGET } from './summaryUtils';

// 未回收伏笔注入参数（第3.5层）
const FORESHADOW_MAX_ITEMS = 5;    // 最多注入条数
const FORESHADOW_ITEM_CHARS = 60;  // 单条 content 截断字数
const FORESHADOW_BUDGET = 300;     // 段落总字数预算

/**
 * AI 上下文构建器参数
 */
export interface BuildContextParams {
  projectId: number;
  chapterId?: number;
  mode: 'polish' | 'expand' | 'continue' | 'fullChapter';
  selectedText?: string;      // 润色/扩写时用
  cursorBeforeText?: string;  // 续写时用
  selectedCardIds?: {
    characters: number[];
    worldSettings: number[];
    plotCards: number[];
    sceneCards: number[];
    bookBookmarks: number[];
  };
  targetWordCount?: number;   // 生成整章时的目标字数
  selectedTechniqueId?: number; // 选中的写作技巧ID
  selectedStyleId?: number;     // 选中的文风风格ID
  selectedRefBookId?: number | null; // 选中的参考书籍ID（拆书分析）
  injectMemory?: boolean;   // 是否注入【全书前情摘要】（默认注入；polish 模式恒不注入）
  memoryBudget?: number;    // 前情摘要层的字数预算（默认：expand 600 / 其余 1500）
  injectForeshadows?: boolean; // 是否注入【未回收伏笔】（默认注入；polish 模式恒不注入）
}

/**
 * 上下文构建结果
 */
export interface BuildContextResult {
  systemPrompt: string;
  userPrompt: string;
  summary: string;
}

/**
 * 去除 HTML 标签，提取纯文本
 */
export function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

/**
 * 构建 AI 上下文
 */
export async function buildContext(params: BuildContextParams): Promise<BuildContextResult> {
  const { projectId, chapterId, mode, selectedText, cursorBeforeText, selectedCardIds, targetWordCount = 3000, selectedTechniqueId, selectedStyleId } = params;

  // 深拷贝 selectedCardIds，避免修改原始对象
  const safeCardIds = selectedCardIds ? {
    characters: [...(selectedCardIds.characters || [])],
    worldSettings: [...(selectedCardIds.worldSettings || [])],
    plotCards: [...(selectedCardIds.plotCards || [])],
    sceneCards: [...(selectedCardIds.sceneCards || [])],
    bookBookmarks: [...(selectedCardIds.bookBookmarks || [])],
  } : undefined;

  // ===== 第1层：作品信息 =====
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error('作品不存在');
  }

  // ===== 第0层：核心灵感（排在最前面） =====
  let layer0 = '';
  let coreInspirationTitle = '';
  let coreInspirationContent = '';
  if (project.coreInspirationId) {
    const inspiration = await db.inspirations.get(project.coreInspirationId);
    if (inspiration) {
      coreInspirationTitle = inspiration.title;
      coreInspirationContent = inspiration.content;
      layer0 = `【核心创意（本书灵魂，所有生成必须围绕它展开）】\n`;
      layer0 += `《${inspiration.title}》\n`;
      layer0 += `${inspiration.content}\n`;
      if (inspiration.tags && inspiration.tags.length > 0) {
        layer0 += `标签：${inspiration.tags.join('、')}\n`;
      }
      layer0 += '\n';
    }
  }

  let layer1 = `【作品信息】\n`;
  layer1 += `书名：${project.name}\n`;
  if (project.genre) layer1 += `题材：${project.genre}\n`;
  if (project.description) layer1 += `简介：${project.description}\n`;
  if (project.goldenFinger) layer1 += `金手指：${project.goldenFinger}\n`;
  if (project.globalStructure) layer1 += `全书结构：${project.globalStructure}\n`;

  // ===== 第2层：卷纲 =====
  let layer2 = '';
  let currentVolume: any = null;
  if (chapterId) {
    const chapter = await db.chapters.get(chapterId);
    if (chapter && chapter.volumeId) {
      currentVolume = await db.volumes.get(chapter.volumeId);
      if (currentVolume) {
        layer2 = `\n【本卷信息】\n`;
        layer2 += `卷名：《${currentVolume.title || currentVolume.name || '未命名'}》\n`;
        if (currentVolume.summary) layer2 += `主线：${currentVolume.summary}\n`;
        if (currentVolume.hook) layer2 += `钩子：${currentVolume.hook}\n`;
        if (currentVolume.climax) layer2 += `爆点：${currentVolume.climax}\n`;
        if (currentVolume.volumeStructure) layer2 += `卷结构：${currentVolume.volumeStructure}\n`;
      }
    }
  }

  // ===== 第3层：章纲 =====
  let layer3 = '';
  let currentChapter: any = null;
  if (chapterId) {
    currentChapter = await db.chapters.get(chapterId);
    if (currentChapter) {
      layer3 = `\n【本章信息】\n`;
      layer3 += `章节名：${currentChapter.title}\n`;
      if (currentChapter.outline) layer3 += `章纲：${currentChapter.outline}\n`;
      if (currentChapter.hook) layer3 += `钩子：${currentChapter.hook}\n`;
      if (currentChapter.climax) layer3 += `爆点：${currentChapter.climax}\n`;
      if (currentChapter.chapterStructure) layer3 += `章结构：${currentChapter.chapterStructure}\n`;
      if (currentChapter.emotion) {
        layer3 += `情绪基调：${currentChapter.emotion}`;
        if (currentChapter.emotionIntensity) {
          layer3 += `（强度 ${currentChapter.emotionIntensity}/5）`;
        }
        layer3 += `\n`;

        // 章内起伏曲线（关键：防止全章同一强度）
        const intensity = currentChapter.emotionIntensity || 3;
        layer3 += `\n【本章节奏曲线（必须遵守，禁止全章同一强度）】\n`;

        // 情绪名统一取本章 emotion 字段（此前硬编码为"高潮/紧张/推进/舒缓为主"，与本章实际情绪不符）
        const emotionLabel = (currentChapter.emotion || '').trim() || '自然';

        if (intensity >= 5) {
          layer3 += `整章强度 5/5（${emotionLabel}），但全章不能一直绷紧，必须有 1-2 处短暂缓冲。\n`;
          layer3 += `参考曲线：紧（开场）→ 更紧 → 极强（高潮）→ 缓 1-2 句 → 极强（收尾）\n`;
          layer3 += `强制要求：\n`;
          layer3 += `- 强度 5 段落：短句（≤15字），动作密集，对话占比>30%，禁抒情/环境/长段心理\n`;
          layer3 += `- 强度 4 段落：动作+对话推进，节奏快\n`;
          layer3 += `- 强度 2-3 缓冲段落：允许 1-2 句环境/心理/短叹词，但必须立即切回推进\n`;
          layer3 += `- 全章至少 1 处降到强度 2 以下（哪怕只有一句话）\n`;
          layer3 += `反例（禁止）：全章每段都是短句+动作+对话 → 显得平，无高潮感\n`;
          layer3 += `正例：开场紧 → 中段缓 1-2 句 → 高潮极强 → 收尾简短缓\n`;
        } else if (intensity === 4) {
          layer3 += `整章强度 4/5（${emotionLabel}），要有 2-3 处起伏。\n`;
          layer3 += `参考曲线：中 → 紧 → 缓 1 句 → 紧 → 中\n`;
          layer3 += `强制要求：\n`;
          layer3 += `- 高潮段落用短句+动作\n`;
          layer3 += `- 每 3-5 段插入 1 段"缓冲"（1-2 句心理/环境/对话）\n`;
          layer3 += `- 禁止连续 4 段都是同强度\n`;
        } else if (intensity === 3) {
          layer3 += `整章强度 3/5（${emotionLabel}），快慢交替。\n`;
          layer3 += `参考曲线：缓 → 推进 → ${emotionLabel} 1 段 → 推进 → 缓\n`;
          layer3 += `强制要求：\n`;
          layer3 += `- 每段必须有信息增量或推进\n`;
          layer3 += `- 至少 1 处用短句制造节奏变化\n`;
          layer3 += `- 禁止连续 3 段都是平铺直叙\n`;
        } else {
          layer3 += `整章强度 ${intensity}/5（${emotionLabel}），但允许 1-2 处小起伏。\n`;
          layer3 += `强制要求：\n`;
          layer3 += `- 允许环境/心理描写\n`;
          layer3 += `- 每 300 字至少 1 个信息增量或对话\n`;
          layer3 += `- 禁止全程抒情/描写，读者会跑\n`;
        }
      }
    }
  }

  // 章节列表缓存：供「全书前情摘要」层与第4层共用，避免重复查询
  let cachedChapterList: Chapter[] | null = null;
  const loadChapterList = async (): Promise<Chapter[]> => {
    if (!cachedChapterList) {
      cachedChapterList = await getChaptersByProject(projectId);
    }
    return cachedChapterList;
  };

  // ===== 第3.5层：未回收伏笔（可顺手回收的旧线索） =====
  // 策略：polish 不注入；continue/fullChapter 注入全部未回收（排除本章刚埋的，最久优先）；
  //       expand 仅注入与选中文字相关的（复用章节页回收弹窗的 8 字启发式），无命中则不注入。
  // 说明：本章「章纲/钩子/爆点」优先级高于伏笔，此层仅作参考，不强制回收。
  let layerForeshadow = '';
  let foreshadowCount = 0;
  if (mode !== 'polish' && params.injectForeshadows !== false) {
    // 过滤：先排除本章刚埋的；expand 额外要求与选中文字相关
    const eligible = (await getPendingForeshadows(projectId)).filter(f => {
      if (f.chapterId != null && f.chapterId === chapterId) return false; // 本章刚埋的不注入
      if (mode === 'expand') {
        if (!selectedText) return false;
        const key = f.content.trim().slice(0, 8);
        return (key.length >= 4 && selectedText.includes(key)) || f.content.includes(selectedText);
      }
      return true;
    });
    // 最久未回收优先（与章节页面板 filteredForeshadows 排序一致）
    const picked = eligible.sort((a, b) => a.createdAt - b.createdAt);

    if (picked.length > 0) {
      // id → 章序号 映射（复用已缓存的章节列表，避免重复查询）
      const chapterList = await loadChapterList();
      const indexById = new Map<number, number>();
      chapterList.forEach(ch => {
        if (ch.id != null) indexById.set(ch.id, ch.index);
      });

      const lines: string[] = [];
      let usedChars = 0;
      for (const f of picked) {
        if (lines.length >= FORESHADOW_MAX_ITEMS) break;
        const text =
          f.content.length > FORESHADOW_ITEM_CHARS
            ? f.content.slice(0, FORESHADOW_ITEM_CHARS) + '…'
            : f.content;
        if (usedChars + text.length > FORESHADOW_BUDGET) break;
        const loc =
          f.chapterId != null && indexById.has(f.chapterId)
            ? `第${indexById.get(f.chapterId)}章`
            : '全局';
        lines.push(`- [#${f.id ?? '?'} | ${loc}] ${text}`);
        usedChars += text.length;
      }

      if (lines.length > 0) {
        foreshadowCount = lines.length;
        layerForeshadow = `\n【未回收伏笔（仅供参考，不强制回收）】\n` + lines.join('\n') + '\n';
      }
    }
  }

  // ===== 第3.9层：全书前情摘要（长篇记忆） =====
  // 解决"写第 N 章时看不到前面几十章发生了什么"：把已生成摘要按时间顺序注入。
  // 策略：polish 不注入；跳过最近 2 章（第4层已注入其细纲与上一章结尾，避免重复占位）；
  //       从最近往更早取，直到用满字数预算。
  let layerMem = '';
  let memoryChapterCount = 0;
  if (mode !== 'polish' && chapterId && currentChapter && params.injectMemory !== false) {
    const budget = params.memoryBudget ?? (mode === 'expand' ? MEMORY_BUDGET.expand : MEMORY_BUDGET.default);
    const memory = buildMemoryBlock(await loadChapterList(), currentChapter.index ?? 0, budget);
    layerMem = memory.block;
    memoryChapterCount = memory.chapterCount;
  }

  // ===== 第4层：剧情上下文 =====
  let layer4 = '';
  if (chapterId && currentChapter) {
    // 前几章：当前章 index 之前最近 2 章
    const allChapters = await loadChapterList();
    const sortedChapters = allChapters
      .filter(ch => ch.volumeId === currentChapter.volumeId)
      .sort((a, b) => a.index - b.index);

    const currentIndex = sortedChapters.findIndex(ch => ch.id === chapterId);

    if (currentIndex > 0) {
      const previousChapters = sortedChapters.slice(Math.max(0, currentIndex - 2), currentIndex);

      if (previousChapters.length > 0) {
        layer4 += `\n【前几章剧情回顾】\n`;
        previousChapters.forEach(ch => {
          const outline = ch.outline || '（无细纲）';
          layer4 += `第${ch.index}章 ${ch.title}：${outline}\n`;
        });
      }

      // 上一章结尾：最后 500 字
      const prevChapter = sortedChapters[currentIndex - 1];

      if (prevChapter && prevChapter.content) {
        const plainText = stripHtml(prevChapter.content);
        const lastPart = plainText.slice(-500);
        if (lastPart) {
          layer4 += `\n【上一章结尾】\n${lastPart}\n`;
        }
      }
    }

    // 本章已写：cursorBeforeText 最后 800 字
    if (cursorBeforeText && mode === 'continue') {
      const plainText = stripHtml(cursorBeforeText);
      const recentText = plainText.slice(-800);
      if (recentText) {
        layer4 += `\n【本章已写】\n${recentText}\n`;
      }
    }
  }

  // ===== 第5层：勾选卡片 =====
  let layer5 = '';

  // 人物卡：严格按勾选拉取，没勾选就是空数组
  const selectedCharacters = (safeCardIds && safeCardIds.characters && safeCardIds.characters.length > 0)
    ? (await db.characters.where('id').anyOf(safeCardIds.characters).toArray()).slice(0, 3)
    : [];

  if (selectedCharacters.length > 0) {
    layer5 += `\n【出场人物】\n`;
    selectedCharacters.forEach(char => {
      let line = `- ${char.name}`;

      // 括号部分：角色定位 · 身份
      const bracketParts: string[] = [];
      if (char.role) bracketParts.push(char.role);
      if (char.identity) bracketParts.push(char.identity);
      if (bracketParts.length > 0) {
        line += `（${bracketParts.join(' · ')}）`;
      }

      // 冒号后部分：性格、能力、动机
      const detailParts: string[] = [];
      if (char.personality) detailParts.push(`性格${char.personality}`);
      if (char.abilities) detailParts.push(`能力${char.abilities}`);
      if (char.motivation) detailParts.push(`动机${char.motivation}`);

      if (detailParts.length > 0) {
        line += `：${detailParts.join('，')}`;
      }

      // 如果只有名字，没有任何其他信息，标注为信息未完善
      if (bracketParts.length === 0 && detailParts.length === 0) {
        line += `（信息未完善）`;
      }

      // 限制长度不超过 80 字
      if (line.length > 80) {
        line = line.slice(0, 77) + '...';
      }

      layer5 += line + `\n`;
    });
  }

  // 世界观设定：严格按勾选拉取，没勾选就是空数组
  const selectedWorldSettings = (safeCardIds && safeCardIds.worldSettings && safeCardIds.worldSettings.length > 0)
    ? (await db.worldSettings.where('id').anyOf(safeCardIds.worldSettings).toArray()).slice(0, 3)
    : [];

  if (selectedWorldSettings.length > 0) {
    layer5 += `\n【相关设定】\n`;
    selectedWorldSettings.forEach(setting => {
      layer5 += `- ${setting.name || setting.title}`;
      if (setting.category) layer5 += `（${setting.category}）`;
      layer5 += `\n`;
      if (setting.description) layer5 += `  ${setting.description}\n`;
      if (setting.rules) layer5 += `  规则：${setting.rules}\n`;
    });
  }

  // 剧情卡
  const selectedPlotCards = (safeCardIds && safeCardIds.plotCards && safeCardIds.plotCards.length > 0)
    ? (await db.plotCards.where('id').anyOf(safeCardIds.plotCards).toArray()).slice(0, 3)
    : [];

  if (selectedPlotCards.length > 0) {
    layer5 += `\n【剧情卡】\n`;
    selectedPlotCards.forEach(plot => {
      layer5 += `- ${plot.title}：${plot.description}\n`;
    });
  }

  // 场景卡
  const selectedSceneCards = (safeCardIds && safeCardIds.sceneCards && safeCardIds.sceneCards.length > 0)
    ? (await db.sceneCards.where('id').anyOf(safeCardIds.sceneCards).toArray()).slice(0, 3)
    : [];

  if (selectedSceneCards.length > 0) {
    layer5 += `\n【场景卡】\n`;
    selectedSceneCards.forEach(scene => {
      const atmosphereText = scene.atmosphere ? `。氛围：${scene.atmosphere}` : '';
      layer5 += `- ${scene.title}：${scene.description}${atmosphereText}\n`;
    });
  }

  // ===== 第6层：写作技巧和文风 =====
  let layer6 = '';

  // 写作技巧
  if (selectedTechniqueId) {
    const technique = await db.writingStyles.get(selectedTechniqueId);
    if (technique) {
      layer6 += `\n【写作技巧要求】\n`;
      layer6 += `${technique.title}\n`;
      layer6 += `${technique.content}\n`;
    }
  }

  // 文风风格
  if (selectedStyleId) {
    const style = await db.writingStyles.get(selectedStyleId);
    if (style) {
      layer6 += `\n【文风风格要求】\n`;
      layer6 += `${style.title}\n`;
      layer6 += `${style.content}\n`;
    }
  }

  // ===== 第6.5层：书库素材参考 =====
  let layer6_5 = '';
  if (safeCardIds && safeCardIds.bookBookmarks.length > 0) {
    const allBookmarks = await getAllBookBookmarks();
    const selectedBookmarks = allBookmarks.filter(bm => bm.id && safeCardIds.bookBookmarks.includes(bm.id));

    if (selectedBookmarks.length > 0) {
      layer6_5 = `\n【书库素材参考（来自其他小说的优秀范例）】\n`;
      selectedBookmarks.forEach(bookmark => {
        layer6_5 += `- [${bookmark.category}] ${bookmark.text}`;
        if (bookmark.bookTitle) {
          layer6_5 += `（来自《${bookmark.bookTitle}》）`;
        }
        layer6_5 += '\n';

        // 如果是拆解分析，添加分析结果
        if (bookmark.category === '拆解分析' && bookmark.note) {
          layer6_5 += `  分析：${bookmark.note.slice(0, 200)}...\n`;
        }
      });
    }
  }

  // ===== 第6.7层：参考书籍 =====
  let layer6_7 = '';
  if (params.selectedRefBookId) {
    const refBook = await db.bookAnalyses.get(params.selectedRefBookId);
    if (refBook) {
      const hasStructured = refBook.style || refBook.structure || refBook.pacing;
      if (hasStructured) {
        layer6_7 = `\n【参考书籍：${refBook.title}】\n`;
        if (refBook.style) layer6_7 += `参考文风：${refBook.style}\n`;
        if (refBook.structure) layer6_7 += `参考结构：${refBook.structure}\n`;
        if (refBook.pacing) layer6_7 += `参考节奏：${refBook.pacing}\n`;
      } else if (refBook.outlineSample) {
        // 兜底：旧数据 3 字段空，但 outlineSample 有完整分析（截断到 800 字，降低 prompt 体积）
        const truncated = refBook.outlineSample.slice(0, 800);
        layer6_7 = `\n【参考书籍：${refBook.title} 分析摘要】\n`;
        layer6_7 += truncated;
        if (refBook.outlineSample.length > 800) {
          layer6_7 += `\n...（已截断，完整分析 ${refBook.outlineSample.length} 字）\n`;
        }
        layer6_7 += `请参考以上分析的文风、结构、节奏特点。\n`;
      }
    }
  }

  // ===== 第7层：避雷规则 =====
  let layer7 = '';
  const rules = await getActiveRules(projectId);
  if (rules.length > 0) {
    layer7 = `\n【避雷规则】\n`;
    rules.forEach((rule, idx) => {
      layer7 += `${idx + 1}. ${rule}\n`;
    });
  }

  // ===== 组装 system prompt =====
  let systemPrompt = '';

  // 如果有核心灵感，添加强化说明
  let coreInspirationPrefix = '';
  if (coreInspirationTitle && coreInspirationContent) {
    coreInspirationPrefix = `本书的核心创意是：「${coreInspirationTitle}」——${coreInspirationContent}\n所有生成内容必须围绕这个核心创意展开，不得偏离。\n\n`;
  }

  switch (mode) {
    case 'polish':
      systemPrompt = coreInspirationPrefix + `你是网文写作助手。请润色用户选中的文字。

要求：
1. 保持作品题材、风格、人物一致。
2. 提升画面感、节奏感和阅读体验。
3. 不改变原意和剧情走向。
4. 直接输出润色后的正文，不要解释。`;
      break;

    case 'expand':
      systemPrompt = coreInspirationPrefix + `你是网文写作助手。请扩写用户选中的文字。

要求：
1. 保持题材、风格、人物、设定一致。
2. 与前文和后文自然衔接。
3. 不改变原意，增加细节。
4. 直接输出扩写后的正文，不要解释。`;
      break;

    case 'continue':
      systemPrompt = coreInspirationPrefix + `你是网文写作助手。请顺着前文继续往下写。

要求：
1. 严格遵循作品题材、风格、人物、设定。
2. 剧情承接前几章和本章章纲。
3. 如果本章有"钩子"，在合适位置留出伏笔。
4. 如果本章有"爆点"，在合适位置写出。
5. 章节开头符合"章结构"要求。
6. 如果本章有"情绪基调"，必须用文字营造出对应的氛围和节奏。
7. 直接输出正文，不要解释。

字数要求（必须严格遵守）：
- 续写内容严格控制在 300 字左右，不超过 400 字。
- 写完 300 字左右立即停笔，不要展开新的情节线。
- 只续写下一小段，不要一次写完整章。

【情绪基调指导】
如果本章设定了情绪基调，你的写作必须体现这种情绪：
- 紧张：短句、快节奏、强调时间压力和危险
- 压抑：沉重氛围、压迫感、角色内心挣扎
- 热血：激昂语气、爆发力、情绪高涨
- 温情：细腻情感、温暖互动、柔和节奏
- 悬疑：留白、铺垫、信息不对称、疑问层层递进
- 爽快：痛快反击、碾压场面、读者期待的满足
- 悲壮：牺牲感、悲凉氛围、崇高意志
- 轻松：幽默对白、日常互动、舒缓节奏
- 震撼：强烈冲击、意料之外、颠覆性信息
- 平淡：日常推进、铺垫为主、不追求强烈情绪

【人物约束】
如果 prompt 里有【出场人物】列表，那么本章只能出现列表中的人物。
不要凭空创造新角色，也不要调用作品里未出场的人物。
如果【出场人物】段落不存在，不要主动引入任何具名角色。

【剧情卡和场景卡】
如果 prompt 里有【剧情卡】，请围绕这些剧情要点展开本章剧情。
如果 prompt 里有【场景卡】，请在合适的场景描写中体现这些氛围和细节。

【书库素材参考】
如果 prompt 里有【书库素材参考】，请参考这些范例的写法、节奏、结构，但不要直接抄袭原文。
学习其中的技巧手法，用到自己的书里。

【写作技巧和文风】
如果 prompt 里有【写作技巧要求】，请严格按该技巧的指导来写。
如果 prompt 里有【文风风格要求】，请严格按该文风的语言习惯来写。

【全书前情摘要】
如果 prompt 里有【全书前情摘要】，写作必须与之保持一致，不得与之冲突；也不要复述摘要里已经发生的事件。

【未回收伏笔（如有）】
如果 prompt 里有【未回收伏笔】，请注意：
- 伏笔是"可以参考、顺手回收"的旧线索，不是本章必须完成的任务。
- 优先级：本章章纲 > 钩子/爆点 > 剧情卡 > 伏笔。绝不能为了回收伏笔而偏离章纲或打断节奏。
- 钩子是本章结尾新埋的悬念，伏笔是前面已埋、现在可能回应的旧线索，不要把旧伏笔当成钩子又埋一遍。
- 只在自然、不打断节奏的位置回收，回收方式限于"一句话或一个细节"的轻点，不要展开成支线。
- 单章最多回收 2 条，宁可不收；与本章无关就直接忽略。
- 不要输出"这里回收了伏笔""呼应了前面的伏笔"之类作者讲解式元话语。`;
      break;

    case 'fullChapter':
      systemPrompt = coreInspirationPrefix + `你是网文写作助手。请根据以下框架生成本章正文。

基本要求：
1. 严格遵守作品题材、风格、世界观。
2. 出场人物必须来自"出场人物"列表。
3. 剧情必须符合本章章纲。
4. 章节开头符合"章结构"要求。
5. 如果本章有"情绪基调"，全章必须用文字营造出对应的氛围和节奏。
6. 直接输出正文，不要解释。

【情绪基调指导】
如果本章设定了情绪基调，你的写作必须贯穿始终地体现这种情绪：
- 紧张：短句、快节奏、强调时间压力和危险、制造不确定性
- 压抑：沉重氛围、压迫感、角色内心挣扎、困境描写
- 热血：激昂语气、爆发力、情绪高涨、激励性对话
- 温情：细腻情感、温暖互动、柔和节奏、人物关怀
- 悬疑：留白、铺垫、信息不对称、疑问层层递进、反常细节
- 爽快：痛快反击、碾压场面、读者期待的满足、反转打脸
- 悲壮：牺牲感、悲凉氛围、崇高意志、悲情渲染
- 轻松：幽默对白、日常互动、舒缓节奏、轻快氛围
- 震撼：强烈冲击、意料之外、颠覆性信息、世界观刷新
- 平淡：日常推进、铺垫为主、不追求强烈情绪、生活化

【钩子的处理】
本章钩子是本章结尾要埋下的悬念，不是本章要完成的事件。
钩子应该这样写：
1. 先用大量篇幅铺垫主角的努力/计划/优势。
2. 眼看就要成功时，出现意料之外的变数。
3. 用最后一段或最后几句，留下这个变数带来的悬念。

反例：主角潜入→被抓（太快，没落差）
正例：主角潜入→一路化解障碍→就要拿到目标→突然发现圈套→被制住→最后一句暗示"对方早就知道他会来"

【爆点的处理】
本章爆点是本章的高潮场面，必须有足够的铺垫和张力。
爆点应该这样写：
1. 爆点前：让局面看起来对主角不利（比如被包围、被识破、实力差距悬殊）。
2. 爆点中：主角用出人意料的方式反击/反转/展现真正的实力。
3. 爆点后：对手或旁观者的反应（震惊、忌惮、低估被打脸）。
4. 爆点必须是"一个完整的场面"，至少 300-500 字，不能一句话带过。

反例：主角掏出铜丝指了一下对手（太快，没张力）
正例：主角被逼入绝境→对手笃定胜券在握→主角开口说出一句话/掏出一件东西/发动某种能力→对手表情从轻视变成凝重→局面逆转→余波

【本章节奏】
请按以下节奏分配篇幅：
1. 开场（20%）：直接进入场景，符合章结构要求。
2. 铺垫（30%）：推进主线剧情，让读者跟随主角视角。
3. 转折（20%）：出现变故/新信息/对手入场。
4. 高潮（20-25%）：钩子或爆点爆发，写得详细具体。
5. 收尾（5-10%）：收束本章，留出指向下一章的悬念。

【禁止的写法】
1. 不要把钩子和爆点写成一句话的动作描述。
2. 不要用'直接''忽然''接着'这样跳过过程的词。
3. 不要把一章压缩成'大纲流水账'——每一段都要有画面感、对白、心理活动。
4. 主角做任何一个关键动作前，都要有动机、判断、犹豫、决断的描写。

【剧情卡和场景卡】
如果 prompt 里有【剧情卡】，请围绕这些剧情要点展开本章剧情。
如果 prompt 里有【场景卡】，请在合适的场景描写中体现这些氛围和细节。

【书库素材参考】
如果 prompt 里有【书库素材参考】，请参考这些范例的写法、节奏、结构，但不要直接抄袭原文。
学习其中的技巧手法，用到自己的书里。

【写作技巧和文风】
如果 prompt 里有【写作技巧要求】，请严格按该技巧的指导来写。
如果 prompt 里有【文风风格要求】，请严格按该文风的语言习惯来写。

字数要求：
目标字数 ${targetWordCount} 字。不要写成 ${targetWordCount} 字的流水账，要有充分的细节和节奏。宁可略微超出（不超过 ${targetWordCount + 500} 字），也不要空泛。

【人物约束】
如果 prompt 里有【出场人物】列表，那么本章只能出现列表中的人物。
不要凭空创造新角色，也不要调用作品里未出场的人物。
如果【出场人物】段落不存在，不要主动引入任何具名角色。

【全书前情摘要】
如果 prompt 里有【全书前情摘要】，写作必须与之保持一致，不得与之冲突；也不要复述摘要里已经发生的事件。

【未回收伏笔（如有）】
如果 prompt 里有【未回收伏笔】，请注意：
- 伏笔是"可以参考、顺手回收"的旧线索，不是本章必须完成的任务。
- 优先级：本章章纲 > 钩子/爆点 > 剧情卡 > 伏笔。绝不能为了回收伏笔而偏离章纲或打断节奏。
- 钩子是本章结尾新埋的悬念，伏笔是前面已埋、现在可能回应的旧线索，不要把旧伏笔当成钩子又埋一遍。
- 只在自然、不打断节奏的位置回收，回收方式限于"一句话或一个细节"的轻点，不要展开成支线。
- 单章最多回收 2 条，宁可不收；与本章无关就直接忽略。
- 不要输出"这里回收了伏笔""呼应了前面的伏笔"之类作者讲解式元话语。`;
      break;
  }

  // ===== 组装 user prompt =====
  let userPrompt = '';

  switch (mode) {
    case 'polish':
      userPrompt = layer0 + layer1 + layer3 + layer6 + layer6_5 + layer6_7 + layer7;
      if (selectedText) {
        userPrompt += `\n【需润色的文字】\n${selectedText}\n`;
      }
      break;

    case 'expand':
      userPrompt = layer0 + layer1 + layer2 + layer3 + layerForeshadow + layerMem + layer4 + layer5 + layer6 + layer6_5 + layer6_7 + layer7;
      if (selectedText) {
        userPrompt += `\n【需扩写的文字】\n${selectedText}\n`;
      }
      break;

    case 'continue':
      userPrompt = layer0 + layer1 + layer2 + layer3 + layerForeshadow + layerMem + layer4 + layer5 + layer6 + layer6_5 + layer6_7 + layer7;
      userPrompt += `\n【续写要求】\n请从前文结尾继续往下写。\n\n【字数要求】\n请写 300 字左右，最多不超过 400 字。\n不要写成 2000 字的长篇，只续写下一小段。\n`;
      break;

    case 'fullChapter':
      userPrompt = layer0 + layer1 + layer2 + layer3 + layerForeshadow + layerMem + layer4 + layer5 + layer6 + layer6_5 + layer6_7 + layer7;
      userPrompt += `\n【生成要求】\n请生成本章完整正文，约 ${targetWordCount} 字。\n`;
      break;
  }

  // ===== 组装 summary =====
  const summaryParts: string[] = [];
  if (layer0) summaryParts.push('核心灵感');
  summaryParts.push('作品设定');

  if (mode === 'polish') {
    if (currentChapter) summaryParts.push('本章章纲');
    if (rules.length > 0) summaryParts.push(`${rules.length} 条避雷规则`);
  } else {
    // expand, continue, fullChapter 模式
    if (currentVolume) summaryParts.push('本卷');
    if (currentChapter) summaryParts.push('本章');
    if (layer4.includes('【前几章剧情回顾】')) {
      const match = layer4.match(/前几章剧情回顾】\n([\s\S]*?)(?:\n【|$)/);
      if (match) {
        const lines = match[1].trim().split('\n').length;
        summaryParts.push(`前 ${lines} 章`);
      }
    }
    if (layer4.includes('【上一章结尾】')) {
      summaryParts.push('上一章结尾');
    }
    if (memoryChapterCount > 0) {
      summaryParts.push(`前情摘要 ${memoryChapterCount} 章`);
    }
    if (foreshadowCount > 0) {
      summaryParts.push(`未回收伏笔 ${foreshadowCount} 条`);
    }
    if (selectedCharacters.length > 0) {
      summaryParts.push(`${selectedCharacters.length} 个人物`);
    }
    if (selectedWorldSettings.length > 0) {
      summaryParts.push(`${selectedWorldSettings.length} 个设定`);
    }
    if (selectedPlotCards.length > 0) {
      summaryParts.push(`${selectedPlotCards.length} 张剧情卡`);
    }
    if (selectedSceneCards.length > 0) {
      summaryParts.push(`${selectedSceneCards.length} 个场景`);
    }
    if (safeCardIds && safeCardIds.bookBookmarks.length > 0) {
      summaryParts.push(`${safeCardIds.bookBookmarks.length} 条书库素材`);
    }
    if (selectedTechniqueId) {
      const technique = await db.writingStyles.get(selectedTechniqueId);
      if (technique) {
        summaryParts.push(`技巧:${technique.title}`);
      }
    }
    if (selectedStyleId) {
      const style = await db.writingStyles.get(selectedStyleId);
      if (style) {
        summaryParts.push(`文风:${style.title}`);
      }
    }
    if (currentChapter?.emotion) {
      summaryParts.push(`情绪:${currentChapter.emotion}`);
      if (currentChapter.emotionIntensity) {
        summaryParts.push(`强度${currentChapter.emotionIntensity}`);
      }
    }
    if (rules.length > 0) {
      summaryParts.push(`${rules.length} 条避雷规则`);
    }
  }

  const summary = summaryParts.join(' + ');

  return {
    systemPrompt,
    userPrompt,
    summary,
  };
}
