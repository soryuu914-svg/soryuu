import { defineConfig } from 'vitest/config';

/**
 * 测试配置（批 2 新建）。
 *
 * ★ 刻意**不复用 `vite.config.ts`**：那个文件管的是前端构建（含 `server.watch.ignored` 等
 * 与测试无关的配置），单独一份配置能把改动面压到最小（方案文档 R7）。
 *
 * 批 2 的引擎测试全部跑在 **Node** 上：
 *   - 真临时目录（`node:os` 的 `tmpdir()`）+ Node 版 `FileSystem` → 能真实验证 rename 语义
 *   - 纯函数（slug / 补零 / 校验）不需要环境
 * 等批 3 接上 Tauri 插件、需要测前端组件时，再考虑加 happy-dom/jsdom 环境。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // 不开启 globals：测试文件显式 import { describe, it, expect }，依赖更明确
    globals: false,
  },
});
