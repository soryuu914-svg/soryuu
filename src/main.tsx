import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { WorkspaceGate } from './features/workspace/WorkspaceGate'
import { seedDatabase } from './db/seed'
import { initGlobalErrorHandlers } from './utils/errorHandler'

// 初始化全局错误监听
initGlobalErrorHandlers();

// 初始化数据库
seedDatabase().catch(console.error);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* 启动门卫：检查/选择工作区；浏览器或 kill switch 下自动 bypass，不阻塞应用 */}
      <WorkspaceGate>
        <App />
      </WorkspaceGate>
    </ErrorBoundary>
  </StrictMode>,
)
