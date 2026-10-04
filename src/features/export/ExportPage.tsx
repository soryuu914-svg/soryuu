import { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Upload, FileText, FileJson, AlertTriangle } from 'lucide-react';
import { db } from '../../db/index';
import { getAllProjects } from '../../db/project';

/**
 * 把 TipTap 的 HTML 转成「保留段落分隔」的纯文本。
 *
 * 原实现直接用 el.textContent 取正文，而 textContent 会把相邻块级元素的内容
 * 直接拼在一起（<p>甲</p><p>乙</p> → "甲乙"），导致导出的 TXT / MD 整章段落挤成一坨。
 * 这里先给块级元素补换行、把 <br> 还原成换行、把 <hr> 变成分隔线，再取文本。
 */
function htmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;

  // <hr> → 分隔线
  div.querySelectorAll('hr').forEach(el => {
    el.replaceWith(document.createTextNode('\n\n---\n\n'));
  });

  // <br>（Shift+Enter 软换行）→ 单个换行
  div.querySelectorAll('br').forEach(el => {
    el.replaceWith(document.createTextNode('\n'));
  });

  // 块级元素 → 内容结束后补一个空行
  div.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre').forEach(el => {
    el.appendChild(document.createTextNode('\n\n'));
  });

  return (div.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function ExportPage() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const projects = useLiveQuery(() => getAllProjects(), []);

  // JSON 全量备份
  const handleExportJSON = async () => {
    setIsExporting(true);
    try {
      // 动态遍历 db.tables 导出全部表。
      // 不硬编码表名 —— 以后 db 新增表会自动纳入备份，不会再出现"漏表"。
      const tables: Record<string, unknown[]> = {};
      let recordCount = 0;
      for (const table of db.tables) {
        const rows = await table.toArray();
        tables[table.name] = rows;
        recordCount += rows.length;
      }

      // 保持与历史备份一致的「扁平」结构：{ version, exportDate, <表名>: [...] }
      // 旧备份就是这个形状，保持不变，新旧备份 + 导入逻辑三者才能互相兼容。
      const data = {
        version: db.verno,
        exportDate: new Date().toISOString(),
        ...tables,
      };

      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const date = new Date().toISOString().split('T')[0];
      const filename = `novel-workbench-backup-${date}.json`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      URL.revokeObjectURL(url);
      alert(`导出成功！共 ${db.tables.length} 张表、${recordCount} 条记录`);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  // JSON 导入恢复
  const handleImportJSON = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('导入会用备份文件覆盖当前数据（仅覆盖备份中包含的表），确定吗？')) {
      // 清空 input 值，允许重新选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setIsImporting(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const jsonStr = event.target?.result as string;
          const parsed = JSON.parse(jsonStr);

          // 兼容两种备份结构：
          //   ① 扁平：{ version, exportDate, <表名>: [...] }  ← 本应用所有历史备份用的就是这种
          //   ② 嵌套：{ version, exportedAt, tables: { <表名>: [...] } }
          const container: Record<string, unknown> =
            parsed && typeof parsed === 'object' && parsed.tables && typeof parsed.tables === 'object'
              ? parsed.tables
              : parsed;

          if (!container || typeof container !== 'object' || Array.isArray(container)) {
            throw new Error('备份内容不是有效对象');
          }

          // 非数据表的元信息键，导入时跳过
          const META_KEYS = new Set(['version', 'exportDate', 'exportedAt', 'tables', 'appVersion']);

          // 以 db.tables 的声明顺序为准来「清空 + 写入」，避免 JSON 键序造成的依赖问题
          const plans: Array<{ table: (typeof db.tables)[number]; rows: unknown[] }> = [];
          for (const table of db.tables) {
            if (META_KEYS.has(table.name)) continue;
            const rows = container[table.name];
            // 备份里没有这张表 → 跳过（老备份只有 7 张表，其余表保持原样，不误删）
            if (Array.isArray(rows)) plans.push({ table, rows });
          }

          if (plans.length === 0) {
            throw new Error('备份文件里没有可识别的数据表');
          }

          // 备份里有、但当前数据库已不存在这张表 → 跳过并记录（用于提示）
          const knownNames = new Set(db.tables.map(t => t.name));
          const unknownTables = Object.keys(container).filter(
            k => !META_KEYS.has(k) && !knownNames.has(k)
          );

          await db.transaction('rw', plans.map(p => p.table), async () => {
            for (const { table, rows } of plans) {
              await table.clear();
              if (rows.length > 0) await table.bulkAdd(rows);
            }
          });

          const importedRecords = plans.reduce((sum, p) => sum + p.rows.length, 0);
          const untouchedTables = db.tables.length - plans.length;
          const extraNote = unknownTables.length > 0
            ? `\n\n已跳过 ${unknownTables.length} 个未知表（本版本无此表）：${unknownTables.join('、')}`
            : '';
          const skipNote = untouchedTables > 0
            ? `\n\n备份中未包含的 ${untouchedTables} 张表已保持原样（未清空）。`
            : '';

          alert(`导入成功：共导入 ${plans.length} 张表、${importedRecords} 条记录。\n\n点击确定后页面将自动刷新。${skipNote}${extraNote}`);
          window.location.reload();
        } catch (parseError) {
          console.error('解析失败:', parseError);
          // SyntaxError 说明文件根本不是合法 JSON；其余是我们主动抛出的可读提示
          const reason = parseError instanceof SyntaxError
            ? '文件不是有效的 JSON'
            : (parseError instanceof Error ? parseError.message : String(parseError));
          alert(`导入失败：${reason}`);
        } finally {
          setIsImporting(false);
          // 清空 input 值
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      };
      reader.readAsText(file);
    } catch (error) {
      console.error('导入失败:', error);
      alert('导入失败，请重试');
      setIsImporting(false);
      // 清空 input 值
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 单作品导出 TXT
  const handleExportTXT = async () => {
    if (!selectedProjectId) {
      alert('请先选择一个作品');
      return;
    }

    try {
      const project = await db.projects.get(selectedProjectId);
      if (!project) {
        alert('作品不存在');
        return;
      }

      const volumes = await db.volumes.where('projectId').equals(selectedProjectId).sortBy('order');
      const chapters = await db.chapters.where('projectId').equals(selectedProjectId).sortBy('order');

      let content = `${project.name}\n\n`;
      if (project.description) {
        content += `${project.description}\n\n`;
      }
      content += '='.repeat(50) + '\n\n';

      // 按卷组织章节
      for (const volume of volumes) {
        content += `第${volume.index}卷 ${volume.title}\n\n`;

        const volumeChapters = chapters.filter(ch => ch.volumeId === volume.id);
        for (const chapter of volumeChapters) {
          content += `第${chapter.index}章 ${chapter.title}\n\n`;

          // 提取纯文本（保留段落分隔）
          if (chapter.content) {
            const plainText = htmlToPlainText(chapter.content);
            if (plainText) content += plainText + '\n\n';
          }

          content += '-'.repeat(50) + '\n\n';
        }
      }

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const date = new Date().toISOString().split('T')[0];
      const filename = `${project.name}-${date}.txt`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      URL.revokeObjectURL(url);
      alert('导出成功！');
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请重试');
    }
  };

  // 单作品导出 Markdown
  const handleExportMarkdown = async () => {
    if (!selectedProjectId) {
      alert('请先选择一个作品');
      return;
    }

    try {
      const project = await db.projects.get(selectedProjectId);
      if (!project) {
        alert('作品不存在');
        return;
      }

      const volumes = await db.volumes.where('projectId').equals(selectedProjectId).sortBy('order');
      const chapters = await db.chapters.where('projectId').equals(selectedProjectId).sortBy('order');

      let content = `# ${project.name}\n\n`;
      if (project.description) {
        content += `> ${project.description}\n\n`;
      }
      content += '---\n\n';

      // 按卷组织章节
      for (const volume of volumes) {
        content += `# 第${volume.index}卷 ${volume.title}\n\n`;

        const volumeChapters = chapters.filter(ch => ch.volumeId === volume.id);
        for (const chapter of volumeChapters) {
          content += `## 第${chapter.index}章 ${chapter.title}\n\n`;

          // 正文转纯文本（保留段落分隔；章节标题已由上面的 ## 前缀提供）
          if (chapter.content) {
            const plainText = htmlToPlainText(chapter.content);
            if (plainText) content += plainText + '\n\n';
          }

          content += '---\n\n';
        }
      }

      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const date = new Date().toISOString().split('T')[0];
      const filename = `${project.name}-${date}.md`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      URL.revokeObjectURL(url);
      alert('导出成功！');
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请重试');
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* 头部 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">导出备份</h1>
        <p className="text-muted-foreground">定期备份数据，保障创作安全</p>
      </div>

      {/* 功能卡片 */}
      <div className="space-y-6">
        {/* JSON 全量备份 */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-start gap-4">
            <div className="bg-blue-100 p-3 rounded-lg">
              <FileJson size={24} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground mb-2">JSON 全量备份</h3>
              <p className="text-muted-foreground text-sm mb-4">
                导出全部数据表（作品、人物、世界观、大纲、正文、灵感、剧情卡、场景卡、避雷规则、书库、文风卡等）为 JSON 文件。推荐定期备份。
              </p>
              <button
                onClick={handleExportJSON}
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                <Download size={18} />
                {isExporting ? '导出中...' : '导出 JSON 备份'}
              </button>
            </div>
          </div>
        </div>

        {/* JSON 导入恢复 */}
        <div className="bg-card rounded-lg border-2 border-red-200 p-6">
          <div className="flex items-start gap-4">
            <div className="bg-red-100 p-3 rounded-lg">
              <AlertTriangle size={24} className="text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground mb-2">JSON 导入恢复</h3>
              <p className="text-red-600 text-sm font-medium mb-2">
                ⚠️ 警告：导入会覆盖当前所有数据，请谨慎操作！
              </p>
              <p className="text-muted-foreground text-sm mb-4">
                选择之前导出的 JSON 备份文件，恢复备份中包含的数据。兼容旧版本备份（仅含 7 张表的文件也能导入，未包含的表保持原样）。
              </p>
              {/* 隐藏的文件输入 */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={handleImportJSON}
                disabled={isImporting}
                className="flex items-center gap-2 px-4 py-2 bg-destructive text-white rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={18} />
                {isImporting ? '导入中...' : '选择备份文件导入'}
              </button>
            </div>
          </div>
        </div>

        {/* 单作品导出 */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-start gap-4">
            <div className="bg-green-100 p-3 rounded-lg">
              <FileText size={24} className="text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground mb-2">单作品导出</h3>
              <p className="text-muted-foreground text-sm mb-4">
                导出指定作品的正文内容为 TXT 或 Markdown 格式。
              </p>

              {/* 作品选择 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">
                  选择作品
                </label>
                <select
                  value={selectedProjectId || ''}
                  onChange={(e) => setSelectedProjectId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full bg-background text-foreground px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">请选择...</option>
                  {projects?.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleExportTXT}
                  disabled={!selectedProjectId}
                  className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={18} />
                  导出为 TXT
                </button>
                <button
                  onClick={handleExportMarkdown}
                  disabled={!selectedProjectId}
                  className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={18} />
                  导出为 Markdown
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-medium text-blue-900 mb-2">💡 备份建议</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>建议每周进行一次 JSON 全量备份</li>
          <li>重要修改前先备份，以便随时恢复</li>
          <li>备份文件请妥善保管，避免丢失</li>
          <li>更换浏览器或清除缓存前务必备份</li>
        </ul>
      </div>
    </div>
  );
}
