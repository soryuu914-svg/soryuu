/**
 * 运行环境探测（批 3b）
 *
 * ★ 本文件**不 import 任何 `@tauri-apps/*`**，因此在浏览器里绝对安全。
 */

/**
 * 当前是否运行在 Tauri WebView 里。
 *
 * 两个判据（任一成立即认为在 Tauri 里）：
 *   1. `window.isTauri` —— Tauri 2 由 Rust 侧注入
 *      （见 `tauri-2.11.6/src/manager/webview.rs` 的 `Object.defineProperty(window, 'isTauri', …)`）
 *   2. `__TAURI_INTERNALS__` —— `@tauri-apps/api` 的 `invoke` 依赖它，
 *      作为双保险（不同版本的注入时机可能不同）
 */
export function isTauriEnv(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { isTauri?: unknown; __TAURI_INTERNALS__?: unknown };
  return w.isTauri === true || '__TAURI_INTERNALS__' in w;
}

/**
 * kill switch：`.env.local` 里写 `VITE_WORKSPACE_GATE=off` → 门卫直接 bypass。
 *
 * 用途：门卫自身出问题导致打不开应用时的**自救开关** ——
 * 改一个环境变量即可，不用改代码、不用重新编译 Rust。
 */
export function isGateDisabledByEnv(): boolean {
  try {
    const env = import.meta.env as unknown as Record<string, string | undefined> | undefined;
    return env?.VITE_WORKSPACE_GATE === 'off';
  } catch {
    return false;
  }
}
