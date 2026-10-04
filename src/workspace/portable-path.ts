/**
 * 便携式路径工具 —— 纯字符串、全同步、零依赖的 `PathProvider` 实现。
 *
 * ## 为什么需要它
 *
 * 批 2 的 `PathProvider` 接口是**同步**的（见 `./types.ts`）：`join(...parts): string`。
 * 而 Tauri 的 `@tauri-apps/api/path` 全部是**异步**的 —— `join` 返回 `Promise<string>`，
 * 且每次调用都是一次 IPC。⇒ 无法直接拿它当 `PathProvider` 用。
 *
 * 主文档 §8f 的本意是「不要让前端手拼平台分隔符」。本模块的解法：
 *   1. **输入侧宽容**：`\` 与 `/` 都接受，进来先统一成 `/` 参与计算
 *      （Rust 的 `PathBuf` 在 Windows 上同时接受两种分隔符）。
 *   2. **输出分隔符从根推断**：根是 `C:\a` 就输出 `\`，根是 `C:/a` 就输出 `/`
 *      ⇒ 与系统返回的路径风格保持一致，从根上避免出现混合分隔符。
 *   3. **入口一次性规范化**：拿到 dialog 返回的路径后，先 `await resolve(picked)`
 *      （Tauri，异步，只调一次）再交给本模块；此后全程同步。
 *
 * ## 实现要点：显式拆「前导根」而不是靠字符串拼接
 * 若直接用 `'/'` 连接各段，`join('/', 'ws')` 会拼出 `//ws` —— 而 `//` 在本模块是
 * UNC 前缀，于是被误判成网络路径。因此这里统一用 `splitLead()` 先抽出前导根
 * （`/` · `C:/` · `C:` · `//server/`），再拼剩余段。
 *
 * ## 与 Node `path` 的差异
 * - `resolve()` **不做 cwd 解析**（前端没有「当前目录」概念），语义等同 `join()`。
 * - 只处理字符串，不访问文件系统。
 */
import type { PathProvider } from './types';

/** 输出路径的两种分隔符风格 */
export type PathSeparator = '/' | '\\';

/** 盘符：`C:` / `c:` */
const DRIVE_RE = /^([a-zA-Z]:)/;
/** 盘符根：`C:` 或 `C:/` */
const DRIVE_ROOT_RE = /^[a-zA-Z]:\/?$/;
/** UNC 前导：`//server` */
const UNC_HEAD_RE = /^\/\/[^/]+/;
/** UNC 根本身：`//server`（不含 share） */
const UNC_ROOT_RE = /^\/\/[^/]+$/;

/**
 * 剔除控制字符。
 * 路径里出现控制字符一定非法，且会让下游（Rust 侧 / JSON 序列化）报出难以定位的错，
 * 所以在入口直接静默剔除。
 */
function stripControlChars(input: string): string {
  // 刻意匹配控制字符：路径中不允许出现，需要主动剔除
  // oxlint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u001f\u007f]/g, '');
}

/**
 * 输入归一化：`\` → `/`，并把 3 个及以上连续斜杠折叠成 2 个（UNC 只保留前导 `//`）。
 * 不做 `.` / `..` 的解析（那是 `collapse()` 的职责）。
 */
export function normalizeIncoming(input: string): string {
  const slashed = stripControlChars(String(input)).replace(/\\/g, '/');
  return slashed.replace(/\/{3,}/g, '//');
}

/** 从原始（未归一化）字符串判断它用的是哪种分隔符风格 */
export function detectSeparator(raw: string): PathSeparator {
  return String(raw).includes('\\') ? '\\' : '/';
}

/** 取一组入参中第一个「含分隔符」的那个的风格；都没有则默认 `/` */
function pickSeparator(parts: string[]): PathSeparator {
  for (const part of parts) {
    if (part.includes('\\')) return '\\';
    if (part.includes('/')) return '/';
  }
  return '/';
}

/** 把内部统一使用的 `/` 输出成目标风格 */
function applySeparator(path: string, sep: PathSeparator): string {
  return sep === '\\' ? path.replace(/\//g, '\\') : path;
}

interface PathParts {
  /** 前导根（含尾斜杠，UNC 除外）；空串表示相对路径。例：`/` · `C:/` · `//server/` */
  lead: string;
  /** 根之后的剩余部分，**保证不以 `/` 开头** */
  body: string;
}

/**
 * 拆出「前导根」与「剩余部分」。输入必须是**已归一化**的 `/` 风格字符串。
 * 这是本模块唯一解析前导的地方 —— `join` / `collapse` / `dirname` / `basename` 都走它。
 */
function splitLead(normalized: string): PathParts {
  const unc = UNC_HEAD_RE.exec(normalized);
  if (unc) {
    // UNC 根必须带尾斜杠（`//server/`），否则与去掉前导斜杠的 body 拼接会粘连
    return { lead: `${unc[0]}/`, body: normalized.slice(unc[0].length).replace(/^\/+/, '') };
  }
  const drive = DRIVE_RE.exec(normalized);
  if (drive) {
    const after = normalized.slice(drive[0].length);
    if (after.startsWith('/')) return { lead: `${drive[0]}/`, body: after.replace(/^\/+/, '') };
    return { lead: drive[0], body: after };
  }
  if (normalized.startsWith('/')) return { lead: '/', body: normalized.replace(/^\/+/, '') };
  return { lead: '', body: normalized };
}

/** 解析 `.` / `..` 并去掉空段（输入必须是已归一化的 `/` 风格） */
function collapse(normalized: string): string {
  const { lead, body } = splitLead(normalized);
  const absolute = lead !== '';
  const stack: string[] = [];
  for (const seg of body.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      const top = stack[stack.length - 1];
      if (stack.length > 0 && top !== '..') stack.pop();
      else if (!absolute) stack.push('..');
      continue;
    }
    stack.push(seg);
  }
  return lead + stack.join('/');
}

/**
 * 拼接路径段。
 * 语义对齐 Node 的 `path.join`：**不会**因为后续段是绝对路径而丢弃前面的段。
 * 输出分隔符取第一个「含分隔符」的入参风格（通常就是工作区根）。
 */
export function join(...parts: string[]): string {
  const valid = parts.filter((p) => typeof p === 'string' && p.length > 0);
  if (valid.length === 0) return '';
  const sep = pickSeparator(valid);
  const parsed = valid.map((p) => splitLead(normalizeIncoming(p)));
  // 只认第一段的前导根（对齐 path.join：后续绝对段不改变根）
  const lead = parsed[0].lead;
  const bodies = parsed.map((p) => p.body).filter((b) => b.length > 0);
  const combined = lead + bodies.join('/');
  return applySeparator(collapse(combined), sep);
}

/** 父目录。相对路径且无父目录时返回 `.`（与 Node 一致） */
export function dirname(input: string): string {
  const raw = String(input ?? '');
  const sep = detectSeparator(raw);
  const normalized = collapse(normalizeIncoming(raw));
  if (normalized === '') return '.';
  // 本身已经是根
  if (normalized === '/' || DRIVE_ROOT_RE.test(normalized) || UNC_ROOT_RE.test(normalized)) {
    return applySeparator(normalized, sep);
  }
  const { lead, body } = splitLead(normalized);
  const segments = body.split('/');
  segments.pop();
  if (segments.length === 0) {
    const base = lead === '' ? '.' : lead;
    return applySeparator(base, sep);
  }
  return applySeparator(lead + segments.join('/'), sep);
}

/** 最后一段。根路径返回空串（与 Node 一致） */
export function basename(input: string): string {
  const normalized = collapse(normalizeIncoming(String(input ?? '')));
  if (normalized === '') return '';
  const { body } = splitLead(normalized);
  if (body === '') return '';
  const segments = body.split('/');
  return segments[segments.length - 1];
}

/**
 * 前端没有「当前工作目录」概念，因此语义等同 {@link join}。
 * 真正的绝对化由入口处一次 `await resolve()`（Tauri，异步）完成。
 */
export function resolve(...parts: string[]): string {
  return join(...parts);
}

/** 符合批 2 `PathProvider` 接口的同步实现，可直接喂给工作区引擎 */
export const portablePath: PathProvider = { join, dirname, basename, resolve };
