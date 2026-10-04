import { useParams, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Users, Globe, List, FileText, Lightbulb, Plus, ChevronRight } from 'lucide-react';
import { getProjectById, updateProject } from '../../db/project';
import { getCharactersByProject } from '../../db/character';
import { getWorldSettingsByProject } from '../../db/world';
import { getVolumesByProject, getChaptersByProject } from '../../db/outline';
import { useState, useEffect } from 'react';
import { askAI, extractJSON } from '../ai/client';
import { db } from '../../db/index';
import { handleAIError } from '../../utils/errorHandler';
import type { Inspiration } from '../../types';

export default function Workbench() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || '0');

  // 实时查询项目信息
  const project = useLiveQuery(() => getProjectById(projectId), [projectId]);

  // 实时查询统计数据
  const characters = useLiveQuery(() => getCharactersByProject(projectId), [projectId]);
  const worldSettings = useLiveQuery(() => getWorldSettingsByProject(projectId), [projectId]);
  const volumes = useLiveQuery(() => getVolumesByProject(projectId), [projectId]);
  const chapters = useLiveQuery(() => getChaptersByProject(projectId), [projectId]);

  // 金手指生成相关状态
  const [showGoldenFingerDialog, setShowGoldenFingerDialog] = useState(false);
  const [goldenFingerGenre, setGoldenFingerGenre] = useState('玄幻');
  const [goldenFingerProtagonist, setGoldenFingerProtagonist] = useState('');
  const [generatingGoldenFinger, setGeneratingGoldenFinger] = useState(false);
  const [goldenFingerCandidates, setGoldenFingerCandidates] = useState<string[]>([]);

  // 核心灵感相关状态
  const [coreInspiration, setCoreInspiration] = useState<Inspiration | null>(null);
  const [showInspirationSelectDialog, setShowInspirationSelectDialog] = useState(false);
  const [inspirationList, setInspirationList] = useState<Inspiration[]>([]);
  const [selectedInspirationId, setSelectedInspirationId] = useState<number | null>(null);
  const [inspirationSearchText, setInspirationSearchText] = useState('');
  const [inspirationFilterType, setInspirationFilterType] = useState<string>('全部');

  // 加载核心灵感
  useEffect(() => {
    if (project?.coreInspirationId) {
      loadCoreInspiration();
    } else {
      setCoreInspiration(null);
    }
  }, [project?.coreInspirationId]);

  async function loadCoreInspiration() {
    if (!project?.coreInspirationId) return;
    const inspiration = await db.inspirations.get(project.coreInspirationId);
    setCoreInspiration(inspiration || null);
  }

  async function loadInspirationList() {
    const list = await db.inspirations.orderBy('createdAt').reverse().toArray();
    setInspirationList(list);
    setInspirationSearchText('');
    setInspirationFilterType('全部');
    // 如果已有核心灵感，默认选中
    setSelectedInspirationId(project?.coreInspirationId || null);
  }

  async function handleSelectInspiration(inspirationId: number) {
    if (!project?.id) return;
    try {
      await updateProject(project.id, {
        coreInspirationId: inspirationId,
        updatedAt: Date.now(),
      });
      setShowInspirationSelectDialog(false);
      await loadCoreInspiration();
      alert('已设置核心灵感');
    } catch (error) {
      console.error('设置核心灵感失败:', error);
      alert('设置失败');
    }
  }

  // 计算总字数
  const totalWords = chapters?.reduce((sum, chapter) => {
    return sum + (chapter.content?.length || 0);
  }, 0) || 0;

  // 生成金手指
  const handleGenerateGoldenFinger = async () => {
    if (!goldenFingerProtagonist.trim()) {
      alert('请输入主角设定');
      return;
    }

    if (!coreInspiration) {
      const go = confirm('当前未设置核心灵感。建议先在作品页选择核心灵感，再生成金手指，会更有针对性。\n\n是否仍要继续生成？');
      if (!go) return;
    }

    setGeneratingGoldenFinger(true);
    try {
      const systemPrompt = `你是网文策划师。请根据用户要求生成 3 个不同的金手指方案。每个金手指要：独特、有爽点、有局限性。${coreInspiration ? '金手指必须与用户提供的【核心灵感】强相关，能够支撑这个灵感落地。' : ''}请按 JSON 数组输出，不要 markdown 包裹。

输出格式示例：
["系统流：穿越后获得修仙模拟器，可以模拟不同的修炼路线，找到最优解", "空间流：随身携带一个异次元空间，里面时间流速是外界的10倍", "重生流：重生前一天，保留未来10年记忆"]`;

      let userPrompt = `题材类型：${goldenFingerGenre}\n主角设定：${goldenFingerProtagonist}`;

      if (coreInspiration) {
        userPrompt += `\n\n【核心灵感】（金手指必须服务于这个灵感，不能脱节）\n标题：${coreInspiration.title}\n内容：${coreInspiration.content}`;
      }

      const result = await askAI({
        system: systemPrompt,
        user: userPrompt,
      });

      const parsed = extractJSON(result, 'array');
      setGoldenFingerCandidates(parsed);
    } catch (error) {
      console.error('生成金手指失败:', error);
      handleAIError(error);
    } finally {
      setGeneratingGoldenFinger(false);
    }
  };

  // 选择金手指
  const handleSelectGoldenFinger = async (goldenFinger: string) => {
    if (!project?.id) return;
    try {
      await updateProject(project.id, {
        goldenFinger,
        updatedAt: Date.now(),
      });
      setShowGoldenFingerDialog(false);
      setGoldenFingerCandidates([]);
      alert('金手指已保存');
    } catch (error) {
      console.error('保存金手指失败:', error);
      alert('保存失败');
    }
  };

  if (!project) {
    return (
      <div className="p-8">
        <div className="text-center py-16">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  const features = [
    {
      title: '人物卡',
      description: '管理小说中的角色设定',
      icon: Users,
      link: `/project/${projectId}/character`,
      count: characters?.length || 0,
    },
    {
      title: '世界观',
      description: '构建故事世界的设定',
      icon: Globe,
      link: `/project/${projectId}/world`,
      count: worldSettings?.length || 0,
    },
    {
      title: '大纲',
      description: '规划故事的章节结构',
      icon: List,
      link: `/project/${projectId}/outline`,
      count: volumes?.length || 0,
    },
    {
      title: '正文',
      description: '开始创作章节内容',
      icon: FileText,
      link: `/project/${projectId}/chapter`,
      count: chapters?.length || 0,
    },
  ];

  // 过滤灵感列表
  const filteredInspirations = inspirationList.filter((insp) => {
    const matchSearch = !inspirationSearchText ||
      insp.title.toLowerCase().includes(inspirationSearchText.toLowerCase()) ||
      (insp.content && insp.content.toLowerCase().includes(inspirationSearchText.toLowerCase()));
    const matchType = inspirationFilterType === '全部' || insp.type === inspirationFilterType;
    return matchSearch && matchType;
  });

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-6xl mx-auto p-8">
        {/* 作品信息卡 */}
        <div className="glass-card rounded-xl p-6 mb-6">
          {/* 标题行 */}
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
              )}
            </div>
          </div>

          {/* 金手指 */}
          <div className="mb-4">
            <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
              金手指
            </label>
            <div className="flex gap-2 items-center">
              <textarea
                value={project.goldenFinger || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (project.id) {
                    updateProject(project.id, {
                      goldenFinger: value || undefined,
                      updatedAt: Date.now(),
                    });
                  }
                }}
                placeholder="主角的金手指设定..."
                className="flex-1 px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-none text-foreground"
                rows={3}
              />
              <button
                onClick={() => setShowGoldenFingerDialog(true)}
                className="px-3 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors flex items-center gap-1 whitespace-nowrap h-fit"
              >
                <span className="text-sm">AI 生成</span>
              </button>
            </div>
          </div>

          {/* 核心灵感 */}
          <div>
            <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
              核心灵感
            </label>
            {coreInspiration ? (
              <div className="bg-secondary rounded-lg p-3 flex items-start gap-3">
                <Lightbulb size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-foreground">《{coreInspiration.title}》</h4>
                  {coreInspiration.content && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {coreInspiration.content}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={async () => {
                      await loadInspirationList();
                      setShowInspirationSelectDialog(true);
                    }}
                    className="px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    更换
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('确定取消核心灵感吗？')) return;
                      if (!project?.id) return;
                      try {
                        await updateProject(project.id, {
                          coreInspirationId: undefined,
                          updatedAt: Date.now(),
                        });
                        await loadCoreInspiration();
                        alert('已取消核心灵感');
                      } catch (error) {
                        console.error('取消失败:', error);
                        alert('取消失败');
                      }
                    }}
                    className="px-3 py-2 text-sm bg-card border border-destructive/30 text-destructive font-semibold rounded-lg hover:bg-destructive/10 hover:border-destructive/50 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={async () => {
                  await loadInspirationList();
                  setShowInspirationSelectDialog(true);
                }}
                className="w-full px-3 py-3 border-2 border-dashed border-primary/30 rounded-lg bg-card/50 text-muted-foreground hover:border-primary/60 hover:bg-primary/5 transition-all"
              >
                <div className="flex items-center justify-center gap-2">
                  <Plus size={20} />
                  <span>选择核心灵感</span>
                </div>
              </button>
            )}
          </div>

          {/* 写作统计（一行居中） */}
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground mt-6 pt-4 border-t border-primary/10">
            <span>📊 总字数 <b className="text-foreground">{totalWords.toLocaleString()}</b></span>
            <span>📖 章节 <b className="text-foreground">{chapters?.length || 0}</b></span>
            <span>👤 人物 <b className="text-foreground">{characters?.length || 0}</b></span>
            <span>📚 卷数 <b className="text-foreground">{volumes?.length || 0}</b></span>
          </div>
        </div>

        {/* 功能入口 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.title}
                to={feature.link}
                className="glass-card rounded-xl p-5 cursor-pointer flex items-center gap-4 group hover:-translate-y-0.5 transition-transform"
              >
                {/* 左侧圆形图标 */}
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>

                {/* 中间标题 + 描述 */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-foreground">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{feature.description}</p>
                </div>

                {/* 右侧数字 + 箭头 */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-2xl font-bold text-muted-foreground">{feature.count}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* 金手指生成对话框 */}
        {showGoldenFingerDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-xl p-6 w-[500px] shadow-xl max-h-[80vh] overflow-y-auto border border-border">
              <h3 className="text-lg font-semibold text-foreground mb-4">AI 生成金手指</h3>

              {!goldenFingerCandidates.length ? (
                <>
                  {/* 输入区 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-foreground mb-2">题材类型</label>
                    <select
                      value={goldenFingerGenre}
                      onChange={(e) => setGoldenFingerGenre(e.target.value)}
                      className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring"
                    >
                      <option value="玄幻">玄幻</option>
                      <option value="都市">都市</option>
                      <option value="仙侠">仙侠</option>
                      <option value="科幻">科幻</option>
                      <option value="历史">历史</option>
                      <option value="游戏">游戏</option>
                    </select>
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-foreground mb-2">主角设定</label>
                    <textarea
                      value={goldenFingerProtagonist}
                      onChange={(e) => setGoldenFingerProtagonist(e.target.value)}
                      placeholder="例如：现代程序员穿越到修仙世界"
                      className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring resize-none"
                      rows={3}
                    />
                  </div>

                  {/* 按钮 */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowGoldenFingerDialog(false)}
                      disabled={generatingGoldenFinger}
                      className="flex-1 px-4 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleGenerateGoldenFinger}
                      disabled={generatingGoldenFinger}
                      className="flex-1 px-4 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50"
                    >
                      {generatingGoldenFinger ? '生成中...' : '生成'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* 候选列表 */}
                  <div className="space-y-3 mb-6">
                    {goldenFingerCandidates.map((candidate, index) => (
                      <div
                        key={index}
                        onClick={() => handleSelectGoldenFinger(candidate)}
                        className="border border-border rounded-lg p-4 hover:border-primary hover:bg-accent cursor-pointer transition-all"
                      >
                        <p className="text-sm text-foreground">{candidate}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setGoldenFingerCandidates([])}
                      className="flex-1 px-4 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      重新生成
                    </button>
                    <button
                      onClick={() => {
                        setShowGoldenFingerDialog(false);
                        setGoldenFingerCandidates([]);
                      }}
                      className="flex-1 px-4 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      关闭
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 灵感选择对话框 */}
        {showInspirationSelectDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-xl p-6 w-[600px] max-h-[80vh] overflow-y-auto border border-border shadow-xl">
              <h3 className="text-lg font-semibold text-foreground mb-4">选择核心灵感</h3>

              {/* 搜索和筛选 */}
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  value={inspirationSearchText}
                  onChange={(e) => setInspirationSearchText(e.target.value)}
                  placeholder="搜索灵感..."
                  className="flex-1 px-3 py-2 bg-background border border-input rounded-lg focus:ring-2 focus:ring-ring text-foreground"
                />
                <select
                  value={inspirationFilterType}
                  onChange={(e) => setInspirationFilterType(e.target.value)}
                  className="px-3 py-2 bg-background border border-input rounded-lg focus:ring-2 focus:ring-ring text-foreground"
                >
                  <option value="全部">全部</option>
                  <option value="情节">情节</option>
                  <option value="人物">人物</option>
                  <option value="世界观">世界观</option>
                  <option value="台词">台词</option>
                  <option value="其他">其他</option>
                </select>
              </div>

              {/* 灵感列表 */}
              <div className="space-y-2 mb-6 max-h-[400px] overflow-y-auto">
                {filteredInspirations.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">没有灵感</p>
                ) : (
                  filteredInspirations.map((insp) => (
                    <div
                      key={insp.id}
                      onClick={() => insp.id && handleSelectInspiration(insp.id)}
                      className={`border rounded-lg p-3 cursor-pointer transition-all ${
                        selectedInspirationId === insp.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary hover:bg-accent'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <Lightbulb size={16} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-foreground text-sm">{insp.title}</h4>
                          {insp.content && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {insp.content}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* 按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowInspirationSelectDialog(false)}
                  className="flex-1 px-4 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
