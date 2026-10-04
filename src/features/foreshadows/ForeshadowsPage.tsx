import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Anchor, Plus, Edit2, Trash2 } from 'lucide-react';
import {
  getForeshadowsByProject,
  addForeshadow,
  updateForeshadow,
  resolveForeshadow,
  deleteForeshadow,
} from '../../db/chapter';
import { getVolumesByProject, getChaptersByProject } from '../../db/outline';
import type { Foreshadow, Chapter } from '../../types';

type FilterTab = 'all' | 'pending' | 'resolved';

interface ChapterGroup {
  key: string;
  title: string;
  items: Foreshadow[];
}

interface VolumeSection {
  key: string;
  title: string;
  groups: ChapterGroup[];
}

// 列表里只显示前 40 字（完整内容见 title 提示与编辑弹窗）
function truncate(text: string, max: number): string {
  const t = (text || '').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function ForeshadowsPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || '0');

  const [tab, setTab] = useState<FilterTab>('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Foreshadow | null>(null);
  const [content, setContent] = useState('');
  const [chapterIdInput, setChapterIdInput] = useState(''); // '' = 不关联章节（全局伏笔）

  // 实时查询
  const foreshadows = useLiveQuery(() => getForeshadowsByProject(projectId), [projectId]);
  const volumes = useLiveQuery(() => getVolumesByProject(projectId), [projectId]);
  const chapters = useLiveQuery(() => getChaptersByProject(projectId), [projectId]);

  const chapterMap = new Map<number, Chapter>();
  chapters?.forEach(ch => {
    if (ch.id !== undefined) chapterMap.set(ch.id, ch);
  });

  const all = foreshadows || [];
  const pendingAll = all.filter(f => f.status === 'pending');
  const resolvedAll = all.filter(f => f.status === 'resolved');

  const list = (tab === 'all' ? all : tab === 'pending' ? pendingAll : resolvedAll)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);

  // 统计：未回收条数 + 最早埋于第几章（只统计能定位到章节的）
  const pendingIndexes = pendingAll
    .map(f => (f.chapterId !== undefined ? chapterMap.get(f.chapterId)?.index : undefined))
    .filter((n): n is number => typeof n === 'number');
  const earliestIndex = pendingIndexes.length > 0 ? Math.min(...pendingIndexes) : null;

  // 分组：按「卷 → 章」；未关联章节的归入"全局伏笔"
  const sections: VolumeSection[] = [];
  const globalItems: Foreshadow[] = [];
  const chapterItems = new Map<number, Foreshadow[]>();

  const buildGroups = (chs: Chapter[] | undefined): ChapterGroup[] =>
    (chs || [])
      .filter(ch => ch.id !== undefined && chapterItems.has(ch.id))
      .map(ch => ({
        key: `ch-${ch.id}`,
        title: `第 ${ch.index} 章 ${ch.title}`,
        items: chapterItems.get(ch.id!)!.slice().sort((a, b) => a.createdAt - b.createdAt),
      }));

  list.forEach(f => {
    if (f.chapterId === undefined || !chapterMap.has(f.chapterId)) {
      globalItems.push(f);
      return;
    }
    const arr = chapterItems.get(f.chapterId) || [];
    arr.push(f);
    chapterItems.set(f.chapterId, arr);
  });

  volumes?.forEach(vol => {
    const groups = buildGroups(chapters?.filter(ch => ch.volumeId === vol.id));
    if (groups.length > 0) {
      sections.push({ key: `vol-${vol.id}`, title: vol.title || vol.name || '未命名卷', groups });
    }
  });

  // 不在任何卷里的章节
  const noVolumeGroups = buildGroups(chapters?.filter(ch => ch.volumeId === undefined));
  if (noVolumeGroups.length > 0) {
    sections.push({ key: 'no-volume', title: '未分卷章节', groups: noVolumeGroups });
  }

  if (globalItems.length > 0) {
    sections.push({
      key: 'global',
      title: '全局伏笔（未关联章节或原章节已删除）',
      groups: [{
        key: 'global-items',
        title: '',
        items: globalItems.slice().sort((a, b) => a.createdAt - b.createdAt),
      }],
    });
  }

  function openCreateDialog() {
    setEditing(null);
    setContent('');
    setChapterIdInput('');
    setShowDialog(true);
  }

  function openEditDialog(f: Foreshadow) {
    setEditing(f);
    setContent(f.content);
    setChapterIdInput(f.chapterId !== undefined ? String(f.chapterId) : '');
    setShowDialog(true);
  }

  async function handleSave() {
    const text = content.trim();
    if (!text) {
      alert('请填写伏笔内容');
      return;
    }

    if (editing?.id) {
      // 编辑：只改内容（章节关联不在编辑时改，避免依赖 Dexie 对 undefined 的处理语义）
      await updateForeshadow(editing.id, { content: text });
    } else {
      const now = Date.now();
      await addForeshadow({
        projectId,
        chapterId: chapterIdInput ? parseInt(chapterIdInput) : undefined,
        content: text,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
    }

    setShowDialog(false);
  }

  async function handleResolve(f: Foreshadow) {
    if (!f.id) return;
    // 独立页没有"在哪一章回收"的上下文 → 不传第二参（回收章节留空）；P3b 的正文入口会传当前章
    await resolveForeshadow(f.id);
  }

  // 撤销回收：同时清掉回收章节与回收时间（Dexie 会把值为 undefined 的字段删除）
  async function handleUnresolve(f: Foreshadow) {
    if (!f.id) return;
    await updateForeshadow(f.id, {
      status: 'pending',
      resolvedChapterId: undefined,
      resolvedAt: undefined,
    });
  }

  async function handleDelete(f: Foreshadow) {
    if (!f.id) return;
    if (!confirm(`确定删除这条伏笔？\n\n${f.content}`)) return;
    await deleteForeshadow(f.id);
  }

  function renderRow(f: Foreshadow) {
    const ch = f.chapterId !== undefined ? chapterMap.get(f.chapterId) : undefined;
    const badge = ch
      ? `第 ${ch.index} 章`
      : f.chapterId !== undefined
        ? '章节已删除'
        : '全局';

    // 时间线文案：未回收 → "未回收 · 创建于 …"；已回收 → "第N章 → 第M章 · 时间"
    const fromLabel = ch ? `第 ${ch.index} 章` : '全局';
    const resolvedChapter = f.resolvedChapterId !== undefined ? chapterMap.get(f.resolvedChapterId) : undefined;
    let timeline: string;
    if (f.status === 'pending') {
      timeline = `未回收 · 创建于 ${formatTime(f.createdAt)}`;
    } else if (resolvedChapter) {
      timeline = `${fromLabel} → 第 ${resolvedChapter.index} 章 · ${formatTime(f.resolvedAt ?? f.createdAt)}`;
    } else {
      timeline = `${fromLabel} → 已回收（回收章节未记录）`;
    }

    return (
      <div key={f.id} className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
        <span
          className={`text-xs px-2 py-0.5 rounded-full shrink-0 border ${
            f.status === 'pending'
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-muted text-muted-foreground border-border'
          }`}
        >
          {badge}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground break-words" title={f.content}>
            {truncate(f.content, 40)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {timeline}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {f.status === 'pending' ? (
            <button
              onClick={() => handleResolve(f)}
              className="px-2 py-1 text-xs text-primary bg-primary/10 rounded hover:bg-primary/20 transition-colors"
              title="标记为已回收"
            >
              标记回收
            </button>
          ) : (
            <button
              onClick={() => handleUnresolve(f)}
              className="px-2 py-1 text-xs text-muted-foreground bg-muted rounded hover:bg-muted/80 transition-colors"
              title="撤销回收，改回未回收"
            >
              撤销回收
            </button>
          )}
          <button
            onClick={() => openEditDialog(f)}
            className="p-1 text-primary hover:bg-primary/10 rounded"
            title="编辑"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDelete(f)}
            className="p-1 text-destructive hover:bg-destructive/10 rounded"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const tabs: Array<{ key: FilterTab; label: string; count: number }> = [
    { key: 'all', label: '全部', count: all.length },
    { key: 'pending', label: '未回收', count: pendingAll.length },
    { key: 'resolved', label: '已回收', count: resolvedAll.length },
  ];

  const chaptersWithoutVolume = (chapters || []).filter(ch => ch.volumeId === undefined);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Anchor className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">伏笔追踪</h1>
            <p className="text-sm text-muted-foreground">
              未回收 {pendingAll.length} 条
              {earliestIndex !== null ? `（最早埋于第 ${earliestIndex} 章）` : ''}
              {' · '}共 {all.length} 条
            </p>
          </div>
        </div>
        <button
          onClick={openCreateDialog}
          className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增伏笔
        </button>
      </div>

      {/* 筛选 Tab */}
      <div className="flex gap-4 mb-4 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
              tab === t.key
                ? 'text-primary border-primary font-medium'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            {t.label}
            <span className="ml-1 text-xs opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      {/* 列表 */}
      {list.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {tab === 'all'
            ? '还没有伏笔记录，点击右上角新增'
            : tab === 'pending'
              ? '没有未回收的伏笔'
              : '还没有已回收的伏笔'}
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map(section => (
            <div key={section.key} className="bg-card border border-border rounded-xl p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">{section.title}</h2>
              <div className="space-y-4">
                {section.groups.map(group => (
                  <div key={group.key}>
                    {group.title && (
                      <p className="text-xs text-muted-foreground mb-2">{group.title}</p>
                    )}
                    <div className="space-y-2">{group.items.map(f => renderRow(f))}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新建 / 编辑弹窗 */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{editing ? '编辑伏笔' : '新增伏笔'}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  伏笔内容 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded h-24"
                  placeholder={'如：老猎户提到的"北方来的信使"之后再没出现'}
                />
                <p className="text-xs text-muted-foreground mt-1">写清"埋了什么"，后续回收才有依据</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">关联章节</label>
                {editing ? (
                  <p className="text-sm text-muted-foreground">
                    {editing.chapterId !== undefined
                      ? (chapterMap.get(editing.chapterId)
                          ? `第 ${chapterMap.get(editing.chapterId)!.index} 章 ${chapterMap.get(editing.chapterId)!.title}`
                          : '原章节已删除')
                      : '全局伏笔（未关联章节）'}
                    <span className="ml-2 text-xs">（编辑时不修改关联章节）</span>
                  </p>
                ) : (
                  <select
                    value={chapterIdInput}
                    onChange={(e) => setChapterIdInput(e.target.value)}
                    className="w-full bg-background text-foreground px-3 py-2 border border-input rounded"
                  >
                    <option value="">不关联章节（全局伏笔）</option>
                    {volumes?.map(vol => {
                      const volChapters = (chapters || []).filter(ch => ch.volumeId === vol.id);
                      if (volChapters.length === 0) return null;
                      return (
                        <optgroup key={vol.id} label={vol.title || vol.name || '未命名卷'}>
                          {volChapters.map(ch => (
                            <option key={ch.id} value={String(ch.id)}>
                              第 {ch.index} 章 {ch.title}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                    {chaptersWithoutVolume.length > 0 && (
                      <optgroup label="未分卷章节">
                        {chaptersWithoutVolume.map(ch => (
                          <option key={ch.id} value={String(ch.id)}>
                            第 {ch.index} 章 {ch.title}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
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



