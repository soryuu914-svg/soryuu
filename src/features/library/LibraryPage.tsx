import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Trash2, User, Globe, Edit2, X, Upload, Plus } from 'lucide-react';
import { getAllLibraryItems, deleteLibraryItem, addLibraryItem, updateLibraryItem } from '../../db/library';
import { worldTemplates, parseDescription, generateDescription } from '../world/worldTemplates';
import { getAllProjects } from '../../db/project';
import { addCharacter, getCharactersByProject } from '../../db/character';
import { addWorldSetting, getWorldSettingsByProject } from '../../db/world';
import { db } from '../../db/index';
import type { LibraryItem, Character, WorldSetting } from '../../types';

type TabType = 'character' | 'worldSetting';

export default function LibraryPage() {
  const [currentTab, setCurrentTab] = useState<TabType>('character');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isEditingInModal, setIsEditingInModal] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});
  const [templateFields, setTemplateFields] = useState<Record<string, string>>({});
  const [showAddToProjectModal, setShowAddToProjectModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<'character' | 'worldSetting'>('character');

  // 实时查询资料库项
  const allItems = useLiveQuery(() => getAllLibraryItems(), []);

  // 实时查询所有作品
  const allProjects = useLiveQuery(() => getAllProjects(), []);

  // 实时统计各作品的人物/世界观数量
  // 一次性把两张表全部取出后按 projectId 归并，避免"每部作品查一次"的 N+1
  const projectCounts = useLiveQuery(async () => {
    const [characterRows, worldSettingRows] = await Promise.all([
      db.characters.toArray(),
      db.worldSettings.toArray(),
    ]);

    const counts: Record<number, { characters: number; worldSettings: number }> = {};
    const bump = (projectId: number, key: 'characters' | 'worldSettings') => {
      if (!counts[projectId]) counts[projectId] = { characters: 0, worldSettings: 0 };
      counts[projectId][key] += 1;
    };

    characterRows.forEach(c => bump(c.projectId, 'characters'));
    worldSettingRows.forEach(s => bump(s.projectId, 'worldSettings'));
    return counts;
  }, []);

  // 过滤数据
  const filteredItems = allItems?.filter(item => {
    // 按 tab 过滤
    if (item.type !== currentTab) {
      return false;
    }

    // 按搜索词过滤
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(lowerQuery) ||
        item.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
        (item.sourceProjectName && item.sourceProjectName.toLowerCase().includes(lowerQuery))
      );
    }

    return true;
  });

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确定要删除《${name}》吗？`)) {
      return;
    }
    await deleteLibraryItem(id);
  };

  const handleViewDetail = (item: LibraryItem) => {
    setSelectedItem(item);
    setIsEditingInModal(false);
    setShowDetailModal(true);
  };

  const handleEdit = (item: LibraryItem) => {
    setSelectedItem(item);
    // 初始化编辑表单数据
    if (item.type === 'character') {
      setEditFormData({
        name: item.content.name || item.name,
        alias: item.content.alias || '',
        role: item.content.role || 'supporting',
        identity: item.content.identity || '',
        appearance: item.content.appearance || '',
        personality: item.content.personality || '',
        motivation: item.content.motivation || '',
        abilities: item.content.abilities || '',
        growth: item.content.growth || '',
        tags: item.tags || [],
      });
    } else {
      // 世界观：解析 description 回填到模板字段
      const category = item.content.category || '自定义';
      const parsedFields = item.content.description
        ? parseDescription(item.content.description, category)
        : {};

      setEditFormData({
        name: item.content.name || item.name,
        category: category,
        rules: item.content.rules || '',
        tags: item.tags || [],
      });
      setTemplateFields(parsedFields);
    }
    setIsEditingInModal(true);
    setShowDetailModal(true);
  };

  const handleCancelEdit = () => {
    setIsEditingInModal(false);
    setEditFormData({});
    setTemplateFields({});
  };

  const handleCategoryChange = (newCategory: string) => {
    // 切换分类时，尝试保留能解析出的字段
    const oldCategory = editFormData.category;

    // 如果有旧的模板字段，先生成 description
    let oldDescription = '';
    if (Object.keys(templateFields).length > 0) {
      oldDescription = generateDescription(templateFields, oldCategory);
    }

    // 用新分类重新解析
    const newParsedFields = oldDescription
      ? parseDescription(oldDescription, newCategory)
      : {};

    setEditFormData({ ...editFormData, category: newCategory });
    setTemplateFields(newParsedFields);
  };

  const handleSaveEdit = async () => {
    if (!selectedItem) return;

    try {
      // 构建更新后的 content
      let updatedContent: any;
      if (selectedItem.type === 'character') {
        updatedContent = {
          name: editFormData.name,
          alias: editFormData.alias,
          role: editFormData.role,
          identity: editFormData.identity,
          appearance: editFormData.appearance,
          personality: editFormData.personality,
          motivation: editFormData.motivation,
          abilities: editFormData.abilities,
          growth: editFormData.growth,
        };
      } else {
        // 世界观：用 generateDescription 把模板字段拼回 description
        const description = generateDescription(templateFields, editFormData.category);
        updatedContent = {
          name: editFormData.name,
          category: editFormData.category,
          description: description,
          rules: editFormData.rules,
        };
      }

      // 更新 LibraryItem
      await updateLibraryItem(selectedItem.id!, {
        name: editFormData.name,
        content: updatedContent,
        tags: editFormData.tags,
      });

      alert('已保存');
      setShowDetailModal(false);
      setIsEditingInModal(false);
      setSelectedItem(null);
      setEditFormData({});
      setTemplateFields({});
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = e.currentTarget;
      const newTag = input.value.trim();
      if (newTag && !editFormData.tags.includes(newTag)) {
        setEditFormData({
          ...editFormData,
          tags: [...editFormData.tags, newTag],
        });
        input.value = '';
      }
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditFormData({
      ...editFormData,
      tags: editFormData.tags.filter((tag: string) => tag !== tagToRemove),
    });
  };

  const handleAddToProject = () => {
    setShowAddToProjectModal(true);
  };

  const handleConfirmAddToProject = async () => {
    if (!selectedItem || !selectedProjectId) return;

    try {
      const targetProject = allProjects?.find(p => p.id === selectedProjectId);
      if (!targetProject) {
        alert('作品不存在');
        return;
      }

      if (selectedItem.type === 'character') {
        // 检查是否已存在同名人物
        const existingCharacters = await getCharactersByProject(selectedProjectId);
        const duplicate = existingCharacters.find(c => c.name === selectedItem.name);

        if (duplicate) {
          if (!confirm(`《${targetProject.name}》中已存在同名人物「${selectedItem.name}」，是否覆盖？`)) {
            return;
          }
          // 这里简单处理：不覆盖，直接返回
          alert('已取消添加');
          return;
        }

        // 添加人物卡到目标作品
        const characterData: Omit<Character, 'id'> = {
          projectId: selectedProjectId,
          name: selectedItem.content.name || selectedItem.name,
          alias: selectedItem.content.alias || '',
          role: selectedItem.content.role || 'supporting',
          identity: selectedItem.content.identity || '',
          appearance: selectedItem.content.appearance || '',
          personality: selectedItem.content.personality || '',
          motivation: selectedItem.content.motivation || '',
          abilities: selectedItem.content.abilities || '',
          growth: selectedItem.content.growth || '',
          tags: selectedItem.tags || [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await addCharacter(characterData);
        alert(`已将「${selectedItem.name}」添加到《${targetProject.name}》`);
      } else {
        // 检查是否已存在同名世界观
        const existingSettings = await getWorldSettingsByProject(selectedProjectId);
        const duplicate = existingSettings.find(w => w.name === selectedItem.name);

        if (duplicate) {
          if (!confirm(`《${targetProject.name}》中已存在同名世界观「${selectedItem.name}」，是否覆盖？`)) {
            return;
          }
          alert('已取消添加');
          return;
        }

        // 添加世界观到目标作品
        const worldSettingData: Omit<WorldSetting, 'id'> = {
          projectId: selectedProjectId,
          name: selectedItem.content.name || selectedItem.name,
          category: selectedItem.content.category || '自定义',
          description: selectedItem.content.description || '',
          rules: selectedItem.content.rules || '',
          tags: selectedItem.tags || [],
          title: selectedItem.content.name || selectedItem.name, // 向后兼容
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await addWorldSetting(worldSettingData);
        alert(`已将「${selectedItem.name}」添加到《${targetProject.name}》`);
      }

      setShowAddToProjectModal(false);
      setSelectedProjectId(null);
    } catch (error) {
      console.error('添加到作品失败:', error);
      alert('添加失败，请重试');
    }
  };

  const handleCreateNew = (type: 'character' | 'worldSetting') => {
    setCreateType(type);
    setShowCreateModal(true);
    if (type === 'character') {
      setEditFormData({
        name: '',
        alias: '',
        role: 'supporting',
        identity: '',
        appearance: '',
        personality: '',
        motivation: '',
        abilities: '',
        growth: '',
        tags: [],
      });
    } else {
      setEditFormData({
        name: '',
        category: '自定义',
        rules: '',
        tags: [],
      });
      setTemplateFields({});
    }
  };

  const handleSaveNewItem = async () => {
    if (!editFormData.name || !editFormData.name.trim()) {
      alert('名称不能为空');
      return;
    }

    try {
      const duplicate = allItems?.find(
        item => item.type === createType && item.name === editFormData.name
      );

      if (duplicate) {
        if (!confirm(`已存在同名${createType === 'character' ? '人物卡' : '世界观'}「${editFormData.name}」，是否覆盖？`)) {
          return;
        }
        let updatedContent: any;
        if (createType === 'character') {
          updatedContent = {
            name: editFormData.name,
            alias: editFormData.alias,
            role: editFormData.role,
            identity: editFormData.identity,
            appearance: editFormData.appearance,
            personality: editFormData.personality,
            motivation: editFormData.motivation,
            abilities: editFormData.abilities,
            growth: editFormData.growth,
          };
        } else {
          const description = generateDescription(templateFields, editFormData.category);
          updatedContent = {
            name: editFormData.name,
            category: editFormData.category,
            description: description,
            rules: editFormData.rules,
          };
        }
        await updateLibraryItem(duplicate.id!, {
          name: editFormData.name,
          content: updatedContent,
          tags: editFormData.tags,
        });
        alert('已覆盖更新');
      } else {
        let content: any;
        if (createType === 'character') {
          content = {
            name: editFormData.name,
            alias: editFormData.alias,
            role: editFormData.role,
            identity: editFormData.identity,
            appearance: editFormData.appearance,
            personality: editFormData.personality,
            motivation: editFormData.motivation,
            abilities: editFormData.abilities,
            growth: editFormData.growth,
          };
        } else {
          const description = generateDescription(templateFields, editFormData.category);
          content = {
            name: editFormData.name,
            category: editFormData.category,
            description: description,
            rules: editFormData.rules,
          };
        }

        const newItem: Omit<LibraryItem, 'id'> = {
          type: createType,
          name: editFormData.name,
          content: content,
          tags: editFormData.tags || [],
          sourceProjectName: '手动创建',
          createdAt: Date.now(),
        };

        await addLibraryItem(newItem);
        alert('创建成功');
      }

      setShowCreateModal(false);
      setEditFormData({});
      setTemplateFields({});
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  // 临时测试：手动添加一条数据
  const getTypeLabel = (type: string) => {
    return type === 'character' ? '人物卡' : '世界观';
  };

  const getTypeBadgeClass = (type: string) => {
    return type === 'character'
      ? 'bg-primary/15 text-primary border border-primary/30'
      : 'bg-primary/10 text-primary/80 border border-primary/20';
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* 头部 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">资料库</h1>
            <p className="text-muted-foreground">跨作品共享的人物卡和世界观设定</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleCreateNew('character')}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-foreground font-semibold rounded-lg hover:bg-white/10 hover:border-primary/40 transition-colors"
            >
              <Plus size={16} />
              新建人物卡
            </button>
            <button
              onClick={() => handleCreateNew('worldSetting')}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-foreground font-semibold rounded-lg hover:bg-white/10 hover:border-primary/40 transition-colors"
            >
              <Plus size={16} />
              新建世界观
            </button>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex items-center gap-4 mb-6 backdrop-blur-xl bg-white/5 rounded-xl p-1 border border-white/10">
          <button
            onClick={() => setCurrentTab('character')}
            className={`flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-all ${
              currentTab === 'character'
                ? 'bg-primary text-primary-foreground shadow-lg'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            }`}
          >
            <User size={18} />
            人物卡 {allItems && `(${allItems.filter(i => i.type === 'character').length})`}
          </button>
          <button
            onClick={() => setCurrentTab('worldSetting')}
            className={`flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-all ${
              currentTab === 'worldSetting'
                ? 'bg-primary text-primary-foreground shadow-lg'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            }`}
          >
            <Globe size={18} />
            世界观 {allItems && `(${allItems.filter(i => i.type === 'worldSetting').length})`}
          </button>
        </div>

        {/* 搜索框 */}
        <div className="mb-6">
          <div className="relative backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索名称、标签或来源书籍..."
              style={{ paddingLeft: '40px' }}
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground/50 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* 卡片网格 */}
        {!filteredItems || filteredItems.length === 0 ? (
          <div className="text-center py-16 backdrop-blur-xl bg-white/5 rounded-xl border-2 border-dashed border-white/10">
            <p className="text-muted-foreground mb-4">
              {searchQuery ? '没有找到匹配的资料' : '资料库为空'}
            </p>
            {!searchQuery && (
              <p className="text-sm text-muted-foreground/80">
                在人物卡或世界观页面新建内容后，会自动同步到资料库
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleViewDetail(item)}
                className="glass-card rounded-xl p-4 cursor-pointer group relative hover:-translate-y-0.5 transition-transform"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${getTypeBadgeClass(item.type)}`}>
                      {getTypeLabel(item.type)}
                    </span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItem(item);
                        handleAddToProject();
                      }}
                      className="p-1 text-foreground/70 hover:bg-primary/20 hover:text-primary rounded transition-all"
                      title="添加到作品"
                    >
                      <Upload size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(item);
                      }}
                      className="p-1 text-primary hover:bg-primary/20 rounded transition-all"
                      title="编辑"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item.id!, item.name);
                      }}
                      className="p-1 text-red-400 hover:bg-red-500/20 rounded transition-all"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-foreground mb-2">{item.name}</h3>

                {item.sourceProjectName && (
                  <p className="text-sm text-muted-foreground mb-2">
                    来源：{item.sourceProjectName}
                  </p>
                )}

                {/* 简介摘要 */}
                {item.content && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {item.type === 'character'
                      ? item.content.personality || item.content.identity || '暂无描述'
                      : item.content.description || '暂无描述'}
                  </p>
                )}

                {/* 标签 */}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.slice(0, 3).map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20"
                      >
                        {tag}
                      </span>
                    ))}
                    {item.tags.length > 3 && (
                      <span className="px-2 py-0.5 text-xs text-muted-foreground">
                        +{item.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 详情弹窗（查看/编辑模式） */}
        {showDetailModal && selectedItem && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="backdrop-blur-xl bg-black/40 border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="sticky top-0 backdrop-blur-xl bg-black/60 border-b border-white/10 p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">
                    {isEditingInModal ? `编辑${selectedItem.type === 'character' ? '人物卡' : '世界观'}` : selectedItem.name}
                  </h2>
                  {!isEditingInModal && (
                    <span className={`inline-block mt-2 px-2 py-1 text-xs rounded-full font-medium ${getTypeBadgeClass(selectedItem.type)}`}>
                      {getTypeLabel(selectedItem.type)}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowDetailModal(false);
                      setIsEditingInModal(false);
                      setEditFormData({});
                    }}
                    className="p-2 text-muted-foreground hover:bg-white/10 rounded transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                {!isEditingInModal ? (
                  // 查看模式 - 结构化展示
                  <div className="space-y-4">
                    {selectedItem.sourceProjectName && (
                      <div>
                        <h3 className="text-sm font-medium text-foreground/70 mb-1">来源书籍</h3>
                        <p className="text-foreground">{selectedItem.sourceProjectName}</p>
                      </div>
                    )}

                    {selectedItem.type === 'character' ? (
                      // 人物卡字段展示
                      <>
                        {selectedItem.content.alias && (
                          <div>
                            <h3 className="text-sm font-medium text-foreground/70 mb-1">别名</h3>
                            <p className="text-foreground">{selectedItem.content.alias}</p>
                          </div>
                        )}
                        {selectedItem.content.role && (
                          <div>
                            <h3 className="text-sm font-medium text-foreground/70 mb-1">角色定位</h3>
                            <p className="text-foreground">{selectedItem.content.role}</p>
                          </div>
                        )}
                        {selectedItem.content.identity && (
                          <div>
                            <h3 className="text-sm font-medium text-foreground/70 mb-1">身份</h3>
                            <p className="text-foreground">{selectedItem.content.identity}</p>
                          </div>
                        )}
                        {selectedItem.content.appearance && (
                          <div>
                            <h3 className="text-sm font-medium text-foreground/70 mb-1">外貌</h3>
                            <p className="text-foreground whitespace-pre-wrap">{selectedItem.content.appearance}</p>
                          </div>
                        )}
                        {selectedItem.content.personality && (
                          <div>
                            <h3 className="text-sm font-medium text-foreground/70 mb-1">性格</h3>
                            <p className="text-foreground whitespace-pre-wrap">{selectedItem.content.personality}</p>
                          </div>
                        )}
                        {selectedItem.content.motivation && (
                          <div>
                            <h3 className="text-sm font-medium text-foreground/70 mb-1">目标/动机</h3>
                            <p className="text-foreground whitespace-pre-wrap">{selectedItem.content.motivation}</p>
                          </div>
                        )}
                        {selectedItem.content.abilities && (
                          <div>
                            <h3 className="text-sm font-medium text-foreground/70 mb-1">能力</h3>
                            <p className="text-foreground whitespace-pre-wrap">{selectedItem.content.abilities}</p>
                          </div>
                        )}
                        {selectedItem.content.growth && (
                          <div>
                            <h3 className="text-sm font-medium text-foreground/70 mb-1">成长线</h3>
                            <p className="text-foreground whitespace-pre-wrap">{selectedItem.content.growth}</p>
                          </div>
                        )}
                      </>
                    ) : (
                      // 世界观字段展示
                      <>
                        {selectedItem.content.category && (
                          <div>
                            <h3 className="text-sm font-medium text-foreground/70 mb-1">分类</h3>
                            <p className="text-foreground">{selectedItem.content.category}</p>
                          </div>
                        )}
                        {selectedItem.content.description && (
                          <div>
                            <h3 className="text-sm font-medium text-foreground/70 mb-1">详细描述</h3>
                            <p className="text-foreground whitespace-pre-wrap">{selectedItem.content.description}</p>
                          </div>
                        )}
                        {selectedItem.content.rules && (
                          <div>
                            <h3 className="text-sm font-medium text-foreground/70 mb-1">硬性规则</h3>
                            <p className="text-foreground whitespace-pre-wrap">{selectedItem.content.rules}</p>
                          </div>
                        )}
                      </>
                    )}

                    {selectedItem.tags && selectedItem.tags.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-foreground/70 mb-2">标签</h3>
                        <div className="flex flex-wrap gap-2">
                          {selectedItem.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1 text-sm rounded-full bg-primary/10 text-primary border border-primary/20"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      创建时间：{new Date(selectedItem.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                ) : (
                  // 编辑模式
                  <div className="space-y-4">
                    {selectedItem.type === 'character' ? (
                      // 人物卡编辑表单
                      <>
                        {/* 姓名 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/70 mb-1">
                            姓名 <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="text"
                            value={editFormData.name || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                            className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                            placeholder="请输入人物姓名"
                          />
                        </div>

                        {/* 别名 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/70 mb-1">
                            别名
                          </label>
                          <input
                            type="text"
                            value={editFormData.alias || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, alias: e.target.value })}
                            className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                            placeholder="如：绰号、笔名等"
                          />
                        </div>

                        {/* 角色定位 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/70 mb-1">
                            角色定位
                          </label>
                          <select
                            value={editFormData.role || 'supporting'}
                            onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                            className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                          >
                            <option value="protagonist">主角</option>
                            <option value="heroine">女主</option>
                            <option value="supporting">配角</option>
                            <option value="antagonist">反派</option>
                          </select>
                        </div>

                        {/* 身份 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/70 mb-1">
                            身份
                          </label>
                          <input
                            type="text"
                            value={editFormData.identity || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, identity: e.target.value })}
                            className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                            placeholder="如：修士、商人、王子等"
                          />
                        </div>

                        {/* 外貌 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/70 mb-1">
                            外貌
                          </label>
                          <textarea
                            value={editFormData.appearance || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, appearance: e.target.value })}
                            className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground/50"
                            rows={2}
                            placeholder="描述外貌特征"
                          />
                        </div>

                        {/* 性格 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/70 mb-1">
                            性格
                          </label>
                          <textarea
                            value={editFormData.personality || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, personality: e.target.value })}
                            className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground/50"
                            rows={2}
                            placeholder="性格特点、行为方式"
                          />
                        </div>

                        {/* 目标/动机 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/70 mb-1">
                            目标/动机
                          </label>
                          <textarea
                            value={editFormData.motivation || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, motivation: e.target.value })}
                            className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground/50"
                            rows={2}
                            placeholder="人物的追求、欲望、核心驱动力"
                          />
                        </div>

                        {/* 能力 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/70 mb-1">
                            能力
                          </label>
                          <textarea
                            value={editFormData.abilities || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, abilities: e.target.value })}
                            className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground/50"
                            rows={2}
                            placeholder="技能、天赋、特殊能力"
                          />
                        </div>

                        {/* 成长线 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/70 mb-1">
                            成长线
                          </label>
                          <textarea
                            value={editFormData.growth || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, growth: e.target.value })}
                            className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground/50"
                            rows={3}
                            placeholder="人物的成长轨迹、转折点"
                          />
                        </div>
                      </>
                    ) : (
                      // 世界观编辑表单
                      <>
                        {/* 分类 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/70 mb-1">
                            分类 <span className="text-red-400">*</span>
                          </label>
                          <select
                            value={editFormData.category || '自定义'}
                            onChange={(e) => handleCategoryChange(e.target.value)}
                            className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                          >
                            <optgroup label="地理">
                              <option value="大陆/区域">大陆/区域</option>
                              <option value="城市/城镇">城市/城镇</option>
                              <option value="秘境/禁地">秘境/禁地</option>
                              <option value="山川/地貌">山川/地貌</option>
                            </optgroup>
                            <optgroup label="势力">
                              <option value="宗门/门派">宗门/门派</option>
                              <option value="家族">家族</option>
                              <option value="王朝/帝国">王朝/帝国</option>
                              <option value="组织/商会">组织/商会</option>
                              <option value="邪派/魔道">邪派/魔道</option>
                            </optgroup>
                            <optgroup label="力量体系">
                              <option value="修炼境界">修炼境界</option>
                              <option value="功法/武技">功法/武技</option>
                              <option value="血脉/体质">血脉/体质</option>
                              <option value="神通/秘术">神通/秘术</option>
                            </optgroup>
                            <optgroup label="物品">
                              <option value="武器/法宝">武器/法宝</option>
                              <option value="丹药">丹药</option>
                              <option value="灵材/灵物">灵材/灵物</option>
                            </optgroup>
                            <optgroup label="历史">
                              <option value="上古事件">上古事件</option>
                              <option value="王朝更迭">王朝更迭</option>
                              <option value="传说/人物">传说/人物</option>
                            </optgroup>
                            <optgroup label="种族">
                              <option value="妖族">妖族</option>
                              <option value="魔族">魔族</option>
                            </optgroup>
                            <optgroup label="其他">
                              <option value="天道/规则">天道/规则</option>
                              <option value="禁忌/诅咒">禁忌/诅咒</option>
                              <option value="自定义">自定义</option>
                            </optgroup>
                          </select>
                        </div>

                        {/* 名称 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/70 mb-1">
                            名称 <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="text"
                            value={editFormData.name || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                            className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                            placeholder="请输入名称"
                          />
                        </div>

                        {/* 动态模板字段 */}
                        {(worldTemplates[editFormData.category] || worldTemplates['自定义']).map((field) => (
                          <div key={field.key}>
                            <label className="block text-sm font-medium text-foreground/70 mb-1">
                              {field.label}
                            </label>
                            <textarea
                              value={templateFields[field.key] || ''}
                              onChange={(e) => setTemplateFields({ ...templateFields, [field.key]: e.target.value })}
                              className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground/50"
                              rows={2}
                              placeholder={field.placeholder}
                            />
                          </div>
                        ))}

                        {/* 硬性规则 */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/70 mb-1">硬性规则</label>
                          <textarea
                            value={editFormData.rules || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, rules: e.target.value })}
                            placeholder="不可违背的设定，如修炼境界、法则限制等"
                            className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground/50"
                            rows={3}
                          />
                        </div>
                      </>
                    )}

                    {/* 标签编辑 */}
                    <div>
                      <label className="block text-sm font-medium text-primary mb-1">标签</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {editFormData.tags?.map((tag: string, idx: number) => (
                          <span
                            key={idx}
                            className="px-3 py-1 text-sm bg-primary/15 text-primary border border-primary/30 rounded-full flex items-center gap-1"
                          >
                            {tag}
                            <button
                              onClick={() => handleRemoveTag(tag)}
                              className="hover:text-primary"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <input
                        type="text"
                        onKeyDown={handleAddTag}
                        placeholder="输入标签后按回车添加"
                        className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>
                )}
              </div>

              {isEditingInModal && (
                <div className="sticky bottom-0 backdrop-blur-xl bg-black/60 border-t border-border p-4 flex gap-3">
                  <button
                    onClick={handleCancelEdit}
                    className="flex-1 px-4 py-2 bg-white/5 border border-white/10 text-foreground font-semibold rounded-lg hover:bg-white/10 hover:border-primary/40 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="flex-1 px-4 py-2 bg-white/5 border border-white/10 text-foreground font-semibold rounded-lg hover:bg-white/10 hover:border-primary/40 transition-colors"
                  >
                    保存
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 添加到作品对话框 */}
        {showAddToProjectModal && selectedItem && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="backdrop-blur-xl bg-black/40 border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-white/10">
                <h2 className="text-xl font-bold text-foreground">
                  将《{selectedItem.name}》添加到...
                </h2>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {!allProjects || allProjects.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    还没有创建作品
                  </div>
                ) : (
                  <div className="space-y-3">
                    {allProjects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => setSelectedProjectId(project.id!)}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                          selectedProjectId === project.id
                            ? 'border-primary bg-primary/15'
                            : 'border-border hover:border-primary/50 bg-muted/30'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-foreground mb-1">
                              {project.name}
                            </h3>
                            {project.description && (
                              <p className="text-sm text-muted-foreground mb-2">
                                {project.description}
                              </p>
                            )}
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span>人物: {projectCounts?.[project.id!]?.characters ?? 0}</span>
                              <span>世界观: {projectCounts?.[project.id!]?.worldSettings ?? 0}</span>
                            </div>
                          </div>
                          {selectedProjectId === project.id && (
                            <div className="ml-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <span className="text-primary-foreground text-xs">✓</span>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-white/10 flex gap-3">
                <button
                  onClick={() => {
                    setShowAddToProjectModal(false);
                    setSelectedProjectId(null);
                  }}
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 text-foreground font-semibold rounded-lg hover:bg-white/10 hover:border-primary/40 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmAddToProject}
                  disabled={!selectedProjectId}
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 text-foreground font-semibold rounded-lg hover:bg-white/10 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  确认添加
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 新建卡片对话框 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="backdrop-blur-xl bg-black/40 border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-white/10">
              <h2 className="text-xl font-bold text-foreground">
                {createType === 'character' ? '新建人物卡' : '新建世界观'}
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/70 mb-1">姓名 *</label>
                  <input type="text" value={editFormData.name || ''} onChange={(e) => setEditFormData({...editFormData, name: e.target.value})} className="w-full bg-white/5 text-foreground px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50" />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-white/10 flex gap-3">
              <button onClick={() => { setShowCreateModal(false); setEditFormData({}); setTemplateFields({}); }} className="flex-1 px-4 py-2 bg-white/5 border border-white/10 text-foreground font-semibold rounded-lg hover:bg-white/10 hover:border-primary/40 transition-colors">取消</button>
              <button onClick={handleSaveNewItem} className="flex-1 px-4 py-2 bg-white/5 border border-white/10 text-foreground font-semibold rounded-lg hover:bg-white/10 hover:border-primary/40 transition-colors">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
