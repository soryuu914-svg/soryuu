import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { getSceneCardsByProject, addSceneCard, updateSceneCard, deleteSceneCard } from '../../db/sceneCard';
import type { SceneCard } from '../../types';

export default function SceneCardsPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || '0');

  const [searchText, setSearchText] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingCard, setEditingCard] = useState<SceneCard | null>(null);

  // 表单字段
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [atmosphere, setAtmosphere] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // 实时查询卡片
  const cards = useLiveQuery(() => getSceneCardsByProject(projectId), [projectId]);

  // 筛选卡片
  const filteredCards = cards?.filter((card) => {
    if (!searchText) return true;
    const searchLower = searchText.toLowerCase();
    return (
      card.title.toLowerCase().includes(searchLower) ||
      card.description.toLowerCase().includes(searchLower) ||
      card.atmosphere.toLowerCase().includes(searchLower) ||
      card.tags.some(tag => tag.toLowerCase().includes(searchLower))
    );
  });

  function openCreateDialog() {
    setEditingCard(null);
    setTitle('');
    setDescription('');
    setAtmosphere('');
    setTags([]);
    setTagInput('');
    setShowDialog(true);
  }

  function openEditDialog(card: SceneCard) {
    setEditingCard(card);
    setTitle(card.title);
    setDescription(card.description);
    setAtmosphere(card.atmosphere);
    setTags([...card.tags]);
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
    if (!title.trim()) {
      alert('标题不能为空');
      return;
    }

    if (editingCard?.id) {
      await updateSceneCard(editingCard.id, {
        title,
        description,
        atmosphere,
        tags,
      });
    } else {
      await addSceneCard({
        projectId,
        title,
        description,
        atmosphere,
        tags,
        createdAt: Date.now(),
      });
    }

    setShowDialog(false);
  }

  async function handleDelete(id: number) {
    if (!confirm('确定删除这张场景卡？')) return;
    await deleteSceneCard(id);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">场景卡</h1>
        <button
          onClick={openCreateDialog}
          className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建场景卡
        </button>
      </div>

      {/* 搜索框 */}
      <div className="mb-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索场景卡标题、内容、氛围或标签..."
            style={{ paddingLeft: '40px' }}
            className="w-full bg-background text-foreground pr-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* 卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCards?.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            暂无场景卡，点击右上角新建
          </div>
        )}
        {filteredCards?.map((card) => (
          <div
            key={card.id}
            className="glass-card rounded-xl p-5 cursor-pointer group relative hover:-translate-y-0.5 transition-transform"
            onClick={() => openEditDialog(card)}
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-semibold text-foreground flex-1">{card.title}</h3>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditDialog(card);
                  }}
                  className="p-1 text-primary hover:bg-primary/10 rounded"
                  title="编辑"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(card.id!);
                  }}
                  className="p-1 text-destructive hover:bg-destructive/10 rounded"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {card.atmosphere && (
              <div className="mb-2">
                <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20">
                  {card.atmosphere}
                </span>
              </div>
            )}
            <p className="text-sm text-muted-foreground mb-3 line-clamp-3">{card.description}</p>
            {card.tags.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {card.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 编辑对话框 */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingCard ? '编辑场景卡' : '新建场景卡'}
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
                  placeholder="如：幽暗森林"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">场景描述</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded h-32"
                  placeholder="描述这个场景的要点..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">氛围关键词</label>
                <input
                  type="text"
                  value={atmosphere}
                  onChange={(e) => setAtmosphere(e.target.value)}
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded"
                  placeholder="如：紧张、诡异、温馨"
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
    </div>
  );
}
