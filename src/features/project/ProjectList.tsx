import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, BookOpen, Clock, FileText, Upload } from 'lucide-react';
import { getAllProjects, addProject, deleteProject } from '../../db/project';
import { getChaptersByProject } from '../../db/outline';
import { getAllBookAnalyses } from '../../db/bookAnalysis';
import { askAI, extractJSON } from '../ai/client';
import { handleAIError } from '../../utils/errorHandler';
import ImportDialog from '../import/ImportDialog';

export default function ProjectList() {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    genre: '',
  });

  // AI 生成相关状态
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiFormData, setAiFormData] = useState({
    genre: '玄幻',
    styleKeywords: '',
    requirement: '',
    referenceBook: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiCandidates, setAiCandidates] = useState<any[]>([]);

  // 使用 Dexie React Hooks 实时查询
  const projects = useLiveQuery(() => getAllProjects(), []);

  // 查询书库数据
  const bookAnalyses = useLiveQuery(() => getAllBookAnalyses(), []);

  // 计算每个项目的字数
  const projectStats = useLiveQuery(async () => {
    if (!projects) return {};

    const stats: Record<number, number> = {};
    for (const project of projects) {
      const chapters = await getChaptersByProject(project.id!);
      const wordCount = chapters.reduce((sum, chapter) => {
        return sum + (chapter.content?.length || 0);
      }, 0);
      stats[project.id!] = wordCount;
    }
    return stats;
  }, [projects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('请输入作品名称');
      return;
    }

    const now = Date.now();
    const projectId = await addProject({
      name: formData.name,
      description: formData.description || undefined,
      genre: formData.genre || undefined,
      createdAt: now,
      updatedAt: now,
    });

    setShowModal(false);
    setFormData({ name: '', description: '', genre: '' });

    // 跳转到工作台
    navigate(`/project/${projectId}`);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确定要删除《${name}》吗？此操作不可恢复。`)) {
      return;
    }

    await deleteProject(id);
  };

  // AI 生成书名和简介
  const handleAIGenerate = async () => {
    setIsGenerating(true);
    setAiCandidates([]);

    try {
      const systemPrompt = `你是网文起名专家。请根据用户给出的题材、风格和需求，生成 3 组候选的『书名+简介』。
请严格按 JSON 数组格式输出，每个元素包含字段：title(书名), synopsis(简介)。
简介控制在 100-150 字，突出爽点和核心冲突，吸引读者。
直接输出 JSON 数组，不要 markdown 包裹，不要任何解释。`;

      let userPrompt = `题材类型：${aiFormData.genre}\n`;
      if (aiFormData.styleKeywords) {
        userPrompt += `风格关键词：${aiFormData.styleKeywords}\n`;
      }
      if (aiFormData.requirement) {
        userPrompt += `一句话需求：${aiFormData.requirement}\n`;
      }

      // 如果选择了参考书籍，加入文风信息
      if (aiFormData.referenceBook && bookAnalyses) {
        const refBook = bookAnalyses.find(b => b.id === parseInt(aiFormData.referenceBook));
        if (refBook) {
          userPrompt += `\n参考文风：${refBook.style}\n`;
          userPrompt += `参考结构：${refBook.structure}\n`;
          userPrompt += `参考节奏：${refBook.pacing}\n`;
        }
      }

      const result = await askAI({
        system: systemPrompt,
        user: userPrompt,
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

  // 选择候选
  const handleSelectCandidate = (candidate: any) => {
    setFormData({
      ...formData,
      name: candidate.title || '',
      description: candidate.synopsis || '',
    });

    setShowAIModal(false);
    setAiCandidates([]);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  if (!projects) {
    return <div className="p-8">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-7xl mx-auto p-8">
        {/* 头部 */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">我的作品</h1>
            <p className="text-sm text-muted-foreground mt-1">共 {projects.length} 部作品</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 h-10 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
            >
              <Upload size={18} />
              导入稿件
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
            >
              <Plus size={18} />
              新建作品
            </button>
          </div>
        </div>

      {/* 作品列表 */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <BookOpen size={64} className="text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground mb-6">还没有作品</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
          >
            创建第一部作品
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project) => (
            <div key={project.id} className="relative group">
              <div
                className="glass-card rounded-xl p-6 cursor-pointer hover:-translate-y-0.5 transition-transform"
                onClick={() => navigate(`/project/${project.id}`)}
              >
                {/* 顶部：图标 + 书名 */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-foreground truncate">
                      {project.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      最近编辑
                    </p>
                  </div>
                </div>

                {/* 简介 */}
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[2.5em]">
                  {project.description || '暂无简介'}
                </p>

                {/* 底部分隔线 */}
                <div className="border-t border-primary/10 mb-3" />

                {/* 底部信息 */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    {projectStats?.[project.id!] || 0} 字
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDate(project.updatedAt)}
                  </span>
                </div>

                {/* hover 时显示的删除按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(project.id!, project.name);
                  }}
                  className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity
                             w-7 h-7 rounded-md flex items-center justify-center
                             text-destructive hover:bg-destructive/10"
                  title="删除作品"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {/* 新建作品占位卡 */}
          <div
            onClick={() => setShowModal(true)}
            className="rounded-xl p-6 cursor-pointer flex flex-col items-center justify-center min-h-[200px]
                       border-2 border-dashed border-primary/20
                       hover:border-primary/50 hover:bg-primary/5 transition-all"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Plus className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">新建作品</p>
          </div>
        </div>
      )}

      {/* 新建作品弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 w-full max-w-md border border-border shadow-lg">
            <h2 className="text-2xl font-bold text-foreground mb-4">新建作品</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    作品名称 <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                    placeholder="请输入作品名称"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    作品简介
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-none text-foreground"
                    rows={3}
                    placeholder="简要描述一下你的作品"
                  />
                </div>

                {/* AI 生成按钮 */}
                <div className="flex justify-center -mt-2">
                  <button
                    type="button"
                    onClick={() => setShowAIModal(true)}
                    className="flex items-center gap-2 px-4 py-2 h-10 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    AI 生成书名和简介
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    题材类型
                  </label>
                  <input
                    type="text"
                    value={formData.genre}
                    onChange={(e) =>
                      setFormData({ ...formData, genre: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                    placeholder="如：玄幻、都市、科幻等"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setFormData({ name: '', description: '', genre: '' });
                  }}
                  className="flex-1 px-4 py-2 h-9 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 h-9 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors shadow-sm"
                >
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI 生成二级弹窗 */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-card rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border shadow-lg">
            <h2 className="text-2xl font-bold text-foreground mb-4">AI 生成书名和简介</h2>

            {/* 表单区域 */}
            {aiCandidates.length === 0 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    题材类型 <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={aiFormData.genre}
                    onChange={(e) =>
                      setAiFormData({ ...aiFormData, genre: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                  >
                    <option value="玄幻">玄幻</option>
                    <option value="都市">都市</option>
                    <option value="仙侠">仙侠</option>
                    <option value="科幻">科幻</option>
                    <option value="历史">历史</option>
                    <option value="悬疑">悬疑</option>
                    <option value="其他">其他</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    风格关键词
                  </label>
                  <input
                    type="text"
                    value={aiFormData.styleKeywords}
                    onChange={(e) =>
                      setAiFormData({ ...aiFormData, styleKeywords: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                    placeholder="如：热血、爽文、系统流"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    一句话需求
                  </label>
                  <input
                    type="text"
                    value={aiFormData.requirement}
                    onChange={(e) =>
                      setAiFormData({ ...aiFormData, requirement: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                    placeholder="如：少年逆袭、打脸虐渣"
                  />
                </div>

                {/* 参考书籍（如果有书库） */}
                {bookAnalyses && bookAnalyses.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      参考书籍（可选）
                    </label>
                    <select
                      value={aiFormData.referenceBook}
                      onChange={(e) =>
                        setAiFormData({ ...aiFormData, referenceBook: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                    >
                      <option value="">不参考</option>
                      {bookAnalyses.map((book) => (
                        <option key={book.id} value={book.id}>
                          {book.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAIModal(false);
                      setAiFormData({
                        genre: '玄幻',
                        styleKeywords: '',
                        requirement: '',
                        referenceBook: '',
                      });
                    }}
                    className="flex-1 px-4 py-2 h-9 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleAIGenerate}
                    disabled={isGenerating}
                    className="flex-1 px-4 py-2 h-9 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {isGenerating ? '生成中...' : '生成候选'}
                  </button>
                </div>
              </div>
            )}

            {/* 候选展示区域 */}
            {aiCandidates.length > 0 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  点击任意候选即可自动填充到作品信息中
                </p>

                <div className="space-y-3">
                  {aiCandidates.map((candidate, index) => (
                    <div
                      key={index}
                      onClick={() => handleSelectCandidate(candidate)}
                      className="border border-border rounded-lg p-4 hover:border-primary hover:bg-accent cursor-pointer transition-all"
                    >
                      <h3 className="text-lg font-bold text-foreground mb-2">
                        {candidate.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {candidate.synopsis}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setAiCandidates([]);
                    }}
                    className="flex-1 px-4 py-2 h-9 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors"
                  >
                    重新生成
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAIModal(false);
                      setAiCandidates([]);
                    }}
                    className="flex-1 px-4 py-2 h-9 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors"
                  >
                    关闭
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 导入稿子（TXT / MD / .docx） */}
      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onImported={(projectId) => {
            setShowImport(false);
            // 导入完直接进工作台，省得用户再自己找一遍
            navigate(`/project/${projectId}`);
          }}
        />
      )}
      </div>
    </div>
  );
}
