import { useState } from 'react';
import { Sparkles, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { askAI } from '../ai/client';
import { handleAIError } from '../../utils/errorHandler';
import {
  getAllPractices,
  addPractice,
  updatePractice,
  deletePractice,
  getStyleCard,
  getPracticeCount,
  saveStyleCard,
  syncStyleCardToToolbox,
} from '../../db/writingPractice';

export default function WritingPracticePage() {
  const [prompt, setPrompt] = useState('');
  const [content, setContent] = useState('');
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const practices = useLiveQuery(() => getAllPractices(), []);
  const styleCard = useLiveQuery(() => getStyleCard(), []);

  const generatePrompt = async () => {
    setLoadingPrompt(true);
    try {
      const result = await askAI({
        system: `你是网文写作教练。请随机出一个适合练笔的场景题目。
要求：
- 一句话，有具体的场景/冲突/动作
- 不要泛泛（如"写一个主角"）
- 长度 20-50 字
- 直接输出题目，不要解释，不要引号

示例：
一个陌生人在地铁上突然递给你一封信
主角发现自己的影子在无人时独自动了`,
        user: '请出一个题目',
        maxTokens: 8000,
      });
      setPrompt(result.trim().replace(/^["「『]|["」』]$/g, ''));
    } catch (error) {
      console.error('出题失败:', error);
      handleAIError(error);
    } finally {
      setLoadingPrompt(false);
    }
  };

  // AI 分析单次练笔，提取文风特征
  const analyzeOnePractice = async (content: string): Promise<string> => {
    const result = await askAI({
      system: `你是文字风格分析专家。请分析用户这段练笔的文风特征。

要求：
1. 聚焦：句式长短、用词偏好、节奏感、修辞习惯、对话处理方式、情绪表达方式
2. 要具体（如"短句为主，句均不超过20字"，不要"文风简洁"）
3. 每条不超过 30 字
4. 3-5 条即可

输出纯文本，每行一条，不要解释。`,
      user: content,
      maxTokens: 8000,
    });
    return result.trim();
  };

  // 增量更新文风卡（读当前卡 + 新分析 → 合并）
  const updateStyleCardIncremental = async (newAnalysis: string, sampleCount: number) => {
    const current = await getStyleCard();

    const systemPrompt = `你有"当前文风卡"和"新练笔分析"。请把新分析合并进文风卡。

要求：
1. 保留旧卡的有效特征，不要丢
2. 新分析与旧卡重复的，合并
3. 新分析与旧卡矛盾的，判断：
   - 若是不同场景的差异（战斗 vs 日常），并存并标注场景
   - 若确实是习惯变化，以新样本为准
4. 让另一个 AI 读完能模仿你的风格
5. 用 ## 分段，清晰可执行
6. 字数 200-400

输出文风卡全文，不要解释。`;

    const userPrompt = current
      ? `【当前文风卡】\n${current.content}\n\n【新练笔分析】\n${newAnalysis}`
      : `【新练笔分析】\n${newAnalysis}\n\n（这是第一次练笔，直接生成文风卡）`;

    const result = await askAI({ system: systemPrompt, user: userPrompt, maxTokens: 8000 });
    const newCard = result.trim();

    await saveStyleCard(newCard, sampleCount);
    await syncStyleCardToToolbox(newCard);
  };

  const wordCount = content.replace(/\s/g, '').length;

  const handleSave = async () => {
    if (wordCount < 100) {
      alert('至少写 100 字');
      return;
    }
    if (wordCount > 300) {
      alert('不超过 300 字');
      return;
    }
    setSaving(true);
    setAnalyzing(true);
    try {
      // 1. 存练习（先存不带分析）
      const id = await addPractice({
        prompt,
        content,
        wordCount,
        aiAnalysis: '',
        createdAt: Date.now(),
      });

      // 2. AI 分析
      const analysis = await analyzeOnePractice(content);
      await updatePractice(id, { aiAnalysis: analysis });

      // 3. 增量更新文风卡
      const count = await getPracticeCount();
      await updateStyleCardIncremental(analysis, count);

      // 4. 清空 + 换题
      setContent('');
      await generatePrompt();
    } catch (error) {
      console.error('分析失败:', error);
      handleAIError(error);
    } finally {
      setAnalyzing(false);
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这次练习？')) return;
    await deletePractice(id);
  };

  return (
    <div className="w-full p-6">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">写作练习</h1>
            <p className="text-sm text-muted-foreground mt-1">
              每天练一小段，AI 逐渐学会你的文风
            </p>
          </div>
          {styleCard && (
            <div className="text-xs text-muted-foreground">
              已基于 {styleCard.sampleCount} 次练笔生成文风卡
            </div>
          )}
        </div>

        {/* 主区域 */}
        <div className="glass-card rounded-xl p-6 mb-6">
          {/* 题目 */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                今日题目
              </label>
              <button
                onClick={generatePrompt}
                disabled={loadingPrompt}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={loadingPrompt ? 'animate-spin' : ''} />
                换一个
              </button>
            </div>
            {!prompt && !loadingPrompt ? (
              <button
                onClick={generatePrompt}
                className="w-full p-4 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles size={16} />
                开始出题
              </button>
            ) : (
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-base text-foreground">
                  {loadingPrompt ? '出题中...' : prompt}
                </p>
              </div>
            )}
          </div>

          {/* 练笔 */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              你的练笔
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="写 100-300 字..."
              rows={10}
              disabled={!prompt}
              className="w-full bg-background text-foreground px-4 py-3 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs ${wordCount > 300 ? 'text-destructive' : wordCount >= 100 ? 'text-primary' : 'text-muted-foreground'}`}>
                {wordCount} / 目标 100-300
              </span>
              <button
                onClick={handleSave}
                disabled={saving || wordCount < 100 || wordCount > 300 || !prompt}
                className="flex items-center gap-1.5 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={14} />
                {analyzing ? 'AI 分析中...' : saving ? '保存中...' : '保存并分析'}
              </button>
            </div>
          </div>
        </div>

        {/* 历史练习 */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">
            历史练习 ({practices?.length || 0})
          </h2>
          {(!practices || practices.length === 0) ? (
            <div className="text-center py-12 text-muted-foreground text-sm glass-card rounded-xl">
              还没有练习记录
            </div>
          ) : (
            <div className="space-y-3">
              {practices.map((p) => (
                <div key={p.id} className="glass-card rounded-xl p-4 group">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-primary font-semibold mb-1">{p.prompt}</p>
                      <p className="text-sm text-foreground line-clamp-2">{p.content}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(p.id!)}
                      className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{p.wordCount} 字</span>
                    <span>{new Date(p.createdAt).toLocaleString('zh-CN')}</span>
                  </div>
                  {p.aiAnalysis && (
                    <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs text-foreground">
                      <span className="font-semibold text-primary">AI 分析：</span>
                      {p.aiAnalysis}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
