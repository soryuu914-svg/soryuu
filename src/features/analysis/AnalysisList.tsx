import { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Trash2, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAllLocalBooks, addLocalBook, deleteLocalBook, addBookChapter } from '../../db/localBook';
import { getAllBookAnalyses, deleteBookAnalysis } from '../../db/bookAnalysis';
import type { LocalBook, BookAnalysis } from '../../types';

export default function AnalysisList() {
  const navigate = useNavigate();
  const books = useLiveQuery(() => getAllLocalBooks(), []);
  const analyses = useLiveQuery(() => getAllBookAnalyses(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'books' | 'analyses'>('books');
  const [importing, setImporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<BookAnalysis | null>(null);
  const [previewData, setPreviewData] = useState<{
    fileName: string;
    title: string;
    author: string;
    chapters: Array<{ index: number; title: string; content: string }>;
    totalWords: number;
  } | null>(null);

  // 格式化数字
  const formatNumber = (num: number): string => {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    return num.toString();
  };

  // 格式化日期
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  // 统计文字数（去除标点和空格）
  const countWords = (text: string): number => {
    return text.replace(/[\s\p{P}]/gu, '').length;
  };

  // 切章函数
  const splitChapters = (text: string): Array<{ index: number; title: string; content: string }> => {
    const chapters: Array<{ index: number; title: string; content: string }> = [];

    // 章节标题正则（支持多种格式）
    const chapterRegex = /^(第[一二三四五六七八九十百千万零\d]+[章节回].*|Chapter\s+\d+.*|\d+[、.].*)/gm;

    const matches = Array.from(text.matchAll(chapterRegex));

    if (matches.length === 0) {
      // 没有找到章节，整本书作为一章
      chapters.push({
        index: 1,
        title: '正文',
        content: text.trim()
      });
      return chapters;
    }

    // 处理第一章之前的内容（前言）
    if (matches[0].index! > 0) {
      const prologueContent = text.substring(0, matches[0].index!).trim();
      if (prologueContent.length > 0) {
        chapters.push({
          index: 0,
          title: '前言',
          content: prologueContent
        });
      }
    }

    // 切分章节
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const startIndex = match.index!;
      const endIndex = i < matches.length - 1 ? matches[i + 1].index! : text.length;

      const chapterTitle = match[0].trim();
      const chapterContent = text.substring(startIndex + chapterTitle.length, endIndex).trim();

      chapters.push({
        index: chapters.length > 0 && chapters[0].title === '前言' ? i : i + 1,
        title: chapterTitle,
        content: chapterContent
      });
    }

    return chapters;
  };

  // 检测文件编码并读取
  const readFileWithEncoding = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        // 先尝试 UTF-8
        try {
          const utf8Text = new TextDecoder('utf-8', { fatal: true }).decode(arrayBuffer);
          resolve(utf8Text);
          return;
        } catch (e) {
          // UTF-8 失败，尝试 GBK
          try {
            const gbkText = new TextDecoder('gbk').decode(arrayBuffer);
            resolve(gbkText);
          } catch (e2) {
            reject(new Error('文件编码不支持'));
          }
        }
      };

      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsArrayBuffer(file);
    });
  };

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      alert('请选择 TXT 文件');
      return;
    }

    setImporting(true);

    try {
      const text = await readFileWithEncoding(file);
      const chapters = splitChapters(text);
      const totalWords = chapters.reduce((sum, ch) => sum + countWords(ch.content), 0);

      setPreviewData({
        fileName: file.name.replace('.txt', ''),
        title: file.name.replace('.txt', ''),
        author: '',
        chapters,
        totalWords
      });

      setShowPreview(true);
    } catch (error) {
      console.error('导入失败:', error);
      alert('导入失败，请检查文件格式');
    } finally {
      setImporting(false);
      // 重置 input，允许重复选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 确认导入
  const handleConfirmImport = async () => {
    if (!previewData) return;

    setImporting(true);

    try {
      const now = Date.now();

      // 写入书籍记录
      const bookId = await addLocalBook({
        title: previewData.title,
        author: previewData.author || undefined,
        totalChapters: previewData.chapters.length,
        totalWords: previewData.totalWords,
        createdAt: now
      });

      // 分批写入章节（每批 10 章）
      const batchSize = 10;
      for (let i = 0; i < previewData.chapters.length; i += batchSize) {
        const batch = previewData.chapters.slice(i, i + batchSize);
        await Promise.all(
          batch.map(chapter =>
            addBookChapter({
              bookId,
              index: chapter.index,
              title: chapter.title,
              content: chapter.content,
              wordCount: countWords(chapter.content),
              createdAt: now
            })
          )
        );
      }

      alert(`已成功导入 ${previewData.chapters.length} 章`);
      setShowPreview(false);
      setPreviewData(null);
    } catch (error) {
      console.error('导入失败:', error);
      alert('导入失败，请重试');
    } finally {
      setImporting(false);
    }
  };

  // 删除书籍
  const handleDeleteBook = async (book: LocalBook) => {
    if (!confirm(`确定删除《${book.title}》吗？其所有章节数据也会被删除。`)) {
      return;
    }

    try {
      await deleteLocalBook(book.id!);
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请重试');
    }
  };

  // 删除分析
  const handleDeleteAnalysis = async (analysisId: number) => {
    if (!confirm('确定删除这条分析吗？')) {
      return;
    }

    try {
      await deleteBookAnalysis(analysisId);
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请重试');
    }
  };

  // 复制全文
  const handleCopyAnalysis = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      alert('已复制到剪贴板');
    }).catch(() => {
      alert('复制失败，请重试');
    });
  };

  return (
    <div className="h-full flex flex-col bg-muted">
      {/* 顶部栏 */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">书库</h1>
            <p className="text-sm text-muted-foreground mt-1">本地书库 · 导入 TXT 阅读与分析</p>
          </div>
          {activeTab === 'books' && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? '导入中...' : '导入 TXT'}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-4 border-b border-border">
          <button
            onClick={() => setActiveTab('books')}
            className={`pb-3 px-2 border-b-2 transition-colors ${
              activeTab === 'books'
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            本地书库 {books && `(${books.length})`}
          </button>
          <button
            onClick={() => setActiveTab('analyses')}
            className={`pb-3 px-2 border-b-2 transition-colors ${
              activeTab === 'analyses'
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            拆书分析 {analyses && `(${analyses.length})`}
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'books' ? (
          // 本地书库
          !books || books.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <BookOpen size={64} className="text-muted-foreground mb-4" />
            <p className="text-lg mb-2">还没有书</p>
            <p className="text-sm mb-4">点击右上角导入 TXT</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
            >
              导入第一本书
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {books.map((book) => (
              <div
                key={book.id}
                className="glass-card rounded-xl p-6 cursor-pointer group relative hover:-translate-y-0.5 transition-transform"
                onClick={() => navigate(`/analysis/book/${book.id}`)}
              >
                <div className="flex flex-col items-center">
                  <h3 className="text-lg font-bold text-foreground text-center mb-2 line-clamp-2">
                    {book.title}
                  </h3>
                  {book.author && (
                    <p className="text-sm text-muted-foreground mb-2">{book.author}</p>
                  )}
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                    <span>{book.totalChapters} 章</span>
                    <span>·</span>
                    <span>{formatNumber(book.totalWords)} 字</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(book.createdAt)} 导入</p>

                  <div className="flex gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/analysis/book/${book.id}`);
                      }}
                      className="px-4 py-1.5 text-sm bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      阅读
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBook(book);
                      }}
                      className="px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 rounded transition-colors"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        // 拆书分析 tab
        !analyses || analyses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FileText size={64} className="text-muted-foreground mb-4" />
            <p className="text-lg mb-2">还没有分析记录</p>
            <p className="text-sm">在本地书库中打开书籍，点击"分析这本书"即可生成</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {analyses.map((analysis) => (
              <div
                key={analysis.id}
                className="glass-card rounded-xl p-5 cursor-pointer hover:-translate-y-0.5 transition-transform"
                onClick={() => setSelectedAnalysis(analysis)}
              >
                {/* 上排：标题 + 标签 */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-base font-bold text-foreground line-clamp-1 flex-1">
                    {analysis.title}
                  </h3>
                  <div className="flex gap-1.5 shrink-0">
                    {analysis.tags.map((tag, idx) => (
                      <span key={idx} className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary border border-primary/20">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 中排：摘要（两行截断） */}
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {analysis.outlineSample.substring(0, 200)}...
                </p>

                {/* 下排：日期 + 操作 */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(analysis.createdAt)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnalysis(analysis);
                      }}
                      className="px-3 py-1.5 text-xs bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
                    >
                      查看详情
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAnalysis(analysis.id!);
                      }}
                      className="px-3 py-1.5 text-xs bg-card border border-destructive/30 text-destructive font-semibold rounded-lg hover:bg-destructive/10 hover:border-destructive/50 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
      </div>

      {/* 预览对话框 */}
      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-foreground mb-4">导入预览</h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">书名</label>
                <input
                  type="text"
                  value={previewData.title}
                  onChange={(e) => setPreviewData({ ...previewData, title: e.target.value })}
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">作者（可选）</label>
                <input
                  type="text"
                  value={previewData.author}
                  onChange={(e) => setPreviewData({ ...previewData, author: e.target.value })}
                  className="w-full bg-background text-foreground px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
                  placeholder="留空表示未知"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm text-muted-foreground">总章节数</p>
                  <p className="text-2xl font-bold text-foreground">{previewData.chapters.length}</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm text-muted-foreground">总字数</p>
                  <p className="text-2xl font-bold text-foreground">{formatNumber(previewData.totalWords)}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground mb-2">前 5 章预览</p>
                <div className="bg-muted rounded-lg p-3 space-y-1">
                  {previewData.chapters.slice(0, 5).map((ch, idx) => (
                    <div key={idx} className="text-sm text-foreground">
                      第 {ch.index} 章：{ch.title}
                    </div>
                  ))}
                  {previewData.chapters.length > 5 && (
                    <div className="text-sm text-muted-foreground">...还有 {previewData.chapters.length - 5} 章</div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPreview(false);
                  setPreviewData(null);
                }}
                disabled={importing}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing || !previewData.title.trim()}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? '导入中...' : '确认导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分析详情弹窗 */}
      {selectedAnalysis && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* 标题栏 */}
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-2xl font-bold text-foreground mb-2">{selectedAnalysis.title}</h2>
              <div className="flex items-center gap-2">
                {selectedAnalysis.tags.map((tag, idx) => (
                  <span key={idx} className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary border border-primary/20">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-4">
                {(() => {
                  const text = selectedAnalysis.outlineSample || '';
                  const sections: Array<{ title: string; lines: string[] }> = [];
                  let current: { title: string; lines: string[] } | null = null;

                  text.split('\n').forEach(line => {
                    if (line.startsWith('## ')) {
                      if (current) sections.push(current);
                      current = { title: line.replace('## ', '').trim(), lines: [] };
                    } else if (current) {
                      current.lines.push(line);
                    } else if (line.trim()) {
                      sections.push({ title: '', lines: [line] });
                    }
                  });
                  if (current) sections.push(current);

                  if (sections.length === 0) {
                    return <p className="text-sm text-foreground whitespace-pre-wrap">{text}</p>;
                  }

                  return sections.map((section, idx) => (
                    <div key={idx} className="bg-card border border-border rounded-xl p-4">
                      {section.title && (
                        <h3 className="text-base font-bold text-primary mb-3 pb-2 border-b border-border">
                          {section.title}
                        </h3>
                      )}
                      <div className="text-sm text-foreground leading-relaxed space-y-2">
                        {section.lines.map((line, i) => {
                          if (line.startsWith('- ')) {
                            return (
                              <div key={i} className="flex gap-2">
                                <span className="text-primary shrink-0">·</span>
                                <span>{line.replace('- ', '')}</span>
                              </div>
                            );
                          }
                          if (line.trim()) {
                            return <p key={i}>{line}</p>;
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-6 py-4 border-t border-border flex gap-3">
              <button
                onClick={() => setSelectedAnalysis(null)}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => handleCopyAnalysis(selectedAnalysis.outlineSample)}
                className="flex-1 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors flex items-center justify-center gap-2"
              >
                复制全文
              </button>
              <button
                onClick={() => {
                  if (confirm('确定删除这条分析吗？')) {
                    handleDeleteAnalysis(selectedAnalysis.id!);
                    setSelectedAnalysis(null);
                  }
                }}
                className="px-4 py-2 bg-card border border-destructive/30 text-destructive font-semibold rounded-lg hover:bg-destructive/10 hover:border-destructive/50 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
