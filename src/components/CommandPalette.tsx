import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, Library, Database, Wrench, ShieldAlert, Lightbulb,
  Download, Settings, FileText, User, Globe, List, BookOpen,
  Layers, Film, Search, ArrowRight
} from 'lucide-react';
import { db } from '../db';

interface SearchResult {
  id: string;
  type: string;       // "人物卡" / "世界观" / "章节" / "卷" / "剧情卡" / "场景卡"
  label: string;
  sub?: string;
  projectName?: string;
  path: string;
}

async function searchAll(query: string): Promise<SearchResult[]> {
  const q = query.toLowerCase().trim();
  if (q.length < 1) return [];

  const results: SearchResult[] = [];
  const match = (s?: string) => !!(s && s.toLowerCase().includes(q));

  try {
    // 1. 项目
    const projects = await db.projects.toArray();
    projects
      .filter(p => match(p.name) || match(p.description))
      .slice(0, 5)
      .forEach(p => results.push({
        id: `proj-${p.id}`,
        type: '项目',
        label: p.name,
        sub: p.description?.slice(0, 40),
        path: `/project/${p.id}`,
      }));

    // 2. 人物卡
    const characters = await db.characters.toArray();
    for (const c of characters.filter(c => match(c.name) || match(c.identity) || match(c.personality)).slice(0, 10)) {
      const proj = projects.find(x => x.id === c.projectId);
      results.push({
        id: `char-${c.id}`,
        type: '人物卡',
        label: c.name,
        sub: c.identity || (c.role === 'protagonist' ? '主角' : c.role === 'antagonist' ? '反派' : ''),
        projectName: proj?.name,
        path: `/project/${c.projectId}/character`,
      });
    }

    // 3. 世界观
    const settings = await db.worldSettings.toArray();
    for (const s of settings.filter(s => match(s.name) || match(s.description)).slice(0, 5)) {
      const proj = projects.find(x => x.id === s.projectId);
      results.push({
        id: `world-${s.id}`,
        type: '世界观',
        label: s.name,
        sub: s.category,
        projectName: proj?.name,
        path: `/project/${s.projectId}/world`,
      });
    }

    // 4. 卷
    const volumes = await db.volumes.toArray();
    for (const v of volumes.filter(v => match(v.title) || match(v.summary)).slice(0, 5)) {
      const proj = projects.find(x => x.id === v.projectId);
      results.push({
        id: `vol-${v.id}`,
        type: '卷',
        label: v.title,
        sub: v.summary?.slice(0, 40),
        projectName: proj?.name,
        path: `/project/${v.projectId}/outline`,
      });
    }

    // 5. 章节
    const chapters = await db.chapters.toArray();
    for (const ch of chapters.filter(ch => match(ch.title) || match(ch.outline)).slice(0, 10)) {
      const proj = projects.find(x => x.id === ch.projectId);
      results.push({
        id: `ch-${ch.id}`,
        type: '章节',
        label: ch.title,
        sub: ch.outline?.slice(0, 40),
        projectName: proj?.name,
        path: `/project/${ch.projectId}/chapter?chapterId=${ch.id}`,
      });
    }

    // 6. 灵感
    const inspirations = await db.inspirations.toArray();
    inspirations
      .filter(i => match(i.title) || match(i.content))
      .slice(0, 5)
      .forEach(i => results.push({
        id: `insp-${i.id}`,
        type: '灵感',
        label: i.title,
        sub: i.content?.slice(0, 40),
        path: '/inspirations',
      }));

    // 7. 资料库（LibraryItem 无 description 字段：按 name / 来源作品 / 快照内容匹配）
    const libItems = await db.libraryItems.toArray();
    libItems
      .filter(l => match(l.name) || match(l.sourceProjectName) || match(typeof l.content === 'string' ? l.content : JSON.stringify(l.content)))
      .slice(0, 5)
      .forEach(l => results.push({
        id: `lib-${l.id}`,
        type: '资料库',
        label: l.name,
        sub: l.sourceProjectName || (typeof l.content?.description === 'string' ? l.content.description.slice(0, 40) : undefined),
        path: '/library',
      }));

    // 8. 剧情卡
    const plots = await db.plotCards.toArray();
    for (const p of plots.filter(p => match(p.title) || match(p.description)).slice(0, 5)) {
      const proj = projects.find(x => x.id === p.projectId);
      results.push({
        id: `plot-${p.id}`,
        type: '剧情卡',
        label: p.title || '',
        sub: p.description?.slice(0, 40),
        projectName: proj?.name,
        path: `/project/${p.projectId}/plotCards`,
      });
    }

    // 9. 场景卡
    const scenes = await db.sceneCards.toArray();
    for (const s of scenes.filter(s => match(s.title) || match(s.description) || match(s.atmosphere)).slice(0, 5)) {
      const proj = projects.find(x => x.id === s.projectId);
      results.push({
        id: `scene-${s.id}`,
        type: '场景卡',
        label: s.title || '',
        sub: s.description?.slice(0, 40),
        projectName: proj?.name,
        path: `/project/${s.projectId}/sceneCards`,
      });
    }

  } catch (error) {
    console.error('搜索失败:', error);
  }

  return results;
}

interface Command {
  id: string;
  label: string;
  keywords: string;
  icon: any;
  group: '跳转' | '项目';
  path: string;
}

const GLOBAL_COMMANDS: Command[] = [
  { id: 'g-project', label: '项目列表', keywords: 'project xiangmu 项目 首页', icon: Home, group: '跳转', path: '/' },
  { id: 'g-analysis', label: '书库', keywords: 'analysis shuku 书库 拆书', icon: Library, group: '跳转', path: '/analysis' },
  { id: 'g-library', label: '资料库', keywords: 'library ziliao 资料库', icon: Database, group: '跳转', path: '/library' },
  { id: 'g-writing', label: '写作工具箱', keywords: 'writing gongjuxiang 写作 技巧 文风', icon: Wrench, group: '跳转', path: '/writing' },
  { id: 'g-rejections', label: '审核避雷', keywords: 'rejections shenhe bilei 避雷 规则', icon: ShieldAlert, group: '跳转', path: '/rejections' },
  { id: 'g-inspirations', label: '灵感库', keywords: 'inspirations linggan 灵感', icon: Lightbulb, group: '跳转', path: '/inspirations' },
  { id: 'g-practice', label: '写作练习', keywords: 'practice xiezuolianxi 写作 练习 练笔', icon: BookOpen, group: '跳转', path: '/practice' },
  { id: 'g-export', label: '导出备份', keywords: 'export daochu 导出 备份', icon: Download, group: '跳转', path: '/export' },
  { id: 'g-settings', label: '设置', keywords: 'settings shezhi 设置 ai', icon: Settings, group: '跳转', path: '/settings' },
];

function buildProjectCommands(projectId: string): Command[] {
  const p = (sub: string) => `/project/${projectId}${sub}`;
  return [
    { id: 'p-workbench', label: '工作台', keywords: 'workbench gongzuotai 工作台', icon: BookOpen, group: '项目', path: p('') },
    { id: 'p-characters', label: '人物卡', keywords: 'characters renwu 人物卡', icon: User, group: '项目', path: p('/character') },
    { id: 'p-world', label: '世界观', keywords: 'world shijieguan 世界观 设定', icon: Globe, group: '项目', path: p('/world') },
    { id: 'p-outline', label: '大纲', keywords: 'outline dagang 大纲 卷纲 章纲', icon: List, group: '项目', path: p('/outline') },
    { id: 'p-chapter', label: '正文', keywords: 'chapter zhengwen 正文 编辑', icon: FileText, group: '项目', path: p('/chapter') },
    { id: 'p-plot', label: '剧情卡', keywords: 'plot juqing 剧情卡', icon: Layers, group: '项目', path: p('/plotCards') },
    { id: 'p-scene', label: '场景卡', keywords: 'scene changjing 场景卡', icon: Film, group: '项目', path: p('/sceneCards') },
  ];
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  // ===== 项目内搜索结果（第 2 批） =====
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // 从当前 URL 提取 projectId
  const projectId = useMemo(() => {
    const m = location.pathname.match(/\/project\/(\d+)/);
    return m ? m[1] : null;
  }, [location.pathname]);

  const commands = useMemo(() => {
    return projectId
      ? [...GLOBAL_COMMANDS, ...buildProjectCommands(projectId)]
      : GLOBAL_COMMANDS;
  }, [projectId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase().trim();
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.keywords.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // 防抖搜索：输入变化后 300ms 触发
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchAll(query);
      setSearchResults(results);
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // ⌘K / Ctrl+K 监听
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 打开时重置
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  // 上下键 + 回车
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const totalCount = filtered.length + searchResults.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, totalCount - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const allItems = [...filtered.map(c => ({ path: c.path })), ...searchResults];
        const current = allItems[selectedIndex];
        if (current) {
          navigate(current.path);
          setOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, searchResults, selectedIndex, navigate]);

  if (!open) return null;

  // 按 group 分组
  const grouped = filtered.reduce((acc, cmd) => {
    if (!acc[cmd.group]) acc[cmd.group] = [];
    acc[cmd.group].push(cmd);
    return acc;
  }, {} as Record<string, Command[]>);

  let flatIndex = 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-[100] pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="glass-card rounded-xl w-full max-w-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 输入框 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="搜索页面或输入指令..."
            className="flex-1 bg-transparent text-foreground outline-none text-sm"
            autoFocus
          />
          <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* 结果列表 */}
        <div className="max-h-[400px] overflow-y-auto p-2">
          {filtered.length === 0 && searchResults.length === 0 && !searching ? (
            <p className="text-center py-8 text-sm text-muted-foreground">没有匹配的命令</p>
          ) : (
            Object.entries(grouped).map(([group, cmds]) => (
              <div key={group} className="mb-2">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {group}
                </div>
                {cmds.map(cmd => {
                  const Icon = cmd.icon;
                  const isSelected = flatIndex === selectedIndex;
                  const currentFlatIndex = flatIndex++;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => { navigate(cmd.path); setOpen(false); }}
                      onMouseEnter={() => setSelectedIndex(currentFlatIndex)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isSelected
                          ? 'bg-primary/15 text-primary'
                          : 'text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 text-left">{cmd.label}</span>
                      {isSelected && <ArrowRight className="w-3.5 h-3.5 opacity-60" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}

          {searchResults.length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                搜索「{query}」
              </div>
              {searchResults.map((result, idx) => {
                const globalIdx = filtered.length + idx;
                const isSelected = globalIdx === selectedIndex;
                return (
                  <button
                    key={result.id}
                    onClick={() => { navigate(result.path); setOpen(false); }}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isSelected
                        ? 'bg-primary/15 text-primary'
                        : 'text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full shrink-0">
                      {result.type}
                    </span>
                    <span className="flex-1 text-left truncate">{result.label}</span>
                    {(result.projectName || result.sub) && (
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {result.projectName && result.sub ? `${result.projectName} · ${result.sub}` : result.projectName || result.sub}
                      </span>
                    )}
                    {isSelected && <ArrowRight className="w-3.5 h-3.5 opacity-60 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {searching && searchResults.length === 0 && (
            <div className="text-center py-4 text-xs text-muted-foreground">搜索中...</div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-muted-foreground">
          <span>↑↓ 选择</span>
          <span>↵ 跳转</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
