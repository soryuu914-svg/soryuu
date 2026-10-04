import { useState, useEffect } from 'react';
import { Save, Key, AlertCircle, Zap, AlertTriangle, Trash2, ChevronDown, ChevronUp, Info, MessageCircle, ShieldCheck, Keyboard, Bot, Settings, FolderOpen, FolderPlus, Copy, RefreshCw } from 'lucide-react';
import { saveAIConfig, getAIConfig, askAI } from '../ai/client';
import { handleAIError, getErrorLogs, clearErrorLogs } from '../../utils/errorHandler';
// 工作区（批 3c）：只读这些 API，不改动它们
import { isTauriEnv } from '../workspace/isTauri';
import { createWorkspaceAt, pickDirectory, readStoredPath, saveStoredPath, tauriProbe } from '../workspace/tauriBackend';
import { ProbeError } from '../workspace/types';
import { WorkspaceMetaError } from '../../workspace';
import type { WorkspaceMeta } from '../../workspace';
import pkg from '../../../package.json';

// 应用版本号：唯一来源为 package.json（Tauri 打包后同样读这里）
const APP_VERSION = pkg.version;

// 全项目已实现的快捷键（来源：grep keydown / metaKey / ctrlKey）
const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: '⌘K / Ctrl+K', desc: '打开命令面板' },
  { keys: '↑ / ↓', desc: '命令面板中上下选择' },
  { keys: 'Enter', desc: '命令面板中确认选中项' },
  { keys: 'Esc', desc: '关闭命令面板 / 弹窗' },
  { keys: '⌘\\ / Ctrl+\\', desc: '切换写作页右侧面板' },
];

// 设置页分类（左侧导航）
type SettingsSection = 'ai' | 'general' | 'workspace' | 'about' | 'logs';

const NAV_ITEMS: { id: SettingsSection; label: string; icon: typeof Bot }[] = [
  { id: 'ai', label: 'AI 配置', icon: Bot },
  { id: 'general', label: '通用', icon: Settings },
  { id: 'workspace', label: '工作区', icon: FolderOpen },
  { id: 'about', label: '关于与帮助', icon: Info },
  { id: 'logs', label: '错误日志', icon: AlertCircle },
];

// 服务商预设配置
const AI_PRESETS = [
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    name: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-32k',
  },
  {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
  },
  {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.5-sonnet',
  },
  {
    name: '自定义',
    baseUrl: '',
    model: '',
  },
];

export default function SettingsPage() {
  const [selectedPreset, setSelectedPreset] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [maxTokens, setMaxTokens] = useState('8192');
  const [isSaved, setIsSaved] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showErrorLogs, setShowErrorLogs] = useState(false);
  const [errorLogs, setErrorLogs] = useState(getErrorLogs());
  // 当前分类（左侧导航），默认「AI 配置」
  const [activeSection, setActiveSection] = useState<SettingsSection>('ai');

  // ── 工作区（批 3c）─────────────────────────────────────────
  // 是否运行在桌面版（Tauri）。浏览器下整块降级为只读说明，不调用任何 Tauri API。
  const [isDesktop] = useState(() => isTauriEnv());
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [workspaceMeta, setWorkspaceMeta] = useState<WorkspaceMeta | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);

  // 页面加载时从 localStorage 读取配置
  useEffect(() => {
    const config = getAIConfig();
    if (config.baseUrl) {
      setBaseUrl(config.baseUrl);
      setApiKey(config.apiKey);
      setModel(config.model);
      setMaxTokens(String(config.maxTokens));

      // 尝试匹配预设
      const preset = AI_PRESETS.find(
        (p) => p.baseUrl === config.baseUrl && p.model === config.model
      );
      if (preset) {
        setSelectedPreset(preset.name);
      } else {
        setSelectedPreset('自定义');
      }
    }
  }, []);

  // 切换预设
  const handlePresetChange = (presetName: string) => {
    setSelectedPreset(presetName);
    const preset = AI_PRESETS.find((p) => p.name === presetName);
    if (preset) {
      setBaseUrl(preset.baseUrl);
      setModel(preset.model);
    }
  };

  // 保存配置
  const handleSave = () => {
    if (!baseUrl.trim()) {
      alert('请输入 Base URL');
      return;
    }
    if (!apiKey.trim()) {
      alert('请输入 API Key');
      return;
    }
    if (!model.trim()) {
      alert('请输入模型名称');
      return;
    }
    const maxTokensNum = parseInt(maxTokens, 10);
    if (!Number.isFinite(maxTokensNum) || maxTokensNum <= 0) {
      alert('最大输出 tokens 必须是正整数');
      return;
    }

    saveAIConfig(baseUrl, apiKey, model, maxTokensNum);
    setIsSaved(true);

    // 3秒后隐藏保存成功提示
    setTimeout(() => {
      setIsSaved(false);
    }, 3000);
  };

  // 测试连接
  const handleTest = async () => {
    if (!baseUrl.trim() || !apiKey.trim() || !model.trim()) {
      alert('请先填写完整的配置信息');
      return;
    }

    // 先保存配置（含最大输出 tokens）
    const testMaxTokens = parseInt(maxTokens, 10);
    saveAIConfig(baseUrl, apiKey, model, Number.isFinite(testMaxTokens) && testMaxTokens > 0 ? testMaxTokens : undefined);

    setIsTesting(true);
    try {
      const response = await askAI({
        user: '你好，请回复"连接成功"',
      });
      alert(`✓ 连接成功！\n\nAI 回复：${response}`);
    } catch (error) {
      handleAIError(error);
    } finally {
      setIsTesting(false);
    }
  };

  // 清空错误日志
  const handleClearLogs = () => {
    if (confirm('确定要清空所有错误日志吗？')) {
      clearErrorLogs();
      setErrorLogs([]);
    }
  };

  // 刷新错误日志
  const handleRefreshLogs = () => {
    setErrorLogs(getErrorLogs());
  };

  // 读取「当前工作区」（只读；浏览器下直接跳过，保证降级不崩）
  useEffect(() => {
    if (!isDesktop) return;
    let alive = true;
    void (async () => {
      try {
        const path = await readStoredPath();
        if (!alive) return;
        setWorkspacePath(path);
        if (!path) return;
        try {
          const meta = await tauriProbe.readMeta(path);
          if (alive) setWorkspaceMeta(meta);
        } catch {
          // 路径已失效：这里不报错，启动门卫会负责引导（重新选择 / 新建）
        }
      } catch {
        // store 不可读 → 当作「未设置」
      }
    })();
    return () => {
      alive = false;
    };
  }, [isDesktop]);

  /** 把工作区相关异常翻译成一句可操作的提示（「切换」与「新建」共用） */
  const formatWorkspaceError = (error: unknown, pickedPath: string | null): string => {
    if (error instanceof ProbeError && error.reason === 'no-workspace-file') {
      return `「${pickedPath ?? ''}」里没有工作区。\n请改选一个已存在的工作区，或点「新建工作区」在那里建一个。`;
    }
    if (error instanceof WorkspaceMetaError) {
      return error.message;
    }
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (/forbidden|not allowed|denied|permission/i.test(message)) {
      return `应用没有这个文件夹的访问权限。\n请改用「切换工作区」直接选中它（选中即完成授权）：\n${pickedPath ?? ''}\n\n技术细节：${message}`;
    }
    return message;
  };

  // 切换工作区：选目录 → 校验 → 记住 → 重新加载（让门卫按新路径重新走一遍）
  const handleSwitchWorkspace = async () => {
    setWorkspaceError(null);
    setWorkspaceNotice(null);
    setWorkspaceBusy(true);
    let picked: string | null = null;
    try {
      picked = await pickDirectory('选择工作区文件夹');
      if (!picked) return; // 用户取消
      const meta = await tauriProbe.readMeta(picked);
      await saveStoredPath(picked);
      setWorkspacePath(picked);
      setWorkspaceMeta(meta);
      setWorkspaceNotice('已切换工作区，正在重新加载…');
      // 批 3 期间数据仍在 IndexedDB、与工作区路径无关 ⇒ 重载一次即可让全局状态一致
      setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setWorkspaceError(formatWorkspaceError(error, picked));
    } finally {
      setWorkspaceBusy(false);
    }
  };

  /**
   * 新建工作区：选一个文件夹 → 建骨架 → 记住 → 重新加载
   *
   * 复用与启动页「新建工作区」**完全相同**的底层函数
   * （`pickDirectory` / `createWorkspaceAt` / `tauriProbe` / `saveStoredPath`），
   * 不重复实现「建骨架」这件事。
   */
  const handleCreateWorkspace = async () => {
    setWorkspaceError(null);
    setWorkspaceNotice(null);
    setWorkspaceBusy(true);
    let root: string | null = null;
    try {
      root = await pickDirectory('选择新工作区的文件夹（建议选一个空文件夹）');
      if (!root) return; // 用户取消

      // ① 这个文件夹已经是有效工作区吗？是 → 直接复用，不必重建
      let meta: WorkspaceMeta | null = null;
      let needCreate = false;
      try {
        meta = await tauriProbe.readMeta(root);
      } catch (error) {
        if (error instanceof ProbeError && error.reason === 'no-workspace-file') {
          needCreate = true; // 目录在、但没有 workspace.json → 该建骨架
        } else {
          throw error; // corrupt / schema-too-new / forbidden → 交给外层统一提示
        }
      }

      // ② 建骨架。幂等：不会覆盖已存在的 workspace.json，也不会删掉文件夹里已有的内容
      if (needCreate) {
        await createWorkspaceAt(root); // 工作区名默认取文件夹名
        meta = await tauriProbe.readMeta(root); // 写完必须能读回来才算成功
      }

      await saveStoredPath(root);
      setWorkspacePath(root);
      setWorkspaceMeta(meta);
      setWorkspaceNotice(
        needCreate
          ? '已创建并切换工作区，正在重新加载…'
          : '该文件夹已是工作区，已切换过去，正在重新加载…',
      );
      // 与「切换工作区」同样处理：批 3 期间数据仍在 IndexedDB，重载一次让全局状态一致
      setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setWorkspaceError(formatWorkspaceError(error, root));
    } finally {
      setWorkspaceBusy(false);
    }
  };

  // 复制当前路径
  const handleCopyWorkspacePath = async () => {
    if (!workspacePath) return;
    try {
      await navigator.clipboard.writeText(workspacePath);
      setWorkspaceNotice('路径已复制到剪贴板');
    } catch {
      setWorkspaceError('复制失败，请手动选中路径复制。');
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* 头部 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">设置</h1>
        <p className="text-muted-foreground">配置 AI 服务商和模型</p>
      </div>

      {/* 左侧导航 + 右侧内容 */}
      <div className="flex gap-6 items-start">
        {/* 左侧导航 */}
        <nav className="w-48 flex-shrink-0 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors border-l-2 ' +
                  (active
                    ? 'bg-primary/10 text-primary border-primary'
                    : 'text-muted-foreground hover:bg-muted border-transparent')
                }
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* 右侧内容区 */}
        <div className="flex-1 min-w-0">
          {/* AI 配置 */}
          {activeSection === 'ai' && (
          <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Key size={24} className="text-blue-600" />
          <h2 className="text-xl font-bold text-foreground">AI 服务配置</h2>
        </div>

        <div className="space-y-4">
          {/* 服务商预设 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              服务商预设
            </label>
            <select
              value={selectedPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full bg-background text-foreground px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">请选择...</option>
              {AI_PRESETS.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Base URL
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              className="w-full bg-background text-foreground px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-background text-foreground px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              模型名称 (Model)
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="deepseek-chat"
              className="w-full bg-background text-foreground px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* 最大输出 tokens */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              最大输出 tokens (max_tokens)
            </label>
            <input
              type="number"
              min={1}
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="8192"
              className="w-full bg-background text-foreground px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-xs text-muted-foreground mt-1">
              仅作为「未显式指定 maxTokens 的调用」的默认值（各页面已写死的值优先）。参考上限：deepseek-chat ≈ 8192；思考类模型（deepseek-reasoner 等）可到 32000+。填超上限会被接口拒绝（HTTP 400）。
            </p>
          </div>

          {/* 安全提示 */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <AlertCircle size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-800">
              API Key 只保存在你的本地浏览器，调用时直接发给你填写的服务商
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
            >
              <Save size={20} />
              保存
            </button>
            <button
              onClick={handleTest}
              disabled={isTesting}
              className="flex items-center gap-2 px-6 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap size={20} />
              {isTesting ? '测试中...' : '测试连接'}
            </button>
            {isSaved && (
              <span className="text-green-600 text-sm font-medium">
                ✓ 保存成功
              </span>
            )}
          </div>

          {/* 帮助信息 */}
          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-medium text-foreground mb-2">如何获取 API Key？</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>DeepSeek: <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">platform.deepseek.com</a></li>
              <li>Kimi: <a href="https://platform.moonshot.cn/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">platform.moonshot.cn</a></li>
              <li>智谱 GLM: <a href="https://open.bigmodel.cn/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">open.bigmodel.cn</a></li>
              <li>通义千问: <a href="https://dashscope.console.aliyun.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">dashscope.console.aliyun.com</a></li>
              <li>OpenAI: <a href="https://platform.openai.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">platform.openai.com</a></li>
              <li>OpenRouter: <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">openrouter.ai</a></li>
            </ul>
          </div>
        </div>
      </div>
          )}

          {/* 关于与帮助：关于 + 反馈与支持 */}
          {activeSection === 'about' && (
            <>
          {/* 关于 */}
          <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Info size={24} className="text-blue-600" />
          <h2 className="text-xl font-bold text-foreground">关于</h2>
        </div>
        <div className="text-sm">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">版本号</span>
            <span className="text-foreground font-mono">v{APP_VERSION}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-3">写作台</p>
        </div>
      </div>

      {/* 反馈与支持 */}
      <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <MessageCircle size={24} className="text-blue-600" />
          <h2 className="text-xl font-bold text-foreground">反馈与支持</h2>
        </div>
        <div className="text-sm">
          {/* TODO: 填入真实 QQ 群号 */}
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">QQ 群</span>
            <span className="text-foreground/60">待补充</span>
          </div>
          {/* TODO: 填入真实联系邮箱 */}
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">邮箱</span>
            <span className="text-foreground/60">待补充</span>
          </div>
          <p className="text-xs text-muted-foreground mt-3">遇到问题或想提建议，欢迎联系</p>
        </div>
      </div>
            </>
          )}

          {/* 通用：快捷键 + 隐私说明 */}
          {activeSection === 'general' && (
            <>
          {/* 隐私说明 */}
          <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <ShieldCheck size={24} className="text-blue-600" />
          <h2 className="text-xl font-bold text-foreground">隐私说明</h2>
        </div>
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <ShieldCheck size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-800">
            所有数据存在你的本地浏览器，AI 调用走你自己的 API Key，我们不收集、不上传任何内容。
          </p>
        </div>
      </div>

      {/* 快捷键 */}
      <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Keyboard size={24} className="text-blue-600" />
          <h2 className="text-xl font-bold text-foreground">快捷键</h2>
        </div>
        <ul className="space-y-2 text-sm">
          {SHORTCUTS.map((item) => (
            <li key={item.keys} className="flex items-center gap-3">
              <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted text-foreground font-mono text-xs whitespace-nowrap">
                {item.keys}
              </span>
              <span className="text-muted-foreground">{item.desc}</span>
            </li>
          ))}
        </ul>
      </div>
            </>
          )}

          {/* 工作区（批 3c）：查看当前路径 + 切换 */}
          {activeSection === 'workspace' && (
            <div className="bg-card rounded-lg border border-border p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <FolderOpen size={24} className="text-blue-600" />
                <h2 className="text-xl font-bold text-foreground">工作区</h2>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                工作区用于存放你的作品。数据落盘将在后续版本启用，当前工作区仅用于记录位置。
              </p>

              {!isDesktop ? (
                /* 浏览器预览模式：只读降级说明，不调用任何 Tauri API */
                <div className="flex items-start gap-2 p-3 bg-primary/10 border border-primary/30 rounded-lg">
                  <Info size={20} className="text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-foreground">
                    当前是浏览器预览模式，不启用工作区。打包成桌面版后，可以在这里查看并切换工作区。
                  </p>
                </div>
              ) : (
                <>
                  <div className="text-sm">
                    <div className="flex items-start justify-between gap-4 py-2 border-b border-border">
                      <span className="text-muted-foreground shrink-0">当前路径</span>
                      <span className="text-foreground font-mono text-xs break-all text-right">
                        {workspacePath ?? '未设置（下次启动时可选择）'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-2 border-b border-border">
                      <span className="text-muted-foreground shrink-0">工作区名称</span>
                      <span className="text-foreground">{workspaceMeta?.name ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-2 border-b border-border">
                      <span className="text-muted-foreground shrink-0">文件结构版本</span>
                      <span className="text-foreground font-mono">
                        {workspaceMeta ? `v${workspaceMeta.schemaVersion}` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mt-4">
                    <button
                      onClick={() => void handleSwitchWorkspace()}
                      disabled={workspaceBusy}
                      className="flex items-center gap-2 px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw size={18} className={workspaceBusy ? 'animate-spin' : ''} />
                      {workspaceBusy ? '处理中…' : '切换工作区'}
                    </button>
                    <button
                      onClick={() => void handleCreateWorkspace()}
                      disabled={workspaceBusy}
                      className="flex items-center gap-2 px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FolderPlus size={18} />
                      新建工作区
                    </button>
                    {workspacePath && (
                      <button
                        onClick={() => void handleCopyWorkspacePath()}
                        className="flex items-center gap-2 px-4 py-2 bg-muted border border-border rounded-lg text-foreground font-semibold hover:bg-muted/80 hover:border-primary/40 transition-colors"
                      >
                        <Copy size={18} />
                        复制路径
                      </button>
                    )}
                  </div>

                  {workspaceNotice && (
                    <p className="mt-3 text-sm text-green-600">{workspaceNotice}</p>
                  )}

                  {workspaceError && (
                    <div className="mt-3 flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/40 rounded-lg">
                      <AlertTriangle size={20} className="text-destructive mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                        {workspaceError}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 错误日志 */}
          {activeSection === 'logs' && (
          <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <AlertTriangle size={24} className="text-orange-600" />
            <h2 className="text-xl font-bold text-foreground">错误日志</h2>
            <span className="text-sm text-muted-foreground">（最近 50 条）</span>
          </div>
          <button
            onClick={() => {
              setShowErrorLogs(!showErrorLogs);
              if (!showErrorLogs) handleRefreshLogs();
            }}
            className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
          >
            {showErrorLogs ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            {showErrorLogs ? '收起' : '展开'}
          </button>
        </div>

        {showErrorLogs && (
          <div>
            {errorLogs.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">暂无错误记录</p>
            ) : (
              <>
                <div className="flex justify-end mb-3">
                  <button
                    onClick={handleClearLogs}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                    清空日志
                  </button>
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {errorLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-muted border border-border rounded-lg text-sm"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-medium text-red-600">{log.type}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <p className="text-foreground mb-1">{log.message}</p>
                      {log.stack && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            查看详细堆栈
                          </summary>
                          <pre className="mt-2 text-xs text-muted-foreground bg-card p-2 rounded border border-border overflow-x-auto">
                            {log.stack}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
          )}
        </div>
      </div>
    </div>
  );
}
