import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { addBookAnalysis } from '../../db/bookAnalysis';
import { askAI, hasAIConfig } from '../ai/client';
import { handleAIError } from '../../utils/errorHandler';

const MAX_CHARS = 8000;

interface AnalysisResult {
  style: string;
  structure: string;
  pacing: string;
  highlights: string[];
  outlineSample: string;
  characters: string;
}

export default function NewAnalysis() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [truncateNotice, setTruncateNotice] = useState(false);

  // 上传 TXT 文件
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      alert('请上传 .txt 文件');
      return;
    }

    try {
      const reader = new FileReader();

      reader.onload = async (event) => {
        let content = event.target?.result as string;

        // 检测乱码，尝试 GBK 解码
        if (content.includes('�') || /[\u0080-ÿ]{3,}/.test(content)) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const decoder = new TextDecoder('gbk');
            content = decoder.decode(arrayBuffer);
          } catch (err) {
            console.warn('GBK 解码失败，使用 UTF-8:', err);
          }
        }

        // 截取前 8000 字
        if (content.length > MAX_CHARS) {
          content = content.slice(0, MAX_CHARS);
          alert(`已截取前 ${MAX_CHARS.toLocaleString()} 字`);
        }

        setText(content);

        // 如果书名为空，自动填入文件名（去掉 .txt）
        if (!title.trim()) {
          const fileName = file.name.replace(/\.txt$/i, '');
          setTitle(fileName);
        }
      };

      reader.onerror = () => {
        alert('文件读取失败');
      };

      reader.readAsText(file, 'utf-8');
    } catch (error) {
      console.error('文件上传失败:', error);
      alert('文件上传失败');
    }

    // 清空 input，允许重复上传同一文件
    e.target.value = '';
  };

  const handleAnalyze = async () => {
    if (!text.trim()) {
      alert('请输入要分析的文本');
      return;
    }

    // 书名改为选填，不填时自动命名
    const finalTitle = title.trim() || `未命名拆书-${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}`;

    // 检查是否配置了 AI
    if (!hasAIConfig()) {
      alert('请先在设置页配置 AI 服务商');
      navigate('/settings');
      return;
    }

    setIsAnalyzing(true);
    setTruncateNotice(false);

    // 截取前8000字
    const truncatedText = text.slice(0, MAX_CHARS);
    const isTruncated = text.length > MAX_CHARS;

    if (isTruncated) {
      setTruncateNotice(true);
    }

    try {
      const systemPrompt = `你是资深网文编辑。请分析以下文本，提炼出：文风、结构、节奏、核心爽点、大纲结构、主要角色原型。
请严格按 JSON 格式输出，不要包含任何 markdown 代码块。
JSON 字段必须包含：style(文风), structure(结构), pacing(节奏), highlights(核心爽点数组), outlineSample(大纲结构), characters(主要角色原型)。`;

      const aiResponse = await askAI({
        system: systemPrompt,
        user: truncatedText,
      });

      // 提取 JSON：兜底逻辑，防止 AI 返回被代码块包裹
      let jsonStr = aiResponse.trim();
      const jsonMatch = jsonStr.match(/{[\s\S]*}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      let analysisData: AnalysisResult;

      try {
        analysisData = JSON.parse(jsonStr);

        // 验证必要字段是否存在
        if (!analysisData.style || !analysisData.structure || !analysisData.pacing) {
          throw new Error('缺少必要字段');
        }
      } catch (parseError) {
        console.error('JSON 解析失败:', parseError);
        console.error('AI 返回原文:', aiResponse);

        // 解析失败，使用兜底数据
        alert('AI 返回数据解析失败，已保存原文。请稍后重试或更换模型。');
        analysisData = {
          style: '解析失败（原文已保存）',
          structure: '解析失败（原文已保存）',
          pacing: '解析失败（原文已保存）',
          highlights: ['解析失败'],
          outlineSample: aiResponse, // 把原始返回存进去
          characters: '解析失败（原文已保存）',
        };
      }

      // 确保 highlights 是数组
      if (!Array.isArray(analysisData.highlights)) {
        analysisData.highlights = [String(analysisData.highlights)];
      }

      // 提取标签（从文风和结构中提取关键词）
      const tags: string[] = [];
      if (analysisData.style.includes('爽文')) tags.push('爽文');
      if (analysisData.style.includes('慢热')) tags.push('慢热');
      if (analysisData.structure.includes('快节奏')) tags.push('快节奏');
      if (analysisData.structure.includes('群像')) tags.push('群像');
      if (tags.length === 0) tags.push('网文');

      const now = Date.now();
      await addBookAnalysis({
        title: finalTitle,
        sourceText: truncatedText,
        style: analysisData.style,
        structure: analysisData.structure,
        pacing: analysisData.pacing,
        highlights: analysisData.highlights,
        outlineSample: analysisData.outlineSample,
        characters: analysisData.characters,
        tags,
        createdAt: now,
      });

      alert('分析完成！');
      navigate('/analysis');
    } catch (error) {
      handleAIError(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const wordCount = text.length;
  const isOverLimit = wordCount > MAX_CHARS;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate('/analysis')}
          className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">新建拆书分析</h1>
          <p className="text-muted-foreground mt-1">粘贴小说文本，AI 将分析文风、结构、节奏等</p>
        </div>
      </div>

      {/* 截取提示 */}
      {truncateNotice && (
        <div className="mb-6 p-4 bg-background border border-yellow-200 rounded-lg">
          <p className="text-sm text-foreground">
            ⚠️ 已截取前 {MAX_CHARS.toLocaleString()} 字进行分析
          </p>
        </div>
      )}

      <div className="space-y-6">
        {/* 书名输入 */}
        <div className="bg-card rounded-lg border border-border p-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            书名（可选）
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-background text-foreground px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="不填时自动命名为：未命名拆书-日期"
          />
        </div>

        {/* 文本输入 */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-foreground">
              原始文本 <span className="text-red-500">*</span>
            </label>
            <div className="text-sm">
              <span className={isOverLimit ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
                {wordCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} 字
              </span>
              {isOverLimit && (
                <span className="ml-2 text-red-500">（将截取前 {MAX_CHARS.toLocaleString()} 字）</span>
              )}
            </div>
          </div>

          {/* 上传 TXT 按钮 */}
          <div className="mb-3">
            <input
              type="file"
              accept=".txt"
              onChange={handleFileUpload}
              className="hidden"
              id="txt-upload"
            />
            <label
              htmlFor="txt-upload"
              className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              上传 TXT 文件
            </label>
            <span className="ml-3 text-xs text-muted-foreground">
              支持 UTF-8 和 GBK 编码，超过 8000 字自动截取
            </span>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-96 bg-background text-foreground px-4 py-3 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none font-mono text-sm"
            placeholder="粘贴小说文本，或点击上方按钮上传 TXT 文件..."
          />
          <p className="text-xs text-muted-foreground mt-2">
            提示：建议粘贴开头3-5章或代表性片段，字数限制在 {MAX_CHARS.toLocaleString()} 字以内效果最佳
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/analysis')}
            className="flex-1 px-6 py-3 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !text.trim()}
            className="flex-1 px-6 py-3 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-card/80 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isAnalyzing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                开始分析
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
