import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { isTauriEnv } from './features/workspace/isTauri';
import Layout from './components/Layout';
import ProjectList from './features/project/ProjectList';
import Workbench from './features/project/Workbench';
import CharacterPage from './features/character/CharacterPage';
import WorldPage from './features/world/WorldPage';
import OutlinePage from './features/outline/OutlinePage';
import ChapterPage from './features/chapter/ChapterPage';
import AnalysisList from './features/analysis/AnalysisList';
import NewAnalysis from './features/analysis/NewAnalysis';
import BookReader from './features/analysis/BookReader';
import SettingsPage from './features/settings/SettingsPage';
import ExportPage from './features/export/ExportPage';
import LibraryPage from './features/library/LibraryPage';
import RejectionsPage from './features/rejections/RejectionsPage';
import InspirationsPage from './features/inspirations/InspirationsPage';
import ContextBuilderTest from './features/ai/ContextBuilderTest';
import PlotCardsPage from './features/cards/PlotCardsPage';
import SceneCardsPage from './features/cards/SceneCardsPage';
import ForeshadowsPage from './features/foreshadows/ForeshadowsPage';
import WritingToolboxPage from './features/writing/WritingToolboxPage';
import WritingPracticePage from './features/practice/WritingPracticePage';

/**
 * 桌面端托盘导航：托盘菜单"设置"由 Rust 侧 emit `tray://navigate`，
 * 这里监听并做路由跳转（纯浏览器模式下不监听）。
 */
function TrayNavigate() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isTauriEnv()) return;
    const unlistenPromise = listen<string>('tray://navigate', (e) => navigate(e.payload));
    return () => { unlistenPromise.then((unlisten) => unlisten()); };
  }, [navigate]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <TrayNavigate />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ProjectList />} />
          <Route path="analysis" element={<AnalysisList />} />
          <Route path="analysis/new" element={<NewAnalysis />} />
          <Route path="analysis/book/:bookId" element={<BookReader />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="rejections" element={<RejectionsPage />} />
          <Route path="inspirations" element={<InspirationsPage />} />
          <Route path="writing" element={<WritingToolboxPage />} />
          <Route path="practice" element={<WritingPracticePage />} />
          <Route path="export" element={<ExportPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="test/context-builder" element={<ContextBuilderTest />} />
          <Route path="project/:id" element={<Workbench />} />
          <Route path="project/:id/character" element={<CharacterPage />} />
          <Route path="project/:id/world" element={<WorldPage />} />
          <Route path="project/:id/plotCards" element={<PlotCardsPage />} />
          <Route path="project/:id/sceneCards" element={<SceneCardsPage />} />
          <Route path="project/:id/foreshadows" element={<ForeshadowsPage />} />
          <Route path="project/:id/outline" element={<OutlinePage />} />
          <Route path="project/:id/chapter" element={<ChapterPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
