/**
 * 全局错误处理工具
 */

export interface ErrorLog {
  type: string;
  message: string;
  stack?: string;
  timestamp: string;
}

// 全局错误日志数组（最多保留 50 条）
const errorLogs: ErrorLog[] = [];
const MAX_LOGS = 50;

// 挂载到 window，让 ErrorBoundary 也能访问
declare global {
  interface Window {
    errorLogger?: ErrorLog[];
  }
}
window.errorLogger = errorLogs;

/**
 * 添加错误日志
 */
export function addErrorLog(log: ErrorLog) {
  errorLogs.unshift(log);
  if (errorLogs.length > MAX_LOGS) {
    errorLogs.pop();
  }
  console.error('📝 记录错误:', log);
}

/**
 * 获取所有错误日志
 */
export function getErrorLogs(): ErrorLog[] {
  return [...errorLogs];
}

/**
 * 清空错误日志
 */
export function clearErrorLogs() {
  errorLogs.length = 0;
}

/**
 * 统一错误提示函数
 */
export function showError(title: string, message: string, detail?: string) {
  const fullMessage = `${title}\n\n${message}${detail ? '\n\n详情：' + detail : ''}`;
  alert(fullMessage);
  console.error('❌', title, message, detail);

  // 记录到日志
  addErrorLog({
    type: title,
    message: message,
    stack: detail,
    timestamp: new Date().toISOString(),
  });
}

/**
 * AI 错误处理
 * 根据错误类型显示友好的中文提示
 */
export function handleAIError(error: any) {
  console.error('AI 调用出错:', error);

  const message = error?.message || String(error);

  if (message.includes('NO_AI_CONFIG')) {
    showError(
      'AI 配置错误',
      '未配置 AI 服务商，请先在设置页配置 API Key',
      message
    );
  } else if (message.includes('NETWORK_ERROR')) {
    showError(
      '网络错误',
      '无法连接到 AI 服务，请检查网络连接',
      message
    );
  } else if (message.includes('AUTH_ERROR') || message.includes('401') || message.includes('Invalid API Key')) {
    showError(
      'API Key 无效',
      'AI 服务商返回认证失败，请检查 API Key 是否正确',
      message
    );
  } else if (message.includes('RATE_LIMIT') || message.includes('429') || message.includes('quota')) {
    showError(
      '请求频繁',
      'AI 服务请求频繁或余额不足，请稍后重试',
      message
    );
  } else if (message.includes('EMPTY_RESPONSE')) {
    showError(
      'AI 返回为空',
      'AI 没有返回有效内容，请重试',
      message
    );
  } else if (message.includes('insufficient_credits') || message.includes('Insufficient Balance')) {
    // 余额不足（DeepSeek 等会返回 HTTP 402 / Insufficient Balance）→ 必须早于 HTTP_ERROR 分支，否则被它抢先命中
    showError(
      'AI 账户余额不足',
      'AI 账户余额不足，请去服务商官网充值后重试',
      message
    );
  } else if (message.includes('HTTP_ERROR')) {
    const statusMatch = message.match(/HTTP_ERROR:(\d+)/);
    const status = statusMatch ? statusMatch[1] : '未知';
    showError(
      'AI 服务错误',
      `AI 服务返回 HTTP ${status} 错误`,
      message
    );
  } else if (message.startsWith('THINKING_TRUNCATED')) {
    showError(
      'AI 输出被截断',
      'AI 思考过长，输出被截断。\n\n建议：在设置页把"最大输出 tokens"调到 16000 或更高',
      message
    );
  } else if (message.startsWith('THINKING_ONLY')) {
    showError(
      'AI 未返回答案',
      'AI 只返回了思考内容，未返回答案。请重试或换个说法',
      message
    );
  } else {
    showError(
      'AI 调用失败',
      '调用 AI 服务时出现未知错误，请重试',
      message
    );
  }
}

/**
 * 初始化全局错误监听
 * 在 main.tsx 中调用
 */
export function initGlobalErrorHandlers() {
  // 捕获未处理的 JS 错误
  window.addEventListener('error', (event) => {
    const { message, filename, lineno, colno, error } = event;

    console.error('❌ 全局 JS 错误:', {
      message,
      filename,
      lineno,
      colno,
      error,
    });

    const errorLocation = filename
      ? `文件 ${filename.split('/').pop()} 第 ${lineno} 行`
      : '未知位置';

    showError(
      '页面出错',
      `${message}（${errorLocation}）`,
      error?.stack
    );

    // 阻止浏览器默认错误提示
    event.preventDefault();
  });

  // 捕获未处理的 Promise 错误
  window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ 未处理的 Promise 错误:', event.reason);

    const reason = event.reason;
    const message = reason?.message || String(reason);
    const stack = reason?.stack;

    showError(
      '异步操作出错',
      message,
      stack
    );

    // 阻止浏览器默认错误提示
    event.preventDefault();
  });

  console.log('✅ 全局错误监听已初始化');
}
