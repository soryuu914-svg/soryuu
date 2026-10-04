import { useState, useEffect } from 'react';
import { Lightbulb, Search, Edit2, Trash2, Sparkles } from 'lucide-react';
import type { Inspiration } from '../../types';
import {
  getAllInspirations,
  addInspiration,
  updateInspiration,
  deleteInspiration,
} from '../../db/inspiration';
import { askAI, extractJSON } from '../ai/client';

const GENRES = ['玄幻', '都市', '仙侠', '科幻', '历史', '悬疑', '其他'];

export default function InspirationsPage() {
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [searchText, setSearchText] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // 表单字段
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');

  // AI 生成对话框
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiGenre, setAiGenre] = useState('玄幻');
  const [aiElements, setAiElements] = useState('');
  const [aiCount, setAiCount] = useState('5');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResults, setAiResults] = useState<Array<{ title: string; content: string; tags: string[]; saved?: boolean }>>([]);

  useEffect(() => {
    loadInspirations();
  }, []);

  async function loadInspirations() {
    const data = await getAllInspirations();
    setInspirations(data);
  }

  // 筛选灵感
  const filteredInspirations = inspirations.filter((insp) => {
    if (!searchText) return true;
    const searchLower = searchText.toLowerCase();
    return (
      insp.title.toLowerCase().includes(searchLower) ||
      insp.content.toLowerCase().includes(searchLower) ||
      insp.tags.some(tag => tag.toLowerCase().includes(searchLower))
    );
  });

  function openCreateDialog() {
    setEditingId(null);
    setTitle('');
    setContent('');
    setTags('');
    setShowDialog(true);
  }

  function openEditDialog(inspiration: Inspiration) {
    setEditingId(inspiration.id!);
    setTitle(inspiration.title);
    setContent(inspiration.content);
    setTags(inspiration.tags.join(', '));
    setShowDialog(true);
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) {
      alert('标题和内容不能为空');
      return;
    }

    const tagsArray = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t);

    if (editingId) {
      await updateInspiration(editingId, {
        title,
        content,
        type: '灵感',
        tags: tagsArray,
      });
    } else {
      await addInspiration({
        title,
        content,
        type: '灵感',
        tags: tagsArray,
        createdAt: Date.now(),
      });
    }

    setShowDialog(false);
    loadInspirations();
  }

  async function handleDelete(id: number) {
    if (!confirm('确定删除这条灵感？')) return;
    await deleteInspiration(id);
    loadInspirations();
  }

  function openAIDialog() {
    setAiGenre('玄幻');
    setAiElements('');
    setAiCount('5');
    setAiResults([]);
    setShowAIDialog(true);
  }

  async function handleAIGenerate() {
    if (!aiElements.trim()) {
      alert('请输入想要的元素');
      return;
    }

    setAiGenerating(true);
    setAiResults([]);

    try {
      const count = aiCount;
      const systemPrompt = `你是网文策划师。请生成 ${count} 个有吸引力的网文灵感。每个包含：title（标题，一句话）、content（核心创意，60字内）、tags（标签数组）。严格按 JSON 数组输出，不要 markdown 包裹。`;
      const userPrompt = `题材：${aiGenre}\n元素：${aiElements}\n数量：${count} 个`;

      console.log('传给 askAI 的参数:', {
        system: typeof systemPrompt,
        user: typeof userPrompt,
        systemContent: systemPrompt,
        userContent: userPrompt
      });

      const raw = await askAI({ system: systemPrompt, user: userPrompt });
      const results = extractJSON(raw, 'array') as Array<{ title: string; content: string; tags: string[] }>;
      if (results && results.length > 0) {
        setAiResults(results.map(r => ({ ...r, saved: false })));
      } else {
        alert('生成失败，请重试');
      }
    } catch (error) {
      console.error('AI 生成失败', error);
      alert('生成失败：' + (error as Error).message);
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleSaveSingleResult(index: number) {
    const result = aiResults[index];
    await addInspiration({
      title: result.title,
      content: result.content,
      type: '灵感',
      tags: result.tags,
      createdAt: Date.now(),
    });

    const updated = [...aiResults];
    updated[index].saved = true;
    setAiResults(updated);

    alert('已保存');
    loadInspirations();
  }

  async function handleSaveAllResults() {
    for (const result of aiResults) {
      if (!result.saved) {
        await addInspiration({
          title: result.title,
          content: result.content,
          type: '灵感',
          tags: result.tags,
          createdAt: Date.now(),
        });
      }
    }

    const unsavedCount = aiResults.filter(r => !r.saved).length;
    alert(`已保存 ${unsavedCount} 条灵感`);
    setShowAIDialog(false);
    loadInspirations();
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Lightbulb className="w-8 h-8 text-yellow-500" />
          <h1 className="text-2xl font-bold">灵感库</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={openAIDialog}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
          >
            AI 生成灵感
          </button>
          <button
            onClick={openCreateDialog}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
          >
            新增灵感
          </button>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="mb-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索灵感标题、内容或标签..."
            style={{ paddingLeft: '40px' }}
            className="w-full bg-background text-foreground pr-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* 灵感列表 */}
      <div className="space-y-4">
        {filteredInspirations.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            暂无灵感，点击右上角新增
          </div>
        )}
        {filteredInspirations.map((insp) => (
          <div
            key={insp.id}
            className="group bg-card/60 backdrop-blur border border-border rounded-xl p-4 transition-all duration-200 hover:border-primary/30 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-1">{insp.title}</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">{insp.content}</p>
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => openEditDialog(insp)}
                  className="p-2 text-primary hover:bg-primary/10 rounded opacity-40 group-hover:opacity-100 transition-opacity"
                  title="编辑"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(insp.id!)}
                  className="p-2 text-destructive hover:bg-destructive/10 rounded opacity-40 group-hover:opacity-100 transition-opacity"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {insp.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {insp.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-2">
              {new Date(insp.createdAt).toLocaleString('zh-CN')}
            </div>
          </div>
        ))}
      </div>

      {/* 新增/编辑对话框 */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="relative bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
            <div className="text-[10px] tracking-[0.3em] text-primary/70 uppercase mb-2">Inspiration · 灵感</div>
            <h2 className="text-2xl font-bold mb-4 pb-4 border-b border-border">
              {editingId ? '编辑灵感' : '新增灵感'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">标题</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-background/50 text-foreground px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                  placeholder="如：系统流+重生+打脸"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">内容</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-background/50 text-foreground px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors h-40"
                  placeholder="详细描述这个创意..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  标签（逗号分隔）
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full bg-background/50 text-foreground px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                  placeholder="如：玄幻, 爽文, 系统"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-border">
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                保存
              </button>
              <button
                onClick={() => setShowDialog(false)}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 生成对话框 */}
      {showAIDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="relative bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
            <div className="text-[10px] tracking-[0.3em] text-primary/70 uppercase mb-2">AI Generation · 智能生成</div>
            <h2 className="text-2xl font-bold mb-4 pb-4 border-b border-border flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI 生成灵感
            </h2>

            {aiResults.length === 0 ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">题材</label>
                  <select
                    value={aiGenre}
                    onChange={(e) => setAiGenre(e.target.value)}
                    className="w-full bg-background/50 text-foreground px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                  >
                    {GENRES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    想要的元素
                  </label>
                  <input
                    type="text"
                    value={aiElements}
                    onChange={(e) => setAiElements(e.target.value)}
                    className="w-full bg-background/50 text-foreground px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                    placeholder="如：系统+重生+打脸"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">数量</label>
                  <select
                    value={aiCount}
                    onChange={(e) => setAiCount(e.target.value)}
                    className="w-full bg-background/50 text-foreground px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                  >
                    <option value="3">3 个</option>
                    <option value="5">5 个</option>
                  </select>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleAIGenerate}
                    disabled={aiGenerating}
                    className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {aiGenerating ? '生成中...' : '生成'}
                  </button>
                  <button
                    onClick={() => setShowAIDialog(false)}
                    className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-4 flex justify-between items-center">
                  <p className="text-muted-foreground">生成了 {aiResults.length} 条灵感</p>
                  <button
                    onClick={handleSaveAllResults}
                    className="px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    全部保存
                  </button>
                </div>

                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {aiResults.map((result, index) => (
                    <div
                      key={index}
                      className="border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold mb-1">
                            {result.title}
                          </h3>
                          <p className="text-muted-foreground">{result.content}</p>
                          {result.tags && result.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {result.tags.map((tag, i) => (
                                <span
                                  key={i}
                                  className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleSaveSingleResult(index)}
                          disabled={result.saved}
                          className={`ml-4 px-3 py-1 text-sm rounded-lg font-semibold transition-colors ${
                            result.saved
                              ? 'bg-card border border-border text-muted-foreground cursor-not-allowed opacity-50'
                              : 'bg-card border border-border text-foreground hover:bg-card/80 hover:border-primary/40'
                          }`}
                        >
                          {result.saved ? '已保存' : '存为灵感'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setShowAIDialog(false)}
                    className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    关闭
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
