import { useState } from 'react';
import { buildContext } from './contextBuilder';
import type { BuildContextParams } from './contextBuilder';
import { db } from '../../db/index';

/**
 * contextBuilder 测试页面
 */
export default function ContextBuilderTest() {
  const [projectId, setProjectId] = useState('1');
  const [chapterId, setChapterId] = useState('');
  const [mode, setMode] = useState<'polish' | 'expand' | 'continue' | 'fullChapter'>('continue');
  const [result, setResult] = useState<{
    systemPrompt: string;
    userPrompt: string;
    summary: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoTestInfo, setAutoTestInfo] = useState('');

  const handleTest = async () => {
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const params: BuildContextParams = {
        projectId: parseInt(projectId),
        mode,
      };

      if (chapterId) {
        params.chapterId = parseInt(chapterId);
      }

      // 模拟勾选的卡片
      if (mode === 'continue' || mode === 'fullChapter' || mode === 'expand') {
        params.selectedCardIds = {
          characters: [1, 2], // 假设前两个人物
          worldSettings: [1], // 假设第一个设定
          plotCards: [],
          sceneCards: [],
          bookBookmarks: [],
        };
      }

      if (mode === 'continue') {
        params.cursorBeforeText = '<p>前文示例内容...</p>';
      }

      if (mode === 'polish' || mode === 'expand') {
        params.selectedText = '选中的文字示例';
      }

      const contextResult = await buildContext(params);
      setResult(contextResult);

      console.log('=== System Prompt ===');
      console.log(contextResult.systemPrompt);
      console.log('\n=== User Prompt ===');
      console.log(contextResult.userPrompt);
      console.log('\n=== Summary ===');
      console.log(contextResult.summary);

    } catch (err: any) {
      setError(err.message);
      console.error('测试失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 一键自动测试
  const handleAutoTest = async () => {
    setError('');
    setResult(null);
    setLoading(true);
    setAutoTestInfo('');

    try {
      // 1. 读取第一个 project
      const projects = await db.projects.orderBy('id').toArray();
      if (projects.length === 0) {
        throw new Error('数据库中没有作品');
      }
      const project = projects[0];

      // 2. 读取该 project 下的第一个 chapter
      const chapters = await db.chapters
        .where('projectId')
        .equals(project.id!)
        .sortBy('id');

      if (chapters.length === 0) {
        throw new Error(`作品 ${project.id} 下没有章节`);
      }
      const chapter = chapters[0];

      setAutoTestInfo(`已找到 project ${project.id} / chapter ${chapter.id}，开始测试...`);
      console.log(`\n========================================`);
      console.log(`🎲 一键测试开始`);
      console.log(`作品 ID: ${project.id}, 书名: ${project.name}`);
      console.log(`章节 ID: ${chapter.id}, 章名: ${chapter.title}`);
      console.log(`========================================\n`);

      // 3. 动态读取当前作品下的所有人物和世界观
      const allCharacters = await db.characters
        .where('projectId')
        .equals(project.id!)
        .toArray();

      const allWorldSettings = await db.worldSettings
        .where('projectId')
        .equals(project.id!)
        .toArray();

      // 按字段完整度排序人物，选择最完整的
      const sortedCharacters = allCharacters
        .map(char => {
          let score = 0;
          if (char.role) score++;
          if (char.identity) score++;
          if (char.personality) score++;
          if (char.abilities) score++;
          if (char.motivation) score++;
          return { char, score };
        })
        .sort((a, b) => b.score - a.score);

      const selectedCharacterIds = sortedCharacters.length > 0
        ? [sortedCharacters[0].char.id!]
        : [];

      const selectedWorldSettingIds = allWorldSettings.map(w => w.id!);

      console.log('使用的人物 ID:', selectedCharacterIds);
      console.log('使用的世界观 ID:', selectedWorldSettingIds);
      if (selectedCharacterIds.length > 0) {
        console.log(`已选择字段最完整的人物: ${sortedCharacters[0].char.name} (完整度: ${sortedCharacters[0].score}/5)`);
      }

      // 4. 测试四个 mode
      const modes: Array<'polish' | 'expand' | 'continue' | 'fullChapter'> = [
        'polish',
        'expand',
        'continue',
        'fullChapter',
      ];

      for (const testMode of modes) {
        console.log(`\n\n========================================`);
        console.log(`📝 测试模式: ${testMode}`);
        console.log(`========================================\n`);

        const params: BuildContextParams = {
          projectId: project.id!,
          chapterId: chapter.id!,
          mode: testMode,
          selectedCardIds: {
            characters: selectedCharacterIds,
            worldSettings: selectedWorldSettingIds,
            plotCards: [],
            sceneCards: [],
            bookBookmarks: [],
          },
        };

        // 模拟勾选的卡片
        if (testMode === 'continue' || testMode === 'fullChapter' || testMode === 'expand') {
          params.selectedCardIds = {
            characters: [1, 2],
            worldSettings: [1],
            plotCards: [],
            sceneCards: [],
            bookBookmarks: [],
          };
        }

        if (testMode === 'continue') {
          params.cursorBeforeText = '<p>前文示例内容...</p>';
        }

        if (testMode === 'polish' || testMode === 'expand') {
          params.selectedText = '选中的文字示例';
        }

        const contextResult = await buildContext(params);

        console.log(`【${testMode} - Summary】`);
        console.log(contextResult.summary);
        console.log(`\n【${testMode} - System Prompt】`);
        console.log(contextResult.systemPrompt);
        console.log(`\n【${testMode} - User Prompt】`);
        console.log(contextResult.userPrompt);
        console.log(`\n========================================`);
      }

      console.log(`\n\n✅ 一键测试完成！请查看上方四个模式的完整输出。`);
      setAutoTestInfo(prev => prev + ' ✅ 测试完成！请查看控制台输出。');

    } catch (err: any) {
      setError(err.message);
      console.error('一键测试失败:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Context Builder 测试</h1>

      {autoTestInfo && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-blue-800">
          {autoTestInfo}
        </div>
      )}

      <div className="mb-6">
        <button
          onClick={handleAutoTest}
          disabled={loading}
          className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 font-bold"
        >
          {loading ? '测试中...' : '🎲 一键测试（自动读取数据）'}
        </button>
        <p className="text-sm text-muted-foreground mt-2">
          自动读取第一个作品和章节，测试四个模式（polish / expand / continue / fullChapter），结果打印到控制台
        </p>
      </div>

      <hr className="my-8" />

      <h2 className="text-xl font-bold mb-4">手动测试</h2>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1">作品 ID</label>
          <input
            type="number"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full bg-background text-foreground px-3 py-2 border border-input rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">章节 ID（可选）</label>
          <input
            type="number"
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
            className="w-full bg-background text-foreground px-3 py-2 border border-input rounded"
            placeholder="留空则不加载章节信息"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">模式</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            className="w-full bg-background text-foreground px-3 py-2 border border-input rounded"
          >
            <option value="polish">润色</option>
            <option value="expand">扩写</option>
            <option value="continue">续写</option>
            <option value="fullChapter">生成整章</option>
          </select>
        </div>

        <button
          onClick={handleTest}
          disabled={loading}
          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? '测试中...' : '测试构建上下文'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 mb-6">
          错误：{error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="p-4 bg-green-50 border border-green-200 rounded">
            <h3 className="font-bold mb-2">Summary</h3>
            <p className="text-sm text-green-800">{result.summary}</p>
          </div>

          <div className="p-4 bg-muted border border-border rounded">
            <h3 className="font-bold mb-2">System Prompt</h3>
            <pre className="text-xs whitespace-pre-wrap text-foreground">
              {result.systemPrompt}
            </pre>
          </div>

          <div className="p-4 bg-muted border border-border rounded">
            <h3 className="font-bold mb-2">User Prompt</h3>
            <pre className="text-xs whitespace-pre-wrap text-foreground max-h-96 overflow-y-auto">
              {result.userPrompt}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
