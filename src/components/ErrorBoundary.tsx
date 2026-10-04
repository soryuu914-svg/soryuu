import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * 全局错误边界组件
 * 捕获 React 组件渲染错误，防止白屏
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('❌ React 组件渲染错误:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });

    // 记录到全局错误日志
    if (window.errorLogger) {
      window.errorLogger.push({
        type: 'React渲染错误',
        message: error.message,
        stack: error.stack || '',
        timestamp: new Date().toISOString(),
      });
    }
  }

  handleRefresh = () => {
    window.location.reload();
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const errorText = `错误信息：\n${error?.message}\n\n错误堆栈：\n${error?.stack}\n\n组件堆栈：\n${errorInfo?.componentStack}`;

    navigator.clipboard.writeText(errorText).then(() => {
      alert('错误信息已复制到剪贴板');
    }).catch(() => {
      // 降级方案：使用旧的复制方法
      const textarea = document.createElement('textarea');
      textarea.value = errorText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('错误信息已复制到剪贴板');
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-muted flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-card rounded-lg shadow-lg p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-foreground">页面出现错误</h1>
            </div>

            <div className="mb-6">
              <p className="text-foreground mb-4">
                抱歉，页面渲染时出现了错误。请尝试刷新页面，或将错误信息复制后反馈给开发者。
              </p>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-red-800 mb-2">错误信息：</p>
                <p className="text-sm text-red-700 font-mono break-all">
                  {this.state.error?.message}
                </p>
              </div>

              {this.state.error?.stack && (
                <details className="bg-muted border border-border rounded-lg p-4">
                  <summary className="text-sm font-medium text-foreground cursor-pointer">
                    查看详细错误堆栈
                  </summary>
                  <pre className="mt-3 text-xs text-muted-foreground overflow-auto max-h-64">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={this.handleRefresh}
                className="flex-1 px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors"
              >
                刷新页面
              </button>
              <button
                onClick={this.handleCopyError}
                className="flex-1 px-4 py-2 bg-accent border border-border text-foreground font-semibold rounded-lg hover:bg-accent/80 hover:border-primary/40 transition-colors"
              >
                复制错误信息
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
