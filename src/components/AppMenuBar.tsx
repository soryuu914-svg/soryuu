import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauriEnv } from '../features/workspace/isTauri';
import pkg from '../../package.json';

/**
 * 自定义应用菜单栏（替代 Windows 原生菜单栏，样式与界面暗紫主题一致，VSCode 风格）。
 *
 * 仅桌面模式（isTauriEnv）渲染；浏览器模式返回 null 降级为无菜单。
 *
 * 实现要点：
 * - 触发按钮与下拉项都用 onMouseDown preventDefault —— 防止点击菜单夺走焦点，
 *   这样撤销/重做/剪切/复制等 execCommand 才能作用于"当前焦点所在的输入框"
 * - 撤销/重做走 webview 原生 undo 栈：对普通 input/textarea 有效；
 *   TipTap 编辑器有自己的历史栈（ProseMirror），编辑器内撤销靠 Ctrl+Z，菜单项对其无效（已知局限）
 * - 粘贴：Chromium 系不支持 execCommand('paste')，改走 clipboard API 读文本后 insertText 插入；
 *   若 WebView2 拒绝剪贴板读取权限则静默失败（只能 Ctrl+V）
 */
interface MenuAction {
  label: string;
  run: () => void;
}

export default function AppMenuBar() {
  const [mounted, setMounted] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 首帧后再判定环境（避免 SSR/首帧闪烁，也和 isTauriEnv 的注入时机兼容）
    setMounted(true);
  }, []);

  // 点击外部关闭 + Esc 关闭
  useEffect(() => {
    if (!openMenu && !showAbout) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setShowAbout(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu, showAbout]);

  if (!mounted || !isTauriEnv()) return null;

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
  };

  const doPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) exec('insertText', text);
    } catch {
      // WebView2 拒绝剪贴板读取：静默失败（用户可用 Ctrl+V）
    }
  };

  const doFullscreen = async () => {
    const win = getCurrentWindow();
    const cur = await win.isFullscreen();
    await win.setFullscreen(!cur);
  };

  const doExit = async () => {
    try {
      await invoke('exit_app');
    } catch {
      window.close(); // 兜底（Tauri 下会触发 CloseRequested → 隐藏到托盘）
    }
  };

  const menus: Array<{ label: string; items: MenuAction[] }> = [
    {
      label: '文件',
      items: [{ label: '退出', run: () => { void doExit(); } }],
    },
    {
      label: '编辑',
      items: [
        { label: '撤销', run: () => exec('undo') },
        { label: '重做', run: () => exec('redo') },
        { label: '剪切', run: () => exec('cut') },
        { label: '复制', run: () => exec('copy') },
        { label: '粘贴', run: () => { void doPaste(); } },
        { label: '全选', run: () => exec('selectAll') },
      ],
    },
    {
      label: '视图',
      items: [{ label: '切换全屏', run: () => { void doFullscreen(); } }],
    },
    {
      label: '帮助',
      items: [{ label: '关于写作台', run: () => setShowAbout(true) }],
    },
  ];

  return (
    <>
      <div ref={containerRef} className="relative z-40 flex items-center h-8 bg-card/50 border-b border-border text-sm px-3 select-none">
        {menus.map((menu) => (
          <div key={menu.label} className="relative">
            <button
              type="button"
              // preventDefault：点击菜单名不夺走输入框焦点（execCommand 依赖焦点）
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
              className={`px-3 py-0.5 rounded transition-colors ${
                openMenu === menu.label
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {menu.label}
            </button>
            {openMenu === menu.label && (
              <div className="absolute left-0 top-full mt-1 min-w-[140px] bg-card border border-border rounded-lg shadow-lg py-1">
                {menu.items.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpenMenu(null);
                      item.run();
                    }}
                    className="block w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 关于弹窗 */}
      {showAbout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowAbout(false)}
        >
          <div
            className="bg-card border border-border rounded-lg shadow-lg p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">📖</span>
              <h2 className="text-lg font-semibold text-foreground">关于写作台</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-6">
              写作台 v{pkg.version}
              <br />
              网文创作工作台
            </p>
            <div className="flex justify-end mt-5">
              <button
                type="button"
                onClick={() => setShowAbout(false)}
                className="px-4 py-1.5 h-9 bg-accent border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
