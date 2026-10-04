import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 不让 Vite 监听 src-tauri：target/ 里的产物被 Rust 编译锁住会触发 EBUSY
  // host/port 钉死 IPv4 + strictPort：localhost 在 WebView2 里会解析成 IPv6(::1) 而 vite 只绑
  // IPv4 → Tauri 窗口 ERR_CONNECTION_REFUSED；strictPort 防端口被占时静默跳 5174 导致 Tauri 连错实例
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
})
