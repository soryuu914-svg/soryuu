import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  FileText,
  Save,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Anchor,
  CircleCheck,
  ChevronDown,
  Search,
  Pencil,
} from 'lucide-react';
import {
  getVolumesByProject,
  getChaptersByProject,
  getChapterById,
  updateChapter,
  updateChapterSummary,
} from '../../db/outline';
import { getCharactersByProject } from '../../db/character';
import { addForeshadow, getPendingForeshadows, resolveForeshadow } from '../../db/chapter';
import { getWorldSettingsByProject } from '../../db/world';
import { getAllBookAnalyses } from '../../db/bookAnalysis';
import { getAllBookBookmarks } from '../../db/bookBookmark';
import { getPlotCardsByProject } from '../../db/plotCard';
import { getSceneCardsByProject } from '../../db/sceneCard';
import { getAllTechniques, getAllStyles } from '../../db/writingStyle';
import { askAI, hasAIConfig } from '../ai/client';
import { generateChapterSummary } from '../ai/summarizer';
import { buildContext } from '../ai/contextBuilder';
import { handleAIError } from '../../utils/errorHandler';
import RejectionRulesToggle from '../../components/RejectionRulesToggle';
import type { Chapter } from '../../types';

const statusLabels: Record<string, string> = {
  todo: '未开始',
  draft: '草稿',
  finished: '已完稿',
};

const statusColors: Record<string, string> = {
  todo: 'bg-muted text-foreground',
  draft: 'bg-primary/10 text-primary',
  finished: 'bg-primary/10 text-primary',
};

type ReferenceDialogKey = 'character' | 'world' | 'plot' | 'scene' | 'bookmark' | 'foreshadow';

export default function ChapterPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || '0');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const chapterIdParam = searchParams.get('chapterId');
  const currentChapterId = chapterIdParam ? parseInt(chapterIdParam) : null;

  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [saveTimer, setSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [aiLoading, setAiLoading] = useState<string | null>(null); // 当前正在执行的 AI 操作
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null); // 选中的参考风格ID
  const [selectedTechniqueId, setSelectedTechniqueId] = useState<number | null>(null); // 选中的写作技巧ID
  const [selectedRefBookId, setSelectedRefBookId] = useState<number | null>(null); // 选中的参考书籍ID（拆书分析）
  const [rulesEnabled, setRulesEnabled] = useState(true); // 避雷规则开关
  const [editingGoal, setEditingGoal] = useState(false); // 是否在编辑目标字数
  const [goalInput, setGoalInput] = useState('3000'); // 目标字数输入框
  const [editingTitle, setEditingTitle] = useState(false); // 是否在编辑章节标题（顶部标题区内联编辑）
  const [titleInput, setTitleInput] = useState(''); // 章节标题输入框
  const [localWordCount, setLocalWordCount] = useState(0); // 即时字数（不等保存）
  const [savedWordCount, setSavedWordCount] = useState(0); // 已保存到数据库的字数
  const [referenceDialog, setReferenceDialog] = useState<ReferenceDialogKey | null>(null); // 顶栏参考区弹窗（当前展开的类别）
  const [selectedReferences, setSelectedReferences] = useState<{
    characters: number[];
    worldSettings: number[];
    plots: number[];
    scenes: number[];
    bookmarks: number[];
  }>({
    characters: [],
    worldSettings: [],
    plots: [],
    scenes: [],
    bookmarks: [],
  });
  const [bookmarkCategoryFilter, setBookmarkCategoryFilter] = useState<string>('全部');
  const [contextSummary, setContextSummary] = useState<string>(''); // AI 操作的上下文摘要

  // 章节摘要（长篇记忆）状态
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryEditing, setSummaryEditing] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');

  // 伏笔（埋线）状态
  const [showForeshadowDialog, setShowForeshadowDialog] = useState(false);
  const [foreshadowContent, setForeshadowContent] = useState('');
  const [foreshadowSaving, setForeshadowSaving] = useState(false);
  const [foreshadowError, setForeshadowError] = useState<string | null>(null);

  // 回收伏笔（在正文里选中一段 → 标记为在第 N 章回收）
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [resolveTargetId, setResolveTargetId] = useState<number | null>(null);
  const [resolveSaving, setResolveSaving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // 参考卡片弹窗搜索词（切换/关闭弹窗时自动清空）
  const [referenceSearch, setReferenceSearch] = useState('');

  // 生成整章状态
  const [showFullChapterDialog, setShowFullChapterDialog] = useState(false);
  const [fullChapterWordCount, setFullChapterWordCount] = useState(3000);
  const [fullChapterMode, setFullChapterMode] = useState<'append' | 'overwrite'>('append');
  const [aiTab, setAiTab] = useState<'续写' | '润色' | '扩写' | '整章'>('续写');

  // 预览状态
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewMode, setPreviewMode] = useState<'续写' | '润色' | '扩写' | '整章' | null>(null);

  // 右侧面板折叠状态
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(() => {
    const saved = localStorage.getItem('chapterPanelCollapsed');
    return saved === 'true';
  });

  // 标记是否正在 AI 生成
  const isAIGeneratingRef = useRef(false);

  // ★ 章节标题内联编辑：输入框 ref + Esc 放弃标记
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleSkipSaveRef = useRef(false);

  // 实时查询卷和章节
  const volumes = useLiveQuery(() => getVolumesByProject(projectId), [projectId]);
  const allChapters = useLiveQuery(() => getChaptersByProject(projectId), [projectId]);
  const bookAnalyses = useLiveQuery(() => getAllBookAnalyses(), []); // 查询所有拆书数据
  const characters = useLiveQuery(() => getCharactersByProject(projectId), [projectId]); // 查询人物卡
  const worldSettings = useLiveQuery(() => getWorldSettingsByProject(projectId), [projectId]); // 查询世界观
  const plotCards = useLiveQuery(() => getPlotCardsByProject(projectId), [projectId]); // 查询剧情卡
  const sceneCards = useLiveQuery(() => getSceneCardsByProject(projectId), [projectId]); // 查询场景卡
  const bookBookmarks = useLiveQuery(() => getAllBookBookmarks(), []); // 查询书库标记
  const techniques = useLiveQuery(() => getAllTechniques(), []); // 查询写作技巧
  const styles = useLiveQuery(() => getAllStyles(), []); // 查询文风风格
  const pendingForeshadows = useLiveQuery(() => getPendingForeshadows(projectId), [projectId]); // 查询未回收伏笔
  const currentChapter = useLiveQuery(
    () => (currentChapterId ? getChapterById(currentChapterId) : Promise.resolve(undefined)),
    [currentChapterId]
  );

  // 按卷分组章节
  const chaptersByVolume = allChapters?.reduce((acc, chapter) => {
    const volumeId = chapter.volumeId || 0;
    if (!acc[volumeId]) {
      acc[volumeId] = [];
    }
    acc[volumeId].push(chapter);
    return acc;
  }, {} as Record<number, Chapter[]>);

  // 伏笔行内显示"第 N 章"：章节 id → index
  const chapterIndexById = new Map<number, number>();
  allChapters?.forEach(ch => {
    if (ch.id !== undefined) chapterIndexById.set(ch.id, ch.index);
  });

  // 参考卡片弹窗：搜索过滤（空搜索词 = 不过滤；书库素材再叠加分类筛选）
  const referenceKw = referenceSearch.trim().toLowerCase();
  const matchRef = (...fields: Array<string | undefined>) =>
    !referenceKw || fields.some(f => (f || '').toLowerCase().includes(referenceKw));

  const filteredCharacters = (characters || []).filter(c => matchRef(c.name, c.role, c.identity, c.personality, c.description));
  const filteredWorldSettings = (worldSettings || []).filter(s => matchRef(s.name, s.category, s.description, s.rules));
  const filteredPlotCards = (plotCards || []).filter(p => matchRef(p.title, p.description));
  const filteredSceneCards = (sceneCards || []).filter(s => matchRef(s.title, s.description, s.atmosphere));
  const filteredBookmarks = (bookBookmarks || []).filter(
    bm => (bookmarkCategoryFilter === '全部' || bm.category === bookmarkCategoryFilter)
      && matchRef(bm.bookTitle, bm.text, bm.category),
  );
  const filteredForeshadows = (pendingForeshadows || [])
    .filter(f => matchRef(f.content))
    .sort((a, b) => a.createdAt - b.createdAt);

  // 切换/关闭参考弹窗时清空搜索词
  useEffect(() => {
    setReferenceSearch('');
  }, [referenceDialog]);

  // 计算今日总字数（从数据库读取）
  const getTodayTotalWords = useCallback(() => {
    if (!allChapters) {
      return 0;
    }
    const today = new Date().toISOString().split('T')[0];

    // 所有章节的今日字数总和
    const total = allChapters.reduce((sum, chapter) => {
      if (chapter.lastUpdatedDate === today) {
        return sum + (chapter.todayWords || 0);
      }
      return sum;
    }, 0);

    return total;
  }, [allChapters, currentChapterId, localWordCount, savedWordCount]);

  const todayTotalWords = getTodayTotalWords();
  const currentGoal = currentChapter?.chapterGoal || 3000;
  const progress = Math.min((todayTotalWords / currentGoal) * 100, 100);
  const progressColor = progress >= 100 ? 'bg-primary' : progress >= 50 ? 'bg-primary' : 'bg-muted';

  // 计算已选上下文数量
  const selectedCount = selectedReferences.characters.length +
                        selectedReferences.worldSettings.length +
                        selectedReferences.plots.length +
                        selectedReferences.scenes.length;

  // 切换勾选状态
  const toggleReference = (type: 'characters' | 'worldSettings' | 'plots' | 'scenes' | 'bookmarks', id: number) => {
    setSelectedReferences(prev => {
      const current = prev[type];
      if (current.includes(id)) {
        return { ...prev, [type]: current.filter(i => i !== id) };
      } else {
        return { ...prev, [type]: [...current, id] };
      }
    });
  };

  // 清空所有勾选
  const clearAllReferences = () => {
    setSelectedReferences({
      characters: [],
      worldSettings: [],
      plots: [],
      scenes: [],
      bookmarks: [],
    });
  };

  // 防抖保存函数
  const debouncedSave = useCallback(
    async (content: string, wordCount: number) => {
      if (!currentChapterId) return;

      // 清除之前的定时器
      if (saveTimer) {
        clearTimeout(saveTimer);
      }

      // 设置新的定时器
      const timer = setTimeout(async () => {
        setIsSaving(true);
        try {
          const chapter = await getChapterById(currentChapterId);
          const newStatus = chapter?.status === 'todo' && content.trim() ? 'draft' : chapter?.status;

          // 如果是 AI 生成，只更新 content 和 wordCount，不计入今日字数
          if (isAIGeneratingRef.current) {
            await updateChapter(currentChapterId, {
              content,
              wordCount,
              status: newStatus,
              // 正文变动 → 摘要可能过期（AI 生成也算变动）
              summaryDirty: true,
              updatedAt: Date.now(),
            });

            setSavedWordCount(wordCount);
            setLastSaved(Date.now());
            return;
          }

          // 用户正常输入时，才走今日字数累加逻辑
          const today = new Date().toISOString().split('T')[0];
          const oldTodayWords = chapter?.todayWords || 0;
          const oldLastDate = chapter?.lastUpdatedDate || '';
          const oldChapterWords = chapter?.wordCount || 0;

          // 计算增量
          const delta = wordCount - oldChapterWords;

          let newTodayWords;
          if (today !== oldLastDate) {
            // 跨天或首次，重置为当前字数
            newTodayWords = wordCount;
          } else {
            // 同一天累加增量
            newTodayWords = Math.max(0, oldTodayWords + delta);
          }

          await updateChapter(currentChapterId, {
            content,
            wordCount,
            status: newStatus,
            // 正文变动 → 摘要可能过期
            summaryDirty: true,
            todayWords: newTodayWords,
            lastUpdatedDate: today,
            updatedAt: Date.now(),
          });

          // 更新已保存字数状态
          setSavedWordCount(wordCount);
          setLastSaved(Date.now());
        } catch (error) {
          console.error('保存失败:', error);
        } finally {
          setIsSaving(false);
        }
      }, 1000); // 1秒防抖

      setSaveTimer(timer);
    },
    [currentChapterId, saveTimer]
  );

  // ===== 章节摘要（长篇记忆） =====

  // 生成本章摘要（60-100 字事件流水）
  const handleGenerateSummary = async () => {
    if (!currentChapter || !currentChapter.id || summaryGenerating) return;

    if (!hasAIConfig()) {
      alert('请先在设置页配置 AI 服务商');
      navigate('/settings');
      return;
    }
    if (!currentChapter.content || !currentChapter.content.trim()) {
      alert('本章还没有正文，无法生成摘要');
      return;
    }

    const targetId = currentChapter.id;
    const targetIndex = currentChapter.index ?? 0;
    setSummaryGenerating(true);
    setSummaryError(null);

    try {
      const volumeTitle = volumes?.find(v => v.id === currentChapter.volumeId)?.title;
      // 带上上一章摘要：保证衔接与代词指代一致
      const prevWithSummary = (allChapters || [])
        .filter(c => (c.index ?? 0) < targetIndex && !!c.summary && !!c.summary.trim())
        .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))[0];

      const summary = await generateChapterSummary(currentChapter, {
        volumeTitle,
        prevSummary: prevWithSummary?.summary,
      });

      await updateChapterSummary(targetId, summary);
      setSummaryEditing(false);
    } catch (error) {
      console.error('生成章节摘要失败:', error);
      setSummaryError('生成失败，请重试');
    } finally {
      setSummaryGenerating(false);
    }
  };

  // 保存手动编辑后的摘要
  const handleSaveSummaryDraft = async () => {
    if (!currentChapter?.id) return;
    const text = summaryDraft.trim();
    if (!text) {
      alert('摘要不能为空');
      return;
    }
    try {
      await updateChapterSummary(currentChapter.id, text);
      setSummaryEditing(false);
      setSummaryError(null);
    } catch (error) {
      console.error('保存章节摘要失败:', error);
      setSummaryError('保存失败，请重试');
    }
  };

  // 标记本章完稿
  const handleMarkChapterFinished = async () => {
    if (!currentChapter?.id) return;
    try {
      await updateChapter(currentChapter.id, { status: 'finished' });
    } catch (error) {
      console.error('标记完稿失败:', error);
    }
  };

  // ===== 伏笔（埋线） =====

  // 打开「埋线」弹窗：把选中文字预填为伏笔内容（最多 80 字）
  const handleOpenForeshadowDialog = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, '').trim();
    setForeshadowContent(selected.slice(0, 80));
    setForeshadowError(null);
    setShowForeshadowDialog(true);
  };

  // 保存伏笔（保存后右侧「未回收伏笔」列表由 useLiveQuery 自动刷新）
  const handleSaveForeshadow = async () => {
    const text = foreshadowContent.trim();
    if (!text) {
      setForeshadowError('请填写伏笔内容');
      return;
    }

    setForeshadowSaving(true);
    try {
      const now = Date.now();
      await addForeshadow({
        projectId,
        chapterId: currentChapter?.id,
        content: text,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
      setShowForeshadowDialog(false);
      setForeshadowContent('');
      setForeshadowError(null);
    } catch (error) {
      console.error('保存伏笔失败:', error);
      setForeshadowError('保存失败，请重试');
    } finally {
      setForeshadowSaving(false);
    }
  };

  // 打开「回收伏笔」弹窗：列出所有未回收伏笔（单选）
  // 轻量预选：若选中文字里出现某条伏笔的前 8 字（或该条内容包含选中文字），默认选中它
  const handleOpenResolveDialog = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, '').trim();
    const list = pendingForeshadows || [];
    const guess = selected
      ? list.find(f => {
          const key = f.content.trim().slice(0, 8);
          return (key.length >= 4 && selected.includes(key)) || f.content.includes(selected);
        })
      : undefined;
    setResolveTargetId(guess?.id ?? null);
    setResolveError(null);
    setShowResolveDialog(true);
  };

  // 确认回收：第二参传当前章 id（= 记录"在第几章回收"）
  const handleConfirmResolve = async () => {
    if (resolveTargetId === null) return;
    setResolveSaving(true);
    try {
      await resolveForeshadow(resolveTargetId, currentChapter?.id);
      setShowResolveDialog(false);
      setResolveTargetId(null);
      setResolveError(null);
    } catch (error) {
      console.error('回收伏笔失败:', error);
      setResolveError('回收失败，请重试');
    } finally {
      setResolveSaving(false);
    }
  };

  // 摘要生成时间展示
  const formatSummaryTime = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // AI 辅助功能处理
  const handleAIAction = async (action: 'polish' | 'expand' | 'continue') => {
    if (!editor) return;

    // 检查是否配置了 AI
    if (!hasAIConfig()) {
      alert('请先在设置页配置 AI 服务商');
      navigate('/settings');
      return;
    }

    // 获取选中的文字
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');

    // 润色和扩写需要选中文字，续写不需要
    if ((action === 'polish' || action === 'expand') && !selectedText.trim()) {
      alert('请先选中一段文字');
      return;
    }

    setAiLoading(action);

    try {
      // 准备 selectedCardIds
      const selectedCardIds = {
        characters: selectedReferences.characters,
        worldSettings: selectedReferences.worldSettings,
        plotCards: selectedReferences.plots,
        sceneCards: selectedReferences.scenes,
        bookBookmarks: selectedReferences.bookmarks,
      };

      // 续写需要获取光标前的文本
      let cursorBeforeText = '';
      if (action === 'continue') {
        cursorBeforeText = editor.state.doc.textBetween(0, editor.state.selection.from, '\n');
      }

      // 调用 contextBuilder
      const ctx = await buildContext({
        projectId,
        chapterId: currentChapter?.id,
        mode: action,
        selectedText: (action === 'polish' || action === 'expand') ? selectedText : undefined,
        cursorBeforeText: action === 'continue' ? cursorBeforeText : undefined,
        selectedCardIds,
        selectedTechniqueId: selectedTechniqueId ?? undefined,
        selectedStyleId: selectedStyleId ?? undefined,
        selectedRefBookId,
      });

      // 字数硬约束前置：写进 user prompt 开头（避免 AI 读完大量上下文后忘记字数）
      const wordCountPrefix = action === 'continue'
        ? `【硬性要求 · 必须遵守】续写 300 字，最少 250 字，最多 400 字。\n写完前自查：字数够 250 了吗？不够继续写。\n\n`
        : '';

      // 保存上下文摘要到状态
      setContextSummary(ctx.summary);

      // 标记 AI 生成开始
      isAIGeneratingRef.current = true;

      // 调用 AI
      const result = await askAI({
        system: ctx.systemPrompt,
        user: wordCountPrefix + ctx.userPrompt,
        maxTokens: 16000,
      });

      // 自动分段兜底函数
      const autoParagraph = (text: string): string => {
        if (text.includes('\n\n')) return text;
        let processed = text
          .replace(/([。！？])(?=["「])/g, '$1\n\n')
          .replace(/(["」])(?=[^\n"」「])/g, '$1\n\n')
          .replace(/([。！？])(?=[^。！？\n"」「]{40,})/g, '$1\n\n');
        return processed;
      };

      const processedText = autoParagraph(result);

      // 所有模式都放到预览区
      if (action === 'continue') {
        setPreviewContent(processedText);
        setPreviewMode('续写');
      } else if (action === 'polish') {
        setPreviewContent(processedText);
        setPreviewMode('润色');
      } else if (action === 'expand') {
        setPreviewContent(processedText);
        setPreviewMode('扩写');
      }

      // AI 内容处理完成后，延迟 200ms 重置标记
      setTimeout(() => {
        isAIGeneratingRef.current = false;
      }, 200);

    } catch (error) {
      handleAIError(error);
      // 出错时也要重置标记
      isAIGeneratingRef.current = false;
    } finally {
      setAiLoading(null);
    }
  };

  // 生成整章正文
  const handleGenerateFullChapter = async () => {
    if (!editor || !currentChapter) return;

    // 检查是否配置了 AI
    if (!hasAIConfig()) {
      alert('请先在设置页配置 AI 服务商');
      navigate('/settings');
      return;
    }

    // 如果是覆盖模式且编辑器有内容，二次确认
    if (fullChapterMode === 'overwrite' && editor.getText().trim()) {
      if (!window.confirm('将覆盖当前正文，确定吗？')) {
        return;
      }
    }

    setShowFullChapterDialog(false);
    setAiLoading('fullChapter');

    try {
      // 准备 selectedCardIds
      const selectedCardIds = {
        characters: selectedReferences.characters,
        worldSettings: selectedReferences.worldSettings,
        plotCards: selectedReferences.plots,
        sceneCards: selectedReferences.scenes,
        bookBookmarks: selectedReferences.bookmarks,
      };

      // 标记 AI 生成开始
      isAIGeneratingRef.current = true;

      // 调用 contextBuilder
      const ctx = await buildContext({
        projectId,
        chapterId: currentChapter.id,
        mode: 'fullChapter',
        targetWordCount: fullChapterWordCount,
        selectedCardIds,
        selectedTechniqueId: selectedTechniqueId ?? undefined,
        selectedStyleId: selectedStyleId ?? undefined,
        selectedRefBookId,
      });

      // 保存上下文摘要到状态
      setContextSummary(ctx.summary);

      // 调用 AI
      const result = await askAI({
        system: ctx.systemPrompt,
        user: ctx.userPrompt,
        maxTokens: 32000,
      });

      // 自动分段兜底函数
      const autoParagraph = (text: string): string => {
        if (text.includes('\n\n')) return text;
        let processed = text
          .replace(/([。！？])(?=["「])/g, '$1\n\n')
          .replace(/(["」])(?=[^\n"」「])/g, '$1\n\n')
          .replace(/([。！？])(?=[^。！？\n"」「]{40,})/g, '$1\n\n');
        return processed;
      };

      const processedText = autoParagraph(result);

      // 放到预览区
      setPreviewContent(processedText);
      setPreviewMode('整章');

      // AI 内容写入完成后，延迟 800ms 重置标记
      setTimeout(() => {
        isAIGeneratingRef.current = false;
      }, 800);

    } catch (error) {
      handleAIError(error);
      // 出错时也要重置标记
      isAIGeneratingRef.current = false;
    } finally {
      setAiLoading(null);
    }
  };

  // 接受预览内容并插入正文
  const handleAcceptPreview = () => {
    if (!editor || !previewContent || !previewMode) return;

    // 将纯文本转换为 HTML
    const textToHtml = (text: string): string => {
      return text
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('');
    };

    const htmlContent = textToHtml(previewContent);

    // 根据模式插入内容
    if (previewMode === '续写') {
      editor.chain().focus().insertContent(htmlContent).run();
    } else if (previewMode === '润色' || previewMode === '扩写') {
      // 替换选中的文字
      const { from, to } = editor.state.selection;
      editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, htmlContent).run();
    } else if (previewMode === '整章') {
      // 根据之前选择的模式处理
      if (fullChapterMode === 'overwrite') {
        editor.commands.setContent(htmlContent);
      } else {
        editor.chain().focus().insertContent(htmlContent).run();
      }
    }

    // 清空预览
    setPreviewContent('');
    setPreviewMode(null);

    // 提示
    alert('已插入正文');
  };

  // 重新生成
  const handleRegenerate = () => {
    if (!previewMode) return;

    // 清空预览
    setPreviewContent('');

    // 根据模式重新调用生成
    if (previewMode === '续写') {
      handleAIAction('continue');
    } else if (previewMode === '润色') {
      handleAIAction('polish');
    } else if (previewMode === '扩写') {
      handleAIAction('expand');
    } else if (previewMode === '整章') {
      handleGenerateFullChapter();
    }
  };

  // 初始化编辑器
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '开始写作...',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-3xl mx-auto focus:outline-none min-h-[500px] px-8 py-6',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      const wordCount = text.length;

      // 立即更新本地字数状态
      setLocalWordCount(wordCount);

      // 延迟保存到数据库
      debouncedSave(html, wordCount);
    },
  });

  // 监听章节切换，更新编辑器内容
  useEffect(() => {
    if (editor && currentChapter) {
      const content = currentChapter.content || '';
      // 只有当内容不同时才更新，避免光标跳动
      if (editor.getHTML() !== content) {
        editor.commands.setContent(content);
      }
      // 重置本地字数状态
      const wordCount = currentChapter.wordCount || 0;
      setLocalWordCount(wordCount);
      setSavedWordCount(wordCount);
    } else if (editor && !currentChapter && currentChapterId) {
      // 章节加载中，清空编辑器
      editor.commands.setContent('');
      setLocalWordCount(0);
      setSavedWordCount(0);
    }
  }, [editor, currentChapter, currentChapterId]);

  // 切换右侧面板折叠状态
  const toggleRightPanel = useCallback(() => {
    setRightPanelCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem('chapterPanelCollapsed', String(newValue));
      return newValue;
    });
  }, []);

  // 监听快捷键 Ctrl+\ 或 Cmd+\
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleRightPanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleRightPanel]);

  // ★ 章节标题内联编辑：进入编辑态后自动聚焦并全选
  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  // 开始编辑章节标题
  const handleStartEditTitle = () => {
    if (!currentChapter) return;
    titleSkipSaveRef.current = false;
    setTitleInput(currentChapter.title);
    setEditingTitle(true);
  };

  // 保存章节标题（回车 / 失焦收尾；Esc 走 titleSkipSaveRef 分支）
  const handleSaveTitle = async () => {
    if (titleSkipSaveRef.current) {
      titleSkipSaveRef.current = false;
      setEditingTitle(false);
      return;
    }
    const chapterId = currentChapter?.id;
    const original = currentChapter?.title ?? '';
    const next = titleInput.trim();
    setEditingTitle(false);
    // ★ 空标题 → 恢复原值不保存；值没变也不写库
    if (chapterId === undefined || !next || next === original) return;
    try {
      await updateChapter(chapterId, { title: next });
    } catch (error) {
      console.error('保存章节标题失败:', error);
    }
  };

  // 切换章节
  const handleSelectChapter = (chapterId: number) => {
    setSearchParams({ chapterId: chapterId.toString() });
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) {
      return '刚刚';
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)} 分钟前`;
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)} 小时前`;
    } else {
      return date.toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  // 保存目标字数
  const handleSaveGoal = async () => {
    if (!currentChapterId) return;
    const goal = parseInt(goalInput);
    if (isNaN(goal) || goal <= 0) {
      alert('请输入有效的目标字数');
      return;
    }
    try {
      await updateChapter(currentChapterId, { chapterGoal: goal });
      setEditingGoal(false);
    } catch (error) {
      console.error('保存目标字数失败:', error);
    }
  };

  // 格式化数字（千分位）
  const formatNumber = (num: number) => {
    return num.toLocaleString('zh-CN');
  };

  if (!volumes || !allChapters) {
    return <div className="p-8">加载中...</div>;
  }

  return (
    <div className="w-full p-6 h-full overflow-hidden">
      <div className="mb-4">
        {/* ★ 章节标题可编辑：点击 → 内联输入框，回车/失焦保存，Esc 取消 */}
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={() => void handleSaveTitle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur(); // 统一交给 onBlur 保存，避免重复写库
              } else if (e.key === 'Escape') {
                e.preventDefault();
                titleSkipSaveRef.current = true; // Esc → 放弃本次修改
                e.currentTarget.blur();
              }
            }}
            aria-label="章节标题"
            placeholder="章节标题"
            className="-mx-2 w-full max-w-md px-2 py-1 text-2xl font-bold text-foreground bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        ) : (
          <button
            type="button"
            onClick={handleStartEditTitle}
            disabled={!currentChapter}
            title={currentChapter ? '点击编辑章节标题' : undefined}
            className="group -mx-2 flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
          >
            <span className="text-2xl font-bold text-foreground">
              {currentChapter ? currentChapter.title : '章节编辑'}
            </span>
            {currentChapter && (
              <Pencil size={16} className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </button>
        )}
        {currentChapter && (
          <p className="text-sm text-muted-foreground mt-1">
            第 {currentChapter.index} 章 · {localWordCount || 0} 字
          </p>
        )}
      </div>

      <div className="glass-card rounded-xl flex items-stretch overflow-hidden h-[calc(100vh-200px)]">
      {/* 左侧章节列表 */}
      <aside className="w-60 shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">章节列表</h2>
          <p className="text-sm text-muted-foreground mt-1">共 {allChapters.length} 章</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {allChapters.length === 0 ? (
            <div className="p-4 text-center">
              <FileText size={48} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm mb-3">还没有章节</p>
              <button
                onClick={() => navigate(`/project/${projectId}/outline`)}
                className="text-sm text-primary hover:underline"
              >
                前往大纲页创建
              </button>
            </div>
          ) : (
            volumes?.map((volume) => {
              const chapters = chaptersByVolume?.[volume.id!] || [];
              if (chapters.length === 0) return null;

              return (
                <div key={volume.id} className="mb-4">
                  <div className="px-4 py-2 bg-muted border-b border-border">
                    <h3 className="font-medium text-foreground text-sm">{volume.title}</h3>
                  </div>
                  <div className="space-y-1 p-2">
                    {chapters.map((chapter) => (
                      <button
                        key={chapter.id}
                        onClick={() => handleSelectChapter(chapter.id!)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          currentChapterId === chapter.id
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">第 {chapter.index} 章</span>
                          {chapter.status && (
                            <span
                              className={`px-1.5 py-0.5 text-xs rounded ${
                                statusColors[chapter.status]
                              }`}
                            >
                              {statusLabels[chapter.status]}
                            </span>
                          )}
                        </div>
                        <div className="text-sm truncate">{chapter.title}</div>
                        {chapter.wordCount !== undefined && chapter.wordCount > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {chapter.wordCount} 字
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* 中间编辑器 */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {currentChapter ? (
          <>
            {/* 顶部工具栏 */}
            <div className="border-b border-border bg-card px-6 py-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span>第 {currentChapter.index} 章</span>
                    {currentChapter.wordCount !== undefined && (
                      <span>{currentChapter.wordCount} 字</span>
                    )}
                    {lastSaved && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {isSaving ? (
                          <>
                            <Save size={14} className="animate-pulse" />
                            <span>保存中...</span>
                          </>
                        ) : (
                          <>
                            <Clock size={14} />
                            <span>保存于 {formatTime(lastSaved)}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 编辑器工具栏 */}
              {editor && (
                <>
                  <div className="flex items-center gap-3">
                    {/* 避雷规则 */}
                    <div className="border-l border-input pl-3">
                      <RejectionRulesToggle
                        projectId={projectId}
                        enabled={rulesEnabled}
                        onToggle={setRulesEnabled}
                      />
                    </div>
                  </div>

                  {/* 参考区（横排卡片；点条目弹窗展开，保留勾选） */}
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    {/* 参考书籍（整卡即下拉：标签与当前书名同排，点击整卡展开选项，与旁边卡片同款风格） */}
                    <div className="relative flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-card border border-border rounded-lg hover:bg-card/80 hover:border-primary/40 focus-within:ring-2 focus-within:ring-primary/30 transition-colors">
                      <span className="text-muted-foreground">参考书籍：</span>
                      <span className="max-w-[12rem] truncate text-foreground">
                        {bookAnalyses?.find((b) => b.id === selectedRefBookId)?.title ?? '不参考'}
                      </span>
                      <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
                      {/* 透明原生 select 铺满整卡：外观自定义，交互仍走原生（键盘 / 无障碍 / 移动端都能用） */}
                      <select
                        value={selectedRefBookId || ''}
                        onChange={(e) => setSelectedRefBookId(e.target.value ? parseInt(e.target.value) : null)}
                        aria-label="参考书籍"
                        title={`参考书籍：${bookAnalyses?.find((b) => b.id === selectedRefBookId)?.title ?? '不参考'}`}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      >
                        <option value="">不参考</option>
                        {bookAnalyses?.map(b => (
                          <option key={b.id} value={b.id}>{b.title}</option>
                        ))}
                      </select>
                    </div>

                    {([
                      { key: 'character', label: '人物卡', selected: selectedReferences.characters.length, total: characters?.length || 0 },
                      { key: 'world', label: '世界观', selected: selectedReferences.worldSettings.length, total: worldSettings?.length || 0 },
                      { key: 'plot', label: '剧情卡', selected: selectedReferences.plots.length, total: plotCards?.length || 0 },
                      { key: 'scene', label: '场景卡', selected: selectedReferences.scenes.length, total: sceneCards?.length || 0 },
                      { key: 'bookmark', label: '书库素材', selected: selectedReferences.bookmarks.length, total: bookBookmarks?.length || 0 },
                    ] as Array<{ key: ReferenceDialogKey; label: string; selected: number; total: number }>).map(item => (
                      <button
                        key={item.key}
                        onClick={() => setReferenceDialog(item.key)}
                        disabled={item.total === 0}
                        title={`已勾选 ${item.selected} / 共 ${item.total}（点击查看勾选）`}
                        className="px-3 py-1.5 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {item.label}{' '}
                        <span className={item.selected > 0 ? 'text-primary font-semibold' : 'text-muted-foreground'}>
                          {item.selected}/{item.total}
                        </span>
                      </button>
                    ))}

                    <button
                      onClick={() => setReferenceDialog('foreshadow')}
                      title="点击查看未回收伏笔（只读）"
                      className="px-3 py-1.5 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      未回收伏笔{' '}
                      <span className={pendingForeshadows && pendingForeshadows.length > 0 ? 'text-primary font-semibold' : 'text-muted-foreground'}>
                        {pendingForeshadows?.length || 0}
                      </span>
                    </button>
                  </div>

                  <div className="w-px h-6 bg-border" />

                  {/* 格式化按钮 */}
                  <div className="flex items-center gap-1">
                  <button
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={`p-2 rounded hover:bg-muted transition-colors ${
                      editor.isActive('bold') ? 'bg-accent' : ''
                    }`}
                    title="粗体"
                  >
                    <Bold size={18} />
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={`p-2 rounded hover:bg-muted transition-colors ${
                      editor.isActive('italic') ? 'bg-accent' : ''
                    }`}
                    title="斜体"
                  >
                    <Italic size={18} />
                  </button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <button
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    className={`p-2 rounded hover:bg-muted transition-colors ${
                      editor.isActive('heading', { level: 1 }) ? 'bg-accent' : ''
                    }`}
                    title="一级标题"
                  >
                    <Heading1 size={18} />
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={`p-2 rounded hover:bg-muted transition-colors ${
                      editor.isActive('heading', { level: 2 }) ? 'bg-accent' : ''
                    }`}
                    title="二级标题"
                  >
                    <Heading2 size={18} />
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    className={`p-2 rounded hover:bg-muted transition-colors ${
                      editor.isActive('heading', { level: 3 }) ? 'bg-accent' : ''
                    }`}
                    title="三级标题"
                  >
                    <Heading3 size={18} />
                  </button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <button
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={`p-2 rounded hover:bg-muted transition-colors ${
                      editor.isActive('bulletList') ? 'bg-accent' : ''
                    }`}
                    title="无序列表"
                  >
                    <List size={18} />
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={`p-2 rounded hover:bg-muted transition-colors ${
                      editor.isActive('orderedList') ? 'bg-accent' : ''
                    }`}
                    title="有序列表"
                  >
                    <ListOrdered size={18} />
                  </button>
                  </div>
                </>
              )}
            </div>

            {/* 编辑区域 */}
            <div className="flex-1 overflow-y-auto bg-card">
              <EditorContent editor={editor} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-muted">
            <div className="text-center">
              <FileText size={64} className="mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {allChapters.length === 0
                  ? '请先在大纲页创建章节'
                  : '请从左侧选择一个章节开始写作'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 右侧面板容器 */}
      <div className="relative flex shrink-0">
        {/* 固定的展开/折叠按钮 */}
        <button
          onClick={toggleRightPanel}
          className="w-5 h-20 bg-muted/50 hover:bg-muted border-l border-border flex items-center justify-center cursor-pointer transition-colors group sticky top-1/2 -translate-y-1/2"
          title={rightPanelCollapsed ? '展开面板 (Ctrl+\\)' : '收起面板 (Ctrl+\\)'}
        >
          {rightPanelCollapsed ? (
            <ChevronLeft size={16} className="text-muted-foreground group-hover:text-foreground" />
          ) : (
            <ChevronRight size={16} className="text-muted-foreground group-hover:text-foreground" />
          )}
        </button>

        {/* 右侧面板 */}
        <aside
          className={`bg-card border-l border-border flex flex-col overflow-hidden transition-all duration-300 ${
            rightPanelCollapsed ? 'w-0' : 'w-72'
          }`}
        >
          {/* 面板内容 */}
          <div className="flex-1 overflow-y-auto">
        {/* 写作统计 */}
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3">写作统计</h3>
          <div className="space-y-3">
            {/* 今日字数 */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">今日字数</span>
              <span className="text-lg font-bold text-foreground">{formatNumber(todayTotalWords)}</span>
            </div>

            {/* 章节目标 */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">章节目标</span>
              {editingGoal ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    className="w-20 px-2 py-1 text-sm border border-input rounded focus:outline-none focus:ring-2 focus:ring-primary/30"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveGoal}
                    className="px-2 py-1 text-xs bg-card border border-border text-foreground font-semibold rounded hover:bg-card/80 hover:border-primary/40"
                  >
                    确定
                  </button>
                  <button
                    onClick={() => setEditingGoal(false)}
                    className="px-2 py-1 text-xs bg-card border border-border text-foreground font-semibold rounded hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setGoalInput(currentGoal.toString());
                    setEditingGoal(true);
                  }}
                  className="text-lg font-bold text-primary hover:text-primary/80"
                >
                  {formatNumber(currentGoal)}
                </button>
              )}
            </div>

            {/* 进度条 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">完成度</span>
                <span className={`text-xs font-semibold ${progress >= 100 ? 'text-green-600' : progress >= 50 ? 'text-blue-600' : 'text-muted-foreground'}`}>
                  {progress.toFixed(0)}% {progress >= 100 && '✓'}
                </span>
              </div>
              <div className="w-full bg-accent rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full ${progressColor} transition-all duration-300`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 章节摘要（长篇记忆） */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">章节摘要</h3>
            {currentChapter?.summary && (
              <span className="text-xs text-muted-foreground">{currentChapter.summary.length} 字</span>
            )}
          </div>

          {!currentChapter ? (
            <p className="text-xs text-muted-foreground">请先选择一个章节</p>
          ) : (
            <>
              {/* 状态行 */}
              <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
                {summaryGenerating ? (
                  <span className="text-primary">● 生成中...</span>
                ) : currentChapter.summary ? (
                  currentChapter.summaryDirty ? (
                    <span className="text-amber-600" title="正文已改动，摘要可能不完整">● 正文已改动，建议重新生成</span>
                  ) : (
                    <span className="text-green-600">
                      ● 已生成{currentChapter.summaryAt ? ` ${formatSummaryTime(currentChapter.summaryAt)}` : ''}
                    </span>
                  )
                ) : (
                  <span className="text-muted-foreground">○ 未生成摘要</span>
                )}
                {summaryError && <span className="text-destructive">{summaryError}</span>}
              </div>

              {/* 摘要内容（点击可手动编辑） */}
              {summaryEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={summaryDraft}
                    onChange={(e) => setSummaryDraft(e.target.value)}
                    rows={4}
                    placeholder="60-100 字，只写实际发生的事件"
                    className="w-full px-2 py-1.5 text-xs border border-input bg-card text-foreground rounded focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveSummaryDraft}
                      className="px-2 py-1 text-xs bg-card border border-border text-foreground font-semibold rounded hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setSummaryEditing(false)}
                      className="px-2 py-1 text-xs bg-card border border-border text-foreground rounded hover:bg-card/80 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : currentChapter.summary ? (
                <p
                  onClick={() => {
                    setSummaryDraft(currentChapter.summary || '');
                    setSummaryEditing(true);
                  }}
                  title="点击可手动编辑"
                  className="text-xs text-foreground leading-relaxed bg-muted/50 rounded p-2 cursor-text whitespace-pre-wrap"
                >
                  {currentChapter.summary}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  生成后会在写后续章节时自动注入，解决长篇写作"忘记前情"的问题。
                </p>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleGenerateSummary}
                  disabled={summaryGenerating || !currentChapter.content?.trim()}
                  title={!currentChapter.content?.trim() ? '本章还没有正文' : '调用 AI 生成 60-100 字摘要'}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary bg-primary/10 rounded hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles size={14} />
                  <span>{summaryGenerating ? '生成中...' : currentChapter.summary ? '重新生成' : '生成摘要'}</span>
                </button>

                {currentChapter.status === 'finished' ? (
                  <span className="text-xs text-green-600 px-1">已完稿</span>
                ) : (
                  <button
                    onClick={handleMarkChapterFinished}
                    title="把本章状态标记为已完稿"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-card border border-border text-foreground font-semibold rounded hover:bg-card/80 transition-colors"
                  >
                    <Save size={14} />
                    <span>标记完稿</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* AI 工具区 */}
        <div className="p-4 border-b border-border">
          {/* Tab 切换 */}
          <div className="flex border-b border-border mb-4">
            {['续写', '润色', '扩写', '整章'].map(tab => (
              <button
                key={tab}
                onClick={() => setAiTab(tab as '续写' | '润色' | '扩写' | '整章')}
                className={`flex-1 py-2 text-sm transition-colors ${
                  aiTab === tab
                    ? 'text-primary border-b-2 border-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* 共享设置区 */}
          <div className="mb-4">
            {/* 已选提示 */}
            {selectedCount > 0 && (
              <div className="flex items-center justify-between mb-3 p-2 bg-muted rounded-lg">
                <span className="text-xs text-muted-foreground">📎 已选 {selectedCount} 项</span>
                <button
                  onClick={clearAllReferences}
                  className="text-xs bg-card border border-destructive/30 text-destructive font-semibold rounded-lg hover:bg-destructive/10 transition-colors"
                >
                  清空
                </button>
              </div>
            )}

            {/* 写作技巧下拉 */}
            <div className="mb-2">
              <label className="block text-xs text-muted-foreground mb-1">写作技巧</label>
              <select
                value={selectedTechniqueId || ''}
                onChange={(e) => setSelectedTechniqueId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-2 py-1.5 text-sm border border-input rounded focus:ring-2 focus:ring-primary/30"
              >
                <option value="">不指定</option>
                {techniques?.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.title} {tech.isBuiltin ? '(预置)' : '(自定义)'}
                  </option>
                ))}
              </select>
            </div>

            {/* 文风风格下拉 */}
            <div className="mb-0">
              <label className="block text-xs text-muted-foreground mb-1">文风风格</label>
              <select
                value={selectedStyleId || ''}
                onChange={(e) => setSelectedStyleId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-2 py-1.5 text-sm border border-input rounded focus:ring-2 focus:ring-primary/30"
              >
                <option value="">不指定</option>
                {styles?.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.title} {style.isBuiltin ? '(预置)' : '(自定义)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tab 内容区 */}
          {aiTab === '续写' && (
            <div className="space-y-3">
              <button
                onClick={() => handleAIAction('continue')}
                disabled={aiLoading !== null}
                className="w-full h-11 flex items-center justify-center gap-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{aiLoading === 'continue' ? '生成中...' : '续写 300 字'}</span>
              </button>
              <p className="text-xs text-muted-foreground text-center">在光标处续写约 300 字</p>

              {/* 预览区 */}
              {previewContent && previewMode === '续写' && (
                <div className="mt-4 border border-primary/30 rounded-lg bg-card overflow-hidden flex flex-col">
                  {/* 头部 */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-primary/5 shrink-0">
                    <span className="text-xs text-primary font-medium">
                      ✨ 续写预览
                    </span>
                    <button
                      onClick={() => { setPreviewContent(''); setPreviewMode(null); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      ✕ 关闭
                    </button>
                  </div>

                  {/* 内容 */}
                  <div className="p-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap overflow-y-auto" style={{ maxHeight: 'min(400px, 40vh)' }}>
                    {previewContent}
                  </div>

                  {/* 底部按钮 */}
                  <div className="flex gap-2 p-2 border-t border-border shrink-0">
                    <button
                      onClick={handleRegenerate}
                      className="flex-1 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      重新生成
                    </button>
                    <button
                      onClick={handleAcceptPreview}
                      className="flex-1 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      插入正文
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {aiTab === '润色' && (
            <div className="space-y-3">
              <button
                onClick={() => handleAIAction('polish')}
                disabled={aiLoading !== null || !editor?.state.selection || editor.state.selection.empty}
                className="w-full h-11 flex items-center justify-center gap-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{aiLoading === 'polish' ? '生成中...' : '润色选中'}</span>
              </button>
              <p className="text-xs text-muted-foreground text-center">先选中正文中的文字</p>

              {/* 预览区 */}
              {previewContent && previewMode === '润色' && (
                <div className="mt-4 border border-primary/30 rounded-lg bg-card overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-primary/5 shrink-0">
                    <span className="text-xs text-primary font-medium">✨ 润色预览</span>
                    <button
                      onClick={() => { setPreviewContent(''); setPreviewMode(null); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      ✕ 关闭
                    </button>
                  </div>
                  <div className="p-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap overflow-y-auto" style={{ maxHeight: 'min(400px, 40vh)' }}>
                    {previewContent}
                  </div>
                  <div className="flex gap-2 p-2 border-t border-border shrink-0">
                    <button
                      onClick={handleRegenerate}
                      className="flex-1 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      重新生成
                    </button>
                    <button
                      onClick={handleAcceptPreview}
                      className="flex-1 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      插入正文
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {aiTab === '扩写' && (
            <div className="space-y-3">
              <button
                onClick={() => handleAIAction('expand')}
                disabled={aiLoading !== null || !editor?.state.selection || editor.state.selection.empty}
                className="w-full h-11 flex items-center justify-center gap-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{aiLoading === 'expand' ? '生成中...' : '扩写选中'}</span>
              </button>
              <p className="text-xs text-muted-foreground text-center">先选中正文中的文字</p>

              {/* 预览区 */}
              {previewContent && previewMode === '扩写' && (
                <div className="mt-4 border border-primary/30 rounded-lg bg-card overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-primary/5 shrink-0">
                    <span className="text-xs text-primary font-medium">✨ 扩写预览</span>
                    <button
                      onClick={() => { setPreviewContent(''); setPreviewMode(null); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      ✕ 关闭
                    </button>
                  </div>
                  <div className="p-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap overflow-y-auto" style={{ maxHeight: 'min(400px, 40vh)' }}>
                    {previewContent}
                  </div>
                  <div className="flex gap-2 p-2 border-t border-border shrink-0">
                    <button
                      onClick={handleRegenerate}
                      className="flex-1 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      重新生成
                    </button>
                    <button
                      onClick={handleAcceptPreview}
                      className="flex-1 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      插入正文
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {aiTab === '整章' && (
            <div className="space-y-3">
              <button
                onClick={() => setShowFullChapterDialog(true)}
                disabled={aiLoading !== null}
                className="w-full h-11 flex items-center justify-center gap-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{aiLoading === 'fullChapter' ? '生成中... 预计 30-60 秒' : '生成整章正文'}</span>
              </button>
              <p className="text-xs text-muted-foreground text-center">根据章纲生成完整章节</p>

              {/* 预览区 */}
              {previewContent && previewMode === '整章' && (
                <div className="mt-4 border border-primary/30 rounded-lg bg-card overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-primary/5 shrink-0">
                    <span className="text-xs text-primary font-medium">✨ 整章预览</span>
                    <button
                      onClick={() => { setPreviewContent(''); setPreviewMode(null); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      ✕ 关闭
                    </button>
                  </div>
                  <div className="p-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap overflow-y-auto" style={{ maxHeight: 'min(400px, 40vh)' }}>
                    {previewContent}
                  </div>
                  <div className="flex gap-2 p-2 border-t border-border shrink-0">
                    <button
                      onClick={handleRegenerate}
                      className="flex-1 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      重新生成
                    </button>
                    <button
                      onClick={handleAcceptPreview}
                      className="flex-1 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      插入正文
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 伏笔快捷操作（埋线 / 回收）——常驻显示，与 AI Tab 无关 */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex gap-2">
              <button
                onClick={handleOpenForeshadowDialog}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                title="把选中文字记为伏笔（未选中文字则手动填写）"
              >
                <Anchor size={16} />
                <span>埋线</span>
              </button>
              <button
                onClick={handleOpenResolveDialog}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                title="把已埋的伏笔标记为已回收（记录为在本章回收）"
              >
                <CircleCheck size={16} />
                <span>回收伏笔</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">先选中正文文字再点，可自动带出内容 / 预选命中的伏笔</p>
          </div>

          {/* 上下文摘要 */}
          {contextSummary && (
            <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="text-xs font-semibold text-primary mb-1">📖 本次参考</div>
              <div className="text-xs text-primary whitespace-pre-line">{contextSummary}</div>
            </div>
          )}
        </div>

        </div>
      </aside>
      </div>
      </div>

      {/* 生成整章对话框 */}
      {showFullChapterDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-4">生成整章正文</h3>

            {/* 目标字数 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">目标字数</label>
              <select
                value={fullChapterWordCount}
                onChange={(e) => setFullChapterWordCount(parseInt(e.target.value))}
                className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
              >
                <option value={2000}>2000 字</option>
                <option value={3000}>3000 字（推荐）</option>
                <option value={4000}>4000 字</option>
                <option value={5000}>5000 字</option>
              </select>
            </div>

            {/* 写入方式 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-2">写入方式</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="writeMode"
                    checked={fullChapterMode === 'append'}
                    onChange={() => setFullChapterMode('append')}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm text-foreground">追加到末尾</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="writeMode"
                    checked={fullChapterMode === 'overwrite'}
                    onChange={() => setFullChapterMode('overwrite')}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm text-foreground">覆盖现有正文</span>
                </label>
              </div>
            </div>

            {/* 按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowFullChapterDialog(false)}
                className="flex-1 px-4 py-2 text-sm bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleGenerateFullChapter}
                className="flex-1 px-4 py-2 text-sm bg-card border border-border text-foreground rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors font-semibold"
              >
                开始生成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 埋线（记伏笔）对话框 */}
      {showForeshadowDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-4">埋线（记伏笔）</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                伏笔内容 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={foreshadowContent}
                onChange={(e) => setForeshadowContent(e.target.value)}
                placeholder={'如：老猎户提到的"北方来的信使"之后再没出现'}
                className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg h-24 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-xs text-muted-foreground mt-1">默认预填选中文字（最多 80 字），可自行修改</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-2">关联章节</label>
              <p className="text-sm text-muted-foreground">
                {currentChapter ? `第 ${currentChapter.index} 章 ${currentChapter.title}` : '全局伏笔（未关联章节）'}
              </p>
            </div>

            {foreshadowError && <p className="text-xs text-destructive mb-2">{foreshadowError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setShowForeshadowDialog(false)}
                className="flex-1 px-4 py-2 text-sm bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveForeshadow}
                disabled={foreshadowSaving}
                className="flex-1 px-4 py-2 text-sm bg-card border border-border text-foreground rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {foreshadowSaving ? '保存中...' : '保存伏笔'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 回收伏笔对话框 */}
      {showResolveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-1">回收伏笔</h3>
            <p className="text-xs text-muted-foreground mb-4">
              选择要回收的伏笔，将记录为「在第 {currentChapter?.index ?? '?'} 章回收」
            </p>

            {!pendingForeshadows || pendingForeshadows.length === 0 ? (
              <p className="text-sm text-muted-foreground mb-4">暂无未回收伏笔</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1 mb-4">
                {pendingForeshadows
                  .slice()
                  .sort((a, b) => a.createdAt - b.createdAt)
                  .map(f => {
                    const chapterIndex = f.chapterId !== undefined ? chapterIndexById.get(f.chapterId) : undefined;
                    const isCurrent = f.chapterId !== undefined && f.chapterId === currentChapter?.id;
                    const selected = resolveTargetId === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setResolveTargetId(f.id!)}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded border transition-colors ${
                          selected
                            ? 'bg-primary/10 border-primary/40 text-foreground'
                            : 'bg-muted border-transparent text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[9px]">
                            {chapterIndex !== undefined ? `第 ${chapterIndex} 章` : '全局'}
                          </span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[9px]">本章</span>
                          )}
                          {selected && <span className="text-[9px] text-primary ml-auto">已选中</span>}
                        </div>
                        <div className="break-words">
                          {f.content.length > 40 ? `${f.content.slice(0, 40)}…` : f.content}
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}

            {resolveError && <p className="text-xs text-destructive mb-2">{resolveError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setShowResolveDialog(false)}
                className="flex-1 px-4 py-2 text-sm bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmResolve}
                disabled={resolveTargetId === null || resolveSaving}
                className="flex-1 px-4 py-2 text-sm bg-card border border-border text-foreground rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resolveSaving ? '回收中...' : '确认回收'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 参考卡片弹窗（顶栏点条目打开；保留勾选） */}
      {referenceDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-xl p-6 w-full max-w-[480px] max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                {referenceDialog === 'character' ? '人物卡' :
                  referenceDialog === 'world' ? '世界观' :
                    referenceDialog === 'plot' ? '剧情卡' :
                      referenceDialog === 'scene' ? '场景卡' :
                        referenceDialog === 'bookmark' ? '书库素材' : '未回收伏笔'}
              </h3>
              <span className="text-sm text-muted-foreground">
                {referenceDialog === 'character' && `已勾选 ${selectedReferences.characters.length}/${characters?.length || 0}`}
                {referenceDialog === 'world' && `已勾选 ${selectedReferences.worldSettings.length}/${worldSettings?.length || 0}`}
                {referenceDialog === 'plot' && `已勾选 ${selectedReferences.plots.length}/${plotCards?.length || 0}`}
                {referenceDialog === 'scene' && `已勾选 ${selectedReferences.scenes.length}/${sceneCards?.length || 0}`}
                {referenceDialog === 'bookmark' && `已勾选 ${selectedReferences.bookmarks.length}/${bookBookmarks?.length || 0}`}
                {referenceDialog === 'foreshadow' && `只读 · 共 ${pendingForeshadows?.length || 0} 条`}
              </span>
            </div>

            <div className="relative mb-3">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={referenceSearch}
                onChange={(e) => setReferenceSearch(e.target.value)}
                placeholder="搜索…"
                style={{ paddingLeft: '34px' }}
                className="w-full pr-3 py-2 text-sm bg-background text-foreground border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 min-h-[60px] pr-1">
              {referenceDialog === 'character' && (filteredCharacters.length ? filteredCharacters.map((char) => (
                <div key={char.id} className="flex items-start gap-3 p-3 bg-muted/50 border border-border rounded-lg hover:bg-muted hover:border-primary/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedReferences.characters.includes(char.id!)}
                    onChange={() => toggleReference('characters', char.id!)}
                    className="w-4 h-4 mt-0.5 accent-primary rounded focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleReference('characters', char.id!)}>
                    <div className="text-base font-semibold text-foreground truncate">{char.name}</div>
                    {char.role && <div className="text-sm text-muted-foreground mt-0.5">{char.role}</div>}
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground">{referenceKw ? '没有匹配的条目' : '暂无人物卡'}</p>)}

              {referenceDialog === 'world' && (filteredWorldSettings.length ? filteredWorldSettings.map((setting) => (
                <div key={setting.id} className="flex items-start gap-3 p-3 bg-muted/50 border border-border rounded-lg hover:bg-muted hover:border-primary/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedReferences.worldSettings.includes(setting.id!)}
                    onChange={() => toggleReference('worldSettings', setting.id!)}
                    className="w-4 h-4 mt-0.5 accent-primary rounded focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleReference('worldSettings', setting.id!)}>
                    <div className="text-base font-semibold text-foreground truncate">{setting.name}</div>
                    {setting.category && <div className="text-sm text-muted-foreground mt-0.5">{setting.category}</div>}
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground">{referenceKw ? '没有匹配的条目' : '暂无世界观设定'}</p>)}

              {referenceDialog === 'plot' && (filteredPlotCards.length ? filteredPlotCards.map((plot) => (
                <div key={plot.id} className="flex items-start gap-3 p-3 bg-muted/50 border border-border rounded-lg hover:bg-muted hover:border-primary/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedReferences.plots.includes(plot.id!)}
                    onChange={() => toggleReference('plots', plot.id!)}
                    className="w-4 h-4 mt-0.5 accent-primary rounded focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleReference('plots', plot.id!)}>
                    <div className="text-base font-semibold text-foreground truncate">{plot.title}</div>
                    {plot.description && <div className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{plot.description}</div>}
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground">{referenceKw ? '没有匹配的条目' : '暂无剧情卡'}</p>)}

              {referenceDialog === 'scene' && (filteredSceneCards.length ? filteredSceneCards.map((scene) => (
                <div key={scene.id} className="flex items-start gap-3 p-3 bg-muted/50 border border-border rounded-lg hover:bg-muted hover:border-primary/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedReferences.scenes.includes(scene.id!)}
                    onChange={() => toggleReference('scenes', scene.id!)}
                    className="w-4 h-4 mt-0.5 accent-primary rounded focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleReference('scenes', scene.id!)}>
                    <div className="text-base font-semibold text-foreground truncate">{scene.title}</div>
                    {scene.atmosphere && <div className="text-sm text-muted-foreground mt-0.5">{scene.atmosphere}</div>}
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground">{referenceKw ? '没有匹配的条目' : '暂无场景卡'}</p>)}

              {referenceDialog === 'bookmark' && (
                <>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {['全部', '金句', '点子', '人物描写', '世界观', '战斗描写', '情感描写', '拆解分析', '其他'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => setBookmarkCategoryFilter(cat)}
                        className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                          bookmarkCategoryFilter === cat
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  {filteredBookmarks.length ? filteredBookmarks.map((bookmark) => (
                      <div key={bookmark.id} className="flex items-start gap-3 p-3 bg-muted/50 border border-border rounded-lg hover:bg-muted hover:border-primary/40 transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedReferences.bookmarks.includes(bookmark.id!)}
                          onChange={() => toggleReference('bookmarks', bookmark.id!)}
                          className="w-4 h-4 mt-0.5 accent-primary rounded focus:ring-2 focus:ring-primary/30"
                        />
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleReference('bookmarks', bookmark.id!)}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs">{bookmark.category}</span>
                            <span className="text-muted-foreground text-xs truncate">《{bookmark.bookTitle}》</span>
                          </div>
                          <div className="text-sm text-foreground line-clamp-2">{bookmark.text.slice(0, 30)}...</div>
                        </div>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">{referenceKw ? '没有匹配的条目' : '暂无书库素材'}</p>}
                </>
              )}

              {referenceDialog === 'foreshadow' && (!pendingForeshadows || pendingForeshadows.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无未回收伏笔</p>
              ) : filteredForeshadows.length === 0 ? (
                <p className="text-sm text-muted-foreground">没有匹配的条目</p>
              ) : (
                filteredForeshadows.map(f => {
                    const chapterIndex = f.chapterId !== undefined ? chapterIndexById.get(f.chapterId) : undefined;
                    const isCurrent = f.chapterId !== undefined && f.chapterId === currentChapter?.id;
                    return (
                      <div key={f.id} className="flex items-start gap-3 p-3 bg-muted/50 border border-border rounded-lg">
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs shrink-0">
                          {chapterIndex !== undefined ? `第 ${chapterIndex} 章` : '全局'}
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs shrink-0">本章</span>
                        )}
                        <div className="flex-1 min-w-0 text-sm text-foreground break-words">
                          {f.content.length > 40 ? `${f.content.slice(0, 40)}…` : f.content}
                        </div>
                      </div>
                    );
                  })
              ))}
            </div>

            <div className="flex gap-3 mt-4 pt-4 border-t border-border">
              <button
                onClick={() => setReferenceDialog(null)}
                className="flex-1 px-4 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
