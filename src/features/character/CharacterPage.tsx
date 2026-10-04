import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Trash2, Edit2, X, User, Users } from 'lucide-react';
import { getCharactersByProject, addCharacter, updateCharacter, deleteCharacter } from '../../db/character';
import { syncToLibrary, getAllLibraryItems } from '../../db/library';
import { db } from '../../db/index';
import { askAI, extractJSON } from '../ai/client';
import { handleAIError } from '../../utils/errorHandler';
import { getFormattedRules } from '../../utils/rejectionRules';
import RejectionRulesToggle from '../../components/RejectionRulesToggle';
import type { Character } from '../../types';

const roleLabels: Record<string, string> = {
  protagonist: '主角',
  heroine: '女主',
  supporting: '配角',
  antagonist: '反派',
};

const roleColors: Record<string, string> = {
  protagonist: 'bg-primary/15 text-primary border-primary/30',
  heroine: 'bg-primary/15 text-primary border-primary/30',
  supporting: 'bg-primary/10 text-primary/80 border-primary/20',
  antagonist: 'bg-destructive/10 text-destructive border-destructive/20',
};

// 资料库选择弹窗的角色徽章配色（独立于人物卡 roleColors，避免卡片配色调整外溢）
const libraryRoleColors: Record<string, string> = {
  protagonist: 'bg-muted text-muted-foreground border-border',
  heroine: 'bg-muted text-muted-foreground border-border',
  supporting: 'bg-muted text-muted-foreground border-border',
  antagonist: 'bg-muted text-muted-foreground border-border',
};

export default function CharacterPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || '0');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [formData, setFormData] = useState<Partial<Character>>({
    name: '',
    alias: '',
    role: 'supporting',
    identity: '',
    appearance: '',
    personality: '',
    motivation: '',
    abilities: '',
    growth: '',
  });

  // AI 生成表单数据
  const [aiFormData, setAiFormData] = useState({
    role: 'protagonist',
    genre: '玄幻',
    gender: '男',
    age: '青年',
    personality: '冷静',
    background: '',
    requirement: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiCandidates, setAiCandidates] = useState<any[]>([]);
  const [rulesEnabled, setRulesEnabled] = useState(true); // 避雷规则开关
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<number[]>([]);

  // 实时查询人物列表
  const characters = useLiveQuery(
    () => getCharactersByProject(projectId),
    [projectId]
  );

  // 实时查询资料库人物卡
  const libraryCharacters = useLiveQuery(
    () => getAllLibraryItems('character'),
    []
  );

  // 搜索 + 角色分类过滤
  const filteredCharacters = characters?.filter((char) => {
    if (selectedRole && char.role !== selectedRole) return false;
    const query = searchQuery.toLowerCase();
    return (
      char.name.toLowerCase().includes(query) ||
      char.identity?.toLowerCase().includes(query) ||
      char.alias?.toLowerCase().includes(query)
    );
  });

  const handleOpenModal = (character?: Character) => {
    if (character) {
      setEditingCharacter(character);
      setFormData({
        name: character.name,
        alias: character.alias || '',
        role: character.role || 'supporting',
        identity: character.identity || '',
        appearance: character.appearance || '',
        personality: character.personality || '',
        motivation: character.motivation || '',
        abilities: character.abilities || '',
        growth: character.growth || '',
      });
    } else {
      setEditingCharacter(null);
      setFormData({
        name: '',
        alias: '',
        role: 'supporting',
        identity: '',
        appearance: '',
        personality: '',
        motivation: '',
        abilities: '',
        growth: '',
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingCharacter(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name?.trim()) {
      alert('请输入人物姓名');
      return;
    }

    const now = Date.now();

    try {
      if (editingCharacter) {
        // 更新（不同步到资料库）
        await updateCharacter(editingCharacter.id!, {
          ...formData,
          updatedAt: now,
        });
      } else {
        // 新建
        const characterData = {
          projectId,
          name: formData.name,
          alias: formData.alias,
          role: formData.role as any,
          identity: formData.identity,
          appearance: formData.appearance,
          personality: formData.personality,
          motivation: formData.motivation,
          abilities: formData.abilities,
          growth: formData.growth,
          createdAt: now,
          updatedAt: now,
        };

        await addCharacter(characterData);

        // 获取项目名称用于资料库同步
        const project = await db.projects.get(projectId);
        const projectName = project?.name || '未知项目';

        // 自动同步到资料库
        await syncToLibrary(characterData, 'character', projectName);
      }
      handleCloseModal();
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  const handleDelete = async (character: Character) => {
    if (!confirm(`确定要删除人物《${character.name}》吗？`)) {
      return;
    }
    await deleteCharacter(character.id!);
  };

  // AI 生成人物
  const handleAIGenerate = async () => {
    if (!aiFormData.requirement.trim()) {
      alert('请输入一句话需求');
      return;
    }

    setIsGenerating(true);
    setAiCandidates([]);

    try {
      // 获取避雷规则
      const rulesPrefix = await getFormattedRules(projectId, rulesEnabled);

      const roleMap: Record<string, string> = {
        protagonist: '主角',
        heroine: '女主',
        supporting: '配角',
        antagonist: '反派',
      };

      const userPrompt = `角色定位：${roleMap[aiFormData.role]}
题材：${aiFormData.genre}
性别：${aiFormData.gender}
年龄段：${aiFormData.age}
性格倾向：${aiFormData.personality}
背景出身：${aiFormData.background || '不限'}
需求：${aiFormData.requirement}

请生成 3 个差异化的人物候选。`;

      const result = await askAI({
        system: '你是网文人物设定专家。请根据用户给出的条件，生成 3 个差异化的人物候选。请严格按 JSON 数组格式输出，每个元素包含字段：name(姓名), alias(别名), role(角色定位), identity(身份), appearance(外貌), personality(性格), motivation(目标/动机), abilities(能力), growth(成长线)。直接输出 JSON 数组，不要 markdown 包裹，不要任何解释。',
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

  // 选择候选人物
  const handleSelectCandidate = (candidate: any) => {
    setFormData({
      name: candidate.name || '',
      alias: candidate.alias || '',
      role: aiFormData.role as any,
      identity: candidate.identity || '',
      appearance: candidate.appearance || '',
      personality: candidate.personality || '',
      motivation: candidate.motivation || '',
      abilities: candidate.abilities || '',
      growth: candidate.growth || '',
    });

    setShowAIModal(false);
    setAiCandidates([]);
    setShowModal(true);
  };

  // 从资料库添加人物
  const handleAddFromLibrary = async () => {
    if (selectedLibraryIds.length === 0) {
      alert('请至少选择一个人物');
      return;
    }

    try {
      let addedCount = 0;
      const existingNames = characters?.map(c => c.name) || [];

      for (const id of selectedLibraryIds) {
        const libraryItem = libraryCharacters?.find(item => item.id === id);
        if (!libraryItem) continue;

        // 检查是否已存在同名人物
        if (existingNames.includes(libraryItem.name)) {
          console.log(`跳过已存在的人物：${libraryItem.name}`);
          continue;
        }

        // 添加到当前作品
        const characterData: Omit<Character, 'id'> = {
          projectId,
          name: libraryItem.content.name || libraryItem.name,
          alias: libraryItem.content.alias || '',
          role: libraryItem.content.role || 'supporting',
          identity: libraryItem.content.identity || '',
          appearance: libraryItem.content.appearance || '',
          personality: libraryItem.content.personality || '',
          motivation: libraryItem.content.motivation || '',
          abilities: libraryItem.content.abilities || '',
          growth: libraryItem.content.growth || '',
          tags: libraryItem.tags || [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await addCharacter(characterData);
        addedCount++;
      }

      alert(`已添加 ${addedCount} 个人物卡`);
      setShowLibraryPicker(false);
      setSelectedLibraryIds([]);
      setLibrarySearchQuery('');
    } catch (error) {
      console.error('从资料库添加失败:', error);
      alert('添加失败，请重试');
    }
  };

  // 切换资料库人物选中状态
  const toggleLibrarySelection = (id: number) => {
    setSelectedLibraryIds(prev =>
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    );
  };

  if (!characters) {
    return <div className="p-8">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-[1400px] mx-auto p-8">
        {/* 头部 */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">人物卡</h1>
            <p className="text-sm text-muted-foreground mt-1">共 {characters.length} 个人物</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowLibraryPicker(true)}
              className="flex items-center gap-2 px-4 py-2 h-10 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
            >
              从资料库选择
            </button>
            <button
              onClick={() => setShowAIModal(true)}
              className="flex items-center gap-2 px-4 py-2 h-10 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
            >
              AI 生成人物
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-4 py-2 h-10 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
            >
              新建人物
            </button>
          </div>
        </div>

      <div className="glass-card rounded-xl flex items-stretch overflow-hidden">
        {/* 左栏：角色分类筛选 */}
        <aside className="w-48 shrink-0 hidden lg:block border-r border-border">
          <div className="p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
              角色分类
            </h3>
            <div className="space-y-1">
              {Object.entries(roleLabels).map(([key, label]) => {
                const count = characters?.filter((c) => c.role === key).length || 0;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedRole(selectedRole === key ? null : key)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                      selectedRole === key
                        ? 'bg-primary/15 text-primary border-l-2 border-primary'
                        : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-xs opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* 中间：搜索 + 卡片网格 */}
        <div className="flex-1 min-w-0 p-6">

      {/* 搜索框 */}
      <div className="mb-6 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索人物姓名、身份..."
            style={{ paddingLeft: '40px' }}
            className="w-full pr-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
          />
        </div>
      </div>

      {/* 人物列表 */}
      {filteredCharacters && filteredCharacters.length === 0 ? (
        <div className="text-center py-16 glass-card rounded-xl">
          <Users size={48} className="mx-auto text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground mb-4">
            {searchQuery ? '没有找到匹配的人物' : '还没有人物'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => handleOpenModal()}
              className="px-6 py-2.5 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
            >
              创建第一个人物
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredCharacters?.map((character) => (
            <div
              key={character.id}
              onClick={() => setSelectedCharacter(character)}
              className="glass-card rounded-xl p-5 cursor-pointer group relative hover:-translate-y-0.5 transition-transform flex flex-col items-center text-center min-h-[220px]"
            >
              {/* 姓名居中 */}
              <h3 className="text-base font-semibold text-foreground truncate w-full mb-1">
                {character.name}
              </h3>

              {/* 角色 badge 居中 */}
              {character.role && (
                <span
                  className={`px-2 py-0.5 text-xs rounded-full border mb-2 ${
                    roleColors[character.role]
                  }`}
                >
                  {roleLabels[character.role]}
                </span>
              )}

              {/* 身份小字居中 */}
              <p className="text-xs text-muted-foreground truncate w-full">
                {character.identity || '未设定身份'}
              </p>

              {/* 性格摘要 */}
              <p className="text-xs text-muted-foreground line-clamp-2 mt-2 w-full">
                {character.personality || ''}
              </p>

              {/* 底部分隔线 */}
              <div className="border-t border-primary/10 w-full mt-auto pt-3" />

              {/* 标签居中 */}
              <div className="flex flex-wrap gap-1.5 justify-center mt-2 w-full">
                {character.motivation && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary line-clamp-1">
                    {character.motivation.slice(0, 8)}
                  </span>
                )}
                {character.abilities && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary line-clamp-1">
                    {character.abilities.slice(0, 8)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
        </div>

        {/* 右栏：人物详情（占位，第 3 批填充） */}
        <aside className="w-80 shrink-0 hidden xl:block border-l border-border">
          <div className="p-5">
            {!selectedCharacter ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>点击卡片查看人物详情</p>
              </div>
            ) : (
              <>
                {/* 头像 */}
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <User className="w-10 h-10 text-primary" />
                </div>

                {/* 名字 + 角色 */}
                <h2 className="text-lg font-bold text-foreground text-center mb-2">
                  {selectedCharacter.name}
                </h2>
                {selectedCharacter.role && (
                  <div className="text-center mb-4">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full border ${roleColors[selectedCharacter.role]}`}>
                      {roleLabels[selectedCharacter.role]}
                    </span>
                  </div>
                )}

                {/* 字段列表 */}
                <div className="space-y-3 text-sm">
                  {selectedCharacter.alias && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">别名</p>
                      <p className="text-foreground">{selectedCharacter.alias}</p>
                    </div>
                  )}
                  {selectedCharacter.identity && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">身份</p>
                      <p className="text-foreground">{selectedCharacter.identity}</p>
                    </div>
                  )}
                  {selectedCharacter.appearance && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">外貌</p>
                      <p className="text-foreground">{selectedCharacter.appearance}</p>
                    </div>
                  )}
                  {selectedCharacter.personality && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">性格</p>
                      <p className="text-foreground">{selectedCharacter.personality}</p>
                    </div>
                  )}
                  {selectedCharacter.motivation && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">目标/动机</p>
                      <p className="text-foreground">{selectedCharacter.motivation}</p>
                    </div>
                  )}
                  {selectedCharacter.abilities && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">能力</p>
                      <p className="text-foreground">{selectedCharacter.abilities}</p>
                    </div>
                  )}
                  {selectedCharacter.growth && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">成长线</p>
                      <p className="text-foreground">{selectedCharacter.growth}</p>
                    </div>
                  )}
                </div>

                {/* 底部操作 */}
                <div className="flex gap-2 mt-5 pt-4 border-t border-border">
                  <button
                    onClick={() => {
                      handleOpenModal(selectedCharacter);
                      setSelectedCharacter(null);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    编辑
                  </button>
                  <button
                    onClick={() => {
                      handleDelete(selectedCharacter);
                      setSelectedCharacter(null);
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
          <div className="bg-card rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border shadow-lg">
            <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">
                {editingCharacter ? '编辑人物' : '新建人物'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-1.5 hover:bg-muted rounded font-semibold transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* 姓名 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  姓名 <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                  placeholder="请输入人物姓名"
                  autoFocus
                />
              </div>

              {/* 别名 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  别名
                </label>
                <input
                  type="text"
                  value={formData.alias}
                  onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                  placeholder="如：绰号、笔名等"
                />
              </div>

              {/* 角色定位 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  角色定位
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                >
                  <option value="protagonist">主角</option>
                  <option value="heroine">女主</option>
                  <option value="supporting">配角</option>
                  <option value="antagonist">反派</option>
                </select>
              </div>

              {/* 身份 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  身份
                </label>
                <input
                  type="text"
                  value={formData.identity}
                  onChange={(e) => setFormData({ ...formData, identity: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                  placeholder="如：修士、商人、王子等"
                />
              </div>

              {/* 外貌 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  外貌
                </label>
                <textarea
                  value={formData.appearance}
                  onChange={(e) => setFormData({ ...formData, appearance: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-none text-foreground"
                  rows={2}
                  placeholder="描述外貌特征"
                />
              </div>

              {/* 性格 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  性格
                </label>
                <textarea
                  value={formData.personality}
                  onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-none text-foreground"
                  rows={2}
                  placeholder="性格特点、行为方式"
                />
              </div>

              {/* 目标/动机 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  目标/动机
                </label>
                <textarea
                  value={formData.motivation}
                  onChange={(e) => setFormData({ ...formData, motivation: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-none text-foreground"
                  rows={2}
                  placeholder="人物的追求、欲望、核心驱动力"
                />
              </div>

              {/* 能力 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  能力
                </label>
                <textarea
                  value={formData.abilities}
                  onChange={(e) => setFormData({ ...formData, abilities: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-none text-foreground"
                  rows={2}
                  placeholder="技能、天赋、特殊能力"
                />
              </div>

              {/* 成长线 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  成长线
                </label>
                <textarea
                  value={formData.growth}
                  onChange={(e) => setFormData({ ...formData, growth: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-none text-foreground"
                  rows={3}
                  placeholder="人物的成长轨迹、转折点"
                />
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

      {/* AI 生成人物弹窗 */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border shadow-lg">
            <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">AI 生成人物</h2>
              <button
                onClick={() => {
                  setShowAIModal(false);
                  setAiCandidates([]);
                }}
                className="p-1.5 hover:bg-muted rounded font-semibold transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 参数输入区 */}
              {aiCandidates.length === 0 && (
                <>
                  {/* 角色定位 */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      角色定位
                    </label>
                    <select
                      value={aiFormData.role}
                      onChange={(e) => setAiFormData({ ...aiFormData, role: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                    >
                      <option value="protagonist">主角</option>
                      <option value="heroine">女主</option>
                      <option value="supporting">配角</option>
                      <option value="antagonist">反派</option>
                    </select>
                  </div>

                  {/* 题材 */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      题材
                    </label>
                    <select
                      value={aiFormData.genre}
                      onChange={(e) => setAiFormData({ ...aiFormData, genre: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                    >
                      <option value="玄幻">玄幻</option>
                      <option value="都市">都市</option>
                      <option value="仙侠">仙侠</option>
                      <option value="科幻">科幻</option>
                      <option value="历史">历史</option>
                      <option value="其他">其他</option>
                    </select>
                  </div>

                  {/* 性别 */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      性别
                    </label>
                    <select
                      value={aiFormData.gender}
                      onChange={(e) => setAiFormData({ ...aiFormData, gender: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                    >
                      <option value="男">男</option>
                      <option value="女">女</option>
                      <option value="不限">不限</option>
                    </select>
                  </div>

                  {/* 年龄段 */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      年龄段
                    </label>
                    <select
                      value={aiFormData.age}
                      onChange={(e) => setAiFormData({ ...aiFormData, age: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                    >
                      <option value="少年">少年</option>
                      <option value="青年">青年</option>
                      <option value="中年">中年</option>
                      <option value="老年">老年</option>
                      <option value="不限">不限</option>
                    </select>
                  </div>

                  {/* 性格倾向 */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      性格倾向
                    </label>
                    <select
                      value={aiFormData.personality}
                      onChange={(e) => setAiFormData({ ...aiFormData, personality: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                    >
                      <option value="冷静">冷静</option>
                      <option value="热血">热血</option>
                      <option value="腹黑">腹黑</option>
                      <option value="憨厚">憨厚</option>
                      <option value="傲娇">傲娇</option>
                      <option value="阴郁">阴郁</option>
                      <option value="开朗">开朗</option>
                      <option value="不拘一格">不拘一格</option>
                    </select>
                  </div>

                  {/* 背景出身 */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      背景出身
                    </label>
                    <input
                      type="text"
                      value={aiFormData.background}
                      onChange={(e) => setAiFormData({ ...aiFormData, background: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                      placeholder="例如：没落世家子弟、散修、宗门弃徒"
                    />
                  </div>

                  {/* 一句话需求 */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      一句话需求
                    </label>
                    <textarea
                      value={aiFormData.requirement}
                      onChange={(e) => setAiFormData({ ...aiFormData, requirement: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-none text-foreground"
                      rows={3}
                      placeholder="例如：沉默寡言的剑修，背负血仇"
                      autoFocus
                    />
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
                      className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                      disabled={isGenerating}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleAIGenerate}
                      className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isGenerating}
                    >
                      {isGenerating ? '生成中...' : '生成'}
                    </button>
                  </div>
                </>
              )}

              {/* 候选展示区 */}
              {aiCandidates.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">请选择一个候选人物：</p>
                  {aiCandidates.map((candidate, index) => (
                    <div
                      key={index}
                      className="border border-border rounded-lg p-4 hover:border-primary hover:bg-accent transition-all"
                    >
                      <div className="mb-3">
                        <h3 className="text-lg font-bold text-foreground">
                          {candidate.name}
                          {candidate.alias && (
                            <span className="text-sm text-muted-foreground font-normal ml-2">
                              ({candidate.alias})
                            </span>
                          )}
                        </h3>
                        {candidate.identity && (
                          <p className="text-sm text-muted-foreground mt-1">身份：{candidate.identity}</p>
                        )}
                      </div>
                      <div className="space-y-2 text-sm mb-4">
                        {candidate.personality && (
                          <p className="text-foreground">
                            <span className="font-medium">性格：</span>
                            {candidate.personality}
                          </p>
                        )}
                        {candidate.motivation && (
                          <p className="text-foreground">
                            <span className="font-medium">动机：</span>
                            {candidate.motivation}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleSelectCandidate(candidate)}
                        className="w-full px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                      >
                        选择这个
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setAiCandidates([])}
                    className="w-full px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    重新生成
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 从资料库选择弹窗 */}
      {showLibraryPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-border shadow-lg">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">从资料库选择人物卡</h2>
              <button
                onClick={() => {
                  setShowLibraryPicker(false);
                  setSelectedLibraryIds([]);
                  setLibrarySearchQuery('');
                }}
                className="p-1.5 hover:bg-muted rounded font-semibold transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* 搜索框 */}
            <div className="px-6 pt-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={librarySearchQuery}
                  onChange={(e) => setLibrarySearchQuery(e.target.value)}
                  placeholder="搜索人物姓名、身份..."
                  style={{ paddingLeft: '40px' }}
                  className="w-full pr-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                />
              </div>
            </div>

            {/* 资料库人物列表 */}
            <div className="flex-1 overflow-y-auto p-6">
              {!libraryCharacters || libraryCharacters.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="mb-2">资料库还没有人物卡</p>
                  <p className="text-sm">在任意作品中新建人物卡时会自动存入资料库</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {libraryCharacters
                    .filter(item => {
                      if (!librarySearchQuery) return true;
                      const query = librarySearchQuery.toLowerCase();
                      return (
                        item.name.toLowerCase().includes(query) ||
                        item.content.identity?.toLowerCase().includes(query)
                      );
                    })
                    .map((item) => (
                      <div
                        key={item.id}
                        onClick={() => toggleLibrarySelection(item.id!)}
                        className={`border rounded-lg p-4 cursor-pointer transition-all ${
                          selectedLibraryIds.includes(item.id!)
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* 勾选框 */}
                          <div className="mt-1">
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                selectedLibraryIds.includes(item.id!)
                                  ? 'bg-primary border-primary'
                                  : 'border-input'
                              }`}
                            >
                              {selectedLibraryIds.includes(item.id!) && (
                                <span className="text-white text-xs">✓</span>
                              )}
                            </div>
                          </div>

                          {/* 人物信息 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-foreground truncate">
                                {item.name}
                              </h3>
                              {item.content.role && (
                                <span
                                  className={`px-2 py-0.5 text-xs rounded-full border shrink-0 ${
                                    libraryRoleColors[item.content.role]
                                  }`}
                                >
                                  {roleLabels[item.content.role]}
                                </span>
                              )}
                            </div>
                            {item.content.identity && (
                              <p className="text-xs text-muted-foreground mb-2">
                                {item.content.identity}
                              </p>
                            )}
                            {item.content.personality && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {item.content.personality}
                              </p>
                            )}
                            {item.sourceProjectName && (
                              <p className="text-xs text-muted-foreground mt-2">
                                来源：{item.sourceProjectName}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="p-4 border-t border-border flex gap-3">
              <button
                onClick={() => {
                  setShowLibraryPicker(false);
                  setSelectedLibraryIds([]);
                  setLibrarySearchQuery('');
                }}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddFromLibrary}
                disabled={selectedLibraryIds.length === 0}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                添加到本书（已选 {selectedLibraryIds.length} 个）
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
