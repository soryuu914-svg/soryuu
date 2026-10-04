import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Sparkles } from 'lucide-react';
import { getLocalBookById, getChaptersByBook } from '../../db/localBook';
import { addBookAnalysis } from '../../db/bookAnalysis';
import { addBookBookmark, getBookmarksByBook, deleteBookBookmark } from '../../db/bookBookmark';
import { db } from '../../db/index';
import { askAI, extractJSON } from '../ai/client';
import { addWritingStyle } from '../../db/writingStyle';
import { handleAIError } from '../../utils/errorHandler';
import type { BookChapter } from '../../types';

// 整本书分析的结构化结果（对应 bookAnalyses 的 6 个内容字段）
interface ParsedAnalysis {
  style: string;
  structure: string;
  pacing: string;
  highlights: string[];
  outlineSample: string;
  characters: string;
}

export default function BookReader() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const bookIdNum = parseInt(bookId || '0');

  const book = useLiveQuery(() => getLocalBookById(bookIdNum), [bookIdNum]);
  const chapters = useLiveQuery(() => getChaptersByBook(bookIdNum), [bookIdNum]);

  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [selectedText, setSelectedText] = useState('');

  // 标记素材相关状态
  const [showBookmarkDialog, setShowBookmarkDialog] = useState(false);
  const [bookmarkCategory, setBookmarkCategory] = useState('金句');
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [bookmarkTags, setBookmarkTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedBookmark, setSelectedBookmark] = useState<any>(null);
  const [showBookmarkDetail, setShowBookmarkDetail] = useState(false);

  // 获取当前书的所有标记
  const bookmarks = useLiveQuery(() => getBookmarksByBook(bookIdNum), [bookIdNum]);

  // AI拆解相关状态
  const [showDeconstruction, setShowDeconstruction] = useState(false);
  const [deconstructionDimensions, setDeconstructionDimensions] = useState({
    writingStyle: true,
    structure: true,
    emotion: true,
    dialogue: true,
    takeaways: true,
  });
  const [deconstructing, setDeconstructing] = useState(false);
  const [deconstructionResult, setDeconstructionResult] = useState<string>('');
  const [showDeconstructionResult, setShowDeconstructionResult] = useState(false);

  // 整本书分析相关状态
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);
  const [analysisRange, setAnalysisRange] = useState<'first3' | 'first10' | 'random10'>('first10');
  const [analysisDimensions, setAnalysisDimensions] = useState({
    firstChapters: true,
    writingStyle: true,
    plotStructure: true,
    characters: true,
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [analysisParsed, setAnalysisParsed] = useState<ParsedAnalysis | null>(null);
  const [showAnalysisResult, setShowAnalysisResult] = useState(false);

  // 拆书提炼技巧相关状态
  const [extractingTips, setExtractingTips] = useState(false);
  const [extractedTips, setExtractedTips] = useState<Array<{ title: string; description: string; content: string; category: string }>>([]);
  const [showTipsPreview, setShowTipsPreview] = useState(false);

  const currentChapter = chapters?.[currentChapterIndex];

  // 处理文本选中
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || '';
      setSelectedText(text);
    };

    document.addEventListener('mouseup', handleSelection);
    return () => document.removeEventListener('mouseup', handleSelection);
  }, []);

  // 上一章
  const handlePrevChapter = () => {
    if (currentChapterIndex > 0) {
      setCurrentChapterIndex(currentChapterIndex - 1);
      window.scrollTo(0, 0);
    }
  };

  // 下一章
  const handleNextChapter = () => {
    if (chapters && currentChapterIndex < chapters.length - 1) {
      setCurrentChapterIndex(currentChapterIndex + 1);
      window.scrollTo(0, 0);
    }
  };

  // 打开标记对话框
  const handleOpenBookmarkDialog = () => {
    if (!selectedText) {
      alert('请先选中文字');
      return;
    }
    setShowBookmarkDialog(true);
  };

  // 添加标签
  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      if (!bookmarkTags.includes(tagInput.trim())) {
        setBookmarkTags([...bookmarkTags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  // 删除标签
  const handleRemoveTag = (tag: string) => {
    setBookmarkTags(bookmarkTags.filter(t => t !== tag));
  };

  // 保存标记
  const handleSaveBookmark = async () => {
    if (!book || !currentChapter || !selectedText) return;

    try {
      await addBookBookmark({
        bookId: bookIdNum,
        bookTitle: book.title,
        chapterIndex: currentChapter.index,
        chapterTitle: currentChapter.title,
        text: selectedText,
        note: bookmarkNote,
        category: bookmarkCategory,
        tags: bookmarkTags,
        createdAt: Date.now(),
      });

      alert('已标记');
      setShowBookmarkDialog(false);
      // 重置表单
      setBookmarkCategory('金句');
      setBookmarkNote('');
      setBookmarkTags([]);
      setTagInput('');
      setSelectedText('');
    } catch (error) {
      console.error('保存标记失败:', error);
      alert('保存失败');
    }
  };

  // 查看标记详情
  const handleViewBookmark = (bookmark: any) => {
    setSelectedBookmark(bookmark);
    setShowBookmarkDetail(true);
  };

  // 删除标记
  const handleDeleteBookmark = async (id: number) => {
    if (!confirm('确定删除这条标记？')) return;

    try {
      await deleteBookBookmark(id);
      setShowBookmarkDetail(false);
      setSelectedBookmark(null);
    } catch (error) {
      console.error('删除标记失败:', error);
      alert('删除失败');
    }
  };

  // 打开AI拆解对话框
  const handleOpenDeconstruction = () => {
    if (!selectedText) {
      alert('请先选中文字');
      return;
    }
    setShowDeconstruction(true);
  };

  // 开始AI拆解
  const handleStartDeconstruction = async () => {
    if (!selectedText) return;

    setDeconstructing(true);

    try {
      // 构建拆解维度文本
      const dimensions: string[] = [];
      if (deconstructionDimensions.writingStyle) dimensions.push('文风特点');
      if (deconstructionDimensions.structure) dimensions.push('结构技巧');
      if (deconstructionDimensions.emotion) dimensions.push('情绪营造');
      if (deconstructionDimensions.dialogue) dimensions.push('对话技巧');
      if (deconstructionDimensions.takeaways) dimensions.push('可借鉴的点');

      // 构建 system prompt
      const systemPrompt = `你是网文写作教练。用户选中了一段小说文字，请分析它为什么写得好。
请按以下 Markdown 结构输出：

${deconstructionDimensions.writingStyle ? '## 文风特点\n- 句式：\n- 用词：\n- 节奏：\n\n' : ''}
${deconstructionDimensions.structure ? '## 结构技巧\n- 段落安排：\n- 视角：\n\n' : ''}
${deconstructionDimensions.emotion ? '## 情绪营造\n- 用了什么手法：\n\n' : ''}
${deconstructionDimensions.dialogue ? '## 对话技巧（如果这段有对话）\n-\n\n' : ''}
${deconstructionDimensions.takeaways ? '## 可借鉴的点\n- 1.\n- 2.\n- 3.\n\n' : ''}

简洁有力，每项不超过 3 句话。`;

      const userPrompt = `请分析这段文字：\n\n${selectedText}`;

      console.log('开始AI拆解，维度：', dimensions.join('、'));

      const result = await askAI({
        user: userPrompt,
        system: systemPrompt,
        // 结构化输出：关闭思考模式，避免 reasoning 吃光 max_tokens
        disableThinking: true,
      });

      console.log('AI拆解完成');
      setDeconstructionResult(result);
      setShowDeconstruction(false);
      setShowDeconstructionResult(true);
    } catch (error) {
      console.error('AI拆解失败:', error);
      handleAIError(error);
    } finally {
      setDeconstructing(false);
    }
  };

  // 保存拆解结果为素材
  const handleSaveDeconstruction = async () => {
    if (!book || !currentChapter || !selectedText || !deconstructionResult) return;

    try {
      await addBookBookmark({
        bookId: bookIdNum,
        bookTitle: book.title,
        chapterIndex: currentChapter.index,
        chapterTitle: currentChapter.title,
        text: selectedText,
        note: deconstructionResult,
        category: '拆解分析',
        tags: [],
        createdAt: Date.now(),
      });

      alert('已保存');
      setShowDeconstructionResult(false);
      setDeconstructionResult('');
      setSelectedText('');
    } catch (error) {
      console.error('保存拆解结果失败:', error);
      alert('保存失败');
    }
  };

  // 开始整本书分析
  const handleStartAnalysis = async () => {
    if (!book || !chapters || chapters.length === 0) {
      alert('无法分析：书籍数据不完整');
      return;
    }

    setAnalyzing(true);

    try {
      // 根据范围选择章节
      let selectedChapters: BookChapter[] = [];
      if (analysisRange === 'first3') {
        selectedChapters = chapters.slice(0, 3);
      } else if (analysisRange === 'first10') {
        selectedChapters = chapters.slice(0, 10);
      } else if (analysisRange === 'random10') {
        // 均匀采样 10 章
        const step = Math.floor(chapters.length / 10);
        for (let i = 0; i < 10 && i * step < chapters.length; i++) {
          selectedChapters.push(chapters[i * step]);
        }
      }

      // 构建分析维度文本
      const dimensions: string[] = [];
      if (analysisDimensions.firstChapters) dimensions.push('前三章风格（节奏、钩子、爽点）');
      if (analysisDimensions.writingStyle) dimensions.push('文风特点（句式、用词、节奏）');
      if (analysisDimensions.plotStructure) dimensions.push('剧情安排（结构、转折、高潮）');
      if (analysisDimensions.characters) dimensions.push('主要人物塑造');

      // 构建 system prompt（JSON 输出；outlineSample 承载完整 Markdown 报告供展示）
      const systemPrompt = `你是网文分析专家。请分析以下小说内容。
用户要求的维度：${dimensions.join('、')}

请严格按 JSON 格式输出，不要 markdown 代码块包裹：
{
  "style": "文风特点（句式/用词/节奏），${analysisDimensions.writingStyle ? '必填' : '填空字符串'}",
  "structure": "剧情结构（整体/转折/高潮），${analysisDimensions.plotStructure ? '必填' : '填空字符串'}",
  "pacing": "节奏分析（快/慢/起伏），${analysisDimensions.firstChapters ? '必填' : '填空字符串'}",
  "highlights": ["核心爽点1", "爽点2"],
  "characters": "主要人物塑造（主角/配角/反派），${analysisDimensions.characters ? '必填' : '填空字符串'}",
  "outlineSample": "完整的 Markdown 格式分析报告（用 ## 分维度标题，给用户阅读）"
}

每项简洁，outlineSample 总长不超过 1500 字。`;

      // 构建 user prompt
      let userPrompt = `以下是《${book.title}》的 ${selectedChapters.length} 章内容：\n\n`;
      selectedChapters.forEach((ch) => {
        userPrompt += `【第${ch.index}章 ${ch.title}】\n${ch.content.substring(0, 2000)}\n\n`;
      });

      // 调用 AI
      const result = await askAI({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 16000,
        // 结构化输出：关闭思考模式
        disableThinking: true,
      });

      // 容错：去 markdown 包裹 + 抽 JSON
      let jsonStr = result.trim();
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = jsonStr.match(/{[\s\S]*}/);
      if (jsonMatch) jsonStr = jsonMatch[0];

      let parsed: ParsedAnalysis;
      try {
        const raw = JSON.parse(jsonStr);
        parsed = {
          style: typeof raw.style === 'string' ? raw.style : '',
          structure: typeof raw.structure === 'string' ? raw.structure : '',
          pacing: typeof raw.pacing === 'string' ? raw.pacing : '',
          highlights: Array.isArray(raw.highlights) ? raw.highlights.map((h: unknown) => String(h)) : [],
          characters: typeof raw.characters === 'string' ? raw.characters : '',
          outlineSample: typeof raw.outlineSample === 'string' ? raw.outlineSample : '',
        };
      } catch (e) {
        console.error('分析结果 JSON 解析失败:', e);
        console.error('AI 返回原文:', result);
        alert('AI 返回数据解析失败，报告按原文展示；结构化字段未保存。请稍后重试或更换模型。');
        // 解析失败：降级——原文塞 outlineSample，其他填空
        parsed = {
          style: '',
          structure: '',
          pacing: '',
          highlights: [],
          characters: '',
          outlineSample: result, // 原文
        };
      }

      // 展示用的还是 outlineSample（卡片化渲染不变）
      setAnalysisResult(parsed.outlineSample);
      // 暂存到 state，供保存用
      setAnalysisParsed(parsed);
      setShowAnalysisDialog(false);
      setShowAnalysisResult(true);
    } catch (error) {
      handleAIError(error);
    } finally {
      setAnalyzing(false);
    }
  };

  // 保存分析结果到拆书库
  const handleSaveAnalysis = async () => {
    if (!analysisResult || !book) return;

    try {
      const dataToSave = {
        title: `《${book.title}》分析`,
        sourceText: '整本书分析',
        style: analysisParsed?.style || '',
        structure: analysisParsed?.structure || '',
        pacing: analysisParsed?.pacing || '',
        highlights: analysisParsed?.highlights || [],
        outlineSample: analysisParsed?.outlineSample || analysisResult,
        characters: analysisParsed?.characters || '',
        tags: ['整本书分析', book.title],
        createdAt: Date.now(),
      };

      console.log('即将保存的分析:', dataToSave);

      const id = await addBookAnalysis(dataToSave);

      console.log('保存成功，id:', id);

      const check = await db.bookAnalyses.get(id);
      console.log('从数据库读回:', check);

      alert('已保存到拆书库');
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  // 从分析报告提炼写作技巧
  const handleExtractTips = async () => {
    if (!analysisResult || !analysisResult.trim()) {
      alert('没有分析内容可提炼');
      return;
    }

    setExtractingTips(true);
    try {
      const systemPrompt = `你是网文写作教练。用户拆解了一本书，以下是完整分析报告。

请从分析中提炼出 5-10 条可执行的写作技巧，用于指导 AI 写作。

【分类规则】
每条技巧必须归入以下 9 类之一：
- 钩子：悬念/危机/信息/反差
- 爆点：打脸/反杀/揭秘/反转
- 节奏：紧凑/舒缓/张弛
- 人物：主角光环/反差萌/动机
- 描写：动作/环境/感官
- 冲突：目标对立/信息差
- 开篇：黄金三章/开头技巧
- 结构：剧情安排、章节架构、伏笔铺陈、起承转合
- 情绪：情绪调动、氛围营造、读者代入

【质量要求】
1. 每条必须【具体可执行】，不要空话
   - ❌ "注意节奏"
   - ✅ "战斗场景用短句，每句不超过15字，连续3-5句后接一个长句缓冲"
2. 每条 100-200 字，说清"什么时候用"+"怎么做"
3. 优先从分析报告里找"作者明确用了的手法"，不是泛泛的写作常识
4. 不要照抄分析报告的原文，要提炼成【可复用的技巧】

【输出格式】
严格 JSON 数组，不要 markdown 包裹：
[
  {"title": "技巧名（如：钩子·蓝雾悬念）", "description": "一句话说明（20字内）", "content": "详细内容（100-200字）", "category": "钩子"}
]

如果分析里没找到某类技巧，那一类就不输出。`;

      const result = await askAI({
        system: systemPrompt,
        user: analysisResult,
        maxTokens: 16000,
        // 结构化输出：关闭思考模式
        disableThinking: true,
      });

      const parsed = extractJSON(result, 'array') as Array<any>;
      const validCategories = ['钩子', '爆点', '节奏', '人物', '描写', '冲突', '开篇', '结构', '情绪'];

      const tips = parsed
        .map(t => ({
          title: String(t.title || '').trim(),
          description: String(t.description || '').trim(),
          content: String(t.content || '').trim(),
          category: validCategories.includes(t.category) ? t.category : '结构',
        }))
        .filter(t => t.title && t.content);

      if (tips.length === 0) {
        alert('未提炼出有效技巧');
        return;
      }

      setExtractedTips(tips);
      setShowTipsPreview(true);
    } catch (error) {
      console.error('提炼失败:', error);
      handleAIError(error);
    } finally {
      setExtractingTips(false);
    }
  };

  // 保存提炼出的技巧到写作工具箱
  const handleSaveTips = async () => {
    if (extractedTips.length === 0) return;

    for (const tip of extractedTips) {
      await addWritingStyle({
        type: 'technique',
        title: tip.title,
        description: tip.description,
        content: tip.content,
        category: tip.category,
        isBuiltin: false,
        tags: [],
        createdAt: Date.now(),
      });
    }

    alert(`已添加 ${extractedTips.length} 条技巧到写作工具箱`);
    setShowTipsPreview(false);
    setExtractedTips([]);
  };

  if (!book || !chapters) {
    return <div className="p-8">加载中...</div>;
  }

  return (
    <div className="h-full flex">
      {/* 左侧：目录 */}
      <aside className="w-60 bg-card border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <button
            onClick={() => navigate('/analysis')}
            className="flex items-center gap-2 text-primary hover:text-primary/80 mb-3"
          >
            返回书柜
          </button>
          <h2 className="text-lg font-bold text-foreground line-clamp-2">{book.title}</h2>
          {book.author && (
            <p className="text-sm text-muted-foreground mt-1">{book.author}</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {chapters.map((chapter, idx) => (
            <button
              key={chapter.id}
              onClick={() => {
                setCurrentChapterIndex(idx);
                window.scrollTo(0, 0);
              }}
              className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted transition-colors ${
                idx === currentChapterIndex ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'
              }`}
            >
              <div className="text-xs text-muted-foreground mb-1">第 {chapter.index} 章</div>
              <div className="text-sm line-clamp-2">{chapter.title}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* 中间：正文阅读区 */}
      <main className="flex-1 flex flex-col overflow-hidden bg-muted">
        {/* 顶部导航栏 */}
        <div className="bg-card border-b border-border px-6 py-3 flex items-center justify-between">
          <button
            onClick={handlePrevChapter}
            disabled={currentChapterIndex === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            上一章
          </button>

          <div className="text-sm text-muted-foreground">
            第 {currentChapter?.index} 章 / 共 {chapters.length} 章
          </div>

          <button
            onClick={handleNextChapter}
            disabled={!chapters || currentChapterIndex >= chapters.length - 1}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下一章
          </button>
        </div>

        {/* 正文内容 */}
        <div className="flex-1 overflow-y-auto">
          <div
            className="max-w-4xl mx-auto px-8 py-8"
            onMouseUp={() => {
              const selection = window.getSelection();
              const text = selection?.toString().trim() || '';
              setSelectedText(text);
            }}
          >
            {currentChapter ? (
              <article>
                <h1 className="text-3xl font-bold text-foreground mb-6">
                  {currentChapter.title}
                </h1>
                <div className="prose prose-lg max-w-none">
                  {currentChapter.content.split('\n').map((paragraph, idx) => (
                    paragraph.trim() ? (
                      <p key={idx} className="mb-4 text-foreground leading-loose">
                        {paragraph}
                      </p>
                    ) : null
                  ))}
                </div>
              </article>
            ) : (
              <div className="text-center text-muted-foreground mt-20">
                <p>章节加载中...</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 右侧：工具区 */}
      <aside className="w-72 bg-card border-l border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3">工具区</h3>

          {/* 标记和拆解按钮 */}
          <div className="space-y-2 mb-4">
            <button
              onClick={handleOpenBookmarkDialog}
              disabled={!selectedText}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors ${!selectedText ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={!selectedText ? '请先选中文字' : ''}
            >
              标记这段
            </button>
            <button
              onClick={handleOpenDeconstruction}
              disabled={!selectedText}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors ${!selectedText ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={!selectedText ? '请先选中文字' : ''}
            >
              AI 拆解
            </button>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-border my-3"></div>

          {/* 分析这本书按钮 */}
          <button
            onClick={() => setShowAnalysisDialog(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
          >
            分析这本书
          </button>

          {/* 分隔线 */}
          <div className="border-t border-border my-3"></div>

          {/* 我的标记 */}
          <div className="text-sm font-semibold text-foreground">
            📋 我的标记 ({bookmarks?.length || 0})
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {/* 标记列表 */}
          {bookmarks && bookmarks.length > 0 ? (
            <div className="space-y-3">
              {/* 按分类分组显示 */}
              {['金句', '点子', '人物描写', '世界观', '战斗描写', '情感描写', '拆解分析', '其他'].map(category => {
                const categoryBookmarks = bookmarks.filter(b => b.category === category);
                if (categoryBookmarks.length === 0) return null;

                return (
                  <div key={category} className="mb-4">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">{category}</div>
                    <div className="space-y-2">
                      {categoryBookmarks.map(bookmark => (
                        <div
                          key={bookmark.id}
                          onClick={() => handleViewBookmark(bookmark)}
                          className="bg-card border border-border rounded-lg p-2 hover:bg-muted cursor-pointer transition-colors"
                        >
                          <div className="text-xs text-foreground line-clamp-2">
                            {bookmark.text.slice(0, 20)}...
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="mb-2">💡 使用提示</p>
              <p className="text-xs leading-relaxed">
                选中正文中的任意段落，点击上方按钮进行标记或拆解。
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* 分析对话框 */}
      {showAnalysisDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-foreground mb-4">分析这本书</h3>

            {/* 分析范围 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">分析范围</label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="first3"
                    checked={analysisRange === 'first3'}
                    onChange={(e) => setAnalysisRange(e.target.value as any)}
                    className="mr-2"
                  />
                  <span className="text-sm text-foreground">前三章（快速分析，便宜）</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="first10"
                    checked={analysisRange === 'first10'}
                    onChange={(e) => setAnalysisRange(e.target.value as any)}
                    className="mr-2"
                  />
                  <span className="text-sm text-foreground">前 10 章（推荐）</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="random10"
                    checked={analysisRange === 'random10'}
                    onChange={(e) => setAnalysisRange(e.target.value as any)}
                    className="mr-2"
                  />
                  <span className="text-sm text-foreground">随机抽 10 章（均匀采样）</span>
                </label>
              </div>
            </div>

            {/* 分析维度 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-2">分析维度（多选）</label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={analysisDimensions.firstChapters}
                    onChange={(e) => setAnalysisDimensions({ ...analysisDimensions, firstChapters: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-foreground">前三章风格（节奏、钩子、爽点）</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={analysisDimensions.writingStyle}
                    onChange={(e) => setAnalysisDimensions({ ...analysisDimensions, writingStyle: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-foreground">文风特点（句式、用词、节奏）</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={analysisDimensions.plotStructure}
                    onChange={(e) => setAnalysisDimensions({ ...analysisDimensions, plotStructure: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-foreground">剧情安排（结构、转折、高潮）</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={analysisDimensions.characters}
                    onChange={(e) => setAnalysisDimensions({ ...analysisDimensions, characters: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-foreground">主要人物塑造</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowAnalysisDialog(false)}
                disabled={analyzing}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleStartAnalysis}
                disabled={analyzing}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analyzing ? '分析中...' : '开始分析'}
              </button>
            </div>

            {analyzing && (
              <p className="text-sm text-muted-foreground text-center mt-3">分析中... 预计 30-60 秒</p>
            )}
          </div>
        </div>
      )}

      {/* 分析结果对话框 */}
      {showAnalysisResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-foreground">分析报告：《{book.title}》</h3>
              <button
                onClick={() => setShowAnalysisResult(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {(() => {
                // 按 ## 标题切分
                const sections: Array<{ title: string; lines: string[] }> = [];
                let current: { title: string; lines: string[] } | null = null;

                analysisResult.split('\n').forEach(line => {
                  if (line.startsWith('## ')) {
                    if (current) sections.push(current);
                    current = { title: line.replace('## ', '').trim(), lines: [] };
                  } else if (current) {
                    current.lines.push(line);
                  } else if (line.trim()) {
                    // 没有 ## 标题时的前言
                    sections.push({ title: '', lines: [line] });
                  }
                });
                if (current) sections.push(current);

                // 如果没切出任何 section，整个当纯文本
                if (sections.length === 0) {
                  return <p className="text-sm text-foreground whitespace-pre-wrap">{analysisResult}</p>;
                }

                return sections.map((section, idx) => (
                  <div key={idx} className="bg-card border border-border rounded-xl p-4">
                    {section.title && (
                      <h3 className="text-base font-bold text-primary mb-3 pb-2 border-b border-border">
                        {section.title}
                      </h3>
                    )}
                    <div className="text-sm text-foreground leading-relaxed space-y-2">
                      {section.lines.map((line, i) => {
                        if (line.startsWith('- ')) {
                          return (
                            <div key={i} className="flex gap-2">
                              <span className="text-primary shrink-0">·</span>
                              <span>{line.replace('- ', '')}</span>
                            </div>
                          );
                        }
                        if (line.trim()) {
                          return <p key={i}>{line}</p>;
                        }
                        return null;
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowAnalysisResult(false)}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={handleExtractTips}
                disabled={extractingTips}
                className="flex items-center gap-1.5 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                <Sparkles size={14} />
                {extractingTips ? '提炼中...' : '提炼技巧'}
              </button>
              <button
                onClick={handleSaveAnalysis}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                保存到拆书库
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 标记对话框 */}
      {showBookmarkDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-foreground">标记素材</h3>
              <button
                onClick={() => setShowBookmarkDialog(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>

            {/* 被标记的原文 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">原文</label>
              <div className="bg-muted border border-border rounded-lg p-3 text-sm text-foreground max-h-32 overflow-y-auto">
                {selectedText.length > 200 ? selectedText.slice(0, 200) + '...' : selectedText}
              </div>
            </div>

            {/* 分类 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">分类</label>
              <div className="flex flex-wrap gap-2">
                {['金句', '点子', '人物描写', '世界观', '战斗描写', '情感描写', '其他'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setBookmarkCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      bookmarkCategory === cat
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground hover:bg-accent'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* 备注 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">备注（可选）</label>
              <input
                type="text"
                value={bookmarkNote}
                onChange={(e) => setBookmarkNote(e.target.value)}
                placeholder="这段写得很燃..."
                className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
              />
            </div>

            {/* 标签 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-2">标签（回车添加）</label>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="输入标签后按回车..."
                className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent mb-2"
              />
              {bookmarkTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {bookmarkTags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-sm"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-destructive"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowBookmarkDialog(false)}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveBookmark}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                保存标记
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 标记详情对话框 */}
      {showBookmarkDetail && selectedBookmark && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-foreground">标记详情</h3>
              <button
                onClick={() => setShowBookmarkDetail(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>

            {/* 分类标签 */}
            <div className="mb-4">
              <span className="inline-block px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-sm font-medium">
                {selectedBookmark.category}
              </span>
            </div>

            {/* 章节信息 */}
            <div className="mb-3 text-sm text-muted-foreground">
              第 {selectedBookmark.chapterIndex} 章：{selectedBookmark.chapterTitle}
            </div>

            {/* 完整原文 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">原文</label>
              <div className="bg-muted border border-border rounded-lg p-4 text-sm text-foreground max-h-60 overflow-y-auto leading-relaxed">
                {selectedBookmark.text}
              </div>
            </div>

            {/* 备注 */}
            {selectedBookmark.note && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">备注</label>
                <div className="bg-background border border-yellow-500/40 rounded-lg p-3 text-sm text-foreground">
                  {selectedBookmark.note}
                </div>
              </div>
            )}

            {/* 标签 */}
            {selectedBookmark.tags && selectedBookmark.tags.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">标签</label>
                <div className="flex flex-wrap gap-2">
                  {selectedBookmark.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 底部按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowBookmarkDetail(false)}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => handleDeleteBookmark(selectedBookmark.id)}
                className="px-4 py-2 bg-card border border-destructive/30 text-destructive font-semibold rounded-lg hover:bg-destructive/10 hover:border-destructive/50 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI拆解对话框 */}
      {showDeconstruction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-foreground">AI 拆解</h3>
              <button
                onClick={() => setShowDeconstruction(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>

            {/* 被拆解的原文 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">原文</label>
              <div className="bg-muted border border-border rounded-lg p-4 text-sm text-foreground max-h-60 overflow-y-auto leading-relaxed">
                {selectedText}
              </div>
            </div>

            {/* 拆解维度 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-2">拆解维度（多选）</label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={deconstructionDimensions.writingStyle}
                    onChange={(e) => setDeconstructionDimensions({ ...deconstructionDimensions, writingStyle: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-foreground">文风特点（句式、用词、节奏）</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={deconstructionDimensions.structure}
                    onChange={(e) => setDeconstructionDimensions({ ...deconstructionDimensions, structure: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-foreground">结构技巧（段落安排、视角切换）</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={deconstructionDimensions.emotion}
                    onChange={(e) => setDeconstructionDimensions({ ...deconstructionDimensions, emotion: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-foreground">情绪营造（怎么让读者有感觉）</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={deconstructionDimensions.dialogue}
                    onChange={(e) => setDeconstructionDimensions({ ...deconstructionDimensions, dialogue: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-foreground">对话技巧（如果这段有对话）</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={deconstructionDimensions.takeaways}
                    onChange={(e) => setDeconstructionDimensions({ ...deconstructionDimensions, takeaways: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-foreground">可借鉴的点（怎么用到自己书里）</span>
                </label>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeconstruction(false)}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                disabled={deconstructing}
              >
                取消
              </button>
              <button
                onClick={handleStartDeconstruction}
                disabled={deconstructing}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deconstructing ? '拆解中...' : '开始拆解'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI拆解结果对话框 */}
      {showDeconstructionResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-foreground">拆解报告</h3>
              <button
                onClick={() => setShowDeconstructionResult(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>

            {/* 被拆解的原文 */}
            <div className="mb-4 pb-4 border-b border-border">
              <label className="block text-sm font-medium text-foreground mb-2">原文</label>
              <div className="bg-muted border border-border rounded-lg p-3 text-sm text-foreground max-h-32 overflow-y-auto">
                {selectedText}
              </div>
            </div>

            {/* 拆解结果 */}
            <div className="prose max-w-none mb-6">
              {deconstructionResult.split('\n').map((line, idx) => {
                if (line.startsWith('## ')) {
                  return <h2 key={idx} className="text-xl font-bold text-foreground mt-6 mb-3">{line.replace('## ', '')}</h2>;
                } else if (line.startsWith('- ')) {
                  return <li key={idx} className="text-foreground ml-6">{line.replace('- ', '')}</li>;
                } else if (line.trim()) {
                  return <p key={idx} className="text-foreground mb-2">{line}</p>;
                } else {
                  return <br key={idx} />;
                }
              })}
            </div>

            {/* 底部按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeconstructionResult(false)}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(deconstructionResult);
                  alert('已复制到剪贴板');
                }}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                复制
              </button>
              <button
                onClick={handleSaveDeconstruction}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                保存为素材
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 提炼技巧预览弹窗 */}
      {showTipsPreview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-foreground">
                提炼出 {extractedTips.length} 条技巧
              </h2>
              <button
                onClick={() => { setShowTipsPreview(false); setExtractedTips([]); }}
                className="p-1.5 hover:bg-muted rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              确认后将存入写作工具箱，生成时可选用
            </p>

            <div className="space-y-3 mb-5">
              {extractedTips.map((tip, idx) => (
                <div key={idx} className="bg-card/50 border border-border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked
                      onChange={(e) => {
                        if (!e.target.checked) {
                          setExtractedTips(extractedTips.filter((_, i) => i !== idx));
                        }
                      }}
                      className="mt-0.5 w-4 h-4 accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="text-base font-semibold text-foreground">{tip.title}</h3>
                        <select
                          value={tip.category}
                          onChange={(e) => {
                            const newTips = [...extractedTips];
                            newTips[idx].category = e.target.value;
                            setExtractedTips(newTips);
                          }}
                          className="text-xs px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full"
                        >
                          {['钩子', '爆点', '节奏', '人物', '描写', '冲突', '开篇', '结构', '情绪'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      {tip.description && (
                        <p className="text-xs text-muted-foreground mb-2">{tip.description}</p>
                      )}
                      <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{tip.content}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-4 border-t border-border">
              <button
                onClick={() => { setShowTipsPreview(false); setExtractedTips([]); }}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveTips}
                disabled={extractedTips.length === 0}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                保存 {extractedTips.length} 条到写作工具箱
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
