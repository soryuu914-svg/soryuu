import { useEffect, useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Search, X, Edit2, Trash2, ShieldAlert, FileText, Sparkles } from 'lucide-react';
import { initRuleLibrary, checkAndFixCategories } from '../../db';
import { getAllRules, getAllCategories, addRule, updateRule, deleteRule, toggleRule } from '../../db/rejectionRule';
import { getAllSamples, getMarksBySampleId, addSample, addMark, deleteMark } from '../../db/aiFlavor';
import { askAI, extractJSON } from '../ai/client';
import { handleAIError } from '../../utils/errorHandler';
import type { ReactNode } from 'react';
import type { RejectionRule } from '../../types';

// 规则文本归一化：剥离开头标签 [标签]/【标签】、空白、中英文标点与括号（含中文引号）
// —— 提到组件外，让「预览按钮的计数」与「handleApplyDedupe 的实际匹配」共用同一套算法
const normalizeRuleText = (s: string) => s.replace(/^(?:\[.*?\]|【.*?】)+/g, '').replace(/\s+/g, '').replace(/[\u3002\uFF0C\u3001\uFF1B\uFF1A\uFF01\uFF1F\u0022\u0027\u201C\u201D\u2018\u2019\u300C\u300D\u300E\u300F\u005B\u005D\u3010\u3011\uFF08\uFF09\u0028\u0029]/g, '').trim();

export default function RejectionsPage() {
  // ===== 搜索 =====
  const [searchTerm, setSearchTerm] = useState('');

  // ===== 规则弹窗（第 4 批接 CRUD） =====
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<RejectionRule | null>(null);
  const [ruleFormData, setRuleFormData] = useState({ category: '用词', content: '' });

  // ===== Tab 切换 =====
  const [activeTab, setActiveTab] = useState<'rules' | 'flavor'>('rules');

  // ===== AI 味学习（第 3 批接标注交互） =====
  const [selectedSampleId, setSelectedSampleId] = useState<number | null>(null);

  // ===== 新建样本弹窗 =====
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [sampleFormData, setSampleFormData] = useState({ title: '', content: '' });

  // ===== 划词标记弹窗 =====
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<{ text: string; startIndex: number; endIndex: number } | null>(null);
  const [markReason, setMarkReason] = useState('');

  // ===== AI 提炼规则（第 4 批） =====
  const [extracting, setExtracting] = useState(false);
  const [extractedRules, setExtractedRules] = useState<Array<{ content: string; category: string }>>([]);
  const [showRulePreview, setShowRulePreview] = useState(false);
  const [extractCategory, setExtractCategory] = useState('句式'); // 提炼的规则默认归到哪个分类

  // ===== 智能去重（AI 找出语义重复的规则） =====
  const [isDeduping, setIsDeduping] = useState(false);
  const [dedupeGroups, setDedupeGroups] = useState<Array<{ keep: string; remove: string[] }>>([]);
  const [dedupeMerges, setDedupeMerges] = useState<Array<{ title: string; content: string; category: string; remove: string[] }>>([]);
  const [showDedupeModal, setShowDedupeModal] = useState(false);

  // 首次进入时初始化词库：localStorage 标记保证只跑一次
  useEffect(() => {
    initRuleLibrary()
      .then(() => checkAndFixCategories())
      .catch(error => {
        console.error('初始化避雷词库失败:', error);
      });
  }, []);

  // ===== 数据查询 =====
  const rules = useLiveQuery(() => getAllRules(), []);
  const categories = useLiveQuery(() => getAllCategories(), []);

  // AI 味学习：样本列表 + 当前样本的标记
  const samples = useLiveQuery(() => getAllSamples(), []);
  const currentMarks = useLiveQuery(
    () => selectedSampleId ? getMarksBySampleId(selectedSampleId) : Promise.resolve([]),
    [selectedSampleId]
  );
  const currentSample = samples?.find(s => s.id === selectedSampleId);

  // 按搜索过滤
  const filteredRules = rules?.filter(r => {
    if (searchTerm && !r.content.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  }) || [];

  // ===== 预览用：要删的规则（与实际删除共用同一份计算结果，单一数据源）=====
  const pendingDeleteRules = useMemo(() => {
    const removeTexts = new Set<string>();
    dedupeGroups.forEach(g => g.remove.forEach(t => removeTexts.add(t)));
    dedupeMerges.forEach(m => m.remove.forEach(t => removeTexts.add(t)));
    const removeSet = new Set([...removeTexts].map(normalizeRuleText));

    // 调试：打印归一化后的前后对比，便于排查匹配失败
    console.log('要删的归一化:', [...removeSet]);
    console.log('数据库规则归一化:', (rules || []).map(r => normalizeRuleText(r.content)));

    return (rules || []).filter(r => removeSet.has(normalizeRuleText(r.content)));
  }, [dedupeGroups, dedupeMerges, rules]);

  // 按钮上的"删 X"与实际删除数（alert 用的 toDelete.length）共用这一个来源
  const pendingDeleteCount = pendingDeleteRules.length;

  // ===== 规则 CRUD =====
  const handleSaveRule = async () => {
    if (!ruleFormData.content.trim()) {
      alert('请输入规则内容');
      return;
    }

    if (editingRule?.id) {
      await updateRule(editingRule.id, {
        category: ruleFormData.category,
        content: ruleFormData.content.trim(),
      });
    } else {
      await addRule({
        category: ruleFormData.category,
        content: ruleFormData.content.trim(),
        enabled: true,
        createdAt: Date.now(),
      });
    }

    setShowRuleModal(false);
    setEditingRule(null);
    setRuleFormData({ category: '用词', content: '' });
  };

  const handleEditRule = (rule: RejectionRule) => {
    setEditingRule(rule);
    setRuleFormData({ category: rule.category, content: rule.content });
    setShowRuleModal(true);
  };

  const handleDeleteRule = async (rule: RejectionRule) => {
    if (!confirm(`确定删除这条规则？\n\n${rule.content}`)) return;
    await deleteRule(rule.id!);
  };

  const handleToggleRule = async (rule: RejectionRule) => {
    await toggleRule(rule.id!, rule.enabled === false ? true : false);
  };

  // ===== AI 味学习：样本 / 标记 =====
  const handleSaveSample = async () => {
    if (!sampleFormData.title.trim()) {
      alert('请输入样本标题');
      return;
    }
    if (!sampleFormData.content.trim()) {
      alert('请粘贴 AI 生成的内容');
      return;
    }
    const id = await addSample({
      title: sampleFormData.title.trim(),
      content: sampleFormData.content,
      createdAt: Date.now(),
    });
    setShowSampleModal(false);
    setSampleFormData({ title: '', content: '' });
    setSelectedSampleId(id);
  };

  // 划词标记
  const handleTextSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !currentSample) return;
    const text = sel.toString().trim();
    if (!text) return;

    // 计算 startIndex
    const range = sel.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(range.startContainer.parentNode as Node || document.body);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startIndex = preRange.toString().length;
    const endIndex = startIndex + text.length;

    if (startIndex < 0 || endIndex > currentSample.content.length) return;

    setPendingSelection({ text, startIndex, endIndex });
    setMarkReason('');
    setShowMarkModal(true);
  };

  const handleSaveMark = async () => {
    if (!pendingSelection || !currentSample) return;
    if (!markReason.trim()) {
      alert('请写下为什么这是 AI 味');
      return;
    }
    await addMark({
      sampleId: currentSample.id!,
      text: pendingSelection.text,
      startIndex: pendingSelection.startIndex,
      endIndex: pendingSelection.endIndex,
      reason: markReason.trim(),
      createdAt: Date.now(),
    });
    setShowMarkModal(false);
    setPendingSelection(null);
    setMarkReason('');
    window.getSelection()?.removeAllRanges();
  };

  const handleDeleteMark = async (markId: number) => {
    if (!confirm('确定删除这条标记？')) return;
    await deleteMark(markId);
  };

  // ===== AI 提炼规则 =====
  const handleExtractRules = async () => {
    if (!currentMarks || currentMarks.length === 0) {
      alert('请先标记至少一处 AI 味');
      return;
    }

    setExtracting(true);
    try {
      const marksText = currentMarks.map((m, i) =>
        `【标记 ${i + 1}】\n文本：${m.text}\n原因：${m.reason}\n`
      ).join('\n');

      const systemPrompt = `你是网文写作专家。用户从 AI 生成的文章中标记了若干"AI 味"片段，并为每段写了原因。

请根据这些标记和原因，归纳出 3-8 条可执行的避雷规则，用于指导 AI 生成。

要求：
1. 规则要具体可执行（不要"注意真实感"这种空话）
2. 每条不超过 30 字
3. 优先从"原因"里提炼规律，不要只描述现象
4. 按可操作性排序

【分类规则】
每条规则必须归入以下 5 类之一：
- 用词：禁用词、替代词（如"不要用'被'字句"、"避免 AI 味高频词"）
- 句式：句长、句式结构（如"句子不超过30字"、"不用被动句"）
- 情节：剧情逻辑、人设、节奏（如"每章必须有推进"、"配角要有动机"）
- 题材：题材禁忌、尺度（如"不写敏感群体"、"避免盗墓暗示"）
- 其他：无法归入以上的

严格按 JSON 数组输出，不要 markdown 包裹，每条必须带 category 字段：
[
  {"content": "规则文本", "category": "句式"},
  {"content": "规则文本", "category": "用词"}
]`;

      const userPrompt = `已标记 ${currentMarks.length} 处 AI 味：\n\n${marksText}`;

      const result = await askAI({ system: systemPrompt, user: userPrompt });

      // 解析 JSON 数组；category 缺失或不在分类表内时兜底到 extractCategory
      const parsed = extractJSON(result, 'array') as Array<{ content?: string; category?: string }>;
      const validCategories = (categories?.map(c => c.name) || []).concat('其他');
      const rules = parsed
        .map(item => ({
          content: typeof item?.content === 'string' ? item.content.trim() : '',
          category: (typeof item?.category === 'string' && validCategories.includes(item.category))
            ? item.category
            : extractCategory,
        }))
        .filter(item => item.content.length > 0);

      setExtractedRules(rules);
      setShowRulePreview(true);
    } catch (error) {
      console.error('提炼失败:', error);
      handleAIError(error);
    } finally {
      setExtracting(false);
    }
  };

  const handleSaveExtractedRules = async () => {
    if (extractedRules.length === 0) return;

    // 批量存入词库（每条按 AI 给出的分类落库）
    for (const rule of extractedRules) {
      await addRule({
        category: rule.category,
        content: rule.content,
        enabled: true,
        createdAt: Date.now(),
      });
    }

    alert(`已添加 ${extractedRules.length} 条规则到词库`);
    setShowRulePreview(false);
    setExtractedRules([]);
    // 切换到词库 Tab
    setActiveTab('rules');
  };

  // ===== 智能去重（AI 找出语义重复的规则） =====
  const handleDedupe = async () => {
    if (!rules || rules.length < 2) {
      alert('规则不足 2 条，无需去重');
      return;
    }

    setIsDeduping(true);
    try {
      const rulesList = rules.map((r, i) => `${i + 1}. [${r.category}] ${r.content}`).join('\n');

      const systemPrompt = `你是文案编辑助手。用户提供一批"写作规则"，请同时做两件事：

A. 去重：找出完全同义/重复的规则，保留一条
B. 合并：找出**语义相近但不完全重复**的规则（同一话题的不同角度/粒度），把它们合并成一条更完整、更丰富的规则

【判断标准】
- 完全重复 → 归到 delete 类型
- 去重保留哪条：若两条信息量不同，保留信息更全的那条（如一条含"替代方案/具体例子/数字"，另一条只是简单禁令，则保留前者）；remove 指向信息更少的那条。
- 语义相近可互补 → 归到 merge 类型（合并后更有用）
- 独立不相关 → 不动

【合并要求】
1. 合并后的规则要保留原所有条的有效信息
2. 不能丢失关键细节
3. 语言要统一流畅（不要拼凑痕迹）
4. 每条不超过 100 字

严格 JSON 数组输出，不要 markdown 包裹：

[
  {
    "type": "delete",
    "keep": "保留的原文",
    "remove": ["要删的重复文本1", "要删的重复文本2"]
  },
  {
    "type": "merge",
    "title": "合并后的新标题",
    "content": "合并后的完整内容",
    "category": "句式",
    "remove": ["原文本1", "原文本2"]
  }
]

如果没有任何操作，输出空数组 []。`;

      const userPrompt = `规则列表：\n${rulesList}`;

      const result = await askAI({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 16000,
        // 结构化任务：关闭思考模式，避免 reasoning 吃光 max_tokens
        disableThinking: true,
      });
      // extractJSON 在本项目是非泛型函数，用类型断言收敛返回类型
      const parsed = extractJSON(result, 'array') as Array<any>;

      // 去重组（type=delete）与合并组（type=merge）分开收集
      const deletes = parsed.filter(g => g.type === 'delete' && g.keep && Array.isArray(g.remove) && g.remove.length > 0);
      // 合并组必须真的合并了 ≥2 条，否则是"删一条又加一条"的空操作
      const merges = parsed.filter(g => g.type === 'merge' && g.title && g.content && Array.isArray(g.remove) && g.remove.length >= 2);

      if (deletes.length === 0 && merges.length === 0) {
        alert('没有检测到可操作的规则');
        return;
      }

      setDedupeGroups(deletes);
      setDedupeMerges(merges);
      setShowDedupeModal(true);
    } catch (error) {
      console.error('去重失败:', error);
      handleAIError(error);
    } finally {
      setIsDeduping(false);
    }
  };

  const handleApplyDedupe = async () => {
    if (dedupeGroups.length === 0 && dedupeMerges.length === 0) return;

    // 要删的规则：直接复用预览用的同一份计算结果（单一数据源 → alert 数字 = 按钮数字）
    const toDelete = pendingDeleteRules;

    if (toDelete.length === 0 && dedupeMerges.length === 0) {
      alert('没有匹配到要删除或合并的规则');
      return;
    }

    // 3. 删除命中的规则
    for (const rule of toDelete) {
      await deleteRule(rule.id!);
    }

    // 4. 新增合并后的规则
    for (const merge of dedupeMerges) {
      await addRule({
        category: merge.category || '句式',
        content: merge.content.trim(),
        enabled: true,
        createdAt: Date.now(),
      });
    }

    alert(`已删除 ${toDelete.length} 条，合并新增 ${dedupeMerges.length} 条`);
    setShowDedupeModal(false);
    setDedupeGroups([]);
    setDedupeMerges([]);
  };

  return (
    <div className="w-full p-6">
      {/* Tab 切换 */}
      <div className="flex gap-1 border-b border-border mb-6">
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'rules'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          避雷词库
        </button>
        <button
          onClick={() => setActiveTab('flavor')}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'flavor'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          AI 味学习
        </button>
      </div>

      {/* ===== Tab 1：避雷词库 ===== */}
      {activeTab === 'rules' && (
        <>
      {/* 顶部标题 */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI 避雷词库</h1>
          <p className="text-sm text-muted-foreground mt-1">
            录入 AI 生成时需要避免的用词、句式、情节等，生成时自动注入 prompt
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingRule(null);
              setRuleFormData({ category: '用词', content: '' });
              setShowRuleModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 h-9 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
          >
            <Plus size={16} />
            添加规则
          </button>
          <button
            onClick={handleDedupe}
            disabled={isDeduping || !rules || rules.length < 2}
            className="flex items-center gap-2 px-4 py-2 h-9 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={16} />
            {isDeduping ? '分析中...' : '智能整理'}
          </button>
        </div>
      </div>

      {/* 主体：规则列表（单栏，分类改用列表项徽章展示） */}
      <div className="glass-card rounded-xl overflow-hidden min-h-[calc(100vh-220px)]">
        <div className="flex flex-col overflow-hidden">

          {/* 搜索 */}
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索规则内容..."
                className="w-full pl-9 pr-4 py-2 bg-background text-foreground border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* 列表 */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredRules.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {searchTerm ? '没有找到匹配的规则' : '还没有规则'}
                </p>
                {!searchTerm && (
                  <button
                    onClick={() => {
                      setEditingRule(null);
                      setRuleFormData({ category: '用词', content: '' });
                      setShowRuleModal(true);
                    }}
                    className="mt-4 px-4 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    添加第一条规则
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRules.map(rule => (
                  <div
                    key={rule.id}
                    className="group flex items-start gap-3 p-3 bg-card/50 border border-border rounded-lg hover:border-primary/30 transition-colors"
                  >
                    {/* 启用/禁用开关 */}
                    <button
                      onClick={() => handleToggleRule(rule)}
                      className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        rule.enabled !== false
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border'
                      }`}
                      title={rule.enabled !== false ? '点击禁用' : '点击启用'}
                    >
                      {rule.enabled !== false && <span className="text-xs">✓</span>}
                    </button>

                    {/* 分类徽章 */}
                    <span className="shrink-0 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 mt-0.5">
                      {rule.category}
                    </span>

                    {/* 内容 */}
                    <p className={`flex-1 text-sm leading-relaxed ${rule.enabled === false ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                      {rule.content}
                    </p>

                    {/* 操作 */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => handleEditRule(rule)}
                        className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                        title="编辑"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule)}
                        className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 规则编辑弹窗 */}
      {showRuleModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-foreground">
                {editingRule ? '编辑规则' : '添加规则'}
              </h2>
              <button
                onClick={() => {
                  setShowRuleModal(false);
                  setEditingRule(null);
                }}
                className="p-1.5 hover:bg-muted rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* 分类 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">分类</label>
                <select
                  value={ruleFormData.category}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, category: e.target.value })}
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {categories?.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* 内容 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  规则内容 <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={ruleFormData.content}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, content: e.target.value })}
                  placeholder="例如：不要用'被……所……'的句式"
                  rows={4}
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5 pt-4 border-t border-border">
              <button
                onClick={() => {
                  setShowRuleModal(false);
                  setEditingRule(null);
                }}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveRule}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                {editingRule ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* ===== Tab 2：AI 味学习 ===== */}
      {activeTab === 'flavor' && (
        <>
          {/* 顶部标题 */}
          <div className="flex items-end justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">AI 味学习</h1>
              <p className="text-sm text-muted-foreground mt-1">
                标记出 AI 生成的"味道"，写下原因，让 AI 学会你的审美
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExtractRules}
                disabled={extracting || !currentSample || !currentMarks || currentMarks.length === 0}
                className="flex items-center gap-2 px-4 py-2 h-9 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={16} />
                {extracting ? '提炼中...' : '提炼规则'}
              </button>
              <button
                onClick={() => {
                  setShowSampleModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 h-9 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                <Plus size={16} />
                新建样本
              </button>
            </div>
          </div>

          {/* 主体：左样本列表 + 右标注区 */}
          <div className="glass-card rounded-xl flex items-stretch overflow-hidden min-h-[calc(100vh-260px)]">
            {/* 左栏：样本列表 */}
            <aside className="w-64 shrink-0 border-r border-border flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">样本</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {samples?.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8 px-4">
                    还没有样本，点右上角新建
                  </p>
                ) : (
                  samples?.map(sample => (
                    <button
                      key={sample.id}
                      onClick={() => setSelectedSampleId(sample.id!)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors mb-1 ${
                        selectedSampleId === sample.id
                          ? 'bg-primary/15 text-primary border-l-2 border-primary'
                          : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
                      }`}
                    >
                      <div className="truncate">{sample.title}</div>
                      <div className="text-xs opacity-60 mt-0.5">
                        {new Date(sample.createdAt).toLocaleDateString('zh-CN')}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </aside>

            {/* 右栏：标注区 */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              {!currentSample ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">选择左侧样本开始标注</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-4 border-b border-border">
                    <h2 className="text-sm font-semibold text-foreground">{currentSample.title}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      已标记 {currentMarks?.length || 0} 处 · 选中文字即可标记
                    </p>
                  </div>
                  {/* 样本内容（可划词标记） */}
                  <div className="flex-1 overflow-y-auto p-6">
                    <div
                      className="prose prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap select-text"
                      onMouseUp={handleTextSelection}
                    >
                      {(() => {
                        if (!currentMarks || currentMarks.length === 0) {
                          return currentSample.content;
                        }
                        // 按 startIndex 排序
                        const sorted = [...currentMarks].sort((a, b) => a.startIndex - b.startIndex);
                        const parts: ReactNode[] = [];
                        let cursor = 0;
                        sorted.forEach((mark, i) => {
                          if (mark.startIndex > cursor) {
                            parts.push(<span key={`t${i}`}>{currentSample.content.slice(cursor, mark.startIndex)}</span>);
                          }
                          parts.push(
                            <span
                              key={`m${mark.id}`}
                              className="bg-yellow-500/30 border-b border-yellow-500 cursor-help"
                              title={mark.reason}
                            >
                              {currentSample.content.slice(mark.startIndex, mark.endIndex)}
                            </span>
                          );
                          cursor = mark.endIndex;
                        });
                        if (cursor < currentSample.content.length) {
                          parts.push(<span key="tail">{currentSample.content.slice(cursor)}</span>);
                        }
                        return parts;
                      })()}
                    </div>
                  </div>

                  {/* 标记列表 */}
                  {currentMarks && currentMarks.length > 0 && (
                    <div className="border-t border-border p-4 max-h-64 overflow-y-auto">
                      <h3 className="text-sm font-semibold text-foreground mb-3">
                        标记列表 ({currentMarks.length})
                      </h3>
                      <div className="space-y-2">
                        {currentMarks.map(mark => (
                          <div key={mark.id} className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg text-xs">
                            <div className="flex-1 min-w-0">
                              <p className="text-foreground font-medium truncate">「{mark.text}」</p>
                              <p className="text-muted-foreground mt-1">{mark.reason}</p>
                            </div>
                            <button
                              onClick={() => handleDeleteMark(mark.id!)}
                              className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors shrink-0"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* 新建样本弹窗 */}
      {showSampleModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-foreground">新建样本</h2>
              <button
                onClick={() => {
                  setShowSampleModal(false);
                  setSampleFormData({ title: '', content: '' });
                }}
                className="p-1.5 hover:bg-muted rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  标题 <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={sampleFormData.title}
                  onChange={(e) => setSampleFormData({ ...sampleFormData, title: e.target.value })}
                  placeholder="如：剑起青云 第三章 草稿"
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  AI 生成内容 <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={sampleFormData.content}
                  onChange={(e) => setSampleFormData({ ...sampleFormData, content: e.target.value })}
                  placeholder="粘贴 AI 生成的文章..."
                  rows={12}
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none font-mono text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5 pt-4 border-t border-border">
              <button
                onClick={() => {
                  setShowSampleModal(false);
                  setSampleFormData({ title: '', content: '' });
                }}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveSample}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 标记原因弹窗 */}
      {showMarkModal && pendingSelection && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-foreground">标记 AI 味</h2>
              <button
                onClick={() => {
                  setShowMarkModal(false);
                  setPendingSelection(null);
                }}
                className="p-1.5 hover:bg-muted rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">被标记的原文</p>
              <p className="text-sm text-foreground">「{pendingSelection.text}」</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                为什么这是 AI 味？ <span className="text-destructive">*</span>
              </label>
              <textarea
                value={markReason}
                onChange={(e) => setMarkReason(e.target.value)}
                placeholder="例如：眼泪是'正确'的，但不是这个人会做的。缺少具体动作。"
                rows={4}
                className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowMarkModal(false);
                  setPendingSelection(null);
                }}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveMark}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                保存标记
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 提炼结果弹窗 */}
      {showRulePreview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-foreground">
                提炼出 {extractedRules.length} 条规则
              </h2>
              <button
                onClick={() => {
                  setShowRulePreview(false);
                  setExtractedRules([]);
                }}
                className="p-1.5 hover:bg-muted rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 分类选择 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                兜底分类（AI 未给出分类时使用）
              </label>
              <select
                value={extractCategory}
                onChange={(e) => setExtractCategory(e.target.value)}
                className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {categories?.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* 规则预览 */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-foreground mb-2">
                规则预览（可取消勾选不需要的）
              </label>
              <div className="space-y-2">
                {extractedRules.map((rule, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <input
                      type="checkbox"
                      checked
                      onChange={(e) => {
                        if (!e.target.checked) {
                          setExtractedRules(extractedRules.filter((_, i) => i !== idx));
                        }
                      }}
                      className="mt-0.5 w-4 h-4 accent-primary"
                    />
                    <p className="flex-1 text-sm text-foreground">{rule.content}</p>
                    <span className="shrink-0 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20">
                      {rule.category}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-border">
              <button
                onClick={() => {
                  setShowRulePreview(false);
                  setExtractedRules([]);
                }}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveExtractedRules}
                disabled={extractedRules.length === 0}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                保存 {extractedRules.length} 条到词库
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 智能去重预览弹窗 */}
      {showDedupeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-foreground">
                检测到 {dedupeGroups.length} 组重复 + {dedupeMerges.length} 组合并
              </h2>
              <button
                onClick={() => { setShowDedupeModal(false); setDedupeGroups([]); setDedupeMerges([]); }}
                className="p-1.5 hover:bg-muted rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              确认后将保留「✓」标记的规则、删除重复项，并新增「🔀 合并为」的规则
            </p>

            <div className="space-y-4 mb-5">
              {dedupeGroups.map((group, idx) => (
                <div key={idx} className="bg-card/50 border border-border rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-muted-foreground mb-3">
                    重复组 {idx + 1}
                  </h3>

                  {/* 保留的 */}
                  <div className="flex items-start gap-2 mb-2 p-2 bg-primary/10 border border-primary/20 rounded">
                    <span className="text-primary font-bold shrink-0">✓</span>
                    <span className="text-sm text-foreground">{group.keep}</span>
                  </div>

                  {/* 要删的 */}
                  {group.remove.map((text, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1 p-2 bg-destructive/5 border border-destructive/20 rounded">
                      <span className="text-destructive font-bold shrink-0">×</span>
                      <span className="text-sm text-muted-foreground line-through">{text}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {dedupeMerges.length > 0 && (
              <>
                <h3 className="text-sm font-semibold text-foreground mt-6 mb-3">合并组</h3>
                {dedupeMerges.map((merge, idx) => (
                  <div key={idx} className="bg-card/50 border border-border rounded-lg p-4 mb-3">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-primary font-bold">🔀 合并为</span>
                      <span className="text-sm font-semibold text-foreground">{merge.title}</span>
                      <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{merge.category}</span>
                    </div>
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded mb-3">
                      <p className="text-sm text-foreground">{merge.content}</p>
                    </div>
                    <div className="space-y-1">
                      {merge.remove.map((text, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-destructive/5 border border-destructive/20 rounded">
                          <span className="text-destructive font-bold shrink-0">×</span>
                          <span className="text-sm text-muted-foreground line-through">{text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className="flex gap-2 pt-4 border-t border-border">
              <button
                onClick={() => { setShowDedupeModal(false); setDedupeGroups([]); setDedupeMerges([]); }}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleApplyDedupe}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                确认（删 {pendingDeleteCount} + 合并 {dedupeMerges.length}）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
