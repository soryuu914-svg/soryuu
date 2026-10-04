import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, Edit2, X, BookOpen, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '../../db/index';
import {
  getVolumesByProject,
  addVolume,
  updateVolume,
  deleteVolume,
  getChaptersByVolume,
  getChaptersByProject,
  addChapter,
  updateChapter,
  deleteChapter,
} from '../../db/outline';
import { getCharactersByProject } from '../../db/character';
import { getWorldSettingsByProject } from '../../db/world';
import { getAllBookAnalyses } from '../../db/bookAnalysis';
import { readTechniquesByCategory } from '../../db/writingStyle';
import { askAI, extractJSON } from '../../features/ai/client';
import { handleAIError } from '../../utils/errorHandler';
import { getFormattedRules } from '../../utils/rejectionRules';
import RejectionRulesToggle from '../../components/RejectionRulesToggle';
import type { Volume, Chapter } from '../../types';

const statusLabels: Record<string, string> = {
  todo: '未开始',
  draft: '草稿',
  finished: '已完稿',
};

const statusColors: Record<string, string> = {
  todo: 'bg-muted text-foreground',
  draft: 'bg-primary/10 text-primary',
  finished: 'bg-primary/10 text-primary',
};

// 情绪基调颜色映射
function getEmotionColor(emotion: string): string {
  const colors: Record<string, string> = {
    紧张: 'bg-red-50 text-red-700 border-red-200',
    压抑: 'bg-muted text-foreground border-input',
    热血: 'bg-background text-orange-700 border-orange-200',
    温情: 'bg-pink-50 text-pink-700 border-pink-200',
    悬疑: 'bg-purple-50 text-purple-700 border-purple-200',
    爽快: 'bg-background text-yellow-700 border-yellow-200',
    悲壮: 'bg-blue-50 text-blue-700 border-blue-200',
    轻松: 'bg-green-50 text-green-700 border-green-200',
    震撼: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    平淡: 'bg-muted text-muted-foreground border-border',
  };
  return colors[emotion] || 'bg-muted text-muted-foreground border-border';
}

export default function OutlinePage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || '0');

  const [selectedVolumeId, setSelectedVolumeId] = useState<number | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [showVolumeModal, setShowVolumeModal] = useState(false);
  const [showChapterModal, setShowChapterModal] = useState(false);
  const [editingVolume, setEditingVolume] = useState<Volume | null>(null);
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);

  const [volumeFormData, setVolumeFormData] = useState<Partial<Volume>>({
    title: '',
    summary: '',
    hook: '',
    climax: '',
    volumeStructure: '',
  });

  const [chapterFormData, setChapterFormData] = useState<Partial<Chapter>>({
    title: '',
    outline: '',
    hook: '',
    climax: '',
    chapterStructure: '',
    emotion: '',
    emotionIntensity: undefined,
    status: 'todo',
  });

  // AI 生成相关状态
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiFormData, setAiFormData] = useState({
    genre: '玄幻',
    protagonist: '',
    goldenFinger: '',
    requirement: '',
    referenceBook: '',
    globalStructure: '',
  });

  // 卷列表配置（结构驱动）
  type VolumeConfig = {
    name: string;
    volumeStructure: string;
    slots: Array<{
      name: string;
      chapterStructure: string; // "AI自动判断" 或具体结构
    }>;
  };
  const [volumeConfigs, setVolumeConfigs] = useState<VolumeConfig[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<any[]>([]);
  const [expandedVolumes, setExpandedVolumes] = useState<Set<number>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [rulesEnabled, setRulesEnabled] = useState(true); // 避雷规则开关

  // 编辑相关状态
  const [editingVolumeIndex, setEditingVolumeIndex] = useState<number | null>(null);
  const [editingVolumeData, setEditingVolumeData] = useState<any>(null);

  // 章节重写相关状态
  const [rewritingChapterId, setRewritingChapterId] = useState<number | null>(null);

  // 重新总结卷纲相关状态
  const [summarizingVolumeId, setSummarizingVolumeId] = useState<number | null>(null);

  // 重新生成本章细纲相关状态
  const [regeneratingOutlineChapterId, setRegeneratingOutlineChapterId] = useState<number | null>(null);
  const [showOutlinePreview, setShowOutlinePreview] = useState(false);
  const [outlinePreviewData, setOutlinePreviewData] = useState<{
    chapterId: number;
    oldOutline: string;
    newOutline: string;
  } | null>(null);

  // 核心灵感状态
  const [coreInspiration, setCoreInspiration] = useState<any>(null);

  // 查询上下文数据
  const characters = useLiveQuery(() => getCharactersByProject(projectId), [projectId]);
  const worldSettings = useLiveQuery(() => getWorldSettingsByProject(projectId), [projectId]);
  const bookAnalyses = useLiveQuery(() => getAllBookAnalyses(), []);

  // 实时查询卷和章节
  const volumes = useLiveQuery(() => getVolumesByProject(projectId), [projectId]);
  const allChapters = useLiveQuery(() => getChaptersByProject(projectId), [projectId]);

  // 实时查询当前项目信息（用于读取 globalStructure）
  const project = useLiveQuery(() => {
    return db.projects.get(projectId);
  }, [projectId]);

  // 加载核心灵感
  useEffect(() => {
    if (project?.coreInspirationId) {
      db.inspirations.get(project.coreInspirationId).then(setCoreInspiration);
    } else {
      setCoreInspiration(null);
    }
  }, [project?.coreInspirationId]);

  // 统计每卷的章节数
  const volumeChapterCounts = volumes?.reduce((acc, vol) => {
    acc[vol.id!] = allChapters?.filter(ch => ch.volumeId === vol.id).length || 0;
    return acc;
  }, {} as Record<number, number>);

  // 当项目加载后，不再初始化 globalStructure（默认"不指定"）
  useEffect(() => {
    // 移除自动初始化逻辑
  }, [project]);

  // 当 globalStructure 变化时，自动生成默认卷列表
  useEffect(() => {
    if (!aiFormData.globalStructure) {
      setVolumeConfigs([]);
      return;
    }

    // 如果已有配置，提示用户切换会丢失
    if (volumeConfigs.length > 0) {
      if (!confirm('切换全书结构会重置所有卷配置，确定吗？')) {
        // 用户取消，恢复旧值
        setAiFormData(prev => ({ ...prev, globalStructure: '' }));
        return;
      }
    }

    const defaultVolumes = getDefaultVolumesByStructure(aiFormData.globalStructure);
    setVolumeConfigs(defaultVolumes);
  }, [aiFormData.globalStructure]);

  // 根据全书结构返回默认卷列表
  const getDefaultVolumesByStructure = (structure: string): VolumeConfig[] => {
    switch (structure) {
      case '三幕式':
        return [
          { name: '第一幕', volumeStructure: '', slots: [] },
          { name: '第二幕', volumeStructure: '', slots: [] },
          { name: '第三幕', volumeStructure: '', slots: [] },
        ];
      case '英雄之旅':
        return [
          { name: '平凡世界', volumeStructure: '', slots: [] },
          { name: '冒险召唤', volumeStructure: '', slots: [] },
          { name: '拒绝召唤', volumeStructure: '', slots: [] },
          { name: '遇见导师', volumeStructure: '', slots: [] },
          { name: '跨越第一道门槛', volumeStructure: '', slots: [] },
          { name: '试炼·盟友·敌人', volumeStructure: '', slots: [] },
          { name: '进入最深洞穴', volumeStructure: '', slots: [] },
          { name: '磨难', volumeStructure: '', slots: [] },
          { name: '奖赏', volumeStructure: '', slots: [] },
          { name: '返回之路', volumeStructure: '', slots: [] },
          { name: '复活', volumeStructure: '', slots: [] },
          { name: '带着灵药归来', volumeStructure: '', slots: [] },
        ];
      case '起承转合':
        return [
          { name: '起', volumeStructure: '', slots: [] },
          { name: '承', volumeStructure: '', slots: [] },
          { name: '转', volumeStructure: '', slots: [] },
          { name: '合', volumeStructure: '', slots: [] },
        ];
      case '双线并行':
        return [
          { name: 'A线', volumeStructure: '', slots: [] },
          { name: 'B线', volumeStructure: '', slots: [] },
        ];
      case '群像式':
        return [
          { name: '第一卷', volumeStructure: '', slots: [] },
        ];
      default:
        return [];
    }
  };

  // 根据卷结构返回槽位列表
  const getSlotsByVolumeStructure = (structure: string): Array<{ name: string; chapterStructure: string }> => {
    switch (structure) {
      case '七点结构法':
        return [
          { name: '钩子', chapterStructure: '悬念前置' },
          { name: '转折1', chapterStructure: '动作开场' },
          { name: 'pinch1', chapterStructure: '单线推进' },
          { name: '中点', chapterStructure: '悬念前置' },
          { name: 'pinch2', chapterStructure: '单线推进' },
          { name: '转折2', chapterStructure: '动作开场' },
          { name: '结局', chapterStructure: '动作开场' },
        ];
      case '起承转合':
        return [
          { name: '起', chapterStructure: '单线推进' },
          { name: '承', chapterStructure: '单线推进' },
          { name: '转', chapterStructure: '悬念前置' },
          { name: '合', chapterStructure: '动作开场' },
        ];
      case '单元剧':
        return [
          { name: '开场', chapterStructure: '动作开场' },
          { name: '发展', chapterStructure: '单线推进' },
          { name: '高潮', chapterStructure: '动作开场' },
          { name: '反转', chapterStructure: '悬念前置' },
          { name: '收尾', chapterStructure: '单线推进' },
        ];
      case '双线交叉':
        return [
          { name: 'A线1', chapterStructure: '单线推进' },
          { name: 'B线1', chapterStructure: '单线推进' },
          { name: 'A线2', chapterStructure: '多线切换' },
          { name: 'B线2', chapterStructure: '多线切换' },
          { name: 'A汇合', chapterStructure: '动作开场' },
          { name: 'B汇合', chapterStructure: '动作开场' },
        ];
      case '闭环式':
        return [
          { name: '悬念', chapterStructure: '悬念前置' },
          { name: '展开', chapterStructure: '单线推进' },
          { name: '假结局', chapterStructure: '单线推进' },
          { name: '反转', chapterStructure: '倒叙开场' },
          { name: '真结局', chapterStructure: '动作开场' },
        ];
      case '递进式':
        return [
          { name: '初阶', chapterStructure: '单线推进' },
          { name: '中阶', chapterStructure: '单线推进' },
          { name: '高阶', chapterStructure: '动作开场' },
          { name: '巅峰', chapterStructure: '动作开场' },
          { name: '突破', chapterStructure: '悬念前置' },
        ];
      default:
        return [];
    }
  };

  // 更新卷配置的卷结构
  const handleVolumeStructureChange = (volIdx: number, structure: string) => {
    // 如果已有槽位，提示用户切换会丢失
    if (volumeConfigs[volIdx].slots.length > 0) {
      if (!confirm('切换卷结构会重置该卷的章节配置，确定吗？')) {
        return;
      }
    }

    const newConfigs = [...volumeConfigs];
    newConfigs[volIdx].volumeStructure = structure;
    newConfigs[volIdx].slots = getSlotsByVolumeStructure(structure);
    setVolumeConfigs(newConfigs);
  };

  // 更新卷名
  const handleVolumeNameChange = (volIdx: number, name: string) => {
    const newConfigs = [...volumeConfigs];
    newConfigs[volIdx].name = name;
    setVolumeConfigs(newConfigs);
  };

  // 更新槽位的章结构
  const handleSlotStructureChange = (volIdx: number, slotIdx: number, structure: string) => {
    const newConfigs = [...volumeConfigs];
    newConfigs[volIdx].slots[slotIdx].chapterStructure = structure;
    setVolumeConfigs(newConfigs);
  };

  // 自动选择第一个卷
  if (volumes && volumes.length > 0 && selectedVolumeId === null) {
    setSelectedVolumeId(volumes[0].id!);
  }

  const handleOpenVolumeModal = (volume?: Volume) => {
    if (volume) {
      setEditingVolume(volume);
      setVolumeFormData({
        title: volume.title,
        summary: volume.summary || '',
        hook: volume.hook || '',
        climax: volume.climax || '',
        volumeStructure: volume.volumeStructure || '',
      });
    } else {
      setEditingVolume(null);
      setVolumeFormData({
        title: '',
        summary: '',
        hook: '',
        climax: '',
        volumeStructure: '',
      });
    }
    setShowVolumeModal(true);
  };

  const handleCloseVolumeModal = () => {
    setShowVolumeModal(false);
    setEditingVolume(null);
  };

  const handleOpenChapterModal = (chapter?: Chapter) => {
    if (chapter) {
      setEditingChapter(chapter);
      setChapterFormData({
        title: chapter.title,
        outline: chapter.outline || '',
        hook: chapter.hook || '',
        climax: chapter.climax || '',
        chapterStructure: chapter.chapterStructure || '',
        status: chapter.status || 'todo',
      });
    } else {
      setEditingChapter(null);
      setChapterFormData({
        title: '',
        outline: '',
        hook: '',
        climax: '',
        chapterStructure: '',
        status: 'todo',
      });
    }
    setShowChapterModal(true);
  };

  const handleCloseChapterModal = () => {
    setShowChapterModal(false);
    setEditingChapter(null);
  };

  const handleSubmitVolume = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!volumeFormData.title?.trim()) {
      alert('请输入卷名');
      return;
    }

    const now = Date.now();

    try {
      if (editingVolume) {
        // 更新
        await updateVolume(editingVolume.id!, {
          ...volumeFormData,
          name: volumeFormData.title, // 向后兼容
          updatedAt: now,
        });
      } else {
        // 新建 - 自动计算 index
        const maxIndex = volumes?.reduce((max, vol) => Math.max(max, vol.index), 0) || 0;
        await addVolume({
          projectId,
          index: maxIndex + 1,
          title: volumeFormData.title,
          summary: volumeFormData.summary,
          hook: volumeFormData.hook,
          climax: volumeFormData.climax,
          name: volumeFormData.title, // 向后兼容
          order: maxIndex + 1, // 向后兼容
          createdAt: now,
          updatedAt: now,
        });
      }
      handleCloseVolumeModal();
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  const handleSubmitChapter = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!chapterFormData.title?.trim()) {
      alert('请输入章节名');
      return;
    }

    if (!selectedVolumeId) {
      alert('请先选择一个卷');
      return;
    }

    const now = Date.now();

    try {
      if (editingChapter) {
        // 更新
        const wordCount = chapterFormData.outline?.length || 0;
        await updateChapter(editingChapter.id!, {
          ...chapterFormData,
          wordCount,
          order: editingChapter.index, // 向后兼容
          updatedAt: now,
        });
      } else {
        // 新建 - 自动计算 index
        const chaptersInVolume = await getChaptersByVolume(selectedVolumeId);
        const maxIndex = chaptersInVolume.reduce((max, ch) => Math.max(max, ch.index), 0);
        const wordCount = chapterFormData.outline?.length || 0;

        await addChapter({
          projectId,
          volumeId: selectedVolumeId,
          index: maxIndex + 1,
          title: chapterFormData.title,
          outline: chapterFormData.outline,
          hook: chapterFormData.hook,
          climax: chapterFormData.climax,
          status: chapterFormData.status as any,
          wordCount,
          order: maxIndex + 1, // 向后兼容
          createdAt: now,
          updatedAt: now,
        });
      }
      handleCloseChapterModal();
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  const handleDeleteVolume = async (volume: Volume) => {
    const chapterCount = volumeChapterCounts?.[volume.id!] || 0;
    const message = chapterCount > 0
      ? `确定要删除《${volume.title}》吗？该卷下的 ${chapterCount} 个章节也会被删除！`
      : `确定要删除《${volume.title}》吗？`;

    if (!confirm(message)) {
      return;
    }

    await deleteVolume(volume.id!);

    // 如果删除的是当前选中的卷，切换到第一个卷
    if (selectedVolumeId === volume.id) {
      const remaining = volumes?.filter(v => v.id !== volume.id);
      setSelectedVolumeId(remaining && remaining.length > 0 ? remaining[0].id! : null);
    }
  };

  const handleDeleteChapter = async (chapter: Chapter) => {
    if (!confirm(`确定要删除章节《${chapter.title}》吗？`)) {
      return;
    }
    await deleteChapter(chapter.id!);
  };

  // 关闭 AI 生成弹窗
  const handleCloseAIModal = () => {
    if (aiResult.length > 0) {
      if (!confirm('已生成的大纲还没保存，确定关闭吗？')) {
        return;
      }
    }
    setShowAIModal(false);
    setAiResult([]);
    setSelectedItems(new Set());
    setExpandedVolumes(new Set());
  };

  // AI 生成大纲
  const handleAIGenerate = async () => {
    console.log('按钮被点击了');
    setIsGenerating(true);
    setAiResult([]);

    try {
      // 验证必填项
      if (!aiFormData.globalStructure) {
        alert('请选择全书结构');
        setIsGenerating(false);
        return;
      }

      if (volumeConfigs.length === 0) {
        alert('卷列表为空，请先选择全书结构');
        setIsGenerating(false);
        return;
      }

      // 验证每卷都有结构
      const missingStructure = volumeConfigs.findIndex(vol => !vol.volumeStructure);
      if (missingStructure !== -1) {
        alert(`第 ${missingStructure + 1} 卷未选择卷结构`);
        setIsGenerating(false);
        return;
      }

      console.log('卷配置:', volumeConfigs);

      // 检测是否已有卷章（追加模式）
      let existingVolumesContext: any[] = [];
      if (volumes && volumes.length > 0) {
        console.log('检测到已有', volumes.length, '卷，进入追加模式');
        // 读取所有已有卷及其章节
        const sortedVolumes = [...volumes].sort((a, b) => a.index - b.index);
        for (const vol of sortedVolumes) {
          const chaptersInVol = allChapters?.filter(ch => ch.volumeId === vol.id).sort((a, b) => a.index - b.index) || [];
          existingVolumesContext.push({
            index: vol.index,
            title: vol.title,
            summary: vol.summary || '',
            chapters: chaptersInVol.map(ch => ({
              index: ch.index,
              title: ch.title,
              outline: ch.outline || ''
            }))
          });
        }
        console.log('已有大纲上下文:', existingVolumesContext);
      }

      // 直接生成（新逻辑：一次性生成所有卷，不分批）
      console.log('开始生成');
      await generateWithStructure(existingVolumesContext);

    } catch (error) {
      handleAIError(error);
      setIsGenerating(false);
    }
  };

  // 基于结构生成大纲（新方法）
  const generateWithStructure = async (existingVolumesContext: any[]) => {
    setIsGenerating(true);

    try {
      // 读取核心灵感
      let coreInspirationPrefix = '';
      if (project?.coreInspirationId) {
        const inspiration = await db.inspirations.get(project.coreInspirationId);
        if (inspiration) {
          coreInspirationPrefix = `本书的核心创意是：「${inspiration.title}」——${inspiration.content}\n生成的每一卷、每一章都必须围绕这个核心创意展开。\n\n`;
        }
      }

      // 获取避雷规则
      const rulesPrefix = await getFormattedRules(projectId, rulesEnabled);

      // 构建卷章结构说明
      let volumeStructureDesc = '';
      volumeConfigs.forEach((vol, idx) => {
        volumeStructureDesc += `\n第${idx + 1}卷《${vol.name}》：结构 ${vol.volumeStructure}，${vol.slots.length} 章，每章结构如下：\n`;
        vol.slots.forEach((slot, slotIdx) => {
          volumeStructureDesc += `  - 槽位${slotIdx + 1}（${slot.name}）：${slot.chapterStructure}\n`;
        });
      });

      const systemPrompt = coreInspirationPrefix + `你是网文大纲策划师。请按用户指定的结构生成完整大纲。

【全书结构】${aiFormData.globalStructure}

【卷数与每卷结构】${volumeStructureDesc}

输出要求：
1. 严格按每卷的槽位数生成对应章节。
2. 每章的 outline 要体现该槽位的功能（比如"钩子"槽位的章节要留悬念）。
3. 【钩子 vs 爆点 的区别（必须理解）】
- 爆点=本章已发生的、最爽最激烈的一个具体画面。是"结果"。例："三拳砸塌练功台"、"一剑刺穿对方胸口"。
- 钩子=章尾留下的未解问题/悬念。是"接下来会怎样"。例："赵无极倒下前，望向内门方向"、"怀中玉佩突然裂开一道缝"。

【反例 → 正例】
❌ 钩子="他看见了头顶的分数"（这是事件陈述，没悬念）
✅ 钩子="他看见了头顶的分数，脸色骤变"（留下"为什么变"）

❌ 钩子="一句废物，天骄跌境"（这是结果，是爆点该写的）
✅ 钩子="他念完那句话，赵无极的脸色第一次变了"（悬念在"变了之后会怎样"）

❌ 爆点="废灵根改天灵根，入内门"（概括，没画面）
✅ 爆点="评分面板炸裂，他的灵根在三息内重塑"（具体画面）

【额外约束】
- 钩子不能与本章爆点重复（如果爆点已经说结果，钩子必须说"结果之后的新问题"）
- 钩子不能是"主角获得X"、"主角战胜Y"这种成就陈述
- 钩子优先用"某人做了某件反常的事"、"某个东西突然出现/变化"
4. 每章的 chapterStructure 字段填用户选的章结构（如果选了"AI自动判断"，你根据剧情自己选一个：悬念前置/倒叙开场/多线切换/单线推进/对话推进/动作开场）。
5. 每章的 emotion 字段根据剧情选择情绪基调（紧张/压抑/热血/温情/悬疑/爽快/悲壮/轻松/震撼/平淡），emotionIntensity 设定强度（1-5）。
6. 每卷输出 volumeStructure 字段（用户选的卷结构）。
7. 每章 outline ≤ 40 字，hook ≤ 20 字，climax ≤ 20 字。
8. 严格按 JSON 数组输出：
[{
  title: "卷名",
  summary: "卷主线（80字内）",
  hook: "卷钩子（30字内）",
  climax: "卷爆点（30字内）",
  volumeStructure: "卷结构",
  chapters: [{
    title: "章名",
    outline: "细纲（40字内）",
    hook: "章钩子（20字内）",
    climax: "章爆点（20字内）",
    chapterStructure: "章结构",
    emotion: "情绪基调",
    emotionIntensity: 3,
    slotName: "槽位名（如'钩子'）"
  }]
}]

直接输出 JSON 数组，不要 markdown 包裹，不要解释。`;

      let userPrompt = '';

      // 如果有已有的卷（追加模式）
      if (existingVolumesContext.length > 0) {
        userPrompt += `【已有大纲（必须承接，不要重复）】\n`;
        existingVolumesContext.forEach((vol) => {
          userPrompt += `第${vol.index}卷《${vol.title}》：\n`;
          userPrompt += `  主线：${vol.summary}\n`;
          if (vol.chapters && vol.chapters.length > 0) {
            userPrompt += `  章节：\n`;
            vol.chapters.forEach((ch: any) => {
              userPrompt += `    第 ${ch.index} 章 ${ch.title}：${ch.outline}\n`;
            });
          }
        });
        userPrompt += `\n【本次任务】\n`;
        userPrompt += `在已有大纲基础上，从第 ${existingVolumesContext.length + 1} 卷继续往后生成 ${volumeConfigs.length} 卷。\n`;
        userPrompt += `要求：\n`;
        userPrompt += `1. 承接前面剧情的结尾，主角实力、人物关系、伏笔要连贯。\n`;
        userPrompt += `2. 不要重复已有章节的内容。\n\n`;
      }

      userPrompt += `题材类型：${aiFormData.genre}\n`;
      if (aiFormData.protagonist) {
        userPrompt += `主角设定：${aiFormData.protagonist}\n`;
      }
      const goldenFingerValue = aiFormData.goldenFinger || project?.goldenFinger;
      if (goldenFingerValue) {
        userPrompt += `金手指：${goldenFingerValue}\n`;
      }
      if (aiFormData.requirement) {
        userPrompt += `一句话需求：${aiFormData.requirement}\n`;
      }

      // 注入参考书籍（文风/结构/节奏）
      if (aiFormData.referenceBook && bookAnalyses) {
        const refBook = bookAnalyses.find(b => b.id === parseInt(aiFormData.referenceBook));
        if (refBook) {
          const hasStructured = refBook.style || refBook.structure || refBook.pacing;
          if (hasStructured) {
            userPrompt += `\n【参考书籍：${refBook.title}】\n`;
            if (refBook.style) userPrompt += `参考文风：${refBook.style}\n`;
            if (refBook.structure) userPrompt += `参考结构：${refBook.structure}\n`;
            if (refBook.pacing) userPrompt += `参考节奏：${refBook.pacing}\n`;
          } else if (refBook.outlineSample) {
            // 兜底：旧数据 3 字段空，但 outlineSample 有完整分析
            userPrompt += `\n【参考书籍：${refBook.title} 的完整分析】\n${refBook.outlineSample}\n`;
            userPrompt += `请参考以上分析的文风、结构、节奏特点来生成。\n`;
          }
        }
      }

      // 注入上下文：人物卡
      if (characters && characters.length > 0) {
        userPrompt += `\n已有人物卡（请在大纲中合理运用）：\n`;
        characters.slice(0, 5).forEach(char => {
          userPrompt += `- ${char.name}：${char.role || ''}，${char.personality || ''}\n`;
        });
      }

      // 注入上下文：世界观
      if (worldSettings && worldSettings.length > 0) {
        userPrompt += `\n已有世界观设定（请在大纲中合理运用）：\n`;
        worldSettings.slice(0, 10).forEach(setting => {
          userPrompt += `- ${setting.category}：${setting.name}\n`;
        });
      }

      userPrompt += await readTechniquesByCategory(['钩子', '爆点', '结构']);
      userPrompt += `\n注意：大纲的 hook/climax 字段只有 ≤20 字，只写一个具体画面或悬念，不要照搬技巧里"至少 300 字"等正文级字数要求。\n`;
      userPrompt += `\n请严格按上述卷章结构生成大纲：`;

      console.log('=== System Prompt ===');
      console.log(systemPrompt);
      console.log('=== User Prompt ===');
      console.log(userPrompt);

      const result = await askAI({
        system: systemPrompt,
        user: rulesPrefix + userPrompt,
        maxTokens: 8192,
      });

      console.log('AI 原始返回:', result);

      const parsed = extractJSON(result, 'array');

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('AI 返回格式异常');
      }

      console.log('解析成功，共', parsed.length, '卷');

      setAiResult(parsed);

      // 默认全选
      const allIds = new Set<string>();
      parsed.forEach((vol, vIdx) => {
        allIds.add(`v-${vIdx}`);
        vol.chapters?.forEach((_: any, cIdx: number) => {
          allIds.add(`v-${vIdx}-c-${cIdx}`);
        });
      });
      setSelectedItems(allIds);

      // 默认展开所有卷
      setExpandedVolumes(new Set(parsed.map((_, idx) => idx)));

    } catch (error) {
      handleAIError(error);
    } finally {
      setIsGenerating(false);
    }
  };

  // 批量创建
  const handleBatchCreate = async () => {
    if (aiResult.length === 0) return;

    const now = Date.now();
    let volumeIndex = volumes?.reduce((max, vol) => Math.max(max, vol.index), 0) || 0;

    let createdVolumes = 0;
    let createdChapters = 0;

    try {
      // 使用事务一次性写入
      await db.transaction('rw', db.volumes, db.chapters, async () => {
        for (let vIdx = 0; vIdx < aiResult.length; vIdx++) {
          const volId = `v-${vIdx}`;
          if (!selectedItems.has(volId)) continue;

          const vol = aiResult[vIdx];
          volumeIndex++;

          const newVolId = await addVolume({
            projectId,
            index: volumeIndex,
            title: vol.title,
            summary: vol.summary || '',
            hook: vol.hook || '',
            climax: vol.climax || '',
            volumeStructure: vol.volumeStructure || '',
            name: vol.title,
            order: volumeIndex,
            createdAt: now,
            updatedAt: now,
          });

          createdVolumes++;

          if (vol.chapters && Array.isArray(vol.chapters)) {
            let chapterIndex = 0;
            for (let cIdx = 0; cIdx < vol.chapters.length; cIdx++) {
              const chapterId = `v-${vIdx}-c-${cIdx}`;
              if (!selectedItems.has(chapterId)) continue;

              const chapter = vol.chapters[cIdx];
              chapterIndex++;

              await addChapter({
                projectId,
                volumeId: newVolId as number,
                index: chapterIndex,
                title: chapter.title,
                outline: chapter.outline || '',
                hook: chapter.hook || '',
                climax: chapter.climax || '',
                chapterStructure: chapter.chapterStructure || '',
                emotion: chapter.emotion || '',
                emotionIntensity: chapter.emotionIntensity || undefined,
                status: 'todo',
                wordCount: 0,
                order: chapterIndex,
                createdAt: now,
                updatedAt: now,
              });

              createdChapters++;
            }
          }
        }
      });

      alert(`已创建 ${createdVolumes} 卷，${createdChapters} 章`);
      setShowAIModal(false);
      setAiResult([]);
      setSelectedItems(new Set());

    } catch (error) {
      console.error('批量创建失败:', error);
      alert('批量创建失败，请重试');
    }
  };

  // 切换卷的展开/折叠
  const toggleVolumeExpand = (vIdx: number) => {
    const newExpanded = new Set(expandedVolumes);
    if (newExpanded.has(vIdx)) {
      newExpanded.delete(vIdx);
    } else {
      newExpanded.add(vIdx);
    }
    setExpandedVolumes(newExpanded);
  };

  // 切换选中状态
  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);

      // 如果是卷，取消选中所有章节
      if (id.startsWith('v-') && !id.includes('-c-')) {
        const vIdx = parseInt(id.split('-')[1]);
        aiResult[vIdx]?.chapters?.forEach((_: any, cIdx: number) => {
          newSelected.delete(`v-${vIdx}-c-${cIdx}`);
        });
      }
    } else {
      newSelected.add(id);

      // 如果是卷，选中所有章节
      if (id.startsWith('v-') && !id.includes('-c-')) {
        const vIdx = parseInt(id.split('-')[1]);
        aiResult[vIdx]?.chapters?.forEach((_: any, cIdx: number) => {
          newSelected.add(`v-${vIdx}-c-${cIdx}`);
        });
      }
    }
    setSelectedItems(newSelected);
  };

  // 开始编辑某卷
  const handleStartEdit = (vIdx: number) => {
    setEditingVolumeIndex(vIdx);
    setEditingVolumeData(JSON.parse(JSON.stringify(aiResult[vIdx]))); // 深拷贝
  };

  // 保存编辑
  const handleSaveEdit = () => {
    if (editingVolumeIndex === null || !editingVolumeData) return;

    const newResult = [...aiResult];
    newResult[editingVolumeIndex] = editingVolumeData;
    setAiResult(newResult);

    setEditingVolumeIndex(null);
    setEditingVolumeData(null);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingVolumeIndex(null);
    setEditingVolumeData(null);
  };

  // 从此重写后续
  const handleRewriteFrom = async (vIdx: number) => {
    const totalVolumes = aiResult.length;
    const confirmMsg = `将以第 ${vIdx + 1} 卷为起点，重新生成第 ${vIdx + 2} 到第 ${totalVolumes} 卷。已生成的第 1 到 ${vIdx + 1} 卷保留不变，第 ${vIdx + 2} 卷之后的内容会被覆盖。确定吗？`;

    if (!confirm(confirmMsg)) {
      return;
    }

    setIsGenerating(true);

    try {
      // 获取避雷规则
      const rulesPrefix = await getFormattedRules(projectId, rulesEnabled);

      // 保留前 N 卷
      const preservedVolumes = aiResult.slice(0, vIdx + 1);
      const volumesToGenerate = totalVolumes - vIdx - 1;

      if (volumesToGenerate <= 0) {
        alert('这已经是最后一卷了');
        setIsGenerating(false);
        return;
      }

      // 获取每卷的章节数（从第一卷推算）
      const chaptersPerVolume = aiResult[0]?.chapters?.length || 10;

      const systemPrompt = `你是网文大纲策划师。请根据用户要求生成分卷大纲。
本次需生成 ${volumesToGenerate} 卷，每卷约 ${chaptersPerVolume} 章。
请严格按 JSON 数组格式输出，每个元素代表一卷：
{ title: 卷名, summary: 本卷主线（100字内）, chapters: [{ title: 章节名, outline: 本章要点（50字内） }] }
直接输出 JSON 数组，不要 markdown 包裹，不要解释。`;

      let userPrompt = `【已有大纲（必须承接，不要修改）】\n`;
      preservedVolumes.forEach((vol, idx) => {
        userPrompt += `第${idx + 1}卷《${vol.title}》：${vol.summary}`;
        if (idx === preservedVolumes.length - 1) {
          userPrompt += `（这是新的起点，后续必须承接它的剧情）`;
        }
        userPrompt += `\n`;
      });

      userPrompt += `\n【本次任务】\n`;
      userPrompt += `从第 ${vIdx + 2} 卷开始，重新生成到第 ${totalVolumes} 卷。\n`;
      userPrompt += `要求：\n`;
      userPrompt += `1. 严格承接第 ${vIdx + 1} 卷结尾的剧情。\n`;
      userPrompt += `2. 主角实力、人物关系、伏笔要跟第 1-${vIdx + 1} 卷一致。\n`;
      userPrompt += `3. 每卷 summary 控制在 100 字内。\n`;
      userPrompt += `4. 每章 outline 控制在 50 字内。\n`;
      userPrompt += `5. 严格按 JSON 数组输出，不要 markdown 包裹。\n\n`;

      userPrompt += `题材类型：${aiFormData.genre}\n`;
      if (aiFormData.protagonist) {
        userPrompt += `主角设定：${aiFormData.protagonist}\n`;
      }
      if (aiFormData.goldenFinger) {
        userPrompt += `金手指：${aiFormData.goldenFinger}\n`;
      }
      userPrompt += `目标卷数：${volumesToGenerate}\n`;
      userPrompt += `每卷章节数：${chaptersPerVolume}\n`;
      if (aiFormData.requirement) {
        userPrompt += `一句话需求：${aiFormData.requirement}\n`;
      }

      console.log('重写后续，user prompt:', userPrompt);

      const result = await askAI({
        system: systemPrompt,
        user: rulesPrefix + userPrompt,
      });

      console.log('AI 原始返回:', result);

      const parsed = extractJSON(result, 'array');

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('AI 返回格式异常');
      }

      console.log('解析成功，共', parsed.length, '卷');

      // 合并：保留前 N 卷 + 新生成的后续卷
      const newResult = [...preservedVolumes, ...parsed];
      setAiResult(newResult);

      // 重新计算选中项
      const allIds = new Set<string>();
      newResult.forEach((vol, vIdx2) => {
        allIds.add(`v-${vIdx2}`);
        vol.chapters?.forEach((_: any, cIdx: number) => {
          allIds.add(`v-${vIdx2}-c-${cIdx}`);
        });
      });
      setSelectedItems(allIds);

      alert(`已重新生成第 ${vIdx + 2} 到第 ${totalVolumes} 卷`);

    } catch (error) {
      handleAIError(error);
    } finally {
      setIsGenerating(false);
    }
  };

  // 从某章重写后续章节
  const handleRewriteFromChapter = async (chapter: Chapter) => {
    const volume = volumes?.find(v => v.id === chapter.volumeId);
    if (!volume) return;

    const chaptersInVolume = allChapters?.filter(ch => ch.volumeId === volume.id).sort((a, b) => a.index - b.index) || [];
    const chapterIndex = chaptersInVolume.findIndex(ch => ch.id === chapter.id);

    if (chapterIndex === -1) return;
    if (chapterIndex === chaptersInVolume.length - 1) {
      alert('这已经是本卷最后一章了');
      return;
    }

    const confirmMsg = `将从第 ${chapter.index} 章重新生成到第 ${chaptersInVolume[chaptersInVolume.length - 1].index} 章。前面的章节保留不变，后面的章节会被覆盖。确定吗？`;

    if (!confirm(confirmMsg)) {
      return;
    }

    setRewritingChapterId(chapter.id!);

    try {
      // 保留的章节（包括当前章）
      const preservedChapters = chaptersInVolume.slice(0, chapterIndex + 1);
      const chaptersToGenerate = chaptersInVolume.length - chapterIndex - 1;

      const systemPrompt = `你是网文大纲策划师。请根据已有剧情生成后续章节大纲。
请严格按 JSON 数组格式输出，每个元素代表一章：
{ title: 章节名, outline: 本章要点（50字内） }
直接输出 JSON 数组，不要 markdown 包裹，不要解释。`;

      let userPrompt = `【已有剧情（必须承接，不要修改）】\n`;
      preservedChapters.forEach((ch) => {
        userPrompt += `第${ch.index}章《${ch.title}》：${ch.outline || '（无细纲）'}\n`;
      });

      userPrompt += `\n【本次任务】\n`;
      userPrompt += `从第 ${chapter.index + 1} 章开始，继续生成到第 ${chaptersInVolume[chaptersInVolume.length - 1].index} 章，共 ${chaptersToGenerate} 章。\n`;
      userPrompt += `要求：\n`;
      userPrompt += `1. 严格承接第 ${chapter.index} 章的剧情。\n`;
      userPrompt += `2. 剧情跟前面章节保持连贯。\n`;
      userPrompt += `3. 每章 outline 控制在 50 字内。\n`;
      userPrompt += `4. 严格按 JSON 数组输出：[{ title, outline }]。\n`;
      userPrompt += `5. 不要 markdown 包裹。\n`;

      console.log('重写章节，user prompt:', userPrompt);

      const result = await askAI({
        system: systemPrompt,
        user: userPrompt,
      });

      console.log('AI 原始返回:', result);
      console.log('返回内容前 500 字:', result.slice(0, 500));

      let parsed;
      try {
        parsed = extractJSON(result, 'array');
      } catch (e) {
        console.error('解析失败，原始返回:', result);
        console.error('错误详情:', e);
        throw e;
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        console.error('解析结果不是数组或为空:', parsed);
        console.log('原始返回内容:', result);
        throw new Error('AI 返回格式异常');
      }

      console.log('解析成功，共', parsed.length, '章');

      // 更新后续章节
      const now = Date.now();
      for (let i = 0; i < parsed.length && i < chaptersToGenerate; i++) {
        const targetChapter = chaptersInVolume[chapterIndex + 1 + i];
        await updateChapter(targetChapter.id!, {
          title: parsed[i].title,
          outline: parsed[i].outline,
          updatedAt: now,
        });
      }

      alert(`已重新生成第 ${chapter.index + 1} 到第 ${chaptersInVolume[chaptersInVolume.length - 1].index} 章`);

    } catch (error) {
      handleAIError(error);
    } finally {
      setRewritingChapterId(null);
    }
  };

  // 重新生成本卷章节：根据卷设定重新生成所有章节
  const handleSummarizeVolume = async (volume: Volume) => {
    // 获取该卷的章节数
    const chaptersInVolume = allChapters?.filter(ch => ch.volumeId === volume.id).sort((a, b) => a.index - b.index) || [];
    const chapterCount = chaptersInVolume.length;

    if (chapterCount === 0) {
      alert('该卷没有章节，无法重新生成');
      return;
    }

    if (!confirm(`将根据本卷的最新设定（简介、钩子、爆点、结构），重新生成本卷的所有 ${chapterCount} 章。\n\n现有章节会被覆盖，确定吗？`)) {
      return;
    }

    setSummarizingVolumeId(volume.id!);

    try {
      // 获取作品信息
      const project = await db.projects.get(projectId);
      if (!project) {
        throw new Error('未找到作品信息');
      }

      // 获取避雷规则
      const rulesPrefix = await getFormattedRules(projectId, rulesEnabled);

      // 构建叙事结构说明
      let structurePrompt = '';
      if (volume.volumeStructure) {
        structurePrompt += `\n【卷结构】\n本卷采用"${volume.volumeStructure}"结构。`;
        if (volume.volumeStructure === '七点结构法') {
          structurePrompt += `钩子-情节点1-关键点1-中点-关键点2-情节点2-结局。共7个章节对应7个节点。`;
        } else if (volume.volumeStructure === '单元剧') {
          structurePrompt += `每卷是一个完整的单元故事，有始有终。`;
        } else if (volume.volumeStructure === '双线交叉') {
          structurePrompt += `主线和支线交叉推进。`;
        } else if (volume.volumeStructure === '闭环式') {
          structurePrompt += `开头埋伏笔，结尾收回伏笔形成闭环。`;
        } else if (volume.volumeStructure === '递进式') {
          structurePrompt += `章节递进，层层加码，越来越激烈。`;
        }
        structurePrompt += '\n';
      }

      // 构建章节结构说明（逐章取该章自己的 chapterStructure，不再整卷套用第 1 章）
      let chapterStructurePrompt = '';
      const structuredChapters = chaptersInVolume
        .map((ch, i) => ({ order: i + 1, structure: ch.chapterStructure || '' }))
        .filter(item => item.structure);

      if (structuredChapters.length > 0) {
        chapterStructurePrompt += `\n【各章结构（逐章对应，禁止全卷套用同一结构）】\n`;
        structuredChapters.forEach(item => {
          chapterStructurePrompt += `第${item.order}章：${item.structure}\n`;
        });

        // 结构法释义（只列本卷实际用到的，避免重复）
        const structureGlossary: Record<string, string> = {
          悬念前置: '开头抛悬念，中间展开，结尾留钩子。',
          倒叙开场: '开头先展示结果或高潮片段，然后倒回讲述经过。',
          多线切换: '多个场景或角色视角切换。',
          单线推进: '单一视角，顺序推进。',
          对话推进: '以对话为主推动剧情。',
          动作开场: '开头直接进入动作场面。',
        };
        const usedStructures = Array.from(new Set(structuredChapters.map(item => item.structure)));
        const glossaryLines = usedStructures
          .map(s => {
            const detail = structureGlossary[s];
            return detail ? `- ${s}：${detail}` : '';
          })
          .filter(Boolean);
        if (glossaryLines.length > 0) {
          chapterStructurePrompt += `结构法释义：\n${glossaryLines.join('\n')}\n`;
        }
      }

      // 构建 system prompt
      const systemPrompt = `你是网文大纲策划师。请根据以下卷设定，生成 ${chapterCount} 章的章节大纲。
${structurePrompt}${chapterStructurePrompt}
要求：
1. 每章包含 title、outline、hook、climax、chapterStructure。
2. 章节之间剧情连贯，层层递进。
3. 如果指定了结构法（如七点结构法），严格按结构法分布章节节奏。
4. 严格按【各章结构】逐章对应：第 N 章的开头必须体现第 N 章自己的结构（如"动作开场"即前 100 字进入冲突），禁止全卷套用同一结构。
5. 【钩子 vs 爆点 的区别（必须理解）】
- 爆点=本章已发生的、最爽最激烈的一个具体画面。是"结果"。例："三拳砸塌练功台"、"一剑刺穿对方胸口"。
- 钩子=章尾留下的未解问题/悬念。是"接下来会怎样"。例："赵无极倒下前，望向内门方向"、"怀中玉佩突然裂开一道缝"。

【反例 → 正例】
❌ 钩子="他看见了头顶的分数"（这是事件陈述，没悬念）
✅ 钩子="他看见了头顶的分数，脸色骤变"（留下"为什么变"）

❌ 钩子="一句废物，天骄跌境"（这是结果，是爆点该写的）
✅ 钩子="他念完那句话，赵无极的脸色第一次变了"（悬念在"变了之后会怎样"）

❌ 爆点="废灵根改天灵根，入内门"（概括，没画面）
✅ 爆点="评分面板炸裂，他的灵根在三息内重塑"（具体画面）

【额外约束】
- 钩子不能与本章爆点重复（如果爆点已经说结果，钩子必须说"结果之后的新问题"）
- 钩子不能是"主角获得X"、"主角战胜Y"这种成就陈述
- 钩子优先用"某人做了某件反常的事"、"某个东西突然出现/变化"
- 字数：hook 20字内，climax 20字内，outline 40字内
6. chapterStructure 字段必须回填【各章结构】中该章对应的结构法，且与第 4 条逐章一致。

输出 JSON 数组格式：
[{ title: "章节名", outline: "细纲", hook: "钩子", climax: "爆点", chapterStructure: "结构法" }]

直接输出 JSON 数组，不要 markdown 包裹，不要解释。`;

      // 构建 user prompt
      // 读取核心灵感
      let coreInspirationPrefix2 = '';
      if (project?.coreInspirationId) {
        const insp = await db.inspirations.get(project.coreInspirationId);
        if (insp) {
          coreInspirationPrefix2 = `【核心创意】（本章纲必须围绕它）\n《${insp.title}》：${insp.content}\n\n`;
        }
      }

      let userPrompt = coreInspirationPrefix2;
      userPrompt += `【作品信息】\n`;
      userPrompt += `书名：${project.name}\n`;
      if (project.genre) userPrompt += `题材：${project.genre}\n`;
      if (project.goldenFinger) userPrompt += `金手指：${project.goldenFinger}\n`;

      // 注入参考书籍
      if (aiFormData.referenceBook && bookAnalyses) {
        const refBook = bookAnalyses.find(b => b.id === parseInt(aiFormData.referenceBook));
        if (refBook) {
          const hasStructured = refBook.style || refBook.structure || refBook.pacing;
          if (hasStructured) {
            userPrompt += `\n【参考书籍：${refBook.title}】\n`;
            if (refBook.style) userPrompt += `参考文风：${refBook.style}\n`;
            if (refBook.structure) userPrompt += `参考结构：${refBook.structure}\n`;
            if (refBook.pacing) userPrompt += `参考节奏：${refBook.pacing}\n`;
          } else if (refBook.outlineSample) {
            // 兜底：旧数据 3 字段空，但 outlineSample 有完整分析
            userPrompt += `\n【参考书籍：${refBook.title} 的完整分析】\n${refBook.outlineSample}\n`;
            userPrompt += `请参考以上分析的文风、结构、节奏特点来生成。\n`;
          }
        }
      }

      userPrompt += `\n【卷设定】\n`;
      userPrompt += `卷名：《${volume.title}》\n`;
      userPrompt += `主线：${volume.summary || '（未设定）'}\n`;
      if (volume.hook) userPrompt += `结尾钩子：${volume.hook}\n`;
      if (volume.climax) userPrompt += `高潮场景：${volume.climax}\n`;
      if (volume.volumeStructure) userPrompt += `卷结构：${volume.volumeStructure}\n`;
      if (structuredChapters.length > 0) {
        userPrompt += `各章结构（按序对应）：${structuredChapters.map(item => `第${item.order}章=${item.structure}`).join('，')}\n`;
      }
      userPrompt += await readTechniquesByCategory(['钩子', '爆点', '情绪', '冲突']);
      userPrompt += `\n注意：大纲的 hook/climax 字段只有 ≤20 字，只写一个具体画面或悬念，不要照搬技巧里"至少 300 字"等正文级字数要求。\n`;
      userPrompt += `\n请生成 ${chapterCount} 章的章节大纲：`;

      console.log('=== 重新生成本卷章节 System Prompt ===');
      console.log(systemPrompt);
      console.log('=== User Prompt ===');
      console.log(userPrompt);

      const result = await askAI({
        system: systemPrompt,
        user: rulesPrefix + userPrompt,
        maxTokens: 8192,
      });

      // 解析 JSON
      const newChapters = extractJSON(result);

      if (!Array.isArray(newChapters) || newChapters.length === 0) {
        throw new Error('AI 返回的章节数据格式错误');
      }

      console.log('生成的章节数据：', newChapters);

      // 删除旧章节 + 创建新章节（使用事务）
      await db.transaction('rw', db.chapters, async () => {
        // 删除旧章节
        const oldChapterIds = chaptersInVolume.map(ch => ch.id!);
        await db.chapters.bulkDelete(oldChapterIds);

        // 创建新章节
        const now = Date.now();
        for (let i = 0; i < newChapters.length; i++) {
          const ch = newChapters[i];
          await addChapter({
            projectId,
            volumeId: volume.id!,
            index: i + 1,
            title: ch.title || `第 ${i + 1} 章`,
            outline: ch.outline || '',
            hook: ch.hook || '',
            climax: ch.climax || '',
            chapterStructure: ch.chapterStructure || chaptersInVolume[i]?.chapterStructure || '',
            status: 'todo',
            wordCount: 0,
            order: i + 1,
            createdAt: now,
            updatedAt: now,
          });
        }
      });

      alert(`已重新生成 ${newChapters.length} 章`);

    } catch (error) {
      console.error('重新生成章节失败:', error);
      handleAIError(error);
      alert('生成失败，旧章节已保留');
    } finally {
      setSummarizingVolumeId(null);
    }
  };

  // 重新生成本章细纲
  const handleRegenerateChapterOutline = async (chapter: Chapter) => {
    setRegeneratingOutlineChapterId(chapter.id!);

    try {
      // 获取作品信息
      const project = await db.projects.get(projectId);
      if (!project) {
        throw new Error('未找到作品信息');
      }

      // 获取卷信息
      if (!chapter.volumeId) {
        throw new Error('本章未关联卷信息');
      }
      const volume = await db.volumes.get(chapter.volumeId);
      if (!volume) {
        throw new Error('未找到卷信息');
      }

      // 获取该卷下所有章节，确定本章的功能位置
      const chaptersInVolume = allChapters?.filter(ch => ch.volumeId === volume.id).sort((a, b) => a.index - b.index) || [];
      const currentIndex = chaptersInVolume.findIndex(ch => ch.id === chapter.id);

      // 根据卷结构推断槽位名称
      let slotName = `第${chapter.index}章`;
      if (volume.volumeStructure) {
        const slots = getSlotsByVolumeStructure(volume.volumeStructure);
        if (currentIndex >= 0 && currentIndex < slots.length) {
          slotName = slots[currentIndex].name;
        }
      }

      // 获取上一章
      let prevChapter = null;
      let prevContentLast500 = '';
      if (currentIndex > 0) {
        prevChapter = chaptersInVolume[currentIndex - 1];
        if (prevChapter.content) {
          const tmp = document.createElement('div');
          tmp.innerHTML = prevChapter.content;
          const plainText = tmp.textContent || tmp.innerText || '';
          prevContentLast500 = plainText.slice(-500);
        }
      }

      // 获取避雷规则
      const rulesPrefix = await getFormattedRules(projectId, rulesEnabled);

      // 构建 system prompt
      const systemPrompt = `你是网文大纲策划师。请根据用户提供的章节设定，重新生成本章的细纲。

要求：
1. 剧情必须承接上一章的内容。
2. 必须体现本章的钩子和爆点。
3. 本章开头要符合章结构要求（如"动作开场"就是前 100 字进入冲突）。
4. 与前后章剧情连贯，符合本卷主线。
5. 字数不超过 40 字。
6. 直接输出细纲正文，不要任何解释，不要 markdown 包裹。`;

      // 构建 user prompt
      // 读取核心灵感
      let coreInspirationPrefix2 = '';
      if (project?.coreInspirationId) {
        const insp = await db.inspirations.get(project.coreInspirationId);
        if (insp) {
          coreInspirationPrefix2 = `【核心创意】（本章纲必须围绕它）\n《${insp.title}》：${insp.content}\n\n`;
        }
      }

      let userPrompt = coreInspirationPrefix2;
      userPrompt += `【作品信息】\n`;
      userPrompt += `书名：${project.name}\n`;
      if (project.genre) userPrompt += `题材：${project.genre}\n`;
      if (project.goldenFinger) userPrompt += `金手指：${project.goldenFinger}\n`;

      // 注入参考书籍
      if (aiFormData.referenceBook && bookAnalyses) {
        const refBook = bookAnalyses.find(b => b.id === parseInt(aiFormData.referenceBook));
        if (refBook) {
          const hasStructured = refBook.style || refBook.structure || refBook.pacing;
          if (hasStructured) {
            userPrompt += `\n【参考书籍：${refBook.title}】\n`;
            if (refBook.style) userPrompt += `参考文风：${refBook.style}\n`;
            if (refBook.structure) userPrompt += `参考结构：${refBook.structure}\n`;
            if (refBook.pacing) userPrompt += `参考节奏：${refBook.pacing}\n`;
          } else if (refBook.outlineSample) {
            // 兜底：旧数据 3 字段空，但 outlineSample 有完整分析
            userPrompt += `\n【参考书籍：${refBook.title} 的完整分析】\n${refBook.outlineSample}\n`;
            userPrompt += `请参考以上分析的文风、结构、节奏特点来生成。\n`;
          }
        }
      }

      userPrompt += `\n【本卷】\n`;
      userPrompt += `卷名：《${volume.title}》\n`;
      if (volume.summary) userPrompt += `主线：${volume.summary}\n`;
      if (volume.hook) userPrompt += `钩子：${volume.hook}\n`;
      if (volume.climax) userPrompt += `爆点：${volume.climax}\n`;
      if (volume.volumeStructure) userPrompt += `结构：${volume.volumeStructure}\n`;

      userPrompt += `\n【本章】\n`;
      userPrompt += `章名：${chapter.title}\n`;
      userPrompt += `功能位置：${slotName}\n`;
      if (chapter.hook) userPrompt += `钩子：${chapter.hook}\n`;
      if (chapter.climax) userPrompt += `爆点：${chapter.climax}\n`;
      if (chapter.chapterStructure) userPrompt += `章结构：${chapter.chapterStructure}\n`;

      if (prevChapter) {
        userPrompt += `\n【上一章】\n`;
        userPrompt += `标题：${prevChapter.title}\n`;
        if (prevChapter.outline) userPrompt += `细纲：${prevChapter.outline}\n`;
        if (prevContentLast500) userPrompt += `结尾：${prevContentLast500}\n`;
      }

      userPrompt += await readTechniquesByCategory(['情绪', '人物', '冲突']);
      userPrompt += `\n注意：本次是生成 40 字内的章节细纲，不要照搬技巧里"至少 300 字"等正文级要求。\n`;
      userPrompt += `\n注意：大纲的 hook/climax 字段只有 ≤20 字，只写一个具体画面或悬念，不要照搬技巧里"至少 300 字"等正文级字数要求。\n`;
      userPrompt += `\n【生成要求】\n请重新生成本章细纲，40 字内。`;

      console.log('=== 重新生成本章细纲 System Prompt ===');
      console.log(systemPrompt);
      console.log('=== User Prompt ===');
      console.log(userPrompt);

      const result = await askAI({
        system: systemPrompt,
        user: rulesPrefix + userPrompt,
        maxTokens: 8000,
      });

      const newOutline = result.trim();

      if (!newOutline) {
        throw new Error('AI 返回为空');
      }

      // 弹出预览对话框
      setOutlinePreviewData({
        chapterId: chapter.id!,
        oldOutline: chapter.outline || '（无）',
        newOutline,
      });
      setShowOutlinePreview(true);

    } catch (error) {
      console.error('重新生成细纲失败:', error);
      handleAIError(error);
    } finally {
      setRegeneratingOutlineChapterId(null);
    }
  };

  // 采用新细纲
  const handleAdoptNewOutline = async () => {
    if (!outlinePreviewData) return;

    try {
      await updateChapter(outlinePreviewData.chapterId, {
        outline: outlinePreviewData.newOutline,
        updatedAt: Date.now(),
      });

      setShowOutlinePreview(false);
      setOutlinePreviewData(null);
      alert('已更新细纲');
    } catch (error) {
      console.error('更新细纲失败:', error);
      alert('更新失败，请重试');
    }
  };

  // 监听 Esc 键关闭弹窗
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showAIModal) {
        handleCloseAIModal();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showAIModal, aiResult.length]);

  if (!volumes) {
    return <div className="p-8">加载中...</div>;
  }

  return (
    <div className="w-full p-6">
      {/* 顶部标题 */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">章节管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          共 {volumes.length} 卷，{allChapters?.length || 0} 章
        </p>
      </div>

      {/* 三栏玻璃面板 */}
      <div className="glass-card rounded-xl flex items-stretch overflow-hidden min-h-[calc(100vh-220px)] max-w-[1408px] mx-auto">
      {/* 左侧卷列表 */}
      <aside className="w-96 shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-foreground">卷</h2>
            <button
              onClick={() => handleOpenVolumeModal()}
              className="p-1 text-primary hover:bg-primary/10 rounded transition-colors"
              title="新建卷"
            >
              <Plus size={20} />
            </button>
          </div>
          <p className="text-sm text-muted-foreground mb-3">共 {volumes.length} 卷</p>

          {/* AI 生成按钮 */}
          <button
            onClick={() => {
              // 金手指留空时自动带入作品页保存的金手指，避免卷纲漏掉既有设定
              setAiFormData(prev => ({
                ...prev,
                goldenFinger: prev.goldenFinger || project?.goldenFinger || '',
              }));
              setShowAIModal(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
          >
            <Sparkles size={16} />
            AI 生成大纲
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {volumes.length === 0 ? (
            <div className="text-center py-8 px-4">
              <p className="text-muted-foreground text-sm mb-3">还没有卷</p>
              <button
                onClick={() => handleOpenVolumeModal()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                创建第一卷
              </button>
            </div>
          ) : (
            volumes.map((volume) => (
              <div
                key={volume.id}
                className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  selectedVolumeId === volume.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted'
                }`}
                onClick={() => {
                  setSelectedVolumeId(volume.id!);
                  setSelectedChapterId(null);
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium truncate">{volume.title}</div>
                    {volume.volumeStructure && (
                      <span className="text-xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                        {volume.volumeStructure}
                      </span>
                    )}
                  </div>
                  {volume.hook && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {volume.hook.substring(0, 30)}
                      {volume.hook.length > 30 ? '...' : ''}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {volumeChapterCounts?.[volume.id!] || 0} 章
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenVolumeModal(volume);
                    }}
                    className="p-1 text-primary hover:bg-primary/10 rounded"
                    title="编辑"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteVolume(volume);
                    }}
                    className="p-1 hover:bg-red-100 text-red-600 rounded"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </nav>
      </aside>

      {/* 中栏：当前卷的章节列表 */}
      <div className="w-96 shrink-0 border-r border-border overflow-y-auto">
        <div className="p-4">
          {(() => {
            const currentVolume = volumes?.find(v => v.id === selectedVolumeId);
            const chaptersInVolume = allChapters
              ?.filter(ch => ch.volumeId === selectedVolumeId)
              .sort((a, b) => a.index - b.index) || [];

            if (!currentVolume) {
              return (
                <p className="text-sm text-muted-foreground text-center py-8">
                  请在左侧选择一个卷
                </p>
              );
            }

            return (
              <>
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {currentVolume.title}
                    </h3>
                    <button
                      onClick={() => {
                        setSelectedVolumeId(currentVolume.id!);
                        handleOpenChapterModal();
                      }}
                      className="p-1 text-primary hover:bg-primary/10 rounded transition-colors shrink-0"
                      title="新建章节"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {chaptersInVolume.length} 章
                    </p>
                  </div>
                </div>

                {chaptersInVolume.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground mb-3">还没有章节</p>
                    <button
                      onClick={() => {
                        setSelectedVolumeId(currentVolume.id!);
                        handleOpenChapterModal();
                      }}
                      className="px-4 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      创建第一章
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {chaptersInVolume.map(chapter => (
                      <button
                        key={chapter.id}
                        onClick={() => setSelectedChapterId(chapter.id!)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          selectedChapterId === chapter.id
                            ? 'bg-primary/15 text-primary border-l-2 border-primary'
                            : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
                        }`}
                      >
                        <div className="text-[11px] opacity-70 mb-0.5">第 {chapter.index} 章</div>
                        <div className="text-sm font-medium truncate">{chapter.title}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* 右栏：章纲详情 */}
      <div className="w-80 shrink-0 overflow-y-auto border-r border-border">
        <div className="p-6">
          {(() => {
            const selectedChapter = selectedChapterId
              ? allChapters?.find(ch => ch.id === selectedChapterId)
              : null;

            if (!selectedChapter) {
              return (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>点击章节查看章纲</p>
                </div>
              );
            }

            return (
              <>
                {/* 标题 */}
                <div className="mb-1 flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">第 {selectedChapter.index} 章</span>
                  {selectedChapter.status && (
                    <span className={`px-2 py-0.5 text-xs rounded-full ${statusColors[selectedChapter.status]}`}>
                      {statusLabels[selectedChapter.status]}
                    </span>
                  )}
                  {selectedChapter.wordCount !== undefined && selectedChapter.wordCount > 0 && (
                    <span className="text-xs text-muted-foreground">{selectedChapter.wordCount} 字</span>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-4">
                  {selectedChapter.title}
                </h2>

                {/* 元信息行：结构 / 情绪 */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {selectedChapter.chapterStructure && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {selectedChapter.chapterStructure}
                    </span>
                  )}
                  {selectedChapter.emotion && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${getEmotionColor(selectedChapter.emotion)}`}
                      title={`情绪强度: ${selectedChapter.emotionIntensity || '-'}`}
                    >
                      {selectedChapter.emotion}
                    </span>
                  )}
                </div>

                {/* 细纲 */}
                <div className="mb-5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">细纲</p>
                  {selectedChapter.outline ? (
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {selectedChapter.outline}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">暂无细纲</p>
                  )}
                </div>

                {/* 钩子 */}
                {selectedChapter.hook && (
                  <div className="mb-5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">本章钩子</p>
                    <p className="text-sm text-foreground bg-primary/5 border border-primary/20 rounded-lg p-3">
                      🪝 {selectedChapter.hook}
                    </p>
                  </div>
                )}

                {/* 爆点 */}
                {selectedChapter.climax && (
                  <div className="mb-5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">本章爆点</p>
                    <p className="text-sm text-foreground bg-orange-500/5 border border-orange-500/20 rounded-lg p-3">
                      💥 {selectedChapter.climax}
                    </p>
                  </div>
                )}

              </>
            );
          })()}
        </div>
      </div>

      {/* 第 4 栏：操作台 */}
      <div className="w-80 shrink-0 overflow-y-auto">
        <div className="p-4">
          {(() => {
            const selectedChapter = selectedChapterId
              ? allChapters?.find(ch => ch.id === selectedChapterId)
              : null;
            const currentVolume = volumes?.find(v => v.id === selectedVolumeId);

            // 有选中章节 → 显示章节操作
            if (selectedChapter) {
              return (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    章节操作 · 第 {selectedChapter.index} 章
                  </h3>
                  <p className="text-sm text-foreground mb-4 truncate">{selectedChapter.title}</p>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setSelectedVolumeId(selectedChapter.volumeId!);
                        handleOpenChapterModal(selectedChapter);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      <Edit2 size={14} /> 编辑本章
                    </button>
                    <button
                      onClick={() => handleRegenerateChapterOutline(selectedChapter)}
                      disabled={regeneratingOutlineChapterId === selectedChapter.id}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50"
                    >
                      <Sparkles size={14} /> {regeneratingOutlineChapterId === selectedChapter.id ? '生成中...' : '重新生成本章细纲'}
                    </button>
                    <button
                      onClick={() => handleRewriteFromChapter(selectedChapter)}
                      disabled={rewritingChapterId === selectedChapter.id}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50"
                    >
                      🔄 {rewritingChapterId === selectedChapter.id ? '生成中...' : '从此章重写后续'}
                    </button>
                    <button
                      onClick={() => {
                        handleDeleteChapter(selectedChapter);
                        setSelectedChapterId(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-card border border-destructive/30 text-destructive font-semibold rounded-lg hover:bg-destructive/10 hover:border-destructive/50 transition-colors"
                    >
                      <Trash2 size={14} /> 删除本章
                    </button>
                  </div>
                </div>
              );
            }

            // 没有选中章节 → 显示卷操作
            if (currentVolume) {
              return (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    本卷操作
                  </h3>
                  <p className="text-sm text-foreground mb-4 truncate">{currentVolume.title}</p>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setSelectedVolumeId(currentVolume.id!);
                        handleOpenChapterModal();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      <Plus size={14} /> 新建章节
                    </button>
                    <button
                      onClick={() => handleSummarizeVolume(currentVolume)}
                      disabled={summarizingVolumeId === currentVolume.id}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50"
                    >
                      <Sparkles size={14} /> {summarizingVolumeId === currentVolume.id ? '生成中...' : '重新生成本卷章节'}
                    </button>
                  </div>
                </div>
              );
            }

            return <p className="text-sm text-muted-foreground italic">请选择卷或章节</p>;
          })()}
        </div>
      </div>
      </div>

      {/* 卷编辑弹窗 */}
      {showVolumeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg w-full max-w-xl">
            <div className="border-b border-border p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {editingVolume ? '编辑卷' : '新建卷'}
              </h2>
              <button
                onClick={handleCloseVolumeModal}
                className="p-1.5 hover:bg-muted rounded transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmitVolume} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  卷名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={volumeFormData.title}
                  onChange={(e) =>
                    setVolumeFormData({ ...volumeFormData, title: e.target.value })
                  }
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="如：第一卷、序章等"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  简介
                </label>
                <textarea
                  value={volumeFormData.summary}
                  onChange={(e) =>
                    setVolumeFormData({ ...volumeFormData, summary: e.target.value })
                  }
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  rows={3}
                  placeholder="这一卷的主要内容..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  本卷钩子
                </label>
                <textarea
                  value={volumeFormData.hook}
                  onChange={(e) =>
                    setVolumeFormData({ ...volumeFormData, hook: e.target.value })
                  }
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  rows={2}
                  placeholder="结尾留什么悬念，引向下一卷，如：主角身世之谜暴露"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  本卷爆点
                </label>
                <textarea
                  value={volumeFormData.climax}
                  onChange={(e) =>
                    setVolumeFormData({ ...volumeFormData, climax: e.target.value })
                  }
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  rows={2}
                  placeholder="本卷最高潮的一场戏，如：宗门大比夺冠"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  卷结构
                </label>
                <select
                  value={volumeFormData.volumeStructure}
                  onChange={(e) =>
                    setVolumeFormData({ ...volumeFormData, volumeStructure: e.target.value })
                  }
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">不指定</option>
                  <option value="七点结构法">七点结构法</option>
                  <option value="单元剧">单元剧</option>
                  <option value="双线交叉">双线交叉</option>
                  <option value="闭环式">闭环式</option>
                  <option value="递进式">递进式</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseVolumeModal}
                  className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 章节编辑弹窗 */}
      {showChapterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {editingChapter ? '编辑章节' : '新建章节'}
              </h2>
              <button
                onClick={handleCloseChapterModal}
                className="p-1.5 hover:bg-muted rounded transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmitChapter} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  章节名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={chapterFormData.title}
                  onChange={(e) =>
                    setChapterFormData({ ...chapterFormData, title: e.target.value })
                  }
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="请输入章节标题"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  状态
                </label>
                <select
                  value={chapterFormData.status}
                  onChange={(e) =>
                    setChapterFormData({ ...chapterFormData, status: e.target.value as any })
                  }
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="todo">未开始</option>
                  <option value="draft">草稿</option>
                  <option value="finished">已完稿</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  细纲
                </label>
                <textarea
                  value={chapterFormData.outline}
                  onChange={(e) =>
                    setChapterFormData({ ...chapterFormData, outline: e.target.value })
                  }
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  rows={8}
                  placeholder="详细描述本章的剧情走向、冲突点、转折等..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  本章钩子
                </label>
                <textarea
                  value={chapterFormData.hook}
                  onChange={(e) =>
                    setChapterFormData({ ...chapterFormData, hook: e.target.value })
                  }
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  rows={2}
                  placeholder="结尾留什么悬念，引向下一章，如：神秘人夜访"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  本章爆点
                </label>
                <textarea
                  value={chapterFormData.climax}
                  onChange={(e) =>
                    setChapterFormData({ ...chapterFormData, climax: e.target.value })
                  }
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  rows={2}
                  placeholder="本章最爽的一个点，如：觉醒系统"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  章结构
                </label>
                <select
                  value={chapterFormData.chapterStructure}
                  onChange={(e) =>
                    setChapterFormData({ ...chapterFormData, chapterStructure: e.target.value })
                  }
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">不指定</option>
                  <option value="悬念前置">悬念前置</option>
                  <option value="倒叙开场">倒叙开场</option>
                  <option value="多线切换">多线切换</option>
                  <option value="单线推进">单线推进</option>
                  <option value="对话推进">对话推进</option>
                  <option value="动作开场">动作开场</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  由 AI 生成时自动填写，如需微调可手动修改。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    情绪基调
                  </label>
                  <select
                    value={chapterFormData.emotion || ''}
                    onChange={(e) =>
                      setChapterFormData({ ...chapterFormData, emotion: e.target.value })
                    }
                    className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">不指定</option>
                    <option value="紧张">紧张</option>
                    <option value="压抑">压抑</option>
                    <option value="热血">热血</option>
                    <option value="温情">温情</option>
                    <option value="悬疑">悬疑</option>
                    <option value="爽快">爽快</option>
                    <option value="悲壮">悲壮</option>
                    <option value="轻松">轻松</option>
                    <option value="震撼">震撼</option>
                    <option value="平淡">平淡</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    情绪强度
                  </label>
                  <select
                    value={chapterFormData.emotionIntensity || ''}
                    onChange={(e) =>
                      setChapterFormData({ ...chapterFormData, emotionIntensity: e.target.value ? Number(e.target.value) : undefined })
                    }
                    className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    disabled={!chapterFormData.emotion}
                  >
                    <option value="">不指定</option>
                    <option value="1">1 - 微弱</option>
                    <option value="2">2 - 轻度</option>
                    <option value="3">3 - 中等</option>
                    <option value="4">4 - 强烈</option>
                    <option value="5">5 - 极强</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseChapterModal}
                  className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI 生成大纲弹窗 */}
      {showAIModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseAIModal();
            }
          }}
        >
          <div className="bg-card rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto relative">
            {/* 关闭按钮 */}
            <button
              onClick={handleCloseAIModal}
              className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full transition-colors"
              title="关闭"
            >
              <X size={24} className="text-muted-foreground" />
            </button>

            <h2 className="text-2xl font-bold mb-4">AI 生成大纲</h2>

            {/* 核心灵感显示 */}
            {coreInspiration ? (
              <div className="mb-4 p-3 bg-background border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-yellow-700 font-medium">📖 核心创意：</span>
                  <div className="flex-1">
                    <span className="font-semibold text-yellow-900">《{coreInspiration.title}》</span>
                    <p className="text-sm text-yellow-700 mt-1">（所有卷章将围绕它展开）</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-4 p-3 bg-muted border border-border rounded-lg text-sm text-muted-foreground">
                📖 未设置核心灵感，建议先去灵感库设为本作品核心
              </div>
            )}

            {/* 提示已有数据 */}
            {volumes && volumes.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                检测到已有 {volumes.length} 卷 {allChapters?.length || 0} 章，新生成的会追加在后面
              </div>
            )}

            {/* 表单区域 */}
            {aiResult.length === 0 && (
              <div className="space-y-4">
                {/* 题材类型 */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    题材类型 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={aiFormData.genre}
                    onChange={(e) =>
                      setAiFormData({ ...aiFormData, genre: e.target.value })
                    }
                    className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
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

                {/* 主角设定 */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    主角设定
                  </label>
                  <input
                    type="text"
                    value={aiFormData.protagonist}
                    onChange={(e) =>
                      setAiFormData({ ...aiFormData, protagonist: e.target.value })
                    }
                    className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="如：少年剑修，背负血仇"
                  />
                </div>

                {/* 金手指 */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    金手指
                  </label>
                  <input
                    type="text"
                    value={aiFormData.goldenFinger}
                    onChange={(e) =>
                      setAiFormData({ ...aiFormData, goldenFinger: e.target.value })
                    }
                    className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="如：上古剑灵传承"
                  />
                </div>

                {/* 一句话需求 */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    一句话需求（可选）
                  </label>
                  <input
                    type="text"
                    value={aiFormData.requirement}
                    onChange={(e) =>
                      setAiFormData({ ...aiFormData, requirement: e.target.value })
                    }
                    className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="如：快节奏打脸爽文"
                  />
                </div>

                {/* 全书结构（必选） */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    全书结构 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={aiFormData.globalStructure}
                    onChange={(e) =>
                      setAiFormData({ ...aiFormData, globalStructure: e.target.value })
                    }
                    className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">请选择</option>
                    <option value="三幕式">三幕式</option>
                    <option value="英雄之旅">英雄之旅</option>
                    <option value="起承转合">起承转合</option>
                    <option value="双线并行">双线并行</option>
                    <option value="群像式">群像式</option>
                  </select>
                </div>

                {/* 卷列表（动态生成） */}
                {aiFormData.globalStructure && volumeConfigs.length > 0 && (
                  <div className="border border-border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">
                        📚 卷列表（共 {volumeConfigs.length} 卷）
                      </h3>
                    </div>

                    {volumeConfigs.map((vol, volIdx) => (
                      <div key={volIdx} className="border border-input rounded-lg p-3 space-y-2 bg-muted">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground w-12">卷{volIdx + 1}</span>
                          <input
                            type="text"
                            value={vol.name}
                            onChange={(e) => handleVolumeNameChange(volIdx, e.target.value)}
                            className="flex-1 px-2 py-1 text-sm border border-input rounded focus:outline-none focus:ring-1 focus:ring-primary/30"
                            placeholder="卷名"
                          />
                          <select
                            value={vol.volumeStructure}
                            onChange={(e) => handleVolumeStructureChange(volIdx, e.target.value)}
                            className="px-2 py-1 text-sm border border-input rounded focus:outline-none focus:ring-1 focus:ring-primary/30"
                          >
                            <option value="">选择卷结构</option>
                            <option value="七点结构法">七点结构法</option>
                            <option value="起承转合">起承转合</option>
                            <option value="单元剧">单元剧</option>
                            <option value="双线交叉">双线交叉</option>
                            <option value="闭环式">闭环式</option>
                            <option value="递进式">递进式</option>
                          </select>
                        </div>

                        {/* 章节槽位列表 */}
                        {vol.volumeStructure && vol.slots.length > 0 && (
                          <div className="ml-4 space-y-1.5 border-l-2 border-primary/30 pl-3 pt-2">
                            <div className="text-xs font-medium text-muted-foreground mb-2">
                              章节槽位（共 {vol.slots.length} 章）
                            </div>
                            {vol.slots.map((slot, slotIdx) => (
                              <div key={slotIdx} className="flex items-center gap-2 text-xs bg-card p-2 rounded border border-border">
                                <span className="text-muted-foreground w-8">第{slotIdx + 1}章</span>
                                <span className="flex-1 text-foreground font-medium">{slot.name}</span>
                                <select
                                  value={slot.chapterStructure}
                                  onChange={(e) => handleSlotStructureChange(volIdx, slotIdx, e.target.value)}
                                  className="px-2 py-1 border border-input rounded focus:outline-none focus:ring-1 focus:ring-primary/30 text-xs"
                                >
                                  <option value="悬念前置">悬念前置</option>
                                  <option value="倒叙开场">倒叙开场</option>
                                  <option value="多线切换">多线切换</option>
                                  <option value="单线推进">单线推进</option>
                                  <option value="对话推进">对话推进</option>
                                  <option value="动作开场">动作开场</option>
                                </select>
                              </div>
                            ))}
                          </div>
                        )}

                        {vol.volumeStructure && vol.slots.length === 0 && (
                          <div className="text-xs text-muted-foreground ml-4">
                            （槽位未生成，请重新选择卷结构）
                          </div>
                        )}

                        {!vol.volumeStructure && (
                          <div className="text-xs text-orange-600 ml-4">
                            ⚠️ 请选择卷结构
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 参考书籍 */}
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
                      className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
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

                {/* 生成提示 */}
                {aiFormData.globalStructure && volumeConfigs.length > 0 && (
                  <div className="p-3 bg-background border border-yellow-200 rounded-lg text-sm space-y-1">
                    <p className="text-yellow-900">
                      将生成 {volumeConfigs.length} 卷，共 {volumeConfigs.reduce((sum, vol) => sum + vol.slots.length, 0)} 章。
                    </p>
                    {volumeConfigs.some(vol => !vol.volumeStructure) && (
                      <p className="text-orange-700 font-medium">
                        ⚠️ 部分卷未选择卷结构，将无法生成章节槽位。
                      </p>
                    )}
                  </div>
                )}

                {/* 避雷规则 */}
                <div className="border-t border-border pt-4">
                  <RejectionRulesToggle
                    projectId={projectId}
                    enabled={rulesEnabled}
                    onToggle={setRulesEnabled}
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAIModal(false);
                      setAiFormData({
                        genre: '玄幻',
                        protagonist: '',
                        goldenFinger: '',
                        requirement: '',
                        referenceBook: '',
                        globalStructure: '',
                      });
                      setVolumeConfigs([]);
                    }}
                    className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleAIGenerate}
                    disabled={isGenerating || !aiFormData.globalStructure || volumeConfigs.length === 0 || volumeConfigs.some(vol => !vol.volumeStructure)}
                    className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? '生成中...' : '生成大纲'}
                  </button>
                </div>
              </div>
            )}

            {/* 结果展示区域 */}
            {aiResult.length > 0 && (
              <div className="space-y-4">
                {/* 统计信息 */}
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-sm text-foreground">
                    共 {aiResult.length} 卷，
                    {aiResult.reduce((sum, vol) => sum + (vol.chapters?.length || 0), 0)} 章
                  </p>
                </div>

                {/* 卷列表 */}
                <div className="space-y-3">
                  {aiResult.map((vol, vIdx) => {
                    const volId = `v-${vIdx}`;
                    const isExpanded = expandedVolumes.has(vIdx);
                    const isSelected = selectedItems.has(volId);
                    const isEditing = editingVolumeIndex === vIdx;

                    return (
                      <div
                        key={vIdx}
                        className="border border-primary/30 rounded-lg bg-card overflow-hidden"
                      >
                        {/* 卷头 */}
                        <div className="bg-muted p-4">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelection(volId)}
                              className="mt-1 w-4 h-4 accent-primary rounded"
                              disabled={isEditing}
                            />
                            <div className="flex-1">
                              {isEditing ? (
                                // 编辑模式
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-xs text-muted-foreground mb-1">卷名</label>
                                    <input
                                      type="text"
                                      value={editingVolumeData.title}
                                      onChange={(e) =>
                                        setEditingVolumeData({ ...editingVolumeData, title: e.target.value })
                                      }
                                      className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg text-lg font-bold"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-muted-foreground mb-1">主线（summary）</label>
                                    <textarea
                                      value={editingVolumeData.summary}
                                      onChange={(e) =>
                                        setEditingVolumeData({ ...editingVolumeData, summary: e.target.value })
                                      }
                                      className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg text-sm resize-none"
                                      rows={3}
                                    />
                                  </div>
                                  {/* 章节编辑 */}
                                  <div>
                                    <label className="block text-xs text-muted-foreground mb-2">章节列表</label>
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                      {editingVolumeData.chapters?.map((chapter: any, cIdx: number) => (
                                        <div key={cIdx} className="border border-border rounded p-2 bg-card">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs text-muted-foreground">第 {cIdx + 1} 章</span>
                                            <input
                                              type="text"
                                              value={chapter.title}
                                              onChange={(e) => {
                                                const newChapters = [...editingVolumeData.chapters];
                                                newChapters[cIdx].title = e.target.value;
                                                setEditingVolumeData({ ...editingVolumeData, chapters: newChapters });
                                              }}
                                              className="flex-1 px-2 py-1 border border-input rounded text-sm"
                                              placeholder="章节名"
                                            />
                                          </div>
                                          <textarea
                                            value={chapter.outline}
                                            onChange={(e) => {
                                              const newChapters = [...editingVolumeData.chapters];
                                              newChapters[cIdx].outline = e.target.value;
                                              setEditingVolumeData({ ...editingVolumeData, chapters: newChapters });
                                            }}
                                            className="w-full px-2 py-1 border border-input rounded text-xs resize-none"
                                            rows={2}
                                            placeholder="本章要点"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  {/* 编辑按钮 */}
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={handleCancelEdit}
                                      className="flex-1 px-3 py-1.5 bg-card border border-border text-foreground font-semibold rounded text-sm hover:bg-card/80 hover:border-primary/40 transition-colors"
                                    >
                                      取消
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleSaveEdit}
                                      className="flex-1 px-3 py-1.5 bg-card border border-border text-foreground font-semibold rounded text-sm hover:bg-card/80 hover:border-primary/40 transition-colors"
                                    >
                                      保存
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                // 查看模式
                                <>
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2">
                                      <h3 className="text-lg font-bold text-foreground">
                                        {vol.title}
                                      </h3>
                                      <span className="text-xs text-muted-foreground">
                                        {vol.chapters?.length || 0} 章
                                      </span>
                                    </div>
                                    {/* 操作按钮 */}
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleStartEdit(vIdx)}
                                        className="px-3 py-1 text-xs bg-card border border-border text-foreground font-semibold rounded-full hover:bg-card/80 hover:border-primary/40 transition-colors"
                                        title="编辑"
                                      >
                                        ✏️ 编辑
                                      </button>
                                      {vIdx < aiResult.length - 1 && (
                                        <button
                                          type="button"
                                          onClick={() => handleRewriteFrom(vIdx)}
                                          disabled={isGenerating}
                                          className="px-3 py-1 text-xs bg-card border border-border text-foreground font-semibold rounded hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50"
                                          title="从此重写后续"
                                        >
                                          🔄 从此重写后续
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-2">{vol.summary}</p>
                                  {/* 卷结构标签 */}
                                  {vol.volumeStructure && (
                                    <div className="text-xs text-muted-foreground mb-2">
                                      结构：{vol.volumeStructure}
                                    </div>
                                  )}
                                  {/* 卷钩子和爆点 */}
                                  {(vol.hook || vol.climax) && (
                                    <div className="flex gap-2 mb-2 text-xs">
                                      {vol.hook && (
                                        <span className="text-primary">
                                          🪝 {vol.hook}
                                        </span>
                                      )}
                                      {vol.climax && (
                                        <span className="text-orange-600">
                                          💥 {vol.climax}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => toggleVolumeExpand(vIdx)}
                                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                                  >
                                    {isExpanded ? (
                                      <>
                                        <ChevronUp size={16} />
                                        收起章节
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown size={16} />
                                        展开章节
                                      </>
                                    )}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 章节列表 */}
                        {isExpanded && vol.chapters && vol.chapters.length > 0 && (
                          <div className="p-4 space-y-2 bg-card">
                            {vol.chapters.map((chapter: any, cIdx: number) => {
                              const chapterId = `v-${vIdx}-c-${cIdx}`;
                              const isChapterSelected = selectedItems.has(chapterId);

                              return (
                                <div
                                  key={cIdx}
                                  className="flex items-start gap-3 p-3 border border-border rounded hover:bg-muted"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChapterSelected}
                                    onChange={() => toggleSelection(chapterId)}
                                    className="mt-1 w-4 h-4 accent-primary rounded"
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs text-muted-foreground">
                                        第 {cIdx + 1} 章
                                      </span>
                                      {chapter.slotName && (
                                        <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full">
                                          {chapter.slotName}
                                        </span>
                                      )}
                                      <h4 className="font-medium text-foreground">
                                        {chapter.title}
                                      </h4>
                                      {chapter.chapterStructure && (
                                        <span className="text-xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                                          {chapter.chapterStructure}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-2">
                                      {chapter.outline}
                                    </p>
                                    {/* 章钩子和爆点 */}
                                    {(chapter.hook || chapter.climax) && (
                                      <div className="flex gap-2 text-xs">
                                        {chapter.hook && (
                                          <span className="text-primary">
                                            🪝 {chapter.hook}
                                          </span>
                                        )}
                                        {chapter.climax && (
                                          <span className="text-orange-600">
                                            💥 {chapter.climax}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setAiResult([]);
                      setSelectedItems(new Set());
                      setExpandedVolumes(new Set());
                    }}
                    className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    重新生成
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseAIModal}
                    className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchCreate}
                    disabled={selectedItems.size === 0}
                    className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    批量创建（已选 {selectedItems.size} 项）
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 细纲预览对话框 */}
      {showOutlinePreview && outlinePreviewData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg w-full max-w-2xl">
            <div className="border-b border-border p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">细纲预览</h2>
              <button
                onClick={() => {
                  setShowOutlinePreview(false);
                  setOutlinePreviewData(null);
                }}
                className="p-1.5 hover:bg-muted rounded transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2">原细纲</h3>
                <div className="p-3 bg-muted border border-border rounded-lg text-sm text-muted-foreground">
                  {outlinePreviewData.oldOutline}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-foreground mb-2">新细纲</h3>
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm text-foreground">
                  {outlinePreviewData.newOutline}
                </div>
              </div>
            </div>

            <div className="border-t border-border p-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowOutlinePreview(false);
                  setOutlinePreviewData(null);
                }}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAdoptNewOutline}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                采用新细纲
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
