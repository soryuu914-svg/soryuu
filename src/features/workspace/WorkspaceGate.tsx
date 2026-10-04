/**
 * 启动门卫（批 3b）
 *
 * 挂在 `main.tsx` 的 `ErrorBoundary` **内层**、`App` 的外层：
 * ```
 * <ErrorBoundary><WorkspaceGate><App /></WorkspaceGate></ErrorBoundary>
 * ```
 *
 * ★ 硬约束：`ErrorBoundary` **不捕获 Promise rejection** ⇒ 本组件内任何 async 失败
 *   都必须转成 state，禁止向外 throw（否则会白屏，或永远停在加载态）。
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ChooseWorkspace } from './ChooseWorkspace';
import { decideBootstrap, describeError, readyState } from './gateMachine';
import { isGateDisabledByEnv, isTauriEnv } from './isTauri';
import { readStoredPath, tauriProbe } from './tauriBackend';
import { CHECKING_STATE } from './types';
import type { ReactNode } from 'react';
import type { GateState } from './types';
import type { WorkspaceMeta } from '../../workspace';

/**
 * 模块级 promise 缓存 —— dev 的 StrictMode 会让 `useEffect` 跑两次，
 * 用它可以复用第一次的结果（比 `useRef` 更彻底，还能防「弹出两个目录选择框」）。
 * 同项目先例：`src/db/index.ts` 用 localStorage 标记防双执行。
 */
let bootstrapOnce: Promise<GateState> | null = null;

function runBootstrap(): Promise<GateState> {
  return decideBootstrap({
    isTauri: isTauriEnv(),
    gateDisabled: isGateDisabledByEnv(),
    readStoredPath,
    probe: tauriProbe,
  }).catch(
    (error: unknown): GateState => ({
      stage: 'error',
      workspacePath: null,
      meta: null,
      message: describeError(error),
      trace: ['bootstrap 抛出未捕获异常'],
    }),
  );
}

function getBootstrap(): Promise<GateState> {
  bootstrapOnce ??= runBootstrap();
  return bootstrapOnce;
}

/** 清掉缓存（重试 / 将来「切换工作区」复用） */
export function resetBootstrapCache(): void {
  bootstrapOnce = null;
}

export function WorkspaceGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>(CHECKING_STATE);

  useEffect(() => {
    let alive = true;
    void getBootstrap().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleReady = useCallback((path: string, meta: WorkspaceMeta) => {
    setState(readyState(path, meta, ['用户完成工作区选择']));
  }, []);

  const handleBypass = useCallback((message?: string) => {
    setState({
      stage: 'bypassed',
      workspacePath: null,
      meta: null,
      bypassReason: 'browser',
      message,
      trace: ['用户选择以浏览器数据继续'],
    });
  }, []);

  const handleRetry = useCallback(() => {
    resetBootstrapCache();
    setState(CHECKING_STATE);
    void getBootstrap().then(setState);
  }, []);

  // ready / bypassed → 正常进主界面
  if (state.stage === 'ready' || state.stage === 'bypassed') return <>{children}</>;

  if (state.stage === 'checking') return <GateLoading />;

  // need-select / invalid / error → 交给选择页（三个出口始终可达）
  return (
    <ChooseWorkspace
      state={state}
      onReady={handleReady}
      onBypass={handleBypass}
      onRetry={handleRetry}
    />
  );
}

/**
 * 极简加载态。
 * - **不依赖路由、不依赖 Layout**（此时还没进主界面）
 * - 防闪：校验通常 <50ms，所以 120ms 内不渲染 spinner，避免每次启动闪一下
 */
function GateLoading() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      {visible && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>正在检查工作区…</span>
        </div>
      )}
    </div>
  );
}

export default WorkspaceGate;
