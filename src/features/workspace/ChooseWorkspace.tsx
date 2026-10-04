/**
 * 工作区选择 / 失效处理页（批 3b）
 *
 * 三个出口始终可达，保证「任何情况下应用都能打开」：
 *   1. 选择已有文件夹
 *   2. 新建工作区
 *   3. 以浏览器数据继续（跳过工作区）
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  FolderOpen,
  Loader2,
  Monitor,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { WorkspaceMetaError, portablePath, slugify } from '../../workspace';
import { createWorkspaceAt, pickDirectory, saveStoredPath, tauriProbe } from './tauriBackend';
import { describeError } from './gateMachine';
import { ProbeError } from './types';
import type { GateState, InvalidReason } from './types';
import type { WorkspaceMeta } from '../../workspace';

interface ChooseWorkspaceProps {
  state: GateState;
  /** 校验通过 → 交给门卫进主界面 */
  onReady: (path: string, meta: WorkspaceMeta) => void;
  /** 「以浏览器数据继续」 */
  onBypass: (message?: string) => void;
  /** 重新探测（错误态重试） */
  onRetry: () => void;
}

/** 每种失效原因对应的一句人话 */
const REASON_TEXT: Record<InvalidReason, string> = {
  missing: '这个文件夹不在了（可能被删除、移动，或所在磁盘未连接）。',
  'no-workspace-file': '这个文件夹里没有工作区文件。',
  forbidden: '应用失去了对这个文件夹的访问授权（常见于重启后授权未能持久化）。',
  corrupt: '工作区文件已损坏，或格式不合法。',
  'schema-too-new': '这个工作区由更新版本的「写作台」创建，当前版本无法安全打开。',
  'schema-too-old': '工作区文件里的版本号不合法。',
  unknown: '打开工作区时遇到了未预期的错误。',
};

/** 失效时主按钮的文案（不同原因对应不同动作） */
function primaryActionLabel(reason?: InvalidReason): string {
  if (reason === 'forbidden') return '重新选择这个文件夹';
  if (reason === 'missing') return '重新定位工作区';
  return '重新选择工作区';
}

function friendlyError(error: unknown): string {
  if (error instanceof WorkspaceMetaError) {
    if (error.code === 'schema-too-new') {
      return `${error.message}\n（出于数据安全考虑，这里不提供「强制打开」，请先升级应用。）`;
    }
    return error.message;
  }
  if (error instanceof ProbeError) return error.message;
  return describeError(error);
}

function looksLikeForbidden(message: string): boolean {
  return /forbidden|not allowed|denied|permission/i.test(message);
}

export function ChooseWorkspace({ state, onReady, onBypass, onRetry }: ChooseWorkspaceProps) {
  const [busy, setBusy] = useState<'picking' | 'creating' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingRoot, setPendingRoot] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState('我的写作台');

  const isInvalid = state.stage === 'invalid';
  const isError = state.stage === 'error';
  const slug = slugify(workspaceName) || 'workspace';

  /** 选择已有文件夹 → 校验 → 直接进，或引导就地新建 */
  async function chooseExisting() {
    setError(null);
    setNotice(null);
    setPendingRoot(null);
    setBusy('picking');
    let picked: string | null = null;
    try {
      picked = await pickDirectory('选择工作区文件夹');
      if (!picked) return; // 用户取消
      const meta = await tauriProbe.readMeta(picked);
      await saveStoredPath(picked);
      onReady(picked, meta);
    } catch (err) {
      if (err instanceof ProbeError && err.reason === 'no-workspace-file' && picked) {
        setPendingRoot(picked);
        setNotice(`「${picked}」里没有工作区。要在这里新建一个吗？`);
        return;
      }
      setError(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  /** 新建：选父目录 → 拼 root → 冲突检查 → 建骨架 */
  async function createNew() {
    setError(null);
    setNotice(null);
    setPendingRoot(null);
    setBusy('picking');
    try {
      const parent = await pickDirectory('选择存放位置（父文件夹）');
      if (!parent) return;
      const root = portablePath.join(parent, slug);

      // 目录已存在？—— 已是有效工作区则复用；否则需二次确认（用户拍板 #6）
      let existing = false;
      try {
        existing = await tauriProbe.exists(root);
      } catch {
        existing = false; // 越界等异常交给下面的创建流程报错并给兜底提示
      }
      if (existing) {
        try {
          const meta = await tauriProbe.readMeta(root);
          await saveStoredPath(root);
          onReady(root, meta);
          return;
        } catch {
          setPendingRoot(root);
          setNotice(
            `「${root}」已经存在，但它不是一个有效的工作区。仍要在这里建工作区吗？（不会删除里面已有的文件）`,
          );
          return;
        }
      }
      await doCreate(root);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  /** 真正建骨架：建完必须能读回来才算成功 */
  async function doCreate(root: string) {
    setBusy('creating');
    setError(null);
    try {
      await createWorkspaceAt(root, workspaceName.trim() || undefined);
      const meta = await tauriProbe.readMeta(root);
      await saveStoredPath(root);
      setPendingRoot(null);
      setNotice(null);
      onReady(root, meta);
    } catch (err) {
      const message = describeError(err);
      if (looksLikeForbidden(message)) {
        // 把「为什么写不进去」变成一句可执行的提示，而不是死路
        setError(
          `新目录不在应用的授权范围内。\n请改用「选择已有文件夹」直接选中：\n${root}\n（选中该文件夹即完成授权）\n\n技术细节：${message}`,
        );
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-xl space-y-5 rounded-xl border border-border bg-card p-7 text-card-foreground shadow-2xl">
        <header className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <FolderOpen className="h-5 w-5" />
            </span>
            <h1 className="text-lg font-semibold">{isInvalid ? '工作区不可用' : '选择工作区'}</h1>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {isInvalid
              ? '上次使用的工作区打不开了。下面是原因，以及可以做的事。'
              : '「写作台」把作品存放在你自己选择的文件夹里。一个工作区可以放所有作品，方便备份与同步。'}
          </p>
        </header>

        {/* 失效详情：原因 + 原路径 + 技术细节 */}
        {isInvalid && (
          <section className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm">{state.reason ? REASON_TEXT[state.reason] : REASON_TEXT.unknown}</p>
                {state.workspacePath && (
                  <code className="block break-all rounded bg-background/60 px-2 py-1.5 text-xs text-muted-foreground">
                    {state.workspacePath}
                  </code>
                )}
                {state.message && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none">技术细节</summary>
                    <p className="mt-1 break-all">{state.message}</p>
                  </details>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 门卫自身异常 */}
        {isError && (
          <section className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            <p className="text-sm">启动检查时出错：{state.message ?? '未知错误'}</p>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-3 py-2 text-xs hover:bg-accent"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </button>
          </section>
        )}

        {/* 两个主操作 */}
        <div className="space-y-2.5">
          <ActionButton
            icon={<FolderOpen className="h-4 w-4" />}
            title={isInvalid ? primaryActionLabel(state.reason) : '选择已有文件夹'}
            desc="打开一个已有的工作区"
            onClick={chooseExisting}
            disabled={busy !== null}
            loading={busy === 'picking'}
            primary
          />
          <ActionButton
            icon={<Sparkles className="h-4 w-4" />}
            title="新建工作区"
            desc="选一个位置，替你把目录建好"
            onClick={createNew}
            disabled={busy !== null}
            loading={busy === 'creating'}
          />
        </div>

        {/* 新建时的工作区名 */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="ws-name">
            工作区名称（新建时使用）
          </label>
          <input
            id="ws-name"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            placeholder="我的写作台"
            disabled={busy !== null}
          />
          <p className="text-xs text-muted-foreground">
            将创建为子文件夹：<code className="text-foreground">{slug}</code>
          </p>
        </div>

        {/* 二次确认（目录已存在 / 就地新建） */}
        {pendingRoot && notice && (
          <section className="space-y-3 rounded-lg border border-border bg-secondary/60 p-4">
            <p className="break-words text-sm">{notice}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void doCreate(pendingRoot)}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy === 'creating' ? '正在创建…' : '在这里新建'}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setPendingRoot(null);
                  setNotice(null);
                }}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                取消
              </button>
            </div>
          </section>
        )}

        {/* 错误框 */}
        {error && (
          <section className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            <p className="whitespace-pre-wrap break-words text-sm">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs hover:bg-accent"
            >
              知道了
            </button>
          </section>
        )}

        <footer className="space-y-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => onBypass('已跳过工作区设置，应用以浏览器数据继续。')}
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Monitor className="h-3.5 w-3.5" />
            暂不设置，直接开始写作（以浏览器数据继续）
          </button>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            数据落盘将在后续版本启用，当前工作区仅用于记录位置。
          </p>
        </footer>
      </div>
    </div>
  );
}

interface ActionButtonProps {
  icon: ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  primary?: boolean;
}

function ActionButton({ icon, title, desc, onClick, disabled, loading, primary }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-60',
        primary
          ? 'border-primary/40 bg-primary/10 hover:bg-primary/20'
          : 'border-border bg-secondary/40 hover:bg-accent',
      ].join(' ')}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/60 text-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}
