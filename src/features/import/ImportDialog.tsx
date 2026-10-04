/**
 * 导入 TXT / MD / Word 稿子 —— 三步对话框
 *
 *   ① 选文件（TXT/MD 顺带修正编码；.docx 直接读段落模型）
 *   ② 定切分规则 + 预览（看到的就是将要入库的章）
 *   ③ 确认作品名 → 写库
 *
 * ★ 完全不依赖 Tauri：文件用 `File.arrayBuffer()` 读、编码用 `TextDecoder` 解、
 *   .docx 用 Web 原生的 `DecompressionStream` 解压，所以浏览器 `npm run dev` 下也能完整跑通。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import {
  DEFAULT_SPLIT_RULE,
  previewOf,
  splitChapters,
  titleFromFileName,
  type RawChapter,
  type SplitMode,
  type SplitRule,
} from './importSplit';
import { decodeBytes, ENCODING_OPTIONS, encodingLabel, type TextEncodingChoice } from './decodeText';
import { executeImport, IMPORT_VOLUME_TITLE, planImport, type ImportPlan } from './planImport';
import { DOC_LEGACY_HINT, docxBlocksToText, parseDocx, sliceBlocksByLines, type DocBlock } from './docx';
import { docxBlocksToHtml } from './docxToHtml';

interface ImportDialogProps {
  onClose: () => void;
  onImported: (projectId: number) => void;
}

/** 单文件上限（再大就该用工作区分批导了） */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** 来源类型：纯文本（TXT/MD）还是 Word（.docx） */
type SourceKind = 'text' | 'docx';

/** 允许按纯文本读的扩展名 */
const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'text'];

/** 取小写扩展名（不含点） */
function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match ? match[1].toLowerCase() : '';
}

function formatSize(byteLength: number): string {
  return byteLength / 1024 < 1024
    ? `${Math.max(1, Math.round(byteLength / 1024))} KB`
    : `${(byteLength / 1024 / 1024).toFixed(1)} MB`;
}

const MODE_LABELS: Array<{ value: SplitMode; label: string; hint: string }> = [
  { value: 'regex', label: '按章标题切', hint: '识别「第 X 章 / 第 X 回 / 第 X 节」这类行' },
  { value: 'delimiter', label: '按分隔符切', hint: '用 --- 之类的分隔行切，标题取每段第一行' },
  { value: 'single', label: '整篇一章', hint: '不切分，全文作为一章导进来' },
];

export default function ImportDialog({ onClose, onImported }: ImportDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // 步骤 1
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState(0);
  const [kind, setKind] = useState<SourceKind>('text');
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [docxBlocks, setDocxBlocks] = useState<DocBlock[] | null>(null);
  const [encodingChoice, setEncodingChoice] = useState<TextEncodingChoice>('auto');
  const [markdown, setMarkdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 步骤 2
  const [rule, setRule] = useState<SplitRule>(DEFAULT_SPLIT_RULE);

  // 步骤 3
  const [projectName, setProjectName] = useState('');
  const [genre, setGenre] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 解码结果（换编码 / 换文件后自动重算，不用手动触发） */
  const decoded = useMemo(() => (bytes ? decodeBytes(bytes, encodingChoice) : null), [bytes, encodingChoice]);

  /** .docx 的段落模型摊平成「一段一行」的文本 + 行→段落索引 */
  const docxText = useMemo(() => (docxBlocks ? docxBlocksToText(docxBlocks) : null), [docxBlocks]);

  /** 当前源文本：TXT/MD 用解码结果，.docx 用段落模型摊平的结果 */
  const sourceText = kind === 'docx' ? (docxText ? docxText.text : '') : decoded ? decoded.text : '';
  const canGoStep2 = sourceText.length > 0;

  /** 切分结果 —— 预览里展示的就是它，和最终入库的完全一致 */
  const split = useMemo(() => {
    if (sourceText.length === 0) return null;
    return splitChapters(sourceText, rule, {
      stripHeadingPrefix: markdown,
      stripNumbering: true,
      // .docx 需要行区间：靠它把「行」映射回「段落」，才能带格式渲染 HTML
      lineRanges: kind === 'docx',
    });
  }, [sourceText, rule, markdown, kind]);

  /** 待入库的章节：.docx 每章按行区间渲染出带标题 / 加粗的 HTML */
  const chapters: RawChapter[] = useMemo(() => {
    if (!split) return [];
    if (kind !== 'docx' || !docxBlocks || !docxText) return split.chapters;
    return split.chapters.map((chapter) => {
      if (chapter.startLine === undefined || chapter.endLine === undefined) return chapter;
      const blocks = sliceBlocksByLines(docxBlocks, docxText.lineBlockIndex, chapter.startLine, chapter.endLine);
      return { ...chapter, html: docxBlocksToHtml(blocks) };
    });
  }, [split, kind, docxBlocks, docxText]);

  /** 待写入计划（第 3 步的汇总/校验用它，避免和真正写入的形状不一致） */
  const plan: ImportPlan | null = useMemo(() => {
    if (chapters.length === 0) return null;
    return planImport({ projectName, genre, chapters, markdown });
  }, [chapters, projectName, genre, markdown]);

  /** .docx 里用「标题」样式的段落数（用来提示：Word 标题样式不会自动变成章标题） */
  const docxHeadingCount = useMemo(
    () => (docxBlocks ? docxBlocks.filter((block) => block.level > 0).length : 0),
    [docxBlocks],
  );

  // Esc 关闭（导入中不响应，避免把写库打断）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  /** 清掉上一个文件留下的所有来源状态（换文件 / 出错时都要调） */
  const resetSource = () => {
    setBytes(null);
    setDocxBlocks(null);
    setMarkdown(false);
    setEncodingChoice('auto');
  };

  const handlePickFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      setError(`文件太大了（${(file.size / 1024 / 1024).toFixed(1)} MB），上限 20 MB。`);
      return;
    }

    const extension = extensionOf(file.name);

    // .doc 是 Word 97-2003 的 OLE2 复合文档，ZIP 与 XML 两条路都解不开 → 直接告诉用户怎么转
    if (extension === 'doc') {
      resetSource();
      setFileName('');
      setFileSize(0);
      setError(DOC_LEGACY_HINT);
      return;
    }

    const isTextLike =
      extension === 'docx' ||
      extension === '' ||
      TEXT_EXTENSIONS.includes(extension) ||
      file.type.startsWith('text/');
    if (!isTextLike) {
      resetSource();
      setFileName('');
      setFileSize(0);
      setError(`不支持 .${extension} 文件。可以导入 .txt / .md / .markdown / .docx。`);
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      resetSource();
      setFileName(file.name);
      setFileSize(file.size);
      setRule(DEFAULT_SPLIT_RULE);
      setProjectName(titleFromFileName(file.name));

      if (extension === 'docx') {
        const blocks = await parseDocx(buffer);
        if (blocks.length === 0) {
          setFileName('');
          setFileSize(0);
          setError('这个 .docx 里没有读到任何正文 —— 可能整篇都是图片，或者正文被放在文本框 / 页眉里。');
          return;
        }
        setKind('docx');
        setDocxBlocks(blocks);
        return;
      }

      setKind('text');
      setBytes(new Uint8Array(buffer));
      setMarkdown(extension === 'md' || extension === 'markdown');
    } catch (err) {
      // parseDocx 抛出的都是可以直接给用户看的中文说明，不要再套一层「读取文件失败」
      resetSource();
      setFileName('');
      setFileSize(0);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStartImport = async () => {
    if (!plan) return;
    setError(null);
    setBusy(true);
    try {
      const projectId = await executeImport(plan);
      onImported(projectId);
    } catch (err) {
      setError(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const chapterCount = split?.chapterCount ?? 0;
  const ruleError = split?.error ?? null;
  const canGoStep3 = split !== null && ruleError === null && chapterCount > 0;

  /** 章数太少时的提示（需求：< 2 章要让用户手动填分隔符） */
  const showLowCountWarning = ruleError === null && rule.mode !== 'single' && chapterCount < 2;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-border shadow-lg">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Upload size={22} className="text-primary" />
            <h2 className="text-xl font-bold text-foreground">导入 TXT / MD / Word 稿子</h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* 步骤指示 */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border text-sm">
          {([1, 2, 3] as const).map((n) => (
            <div key={n} className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  step === n
                    ? 'bg-primary text-primary-foreground'
                    : step > n
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {n}
              </span>
              <span className={step === n ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                {n === 1 ? '选文件' : n === 2 ? '切分规则' : '确认导入'}
              </span>
              {n < 3 && <span className="text-border">—</span>}
            </div>
          ))}
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/40 rounded-lg">
              <AlertTriangle size={18} className="text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-foreground whitespace-pre-wrap">{error}</p>
            </div>
          )}

          {/* ── 步骤 1 ─────────────────────────────── */}
          {step === 1 && (
            <>
              <div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".txt,.md,.markdown,.docx,.doc,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                  className="hidden"
                  onChange={(e) => {
                    void handlePickFile(e.target.files?.[0]);
                    e.target.value = ''; // 允许重复选同一个文件
                  }}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-primary/25 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  <FileText size={32} className="text-primary" />
                  <span className="text-sm text-foreground">
                    {fileName ? '换一个文件' : '选择 TXT / MD / Word 文件'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    支持 .txt / .md / .markdown / .docx，单个文件最大 20 MB
                  </span>
                </button>
              </div>

              {fileName && kind === 'text' && decoded && (
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText size={16} className="text-primary shrink-0" />
                    <span className="text-foreground font-medium truncate">{fileName}</span>
                    <span className="text-muted-foreground shrink-0">{formatSize(fileSize)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <label className="block text-muted-foreground mb-1">文件编码</label>
                      <select
                        value={encodingChoice}
                        onChange={(e) => setEncodingChoice(e.target.value as TextEncodingChoice)}
                        className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {ENCODING_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="block text-muted-foreground mb-1">识别结果</span>
                      <div className="px-3 py-2 bg-muted rounded-lg text-foreground">
                        {encodingLabel(decoded.encoding)} · {decoded.text.length} 字
                      </div>
                    </div>
                  </div>

                  <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={markdown}
                      onChange={(e) => setMarkdown(e.target.checked)}
                      className="mt-0.5 accent-primary"
                    />
                    <span>
                      这是 Markdown 文件（解析 <code className="text-primary">#</code> 标题、
                      <code className="text-primary">**</code> 加粗、
                      <code className="text-primary">*</code> 斜体等格式）
                      <span className="block text-xs text-muted-foreground">
                        纯 TXT 稿子保持不勾：只按空行分段，正文原样保留。
                      </span>
                    </span>
                  </label>

                  {decoded.warning && (
                    <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/40 rounded-lg">
                      <AlertTriangle size={16} className="text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs text-foreground">{decoded.warning}</p>
                    </div>
                  )}

                  {!decoded.warning && (
                    <p className="flex items-center gap-1.5 text-xs text-green-600">
                      <CheckCircle2 size={14} /> 文本读取正常，没有乱码。
                    </p>
                  )}
                </div>
              )}

              {fileName && kind === 'docx' && docxBlocks && docxText && (
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText size={16} className="text-primary shrink-0" />
                    <span className="text-foreground font-medium truncate">{fileName}</span>
                    <span className="text-muted-foreground shrink-0">{formatSize(fileSize)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="block text-muted-foreground mb-1">Word 正文</span>
                      <div className="px-3 py-2 bg-muted rounded-lg text-foreground">
                        {docxBlocks.length} 段 · {docxText.text.length} 字
                      </div>
                    </div>
                    <div>
                      <span className="block text-muted-foreground mb-1">标题样式</span>
                      <div className="px-3 py-2 bg-muted rounded-lg text-foreground">
                        {docxHeadingCount > 0 ? `${docxHeadingCount} 段用了「标题」样式` : '没有用「标题」样式'}
                      </div>
                    </div>
                  </div>

                  <p className="flex items-center gap-1.5 text-xs text-green-600">
                    <CheckCircle2 size={14} /> 已读出段落 / 标题 / 加粗斜体，不需要再选编码。
                  </p>
                </div>
              )}

              {kind === 'docx' ? (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/40 rounded-lg">
                  <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-foreground space-y-1">
                    <p className="font-medium">Word 里有几样东西无法完整保留：</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li>
                        <b>自动编号列表</b>：编号会丢掉，列表里的文字变成普通段落
                      </li>
                      <li>
                        <b>表格</b>：表格结构丢掉，单元格文字变成一段一段的普通段落
                      </li>
                      <li>
                        <b>图片</b>：整张丢弃（编辑器存的是纯文字稿，图片请单独另存）
                      </li>
                    </ul>
                    <p className="text-muted-foreground">正文文字、标题级别、加粗 / 斜体都会保留下来。</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 bg-primary/10 border border-primary/30 rounded-lg">
                  <Info size={16} className="text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-foreground">
                    记事本存的简体中文 TXT 默认是 ANSI（GBK）。如果预览里出现乱码，
                    把「文件编码」改成 <b>GBK / ANSI</b> 就能正常显示。
                    <span className="block text-muted-foreground mt-1">
                      Word 文档（.docx）不需要选编码，直接选文件就行。
                    </span>
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── 步骤 2 ─────────────────────────────── */}
          {step === 2 && (
            <>
              <div className="space-y-2">
                <span className="block text-sm font-medium text-foreground">切分方式</span>
                <div className="grid grid-cols-3 gap-2">
                  {MODE_LABELS.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setRule({ ...rule, mode: mode.value })}
                      className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                        rule.mode === mode.value
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <span className="block font-medium">{mode.label}</span>
                      <span className="block text-xs mt-0.5 opacity-80">{mode.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {rule.mode === 'regex' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    章标题正则（<code className="text-primary">^</code> 表示行首）
                  </label>
                  <input
                    type="text"
                    value={rule.regexSource}
                    onChange={(e) => setRule({ ...rule, regexSource: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    默认规则同时认中文数字和阿拉伯数字：第一章 / 第12章 / 第三节 / 第五回。
                  </p>
                </div>
              )}

              {rule.mode === 'delimiter' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    分隔符（整行内容等于它就算分节）
                  </label>
                  <input
                    type="text"
                    value={rule.delimiter}
                    onChange={(e) => setRule({ ...rule, delimiter: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="---"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    每段的第一行会当成章标题；第一行超过 40 字、或者这一段只有一行时，
                    改成自动编号「第 N 章」，整段内容都留作正文（不会丢字）。
                  </p>
                </div>
              )}

              {rule.mode === 'single' && (
                <p className="text-sm text-muted-foreground">
                  整篇会作为《{projectName || '未命名作品'}》的第 1 章导入，之后可以在正文页自己拆章。
                </p>
              )}

              {ruleError && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/40 rounded-lg">
                  <AlertTriangle size={16} className="text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground">{ruleError}</p>
                </div>
              )}

              {showLowCountWarning && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/40 rounded-lg">
                  <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-sm text-foreground">
                    <p>
                      {rule.mode === 'regex'
                        ? `这条规则只切出 ${chapterCount} 章，看起来不对。`
                        : `这个分隔符只切出 ${chapterCount} 章，看起来不对。`}
                    </p>
                    {rule.mode === 'regex' ? (
                      <>
                        <p className="text-xs text-muted-foreground mt-1">
                          可以改上面的正则，或者换成「按分隔符切」并填上你文件里的分隔行（例如 ---）。
                        </p>
                        <button
                          type="button"
                          onClick={() => setRule({ ...rule, mode: 'delimiter' })}
                          className="mt-2 px-3 py-1 text-xs bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                        >
                          改用分隔符切
                        </button>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">
                        分隔符要<b>独占一行</b>、且和文件里完全一致（前后可以有空格，不影响匹配）。
                        也可以换成「按章标题切」试试。
                      </p>
                    )}
                  </div>
                </div>
              )}

              {kind === 'docx' && docxHeadingCount > 0 && chapterCount < 2 && (
                <div className="flex items-start gap-2 p-3 bg-primary/10 border border-primary/30 rounded-lg">
                  <Info size={16} className="text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-foreground">
                    这份 Word 里有 <b>{docxHeadingCount}</b> 段用了「标题」样式。注意：Word 的标题样式只影响
                    <b>格式</b>（会转成 H1~H3），<b>不参与切分章节</b> —— 切分只按上面这条规则来。
                    如果正文里没有「第 X 章」这样的标题行，可以先选「整篇一章」导进来，再到正文页自己拆章。
                  </p>
                </div>
              )}

              {!ruleError && !showLowCountWarning && chapterCount > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle2 size={16} />
                  检测到 {chapterCount} 章
                </p>
              )}

              {split && chapterCount > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">切分预览</span>
                    <span className="text-xs text-muted-foreground">
                      章标题里多余的「第 X 章」已自动去掉（侧栏会单独显示序号）
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                    {split.chapters.map((chapter, i) => (
                      <div key={i} className="px-3 py-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">第 {i + 1} 章</span>
                          <span className="text-sm text-foreground font-medium truncate">
                            {chapter.title}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {previewOf(chapter.body, 50) || '（本章没有正文）'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── 步骤 3 ─────────────────────────────── */}
          {step === 3 && plan && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    作品名称 <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="默认用文件名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">题材类型</label>
                  <input
                    type="text"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="如：仙侠、都市（可留空）"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 text-sm space-y-2">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">来源文件</span>
                  <span className="text-foreground truncate">{fileName}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">将创建</span>
                  <span className="text-foreground">
                    1 部作品 · 1 卷「{IMPORT_VOLUME_TITLE}」 · {plan.stats.chapterCount} 章
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">正文合计</span>
                  <span className="text-foreground">约 {plan.stats.wordCount} 字</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">正文格式</span>
                  <span className="text-foreground">
                    {kind === 'docx'
                      ? 'Word（标题 / 加粗斜体已保留）'
                      : markdown
                        ? 'Markdown（标题/加粗等已转换）'
                        : '纯文本（按空行分段）'}
                  </span>
                </div>
              </div>

              {kind === 'docx' && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/40 rounded-lg">
                  <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-foreground">
                    <b>注意：Word 的自动编号列表、表格、图片无法完整保留。</b>
                    编号会变成普通段落、表格会拆成一段段文字、图片会被丢掉；
                    正文文字与标题 / 加粗斜体不受影响。
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                导入完成后会直接把整部稿子写进当前作品库；卷章结构之后可以在「大纲」页继续调整。
              </p>
            </>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 px-6 py-4 border-t border-border">
          {step === 1 && (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!canGoStep2}
                className="flex-1 px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一步
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors"
              >
                上一步
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!canGoStep3}
                className="flex-1 px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一步
              </button>
            </>
          )}

          {step === 3 && plan && (
            <>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={busy}
                className="flex-1 px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                上一步
              </button>
              <button
                type="button"
                onClick={() => void handleStartImport()}
                disabled={busy || projectName.trim().length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {busy ? '导入中…' : `导入 ${plan.stats.chapterCount} 章`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
