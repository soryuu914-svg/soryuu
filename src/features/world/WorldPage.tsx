import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Search, Trash2, Edit2, X, Tag as TagIcon, Sparkles, ChevronDown, ChevronUp, ChevronRight, Globe } from 'lucide-react';
import { getWorldSettingsByProject, addWorldSetting, updateWorldSetting, deleteWorldSetting } from '../../db/world';
import { syncToLibrary } from '../../db/library';
import { db } from '../../db/index';
import { askAI, extractJSON } from '../ai/client';
import { handleAIError } from '../../utils/errorHandler';
import { getFormattedRules } from '../../utils/rejectionRules';
import RejectionRulesToggle from '../../components/RejectionRulesToggle';
import { worldTemplates, worldCategories, parseDescription, generateDescription, legacyCategoryMap } from './worldTemplates';
import { aiCategoryFields } from './aiCategoryFields';
import type { WorldSetting } from '../../types';

export default function WorldPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || '0');

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSetting, setSelectedSetting] = useState<WorldSetting | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [editingSetting, setEditingSetting] = useState<WorldSetting | null>(null);
  const [formData, setFormData] = useState<Partial<WorldSetting>>({
    category: 'other',
    name: '',
    description: '',
    rules: '',
    tags: [],
  });
  const [tagInput, setTagInput] = useState('');
  const [isFreeEditMode, setIsFreeEditMode] = useState(false);
  const [templateFields, setTemplateFields] = useState<Record<string, string>>({});

  // AI 生成表单数据
  const [aiFormData, setAiFormData] = useState({
    category: '地理',
    mode: 'supplement', // supplement: 补充已有, new: 全新体系
    categoryFields: {} as Record<string, string>, // 分类专属字段
    worldTone: '', // 世界基调
    era: '', // 时代背景
    elements: [] as string[], // 元素融合
    pace: '', // 节奏
    protagonistType: [] as string[], // 主角类型
    goldenFinger: '', // 金手指类型
    coolPoints: [] as string[], // 爽点风格
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiCandidates, setAiCandidates] = useState<any[]>([]);
  const [expandedCandidate, setExpandedCandidate] = useState<number | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [selectedRealms, setSelectedRealms] = useState<number[]>([]); // 修炼境界批量选择
  const [expandedRealm, setExpandedRealm] = useState<number | null>(null); // 展开的境界详情
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['世界设定', '力量体系', '物品道具']); // 默认全部展开
  const [expandedListItem, setExpandedListItem] = useState<number | null>(null); // 列表页展开的项
  const [systemName, setSystemName] = useState(''); // 体系名
  const [expandedSystems, setExpandedSystems] = useState<string[]>([]); // 展开的体系面板
  const [rulesEnabled, setRulesEnabled] = useState(true); // 避雷规则开关

  // 实时查询世界观设定
  const settings = useLiveQuery(
    () => getWorldSettingsByProject(projectId),
    [projectId]
  );

  // 过滤分类和搜索，并排序
  const filteredSettings = settings?.filter((setting) => {
    // 归一化旧分类（兼容历史数据），不修改 setting 本身
    const normalizedCat = legacyCategoryMap[setting.category as string] ?? setting.category;
    let matchCategory = false;

    if (selectedCategory === 'all') {
      matchCategory = true;
    } else {
      // 检查是否是组（如"地理"）
      const group = worldCategories.find(g => g.group === selectedCategory);
      if (group) {
        // 如果选的是组，显示该组下所有子分类的设定
        matchCategory = group.items.includes(normalizedCat as string);
      } else {
        // 如果选的是子分类（如"修炼境界"），只显示该子分类
        matchCategory = normalizedCat === selectedCategory;
      }
    }

    const query = searchQuery.toLowerCase();
    const matchSearch =
      !query ||
      setting.name.toLowerCase().includes(query) ||
      setting.description?.toLowerCase().includes(query) ||
      setting.tags?.some(tag => tag.toLowerCase().includes(query));
    return matchCategory && matchSearch;
  })?.sort((a, b) => {
    // 修炼境界按创建时间排序
    if (selectedCategory === '修炼境界' || selectedCategory === '功法武技' || selectedCategory === '血脉体质' || selectedCategory === '神通秘术') {
      return a.createdAt - b.createdAt;
    }
    // 其他分类按创建时间倒序
    return b.createdAt - a.createdAt;
  });

  // 统计各分类数量（组和子分类）
  const categoryCounts: Record<string, number> = { all: settings?.length || 0 };
  worldCategories.forEach(group => {
    // 统计组下所有子分类的总数
    const groupCount = settings?.filter(s => {
      const cat = legacyCategoryMap[s.category as string] ?? s.category;
      return group.items.includes(cat as string);
    }).length || 0;
    categoryCounts[group.group] = groupCount;

    // 统计每个子分类的数量
    group.items.forEach(item => {
      categoryCounts[item] = settings?.filter(s => {
        const cat = legacyCategoryMap[s.category as string] ?? s.category;
        return cat === item;
      }).length || 0;
    });
  });

  const handleOpenModal = (setting?: WorldSetting) => {
    if (setting) {
      setEditingSetting(setting);
      const category = setting.category || '自定义';
      const parsedFields = parseDescription(setting.description || '', category);
      setTemplateFields(parsedFields);
      setFormData({
        category: category as any,
        name: setting.name,
        description: setting.description || '',
        rules: setting.rules || '',
        tags: setting.tags || [],
      });
      setIsFreeEditMode(false);
    } else {
      setEditingSetting(null);
      // 新建时：若左栏当前选中的是具体子分类，默认就用它；否则用第一个子分类（地理）
      const isSubCategory = worldCategories.some(g => g.items.includes(selectedCategory));
      const defaultCategory = (selectedCategory !== 'all' && isSubCategory)
        ? selectedCategory
        : worldCategories[0].items[0];
      setTemplateFields({});
      setFormData({
        category: defaultCategory as any,
        name: '',
        description: '',
        rules: '',
        tags: [],
      });
      setIsFreeEditMode(false);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingSetting(null);
    setTagInput('');
    setTemplateFields({});
    setIsFreeEditMode(false);
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags?.includes(tag)) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), tag],
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter(tag => tag !== tagToRemove) || [],
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name?.trim()) {
      alert('请输入设定名称');
      return;
    }

    console.log('保存世界观设定，formData.category:', formData.category);

    const now = Date.now();

    // 根据编辑模式生成描述
    let finalDescription = '';
    if (isFreeEditMode) {
      finalDescription = formData.description || '';
    } else {
      finalDescription = generateDescription(templateFields, formData.category as string);
    }

    try {
      if (editingSetting) {
        // 更新（不同步到资料库）
        await updateWorldSetting(editingSetting.id!, {
          ...formData,
          description: finalDescription,
          title: formData.name, // 向后兼容
          updatedAt: now,
        });
      } else {
        // 新建
        const worldSettingData = {
          projectId,
          category: formData.category as any,
          name: formData.name,
          description: finalDescription,
          rules: formData.rules,
          tags: formData.tags,
          title: formData.name, // 向后兼容
          createdAt: now,
          updatedAt: now,
        };

        await addWorldSetting(worldSettingData);

        // 获取项目名称用于资料库同步
        const project = await db.projects.get(projectId);
        const projectName = project?.name || '未知项目';

        // 自动同步到资料库
        await syncToLibrary(worldSettingData, 'worldSetting', projectName);
      }
      handleCloseModal();
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  const handleDelete = async (setting: WorldSetting) => {
    if (!confirm(`确定要删除设定《${setting.name}》吗？`)) {
      return;
    }
    await deleteWorldSetting(setting.id!);
  };

  // AI 生成世界观设定
  const handleAIGenerate = async () => {
    setIsGenerating(true);
    setAiCandidates([]);

    try {
      // 获取避雷规则
      const rulesPrefix = await getFormattedRules(projectId, rulesEnabled);

      // 查询同分类的已有设定
      const existingSettings = settings?.filter(s => s.category === aiFormData.category) || [];

      // 判断是否为修炼境界
      const isRealmCategory = aiFormData.category === '修炼境界';

      let userPrompt = '';
      let systemPrompt = '';

      if (isRealmCategory) {
        // 修炼境界使用链式生成逻辑
        systemPrompt = `你是网文修炼体系设计师。请为用户生成**一条完整的修炼境界链**。

规则：
1. 如果用户指定了起点境界，从该境界的**下一个**开始生成。
2. 如果用户指定了终点境界，一直生成到该境界为止。
3. 如果没指定终点，根据题材风格生成到合理的最高境界（如飞升、成神、大帝等）。
4. 境界必须**递进合理**：后一个比前一个更强，名称风格统一。
5. 每个境界包含：name(境界名)、description(简短描述，50字内)、breakthrough(突破条件，30字内)。
6. 严格按 JSON 数组输出，从低到高排列。
7. 不要重复用户已列出的已有境界。
8. 直接输出 JSON，不要任何解释、不要 markdown 包裹。`;

        const startRealm = aiFormData.categoryFields['startRealm'] || '';
        const endRealm = aiFormData.categoryFields['endRealm'] || '';
        const count = aiFormData.categoryFields['count'] || '不限';

        userPrompt = `起点境界：${startRealm || '无（从最低开始）'}\n`;
        userPrompt += `终点境界：${endRealm || '无（自由决定）'}\n`;
        userPrompt += `境界数量：${count}\n`;

        if (existingSettings.length > 0) {
          userPrompt += `已有境界（不要重复）：${existingSettings.map(s => s.name).join('、')}\n`;
        }

        // 添加通用选项
        if (aiFormData.worldTone) {
          userPrompt += `世界基调：${aiFormData.worldTone}\n`;
        }
        if (aiFormData.era) {
          userPrompt += `时代背景：${aiFormData.era}\n`;
        }
        if (aiFormData.elements.length > 0) {
          userPrompt += `元素融合：${aiFormData.elements.join('、')}\n`;
        }
        if (aiFormData.pace) {
          userPrompt += `节奏：${aiFormData.pace}\n`;
        }
        if (aiFormData.protagonistType.length > 0) {
          userPrompt += `主角类型：${aiFormData.protagonistType.join('、')}\n`;
        }
        if (aiFormData.goldenFinger) {
          userPrompt += `金手指：${aiFormData.goldenFinger}\n`;
        }
        if (aiFormData.coolPoints.length > 0) {
          userPrompt += `爽点风格：${aiFormData.coolPoints.join('、')}\n`;
        }

        userPrompt += `\n请生成从起点往后延伸的完整境界链。`;
      } else {
        // 其他分类使用原有的3个独立候选逻辑
        systemPrompt = '你是网文世界观设定专家。用户可能已有部分设定，你必须与已有设定保持体系一致，不得冲突、不得重复，且需要承接已有设定往后延伸。请按 JSON 数组输出 3 个候选，每个包含 name, description, rules, tags。直接输出 JSON，不要解释。';

        // 如果是补充已有模式且有已有设定
        if (aiFormData.mode === 'supplement' && existingSettings.length > 0) {
          userPrompt += '【已有设定（必须兼容，不要冲突，不要重复）】\n';
          existingSettings.forEach(setting => {
            userPrompt += `- 名称：${setting.name}`;
            if (setting.description) {
              userPrompt += ` | 描述：${setting.description.slice(0, 100)}`;
            }
            if (setting.rules) {
              userPrompt += ` | 规则：${setting.rules.slice(0, 100)}`;
            }
            userPrompt += '\n';
          });
          userPrompt += '\n';
        }

        userPrompt += '【用户需求】\n';
        userPrompt += `分类：${aiFormData.category}\n`;
        userPrompt += `生成模式：${aiFormData.mode === 'supplement' ? '补充已有' : '全新体系'}\n`;

        // 添加分类专属字段
        const categoryFieldsConfig = aiCategoryFields[aiFormData.category as keyof typeof aiCategoryFields];
        if (categoryFieldsConfig) {
          categoryFieldsConfig.forEach(field => {
            const value = aiFormData.categoryFields[field.key];
            if (value) {
              userPrompt += `${field.label}：${value}\n`;
            }
          });
        }

        // 添加通用选项
        if (aiFormData.worldTone) {
          userPrompt += `世界基调：${aiFormData.worldTone}\n`;
        }
        if (aiFormData.era) {
          userPrompt += `时代背景：${aiFormData.era}\n`;
        }
        if (aiFormData.elements.length > 0) {
          userPrompt += `元素融合：${aiFormData.elements.join('、')}\n`;
        }
        if (aiFormData.pace) {
          userPrompt += `节奏：${aiFormData.pace}\n`;
        }
        if (aiFormData.protagonistType.length > 0) {
          userPrompt += `主角类型：${aiFormData.protagonistType.join('、')}\n`;
        }
        if (aiFormData.goldenFinger) {
          userPrompt += `金手指：${aiFormData.goldenFinger}\n`;
        }
        if (aiFormData.coolPoints.length > 0) {
          userPrompt += `爽点风格：${aiFormData.coolPoints.join('、')}\n`;
        }

        if (aiFormData.mode === 'supplement' && existingSettings.length > 0) {
          userPrompt += '\n请基于已有设定，生成 3 个与它们兼容的候选设定。';
        } else {
          userPrompt += '\n请生成 3 个差异化的设定候选。';
        }
      }

      const result = await askAI({
        system: systemPrompt,
        user: rulesPrefix + userPrompt,
      });

      console.log('AI 原始返回:', result);

      // 使用 extractJSON 解析
      const parsed = extractJSON(result, 'array');

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('AI 返回格式异常');
      }

      setAiCandidates(parsed);
    } catch (error) {
      handleAIError(error);
    } finally {
      setIsGenerating(false);
    }
  };

  // 选择候选设定
  const handleSelectCandidate = (candidate: any) => {
    setFormData({
      category: aiFormData.category as any,
      name: candidate.name || '',
      description: candidate.description || '',
      rules: candidate.rules || '',
      tags: Array.isArray(candidate.tags) ? candidate.tags : [],
    });

    setShowAIModal(false);
    setAiCandidates([]);
    setShowModal(true);
  };

  // 批量创建修炼境界
  const handleBatchCreateRealms = async () => {
    // 验证体系名
    if (!systemName.trim()) {
      alert('请填写体系名');
      return;
    }

    try {
      const selectedCandidates = selectedRealms.map(index => aiCandidates[index]);
      const now = Date.now();

      for (const realm of selectedCandidates) {
        await addWorldSetting({
          projectId,
          category: aiFormData.category as any,
          name: realm.name,
          title: realm.name, // 向后兼容
          description: realm.description || '',
          rules: realm.breakthrough ? `突破条件：${realm.breakthrough}` : '',
          tags: [],
          systemName: systemName.trim(),
          createdAt: now,
          updatedAt: now,
        });
      }

      setShowAIModal(false);
      setAiCandidates([]);
      setSelectedRealms([]);
      setSystemName('');

      alert(`成功创建 ${selectedCandidates.length} 个${aiFormData.category}！`);
    } catch (error) {
      console.error('批量创建失败:', error);
      alert('批量创建失败，请重试');
    }
  };

  if (!settings) {
    return <div className="p-8">加载中...</div>;
  }

  return (
    <div className="w-full p-6">
      <div className="glass-card rounded-xl flex items-stretch overflow-hidden min-h-[calc(100vh-160px)]">
      {/* 左侧分类导航 */}
      <div className="w-60 shrink-0 border-r border-border">
        <div className="p-4 max-h-[calc(100vh-120px)] overflow-y-auto">
          {/* 标题 */}
          <div className="px-2 pb-2 mb-2 border-b border-primary/10">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">分类</span>
          </div>

          {/* 分组 */}
          {worldCategories.map((group) => {
            const isGroupExpanded = expandedGroups.includes(group.group);
            return (
              <div key={group.group} className="mb-1">
                {/* 大类标题 */}
                <button
                  onClick={() => {
                    if (isGroupExpanded) {
                      setExpandedGroups(expandedGroups.filter(g => g !== group.group));
                    } else {
                      setExpandedGroups([...expandedGroups, group.group]);
                    }
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform ${isGroupExpanded ? 'rotate-90' : ''}`}
                    />
                    {group.group}
                  </span>
                  <span className="text-xs opacity-60">{categoryCounts[group.group]}</span>
                </button>

                {/* 子分类 */}
                {isGroupExpanded && (
                  <div className="space-y-0.5 mt-0.5">
                    {group.items.map((item) => (
                      <button
                        key={item}
                        onClick={() => setSelectedCategory(selectedCategory === item ? 'all' : item)}
                        className={`w-full flex items-center justify-between pl-9 pr-3 py-1.5 rounded-md text-sm transition-colors ${
                          selectedCategory === item
                            ? 'bg-primary/10 text-primary border-l-2 border-primary'
                            : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
                        }`}
                      >
                        <span className="truncate">{item}</span>
                        <span className="text-[10px] opacity-60">{categoryCounts[item]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 min-w-0 overflow-auto">
        <div className="p-6">
          {/* 头部 */}
          <div className="flex items-end justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">世界观设定</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedCategory === 'all'
                  ? `共 ${settings?.length || 0} 个设定`
                  : (() => {
                      // 检查是否是组
                      const group = worldCategories.find(g => g.group === selectedCategory);
                      const label = group ? group.group : selectedCategory;
                      return `${label} · ${filteredSettings?.length || 0} 个设定`;
                    })()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAIModal(true)}
                className="flex items-center gap-2 px-4 py-2 h-9 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                <Sparkles size={18} />
                AI 生成设定
              </button>
              <button
                onClick={() => handleOpenModal()}
                className="flex items-center gap-2 px-4 py-2 h-9 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                <Plus size={18} />
                新建设定
              </button>
            </div>
          </div>

          {/* 搜索框 */}
          <div className="mb-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索设定名称、描述、标签..."
                style={{ paddingLeft: '40px' }}
                className="w-full bg-background text-foreground pr-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* 设定列表 */}
          {filteredSettings && filteredSettings.length === 0 ? (
            <div className="text-center py-16 glass-card rounded-xl">
              <Globe size={48} className="mx-auto text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground mb-4">
                {searchQuery ? '没有找到匹配的设定' : '还没有设定'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => handleOpenModal()}
                  className="px-6 py-2.5 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                >
                  新建第一个设定
                </button>
              )}
            </div>
          ) : (
            <>
              {/* 判断是否使用紧凑列表 */}
              {(selectedCategory === '修炼境界' || selectedCategory === '功法武技' || selectedCategory === '血脉体质' || selectedCategory === '神通秘术') ? (
                /* 紧凑列表模式 - 按体系分组 */
                (() => {
                  // 按 systemName 分组
                  const groupedBySystem: Record<string, typeof filteredSettings> = {};
                  filteredSettings?.forEach(setting => {
                    const system = setting.systemName || '未命名体系';
                    if (!groupedBySystem[system]) {
                      groupedBySystem[system] = [];
                    }
                    groupedBySystem[system].push(setting);
                  });

                  // 初始化展开所有体系
                  if (expandedSystems.length === 0 && Object.keys(groupedBySystem).length > 0) {
                    setExpandedSystems(Object.keys(groupedBySystem));
                  }

                  return (
                    <div className="space-y-4">
                      {Object.entries(groupedBySystem).map(([systemName, systemSettings]) => {
                        const isExpanded = expandedSystems.includes(systemName);
                        const settingsArray = systemSettings || [];
                        return (
                          <div key={systemName} className="glass-card rounded-xl overflow-hidden">
                            {/* 体系标题栏 */}
                            <div
                              className="flex items-center justify-between px-4 py-3 border-b border-primary/10 cursor-pointer hover:bg-primary/5 transition-colors"
                              onClick={() => {
                                if (isExpanded) {
                                  setExpandedSystems(expandedSystems.filter(s => s !== systemName));
                                } else {
                                  setExpandedSystems([...expandedSystems, systemName]);
                                }
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <ChevronDown
                                  size={18}
                                  className={`transition-transform text-muted-foreground ${isExpanded ? '' : '-rotate-90'}`}
                                />
                                <h3 className="text-sm font-medium text-foreground">
                                  {systemName}
                                </h3>
                                <span className="text-xs text-muted-foreground">
                                  {settingsArray.length} 阶
                                </span>
                              </div>
                            </div>

                            {/* 体系内容 */}
                            {isExpanded && (
                              <div className="divide-y">
                                {settingsArray.map((setting, index) => (
                                  <div
                                    key={setting.id}
                                    className="hover:bg-muted transition-colors group"
                                  >
                                    <div
                                      className="flex items-start gap-3 px-4 py-3 cursor-pointer"
                                      onClick={() => {
                                        setSelectedSetting(setting);
                                        setExpandedListItem(expandedListItem === setting.id ? null : (setting.id || null));
                                      }}
                                    >
                                      <span className="text-sm font-medium text-primary flex-shrink-0 w-6">
                                        {index + 1}.
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <h4 className="text-base font-bold text-foreground mb-1">
                                          {setting.name}
                                        </h4>
                                        <p className="text-sm text-muted-foreground truncate">
                                          {setting.description && setting.description.length > 30 && expandedListItem !== setting.id
                                            ? `${setting.description.slice(0, 30)}...`
                                            : setting.description}
                                        </p>
                                        {expandedListItem === setting.id && (
                                          <div className="mt-3 pt-3 border-t space-y-2">
                                            {setting.description && setting.description.length > 30 && (
                                              <div>
                                                <p className="text-xs font-medium text-foreground mb-1">详细描述</p>
                                                <p className="text-sm text-muted-foreground">{setting.description}</p>
                                              </div>
                                            )}
                                            {setting.rules && (
                                              <div className="p-2 bg-background border border-amber-200 rounded">
                                                <p className="text-xs font-medium text-foreground mb-1">硬性规则</p>
                                                <p className="text-sm text-amber-900">{setting.rules}</p>
                                              </div>
                                            )}
                                            {setting.tags && setting.tags.length > 0 && (
                                              <div className="flex flex-wrap gap-1">
                                                {setting.tags.map((tag, idx) => (
                                                  <span
                                                    key={idx}
                                                    className="px-2 py-0.5 bg-muted text-foreground text-xs rounded-full"
                                                  >
                                                    {tag}
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenModal(setting);
                                          }}
                                          className="p-1.5 text-primary hover:bg-primary/10 rounded transition-all"
                                          title="编辑"
                                        >
                                          <Edit2 size={16} />
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(setting);
                                          }}
                                          className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-all"
                                          title="删除"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              ) : (
                /* 卡片网格模式 - 适用于其他分类 */
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredSettings?.map((setting) => (
                <div
                  key={setting.id}
                  onClick={() => setSelectedSetting(setting)}
                  className="glass-card rounded-xl p-6 cursor-pointer group relative hover:-translate-y-0.5 transition-transform flex flex-col items-center text-center min-h-[160px]"
                >
                  {/* 名字居中 */}
                  <h3 className="text-lg font-bold text-foreground truncate w-full mb-2">
                    {setting.name}
                  </h3>

                  {/* 分类 badge 居中 */}
                  {setting.category && (
                    <span className="px-2 py-0.5 text-sm rounded-full bg-primary/10 text-primary border border-primary/20 mb-3">
                      {setting.category}
                    </span>
                  )}

                  {/* 描述居中 2 行 */}
                  {setting.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 w-full">
                      {setting.description}
                    </p>
                  )}

                  {/* 硬性规则（如果有）精简 */}
                  {setting.rules && (
                    <p className="text-xs text-amber-400/80 mt-2 line-clamp-1 w-full">
                      {setting.rules}
                    </p>
                  )}

                  {/* 底部标签居中 */}
                  {setting.tags && setting.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 justify-center mt-auto pt-3 border-t border-primary/10 w-full">
                      {setting.tags.slice(0, 3).map((tag, idx) => (
                        <span key={idx} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                </div>
              ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <aside className="w-80 shrink-0 hidden xl:block border-l border-border">
        <div className="p-5 max-h-[calc(100vh-120px)] overflow-y-auto">
          {!selectedSetting ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>点击卡片查看设定详情</p>
            </div>
          ) : (
            <>
              {/* 名称 */}
              <h2 className="text-lg font-bold text-foreground mb-2">
                {selectedSetting.name}
              </h2>

              {/* 分类徽章 */}
              {selectedSetting.category && (
                <div className="mb-4">
                  <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20">
                    {selectedSetting.category}
                  </span>
                </div>
              )}

              {/* 详细描述 */}
              {selectedSetting.description && (
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-1">详细描述</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{selectedSetting.description}</p>
                </div>
              )}

              {/* 硬性规则 */}
              {selectedSetting.rules && (
                <div className="mb-4 p-3 bg-background border border-amber-200 rounded-lg">
                  <p className="text-xs font-medium text-foreground mb-1">硬性规则</p>
                  <p className="text-sm text-amber-900 whitespace-pre-wrap">{selectedSetting.rules}</p>
                </div>
              )}

              {/* 标签 */}
              {selectedSetting.tags && selectedSetting.tags.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-2">标签</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSetting.tags.map((tag, idx) => (
                      <span key={idx} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 底部操作 */}
              <div className="flex gap-2 mt-5 pt-4 border-t border-border">
                <button
                  onClick={() => {
                    handleOpenModal(selectedSetting);
                    setSelectedSetting(null);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  编辑
                </button>
                <button
                  onClick={() => {
                    handleDelete(selectedSetting);
                    setSelectedSetting(null);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm bg-card border border-destructive/30 text-destructive font-semibold rounded-lg hover:bg-destructive/10 hover:border-destructive/50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
      </div>

      {/* 编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {editingSetting ? '编辑设定' : '新建设定'}
              </h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="p-1.5 hover:bg-muted rounded transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* 分类 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  分类
                </label>
                <select
  value={formData.category}
  disabled={selectedCategory !== 'all' && !editingSetting}
  onChange={(e) => {
    setFormData({ ...formData, category: e.target.value as any });
    if (!isFreeEditMode) {
      setTemplateFields({});
    }
  }}
  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 disabled:cursor-not-allowed"
>
  {worldCategories.map((group) => (
    <optgroup key={group.group} label={group.group}>
      {group.items.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </optgroup>
  ))}
</select>
              </div>

              {/* 名称 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="请输入设定名称"
                  autoFocus
                />
              </div>

              {/* 内容区域 - 根据模式切换 */}
              {isFreeEditMode ? (
                /* 自由编辑模式 */
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    详细描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    rows={8}
                    placeholder="自由编写设定内容..."
                  />
                </div>
              ) : (
                /* 模板字段模式 */
                <>
                  {worldTemplates[formData.category as string]?.map((field) => (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        {field.label}
                      </label>
                      <textarea
                        value={templateFields[field.key] || ''}
                        onChange={(e) => setTemplateFields({ ...templateFields, [field.key]: e.target.value })}
                        className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                        rows={2}
                        placeholder={field.placeholder}
                      />
                    </div>
                  ))}
                </>
              )}

              {/* 硬性规则 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  硬性规则
                </label>
                <textarea
                  value={formData.rules}
                  onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
                  className="w-full px-3 py-2 border border-amber-300 bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                  rows={3}
                  placeholder="设定中不可违背的硬性规则，用于以后 AI 检查一致性..."
                />
                <p className="text-xs text-amber-600 mt-1">
                  提示：这些规则将用于后续 AI 检查剧情一致性
                </p>
              </div>

              {/* 标签 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  标签
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="输入标签后按回车"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    添加
                  </button>
                </div>
                {formData.tags && formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-primary/15 text-primary text-sm rounded-full"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:bg-primary/20 rounded-full p-0.5"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2.5 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI 生成设定弹窗 */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">AI 生成世界观设定</h2>
              <button
                onClick={() => {
                  setShowAIModal(false);
                  setAiCandidates([]);
                }}
                className="p-1.5 hover:bg-muted rounded transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 参数输入区 */}
              {aiCandidates.length === 0 && (
                <>
                  {/* 分类 */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      分类 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={aiFormData.category}
                      onChange={(e) => setAiFormData({ ...aiFormData, category: e.target.value })}
                      className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {worldCategories.map((group) => (
                        <optgroup key={group.group} label={group.group}>
                          {group.items.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {(() => {
                      const existingCount = settings?.filter(s => s.category === aiFormData.category).length || 0;
                      return existingCount > 0 ? (
                        <p className="text-xs text-primary mt-1">
                          💡 检测到已有 {existingCount} 条【{aiFormData.category}】设定，生成时会自动参考并保持兼容。
                        </p>
                      ) : null;
                    })()}
                  </div>

                  {/* 生成模式 */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      生成模式
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          value="supplement"
                          checked={aiFormData.mode === 'supplement'}
                          onChange={(e) => setAiFormData({ ...aiFormData, mode: e.target.value })}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-sm">补充已有（在已有设定基础上延伸）</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          value="new"
                          checked={aiFormData.mode === 'new'}
                          onChange={(e) => setAiFormData({ ...aiFormData, mode: e.target.value })}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-sm">全新体系（另起炉灶）</span>
                      </label>
                    </div>
                  </div>

                  {/* 分类专属字段 */}
                  {aiCategoryFields[aiFormData.category as keyof typeof aiCategoryFields]?.map((field) => (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        {field.label}
                      </label>
                      {field.type === 'select' ? (
                        <select
                          value={aiFormData.categoryFields[field.key] || ''}
                          onChange={(e) => setAiFormData({
                            ...aiFormData,
                            categoryFields: { ...aiFormData.categoryFields, [field.key]: e.target.value }
                          })}
                          className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <option value="">请选择</option>
                          {field.options?.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={aiFormData.categoryFields[field.key] || ''}
                          onChange={(e) => setAiFormData({
                            ...aiFormData,
                            categoryFields: { ...aiFormData.categoryFields, [field.key]: e.target.value }
                          })}
                          className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder={field.placeholder}
                        />
                      )}
                    </div>
                  ))}

                  {/* 修炼境界特殊处理：显示已有境界 */}
                  {aiFormData.category === '修炼境界' && settings?.filter(s => s.category === '修炼境界').length > 0 && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs font-medium text-blue-800 mb-2">已有境界参考</p>
                      <div className="flex flex-wrap gap-2">
                        {settings.filter(s => s.category === '修炼境界').map((s, idx) => (
                          <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 通用选项（可折叠） */}
                  <div className="border-t pt-4">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      {showAdvancedOptions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      <span>通用选项（可选）</span>
                    </button>

                    {showAdvancedOptions && (
                      <div className="mt-4 space-y-4">
                        {/* 世界基调 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            世界基调（单选）
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {['东方玄幻', '西方奇幻', '现代都市', '未来科幻', '末世废土', '赛博朋克', '蒸汽朋克', '仙侠高武'].map(tone => (
                              <label key={tone} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={aiFormData.worldTone === tone}
                                  onChange={() => setAiFormData({ ...aiFormData, worldTone: tone })}
                                  className="w-4 h-4 accent-primary"
                                />
                                <span className="text-sm">{tone}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* 时代背景 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            时代背景（单选）
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {['上古洪荒', '古代', '近代', '现代', '未来', '架空无时代'].map(era => (
                              <label key={era} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={aiFormData.era === era}
                                  onChange={() => setAiFormData({ ...aiFormData, era: era })}
                                  className="w-4 h-4 accent-primary"
                                />
                                <span className="text-sm">{era}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* 元素融合 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            元素融合（可多选）
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {['克苏鲁', '蒸汽机械', '灵异', '神话', '学院', '军事', '商战', '星际'].map(element => (
                              <label key={element} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={aiFormData.elements.includes(element)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setAiFormData({ ...aiFormData, elements: [...aiFormData.elements, element] });
                                    } else {
                                      setAiFormData({ ...aiFormData, elements: aiFormData.elements.filter(el => el !== element) });
                                    }
                                  }}
                                  className="w-4 h-4 accent-primary"
                                />
                                <span className="text-sm">{element}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* 节奏 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            节奏（单选）
                          </label>
                          <div className="grid grid-cols-4 gap-2">
                            {['慢热', '中速', '紧凑', '快节奏爽文'].map(pace => (
                              <label key={pace} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={aiFormData.pace === pace}
                                  onChange={() => setAiFormData({ ...aiFormData, pace: pace })}
                                  className="w-4 h-4 accent-primary"
                                />
                                <span className="text-sm">{pace}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* 主角类型 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            主角类型（可多选）
                          </label>
                          <div className="grid grid-cols-4 gap-2">
                            {['热血', '理智', '腹黑', '憨厚', '傲娇', '阴郁', '无敌流', '凡人流'].map(type => (
                              <label key={type} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={aiFormData.protagonistType.includes(type)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setAiFormData({ ...aiFormData, protagonistType: [...aiFormData.protagonistType, type] });
                                    } else {
                                      setAiFormData({ ...aiFormData, protagonistType: aiFormData.protagonistType.filter(t => t !== type) });
                                    }
                                  }}
                                  className="w-4 h-4 accent-primary"
                                />
                                <span className="text-sm">{type}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* 金手指类型 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            金手指类型（单选）
                          </label>
                          <div className="grid grid-cols-4 gap-2">
                            {['系统', '传承', '异能', '血脉', '重生', '穿越', '无金手指', '其他'].map(gf => (
                              <label key={gf} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={aiFormData.goldenFinger === gf}
                                  onChange={() => setAiFormData({ ...aiFormData, goldenFinger: gf })}
                                  className="w-4 h-4 accent-primary"
                                />
                                <span className="text-sm">{gf}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* 爽点风格 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            爽点风格（可多选）
                          </label>
                          <div className="grid grid-cols-4 gap-2">
                            {['打脸', '扮猪吃虎', '升级流', '装逼', '种田', '苟道', '装弱', '复仇'].map(cp => (
                              <label key={cp} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={aiFormData.coolPoints.includes(cp)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setAiFormData({ ...aiFormData, coolPoints: [...aiFormData.coolPoints, cp] });
                                    } else {
                                      setAiFormData({ ...aiFormData, coolPoints: aiFormData.coolPoints.filter(c => c !== cp) });
                                    }
                                  }}
                                  className="w-4 h-4 accent-primary"
                                />
                                <span className="text-sm">{cp}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 避雷规则 */}
                  <div className="border-t border-border pt-4">
                    <RejectionRulesToggle
                      projectId={projectId}
                      enabled={rulesEnabled}
                      onToggle={setRulesEnabled}
                    />
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAIModal(false);
                        setAiCandidates([]);
                      }}
                      className="flex-1 px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors"
                      disabled={isGenerating}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleAIGenerate}
                      className="flex-1 px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isGenerating}
                    >
                      {isGenerating ? '生成中...' : '生成'}
                    </button>
                  </div>
                </>
              )}

              {/* 候选展示区 */}
              {aiCandidates.length > 0 && (
                <>
                  {aiFormData.category === '修炼境界' ? (
                    /* 修炼境界：紧凑列表展示 + 批量创建 */
                    <div className="border border-input rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-foreground">
                          修炼境界链（共 {aiCandidates.length} 个）
                        </h3>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            已选 {selectedRealms.length}/{aiCandidates.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const allSelected = selectedRealms.length === aiCandidates.length;
                              setSelectedRealms(allSelected ? [] : aiCandidates.map((_, idx) => idx));
                            }}
                            className="text-xs text-primary hover:underline"
                          >
                            {selectedRealms.length === aiCandidates.length ? '全不选' : '全选'}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-0 max-h-96 overflow-y-auto border border-border rounded">
                        {aiCandidates.map((realm, index) => (
                          <div
                            key={index}
                            className={`border-b last:border-b-0 ${
                              selectedRealms.includes(index) ? 'bg-primary/10' : 'bg-card hover:bg-muted'
                            }`}
                          >
                            <div className="flex items-start gap-2 px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selectedRealms.includes(index)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRealms([...selectedRealms, index]);
                                  } else {
                                    setSelectedRealms(selectedRealms.filter(i => i !== index));
                                  }
                                }}
                                className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0"
                              />
                              <div
                                className="flex-1 cursor-pointer"
                                onClick={() => setExpandedRealm(expandedRealm === index ? null : index)}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-primary">
                                    {index + 1}.
                                  </span>
                                  <span className="font-bold text-sm text-foreground">
                                    {realm.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground flex-1">
                                    {realm.description && realm.description.length > 40 && expandedRealm !== index
                                      ? `${realm.description.slice(0, 40)}...`
                                      : realm.description}
                                  </span>
                                  {(realm.description?.length > 40 || realm.breakthrough) && (
                                    <button className="text-xs text-primary hover:underline flex-shrink-0">
                                      {expandedRealm === index ? '收起' : '详情'}
                                    </button>
                                  )}
                                </div>
                                {expandedRealm === index && (
                                  <div className="mt-2 space-y-2 text-xs">
                                    {realm.description && (
                                      <p className="text-foreground">{realm.description}</p>
                                    )}
                                    {realm.breakthrough && (
                                      <p className="text-amber-700 bg-background px-2 py-1 rounded">
                                        突破条件：{realm.breakthrough}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* 体系名输入框 */}
                      <div className="px-4 pt-3 border-t">
                        <label className="block text-sm font-medium text-foreground mb-2">
                          体系名 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={systemName}
                          onChange={(e) => setSystemName(e.target.value)}
                          placeholder="如：星辰体系、修真体系、斗气体系"
                          className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          用于区分不同的修炼体系，方便管理
                        </p>
                      </div>

                      <div className="flex gap-3 px-4 pt-3 pb-4 border-t">
                        <button
                          type="button"
                          onClick={handleAIGenerate}
                          className="px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors disabled:opacity-50"
                          disabled={isGenerating}
                        >
                          重新生成
                        </button>
                        <button
                          type="button"
                          onClick={handleBatchCreateRealms}
                          className="flex-1 px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={selectedRealms.length === 0}
                        >
                          批量创建（已选 {selectedRealms.length} 个）
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 其他分类：3个独立候选 */
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">请选择一个候选设定：</p>
                      {aiCandidates.map((candidate, index) => (
                        <div
                          key={index}
                          className="border border-border rounded-lg p-4 hover:border-primary/50 hover:shadow-md transition-all"
                        >
                          <div className="mb-3">
                            <h3 className="text-lg font-bold text-foreground">{candidate.name}</h3>
                          </div>
                          <div className="space-y-2 text-sm mb-4">
                            {candidate.description && (
                              <div>
                                <p className="text-foreground">
                                  <span className="font-medium">描述：</span>
                                  {expandedCandidate === index ? (
                                    <>
                                      {candidate.description}
                                      {candidate.description.length > 150 && (
                                        <button
                                          onClick={() => setExpandedCandidate(null)}
                                          className="text-primary hover:underline ml-2"
                                        >
                                          收起
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      {candidate.description.slice(0, 150)}
                                      {candidate.description.length > 150 && (
                                        <>
                                          ...
                                          <button
                                            onClick={() => setExpandedCandidate(index)}
                                            className="text-primary hover:underline ml-2"
                                          >
                                            展开
                                          </button>
                                        </>
                                      )}
                                    </>
                                  )}
                                </p>
                              </div>
                            )}
                            {candidate.rules && (
                              <div className="p-3 bg-background border border-amber-200 rounded-lg">
                                <p className="text-xs font-medium text-foreground mb-1">硬性规则</p>
                                <p className="text-sm text-amber-900">{candidate.rules}</p>
                              </div>
                            )}
                            {candidate.tags && Array.isArray(candidate.tags) && candidate.tags.length > 0 && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <TagIcon size={14} className="text-muted-foreground" />
                                {candidate.tags.map((tag: string, idx: number) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-1 bg-muted text-foreground text-xs rounded-full"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleSelectCandidate(candidate)}
                            className="w-full px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors"
                          >
                            选择这个
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => setAiCandidates([])}
                        className="w-full px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors"
                      >
                        重新生成
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
