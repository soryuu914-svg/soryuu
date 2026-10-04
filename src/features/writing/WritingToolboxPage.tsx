import { useState, useEffect, useMemo } from 'react';
import { Wrench, Plus, Search, Edit2, Trash2, Sparkles, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  getAllTechniques,
  getAllStyles,
  addWritingStyle,
  updateWritingStyle,
  deleteWritingStyle,
  initBuiltinWritingStyles,
} from '../../db/writingStyle';
import type { WritingStyle } from '../../types';
import { askAI, extractJSON } from '../ai/client';
import { handleAIError } from '../../utils/errorHandler';

const TECHNIQUE_CATEGORIES = ['钩子', '爆点', '节奏', '人物', '描写', '冲突', '开篇', '结构', '情绪'];

export default function WritingToolboxPage() {
  const [activeTab, setActiveTab] = useState<'technique' | 'style'>('technique');
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<WritingStyle | null>(null);

  // ===== 智能整理（去重 + 合并，仅处理自定义项） =====
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [organizeDeletes, setOrganizeDeletes] = useState<Array<{ keep: string; removeIdx: number[] }>>([]);
  const [organizeMerges, setOrganizeMerges] = useState<Array<{ title: string; description: string; content: string; category: string; removeIdx: number[] }>>([]);
  const [showOrganizeModal, setShowOrganizeModal] = useState(false);

  // 表单字段
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('钩子');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // 实时查询
  const techniques = useLiveQuery(() => getAllTechniques(), []);
  const styles = useLiveQuery(() => getAllStyles(), []);

  // 初始化预置内容
  useEffect(() => {
    initBuiltinWritingStyles();
  }, []);

  const currentList = activeTab === 'technique' ? techniques : styles;
  // 自定义项（顺序 = getAllTechniques/getAllStyles 的 createdAt 升序，与智能整理的 [idx=N] 一一对应）
  const customItems = currentList?.filter(i => !i.isBuiltin) || [];

  // ===== 预览用：要删的条目（与实际整理共用同一份计算，单一数据源）=====
  const pendingDeleteItems = useMemo(() => {
    const removeIndices = new Set<number>();
    organizeDeletes.forEach(g => g.removeIdx.forEach(i => removeIndices.add(i)));
    organizeMerges.forEach(m => m.removeIdx.forEach(i => removeIndices.add(i)));
    return [...removeIndices].map(i => customItems[i]).filter(Boolean);
  }, [organizeDeletes, organizeMerges, customItems]);

  // 按钮上的"删 X 条"与实际删除数（alert 用的 toDelete.length）共用这一个来源
  const pendingDeleteCount = pendingDeleteItems.length;

  // 筛选（先按分类，再按搜索）
  const filteredList = currentList?.filter((item) => {
    if (activeTab === 'technique' && selectedCategory && item.category !== selectedCategory) return false;
    if (!searchText) return true;
    const searchLower = searchText.toLowerCase();
    return (
      item.title.toLowerCase().includes(searchLower) ||
      item.description.toLowerCase().includes(searchLower) ||
      item.content.toLowerCase().includes(searchLower) ||
      item.tags.some(tag => tag.toLowerCase().includes(searchLower))
    );
  });

  function openCreateDialog() {
    setEditingItem(null);
    setTitle('');
    setDescription('');
    setContent('');
    setCategory('钩子');
    setTags([]);
    setTagInput('');
    setShowDialog(true);
  }

  function openEditDialog(item: WritingStyle) {
    setEditingItem(item);
    setTitle(item.title);
    setDescription(item.description);
    setContent(item.content);
    setCategory(item.category || '钩子');
    setTags([...item.tags]);
    setTagInput('');
    setShowDialog(true);
  }

  function handleAddTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  }

  function handleRemoveTag(tag: string) {
    setTags(tags.filter(t => t !== tag));
  }

  function handleTagInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) {
      alert('标题和内容不能为空');
      return;
    }

    if (editingItem?.id) {
      await updateWritingStyle(editingItem.id, {
        title,
        description,
        content,
        category: activeTab === 'technique' ? category : '',
        tags,
      });
    } else {
      await addWritingStyle({
        type: activeTab,
        title,
        description,
        content,
        category: activeTab === 'technique' ? category : '',
        isBuiltin: false,
        tags,
        createdAt: Date.now(),
      });
    }

    setShowDialog(false);
  }

  async function handleDelete(id: number, isBuiltin: boolean) {
    if (isBuiltin) {
      alert('预置内容不能删除');
      return;
    }
    if (!confirm('确定删除？')) return;
    await deleteWritingStyle(id);
  }

  // ===== 智能整理：AI 找出去重 + 可合并的自定义项 =====
  const handleOrganize = async () => {
    // 只处理当前 Tab 的自定义项（预置项一律不动）
    if (customItems.length < 2) {
      alert('自定义技巧不足 2 条，无需整理');
      return;
    }

    setIsOrganizing(true);
    try {
      const list = customItems.map((t, i) =>
        `[idx=${i}] [${t.category}] 【${t.title}】${t.description || ''}\n内容：${t.content}`
      ).join('\n\n');

      const systemPrompt = `你是写作技巧整理助手。用户有一批"自定义写作技巧"（可能有重复或语义相近）。

请同时做两件事：

A. 去重：找出完全同义/重复的技巧，保留一条
B. 合并：找出语义相近但不完全重复的技巧（同一话题的不同角度/粒度），合并成一条更完整的新技巧

【判断标准】
- 完全重复 → "delete" 类型
- 去重保留哪条：若两条信息量不同，保留信息更全的那条（如一条含"替代方案/具体例子/数字"，另一条只是简单禁令，则保留前者）；removeIdx 指向信息更少的那条。
- 语义相近可互补 → "merge" 类型（合并后信息更全）
- 独立不相关 → 不动

【关键】
- removeIdx 是"要删除的条目的 idx"，从输入清单里 [idx=N] 取
- 不要用标题做匹配，用 idx
- idx 必须准确，错了会删错

【合并要求】
1. 合并后要保留原所有条的有效信息
2. 标题要统摄所有合并项（如"钩子·悬念式"+"钩子·信息式"合并为"钩子·悬念与信息"）
3. content 要流畅，不要拼凑痕迹
4. category 从原条目里取主类
5. 不丢信息（硬约束）：removeIdx 里每一条的要点都必须出现在 content 里，逐条对照，不得概括掉
6. 保留具体信息（硬约束）：原条目里的数字、专有名词、示例、条件限定要原样写进 content（如"≤15 字""每 300 字""木盒里的戒指"）
7. 长度放宽：合并结果允许到 400 字以内（原 200 字限制太紧，容易丢信息）；未合并的条目不受此限制
8. 区分正向与反向（硬约束）：原条目分两类——"正向建议"（如"优先写动作对话""多写心理活动"）和"反向规则"（如"禁堆叠视觉词""不写氛围段"）。即使话题相近，二者也是不同维度，必须同时保留。不得因语义相近就当重复项合并掉。

严格 JSON 数组输出，不要 markdown 包裹：

[
  {
    "type": "delete",
    "keep": "保留的标题",
    "removeIdx": [3, 7, 12]
  },
  {
    "type": "merge",
    "title": "合并后新标题",
    "description": "一句话（20字内）",
    "content": "合并后的完整内容",
    "category": "钩子",
    "removeIdx": [0, 5, 9]
  }
]

【输出前自检】
输出前逐条自检，不通过就修正后再输出：
1. merge 的 content 是否覆盖了 removeIdx 里每一条的要点？（逐条对照，缺一条就补上）
2. 原条目的数字、专有名词、示例有没有被漏掉或改写？
3. 标题是否统摄了所有被合并的条目？

如无操作，输出 []。

【输出格式】直接输出 JSON，不要展示思考过程，不要任何解释文字。`;

      const result = await askAI({
        system: systemPrompt,
        user: list,
        maxTokens: 16000,
        // 结构化任务：关闭思考模式，避免 reasoning 吃光 max_tokens
        disableThinking: true,
      });

      const parsed = extractJSON(result, 'array') as Array<any>;

      const deletes = parsed.filter(g => g.type === 'delete' && g.keep && Array.isArray(g.removeIdx) && g.removeIdx.length > 0);
      // 合并组必须真的合并了 ≥2 条，否则是"删一条又加一条"的空操作
      const merges = parsed.filter(g => g.type === 'merge' && g.title && g.content && Array.isArray(g.removeIdx) && g.removeIdx.length >= 2);

      if (deletes.length === 0 && merges.length === 0) {
        alert('没有检测到可整理的内容');
        return;
      }

      setOrganizeDeletes(deletes);
      setOrganizeMerges(merges);
      setShowOrganizeModal(true);
    } catch (error) {
      console.error('整理失败:', error);
      handleAIError(error);
    } finally {
      setIsOrganizing(false);
    }
  };

  // ===== 应用整理结果：先删后增 =====
  const handleApplyOrganize = async () => {
    if (organizeDeletes.length === 0 && organizeMerges.length === 0) return;

    // 要删的条目：直接复用预览用的同一份计算（customItems 与 handleOrganize 时同一份数据、同一顺序）
    const toDelete = pendingDeleteItems;

    // 删除
    for (const item of toDelete) {
      await deleteWritingStyle(item.id!);
    }

    // 新增合并后的条目
    for (const merge of organizeMerges) {
      await addWritingStyle({
        type: activeTab,
        title: merge.title,
        description: merge.description || '',
        content: merge.content,
        category: activeTab === 'technique' ? merge.category : '',
        isBuiltin: false,
        tags: [],
        createdAt: Date.now(),
      });
    }

    alert(`已删除 ${toDelete.length} 条，合并新增 ${organizeMerges.length} 条`);
    setShowOrganizeModal(false);
    setOrganizeDeletes([]);
    setOrganizeMerges([]);
  };

  return (
    <div className="w-full p-6">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Wrench className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold">写作工具箱</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOrganize}
            disabled={isOrganizing || !currentList || currentList.filter(i => !i.isBuiltin).length < 2}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={16} />
            {isOrganizing ? '分析中...' : '智能整理'}
          </button>
          <button
            onClick={openCreateDialog}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建
          </button>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-4 mb-4 border-b border-border">
        <button
          onClick={() => setActiveTab('technique')}
          className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
            activeTab === 'technique'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          写作技巧
        </button>
        <button
          onClick={() => setActiveTab('style')}
          className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
            activeTab === 'style'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          文风风格
        </button>
      </div>

      {/* 左分类 + 右列表 的玻璃面板 */}
      <div className="glass-card rounded-xl flex items-stretch overflow-hidden min-h-[calc(100vh-260px)]">

        {/* 左栏：分类（仅技巧 Tab 显示） */}
        {activeTab === 'technique' && (
          <aside className="w-56 shrink-0 border-r border-border flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">分类</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-semibold transition-colors mb-1 ${
                  selectedCategory === null
                    ? 'bg-primary/15 text-primary border-l-2 border-primary'
                    : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
                }`}
              >
                <span>全部</span>
                <span className="text-xs opacity-60">{currentList?.length || 0}</span>
              </button>
              {TECHNIQUE_CATEGORIES.map(cat => {
                const count = currentList?.filter(i => i.category === cat).length || 0;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-semibold transition-colors mb-1 ${
                      selectedCategory === cat
                        ? 'bg-primary/15 text-primary border-l-2 border-primary'
                        : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
                    }`}
                  >
                    <span className="truncate">{cat}</span>
                    <span className="text-xs opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        {/* 右栏：搜索 + 列表 */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* 搜索框 */}
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索标题、描述或内容..."
                className="w-full bg-background text-foreground pl-10 pr-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* 列表：技巧 Tab = 列表项，文风 Tab = 卡片网格 */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className={activeTab === 'technique' ? 'max-w-4xl' : 'w-full'}>
            {filteredList?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                暂无内容，点击右上角新建
              </div>
            ) : activeTab === 'technique' ? (
              <div className="space-y-3">
                {filteredList?.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => openEditDialog(item)}
                    className="group flex items-start gap-3 p-4 bg-card/50 border border-border rounded-lg hover:border-primary/30 hover:bg-card/80 transition-colors cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-foreground truncate">
                          {item.title}
                        </h3>
                        {item.category && (
                          <span className="shrink-0 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20">
                            {item.category}
                          </span>
                        )}
                        {item.isBuiltin && (
                          <span className="shrink-0 px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded-full">
                            预置
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
                          {item.description}
                        </p>
                      )}
                      <p className="text-sm text-foreground/80 line-clamp-2 leading-relaxed">
                        {item.content}
                      </p>
                      {item.tags.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {item.tags.slice(0, 4).map((tag, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditDialog(item); }}
                        className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                        title="编辑"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(item.id!, item.isBuiltin); }}
                        className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredList?.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => openEditDialog(item)}
                    className="glass-card rounded-xl p-5 cursor-pointer group relative hover:-translate-y-0.5 transition-transform"
                  >
                    {/* 标题 */}
                    <h3 className="text-base font-semibold text-foreground mb-1">
                      {item.title}
                    </h3>

                    {/* 描述 */}
                    {item.description && (
                      <p className="text-xs text-muted-foreground mb-3">{item.description}</p>
                    )}

                    {/* 内容 */}
                    <p className="text-sm text-foreground/80 line-clamp-3 leading-relaxed mb-3">
                      {item.content}
                    </p>

                    {/* 标签 + 预置 */}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1.5 flex-wrap">
                        {item.tags.slice(0, 3).map((tag, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            #{tag}
                          </span>
                        ))}
                      </div>
                      {item.isBuiltin && (
                        <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-full">
                          预置
                        </span>
                      )}
                    </div>

                    {/* hover 编辑/删除 */}
                    <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditDialog(item); }}
                        className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                        title="编辑"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(item.id!, item.isBuiltin); }}
                        className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        </div>

      </div>

      {/* 编辑对话框 - 第一部分 */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingItem ? '编辑' : '新建'}{activeTab === 'technique' ? '写作技巧' : '文风风格'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  标题 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded"
                  placeholder="如：钩子·悬念式"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">描述</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded"
                  placeholder="一句话说明"
                />
              </div>

              {activeTab === 'technique' && (
                <div>
                  <label className="block text-sm font-medium mb-1">分类</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-background text-foreground px-3 py-2 border border-input rounded"
                  >
                    {TECHNIQUE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">
                  内容（会注入 AI prompt）<span className="text-red-500">*</span>
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded h-40"
                  placeholder="详细描述这个技巧或文风的要求..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">标签</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    className="flex-1 px-3 py-2 border border-input rounded"
                    placeholder="输入标签后按回车添加"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    添加
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {tags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 text-sm rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1"
                      >
                        #{tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-destructive"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
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

      {/* 智能整理预览弹窗 */}
      {showOrganizeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-foreground">
                智能整理建议
              </h2>
              <button onClick={() => { setShowOrganizeModal(false); setOrganizeDeletes([]); setOrganizeMerges([]); }} className="p-1.5 hover:bg-muted rounded transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* 去重组 */}
            {organizeDeletes.length > 0 && (
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  去重 {organizeDeletes.length} 组
                </h3>
                <div className="space-y-3">
                  {organizeDeletes.map((g, idx) => (
                    <div key={idx} className="bg-card/50 border border-border rounded-lg p-3">
                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-primary font-bold">✓</span>
                        <span className="text-sm text-foreground">{g.keep}</span>
                      </div>
                      {g.removeIdx.map(i => (
                        <div key={i} className="flex items-start gap-2 p-1.5 bg-destructive/5 rounded">
                          <span className="text-destructive font-bold">×</span>
                          <span className="text-xs text-muted-foreground line-through">{customItems[i]?.title || `[idx=${i}]`}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 合并组 */}
            {organizeMerges.length > 0 && (
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  合并 {organizeMerges.length} 组
                </h3>
                <div className="space-y-3">
                  {organizeMerges.map((m, idx) => (
                    <div key={idx} className="bg-card/50 border border-border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-primary font-bold">🔀</span>
                        <span className="text-sm font-semibold text-foreground">{m.title}</span>
                        <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{m.category}</span>
                      </div>
                      <div className="p-3 bg-primary/5 border border-primary/20 rounded mb-2">
                        <p className="text-sm text-foreground">{m.content}</p>
                      </div>
                      <div className="space-y-1">
                        {m.removeIdx.map(i => (
                          <div key={i} className="flex items-start gap-2 p-1.5 bg-destructive/5 rounded">
                            <span className="text-destructive font-bold">×</span>
                            <span className="text-xs text-muted-foreground line-through">{customItems[i]?.title || `[idx=${i}]`}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t border-border">
              <button
                onClick={() => { setShowOrganizeModal(false); setOrganizeDeletes([]); setOrganizeMerges([]); }}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleApplyOrganize}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                确认（删 {pendingDeleteCount} 条 / 新增 {organizeMerges.length} 条）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
