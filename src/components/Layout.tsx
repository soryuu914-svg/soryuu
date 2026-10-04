import { Link, Outlet, useParams, useLocation } from 'react-router-dom';
import { BookOpen, Home, Users, Globe, List, FileText, Library, Settings, Download, Database, ShieldAlert, Lightbulb, Drama, MapPin, Wrench, Search, Anchor } from 'lucide-react';
import { useEffect, useState } from 'react';
import CommandPalette from './CommandPalette';
import AppMenuBar from './AppMenuBar';

export default function Layout() {
  const { id } = useParams();
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());

  // 更新时间
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 判断当前路由是否激活
  const isActive = (path: string) => {
    return location.pathname === path;
  };

  // 判断路由是否以指定路径开头
  const isActivePrefix = (prefix: string) => {
    return location.pathname.startsWith(prefix);
  };

  // 顶部栏全局功能菜单
  const topMenuItems = [
    { label: '项目列表', path: '/', icon: Home },
    { label: '书库', path: '/analysis', icon: Library },
    { label: '资料库', path: '/library', icon: Database },
    { label: '写作工具箱', path: '/writing', icon: Wrench },
    { label: '审核避雷', path: '/rejections', icon: ShieldAlert },
    { label: '灵感库', path: '/inspirations', icon: Lightbulb },
    { label: '写作练习', path: '/practice', icon: BookOpen },
  ];

  // 项目内导航（左侧）
  const projectNavItems = id ? [
    { label: '工作台', path: `/project/${id}`, icon: BookOpen },
    { label: '人物卡', path: `/project/${id}/character`, icon: Users },
    { label: '世界观', path: `/project/${id}/world`, icon: Globe },
    { label: '大纲', path: `/project/${id}/outline`, icon: List },
    { label: '伏笔', path: `/project/${id}/foreshadows`, icon: Anchor },
    { label: '正文', path: `/project/${id}/chapter`, icon: FileText },
    { label: '剧情卡', path: `/project/${id}/plotCards`, icon: Drama },
    { label: '场景卡', path: `/project/${id}/sceneCards`, icon: MapPin },
  ] : [];

  return (
    <div
      className="flex flex-col h-screen"
      style={{
        background: `
          radial-gradient(900px 520px at 88% -12%, rgba(167,139,250,.35), transparent 60%),
          radial-gradient(760px 600px at -8% 110%, rgba(120,96,180,.25), transparent 60%),
          #0a0a0b
        `,
        backgroundAttachment: 'fixed',
      }}
    >
      {/* 自定义菜单栏（仅桌面模式显示，浏览器模式自动隐藏） */}
      <AppMenuBar />

      {/* 顶部栏 */}
      <header className="h-16 bg-card/70 backdrop-blur-xl border-b border-primary/10 flex items-center px-6 relative">
        {/* 左侧品牌 */}
        <div className="flex items-center gap-2 mr-8">
          <FileText size={24} className="text-primary" />
          <h1 className="text-lg font-semibold text-foreground">写作台</h1>
        </div>

        {/* 中间全局功能菜单 */}
        <nav className="flex items-center gap-1 flex-1">
          {topMenuItems.map((item) => {
            const Icon = item.icon;
            const active = item.path === '/'
              ? isActive(item.path)
              : isActivePrefix(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${
                  active
                    ? 'text-primary bg-primary/15 font-semibold after:absolute after:-bottom-2 after:left-2 after:right-2 after:h-0.5 after:bg-primary after:rounded-full after:shadow-[0_0_8px_rgba(168,130,255,0.6)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* 右侧功能按钮 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              // 派发 ⌘K 事件，让 CommandPalette 打开
              const evt = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, metaKey: true, bubbles: true });
              window.dispatchEvent(evt);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-sm"
            title="搜索 / ⌘K"
          >
            <Search className="w-4 h-4" />
            <span className="hidden md:inline">搜索</span>
            <kbd className="hidden md:inline text-[10px] border border-border rounded px-1.5 py-0.5 ml-1">⌘K</kbd>
          </button>
          <Link
            to="/export"
            className={`p-2 rounded-md transition-colors ${
              isActive('/export')
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title="导出备份"
          >
            <Download size={18} />
          </Link>
          <Link
            to="/settings"
            className={`p-2 rounded-md transition-colors ${
              isActive('/settings')
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title="设置"
          >
            <Settings size={18} />
          </Link>
        </div>

        {/* 底部渐变发光线 */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent pointer-events-none" />
      </header>

      {/* 主体区域 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧项目内导航（仅在项目内显示）*/}
        {projectNavItems.length > 0 && (
          <aside className="w-52 bg-card/50 backdrop-blur-lg border-r border-primary/10 overflow-y-auto">
            <nav className="p-3 space-y-1">
              {projectNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors mr-2 ${
                      active
                        ? 'bg-primary/10 text-primary border-l-2 border-primary pl-2.5'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-sm">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        )}

        {/* 右侧内容区 */}
        <main className="flex-1 overflow-auto bg-transparent">
          <Outlet />
        </main>
      </div>

      {/* 底部状态栏 */}
      <footer className="h-7 border-t border-primary/10 bg-black/40 backdrop-blur flex items-center px-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="text-green-500">●</span>
          <span>已保存</span>
        </div>
        <div className="flex-1"></div>
        <div className="flex items-center gap-4">
          <span>字数 0</span>
          <span>{currentTime.toLocaleTimeString('zh-CN', { hour12: false })}</span>
        </div>
      </footer>

      {/* ⌘K 命令面板 */}
      <CommandPalette />
    </div>
  );
}
