const AI_BASE_URL_KEY = 'ai_base_url';
const AI_API_KEY_KEY = 'ai_api_key';
const AI_MODEL_KEY = 'ai_model';
const AI_MAX_TOKENS_KEY = 'ai_max_tokens';

interface AskAIOptions {
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** 按模型名自动附加"关闭思考"参数（见 resolveThinkingParam）；模型不支持关闭时静默跳过 */
  disableThinking?: boolean;
  /** 透传到请求 body 的额外字段（优先级高于 disableThinking 的自动参数，可覆盖） */
  extraBody?: Record<string, unknown>;
}

/**
 * 按模型名推断"关闭思考模式"的请求参数（2026-09 联网核实各厂商官方文档）。
 * 各厂商参数互不兼容，匹配不到或不支持关闭的模型返回 {}（调用方静默跳过，方案 A）。
 *
 * 【可关闭】
 * - DeepSeek V4 / Claude（Sonnet 5、Opus 5 等） / GLM-4.5~5.2 / Kimi K2.x / 豆包 seed 混合思考模型
 *   → { thinking: { type: 'disabled' } }
 * - Qwen（DashScope）→ { enable_thinking: false }（顶层；本地 vLLM 是 chat_template_kwargs 包裹，两种语义不同）
 * - Gemini 2.5（OpenAI 兼容端点）→ { reasoning_effort: 'none' }
 * - GPT-5.2+ → { reasoning_effort: 'none' }；其余 GPT-5 → { reasoning_effort: 'minimal' }
 * - 混元（开源部署链路）→ { chat_template_kwargs: { enable_thinking: false } }
 *
 * 【无法关闭 → {}】
 * - OpenAI o 系列（仅 low/medium/high）；Gemini 3.x 与 2.5 Pro（官方明确不可关）
 * - GLM-5.3 系列（强制思考）；Kimi K3 / K2.7-code（始终思考）
 * - Claude Fable/Mythos 5.x（拒绝 disabled）；豆包专用思考模型（*-thinking）
 * - deepseek-reasoner / kimi-*-thinking 等专用思考模型
 */
export function resolveThinkingParam(model: string): Record<string, unknown> {
  const m = (model || '').toLowerCase();

  // —— 无法关闭思考的模型：静默跳过 ——
  if (/^o[134]([-_.]|$)/.test(m)) return {};                    // OpenAI o 系列
  if (/gemini-3/.test(m) || /gemini-2\.5-pro/.test(m)) return {}; // Gemini 3.x / 2.5 Pro
  if (/glm-5\.3/.test(m)) return {};                            // GLM-5.3 强制思考
  if (/kimi-k3|kimi-k2\.7|kimi.*thinking/.test(m)) return {};   // Kimi K3 / K2.7-code / 专用思考版
  if (/claude-(fable|mythos)/.test(m)) return {};               // Claude 拒绝 disabled 的型号
  if (/doubao.*thinking/.test(m)) return {};                    // 豆包专用思考模型
  if (/deepseek-reasoner/.test(m)) return {};                   // 旧版专用思考模型

  // —— 可关闭思考的模型 ——
  if (/gemini/.test(m)) return { reasoning_effort: 'none' };    // Gemini 2.5（兼容端点）
  if (/^gpt-5\.[2-9]/.test(m)) return { reasoning_effort: 'none' };
  if (/gpt-5/.test(m)) return { reasoning_effort: 'minimal' };
  if (/(deepseek|claude|glm|doubao|kimi)/.test(m)) return { thinking: { type: 'disabled' } };
  if (/(qwen|qwq)/.test(m)) return { enable_thinking: false };
  if (/hunyuan/.test(m)) return { chat_template_kwargs: { enable_thinking: false } };

  // 未识别的模型：不附加参数，交给模型默认行为
  return {};
}

/**
 * 调用通用的 OpenAI 兼容 API
 * @param options 请求参数
 * @returns 返回 AI 的纯文本回复
 */
export async function askAI(options: AskAIOptions): Promise<string> {
  const baseUrl = localStorage.getItem(AI_BASE_URL_KEY);
  const apiKey = localStorage.getItem(AI_API_KEY_KEY);
  const model = localStorage.getItem(AI_MODEL_KEY);

  if (!baseUrl || !apiKey || !model) {
    throw new Error('NO_AI_CONFIG: 请先在设置页配置 AI 服务商');
  }

  const { system, user, temperature = 0.7, maxTokens, disableThinking, extraBody } = options;

  // 按模型名自动附加"关闭思考"参数；extraBody 优先级更高，可覆盖自动参数
  const autoBody = disableThinking ? resolveThinkingParam(model) : {};

  // maxTokens 取值优先级：调用方显式传入 > 设置页配置（ai_max_tokens）> 兜底 8192
  const configuredMaxTokens = parseInt(localStorage.getItem(AI_MAX_TOKENS_KEY) || '', 10);
  const effectiveMaxTokens = maxTokens
    ?? (Number.isFinite(configuredMaxTokens) && configuredMaxTokens > 0 ? configuredMaxTokens : 8192);

  // 保险措施：确保 system 和 user 不为空
  const safeSystem = (typeof system === 'string' && system.trim()) ? system : '你是一个有帮助的助手';
  const safeUser = (typeof user === 'string' && user.trim()) ? user : '你好';

  const messages: Array<{ role: string; content: string }> = [];
  messages.push({ role: 'system', content: safeSystem });
  messages.push({ role: 'user', content: safeUser });

  try {
    const endpoint = baseUrl.endsWith('/')
      ? `${baseUrl}chat/completions`
      : `${baseUrl}/chat/completions`;

    // 底层调用：发请求并取文本（空内容不在这里抛错，交给下面的重试循环统一处理）
    const callOnce = async (): Promise<string> => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: effectiveMaxTokens,
          ...autoBody,
          ...(extraBody || {}),
        }),
      });

      // 网络错误
      if (!response.ok) {
        const status = response.status;

        // 认证错误
        if (status === 401 || status === 403) {
          throw new Error('AUTH_ERROR: API Key 无效或认证失败');
        }

        // 频率限制/余额不足
        if (status === 429) {
          throw new Error('RATE_LIMIT: 请求频繁或余额不足');
        }

        // 其他 HTTP 错误
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || errorData.message || response.statusText;
        throw new Error(`HTTP_ERROR:${status}: ${errorMessage}`);
      }

      const data = await response.json();

      const msg = data.choices?.[0]?.message;
      const finishReason = data.choices?.[0]?.finish_reason;

      // 诊断日志（含 reasoning_content 长度，用于识别"思考模式假空返回"）
      console.log('[askAI] 诊断', {
        endpoint,
        model,
        finish_reason: finishReason,
        content_length: msg?.content?.length ?? 0,
        reasoning_length: msg?.reasoning_content?.length ?? 0,
        usage: data.usage,
      });

      if (!msg) {
        throw new Error('EMPTY_RESPONSE: API 返回数据格式异常');
      }

      const content = msg.content || '';
      const reasoning = msg.reasoning_content || '';

      // 情况 1：正常有内容
      if (content.trim()) {
        // 诊断：被 max_tokens 截断时给出提示（上层只会看到"JSON 解析失败/输出被截断"这类表象）
        if (finishReason === 'length') {
          console.warn(`[askAI] 输出被截断（finish_reason=length, max_tokens=${effectiveMaxTokens}），建议提高 maxTokens 或分批生成`);
        }
        return content;
      }

      // 情况 2：content 空但 reasoning 有值 → 思考完成但最终输出没产出（不再把"思考"当答案返回）
      if (reasoning.trim()) {
        if (finishReason === 'length') {
          throw new Error(
            `THINKING_TRUNCATED: AI 思考完成但输出被截断（reasoning ${reasoning.length} 字，max_tokens 用完）。请在设置页或调用处调大 maxTokens（建议 16000+）。`
          );
        }
        throw new Error(
          `THINKING_ONLY: AI 只返回了思考内容，没返回最终答案。可能需要在 prompt 中强调"直接输出结果，不要解释"。`
        );
      }

      // 情况 3：都空 → 返回空串，交给外层「空返回自动重试」统一处理（重试 2 次后抛 EMPTY_RESPONSE）
      return '';
    };

    // 空返回自动重试（最多 2 次）
    let finalResult = await callOnce();
    let retryCount = 0;
    while ((!finalResult || finalResult.trim() === '') && retryCount < 2) {
      retryCount++;
      console.warn(`[askAI] 返回为空，第 ${retryCount} 次重试...`);
      await new Promise(r => setTimeout(r, 500));
      finalResult = await callOnce();
    }
    if (!finalResult || finalResult.trim() === '') {
      throw new Error('EMPTY_RESPONSE: AI 返回内容为空（已重试 2 次）');
    }
    return finalResult;
  } catch (error) {
    // 网络连接错误
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('NETWORK_ERROR: 无法连接到 AI 服务，请检查网络');
    }

    if (error instanceof Error) {
      throw error;
    }
    throw new Error('调用 AI API 时发生未知错误');
  }
}

/**
 * 检查是否已配置 AI 服务
 */
export function hasAIConfig(): boolean {
  const baseUrl = localStorage.getItem(AI_BASE_URL_KEY);
  const apiKey = localStorage.getItem(AI_API_KEY_KEY);
  const model = localStorage.getItem(AI_MODEL_KEY);

  return !!(baseUrl && apiKey && model);
}

/**
 * 获取当前配置信息
 */
export function getAIConfig() {
  const storedMaxTokens = parseInt(localStorage.getItem(AI_MAX_TOKENS_KEY) || '', 10);
  return {
    baseUrl: localStorage.getItem(AI_BASE_URL_KEY) || '',
    apiKey: localStorage.getItem(AI_API_KEY_KEY) || '',
    model: localStorage.getItem(AI_MODEL_KEY) || '',
    maxTokens: Number.isFinite(storedMaxTokens) && storedMaxTokens > 0 ? storedMaxTokens : 8192,
  };
}

/**
 * 保存 AI 配置
 */
export function saveAIConfig(baseUrl: string, apiKey: string, model: string, maxTokens?: number) {
  localStorage.setItem(AI_BASE_URL_KEY, baseUrl.trim());
  localStorage.setItem(AI_API_KEY_KEY, apiKey.trim());
  localStorage.setItem(AI_MODEL_KEY, model.trim());
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    localStorage.setItem(AI_MAX_TOKENS_KEY, String(Math.floor(maxTokens)));
  }
}

/**
 * 从 AI 返回的原始文本中提取 JSON
 * @param raw AI 原始返回内容
 * @param type 期望的 JSON 类型
 * @returns 解析后的 JSON 对象或数组
 */
export function extractJSON(raw: string, type: 'array' | 'object' = 'array') {
  // 1. 去掉 markdown 代码块包裹
  let cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // 2. 容错：整体就是合法 JSON 时优先整体解析（避免结构被正则切错）
  try {
    const whole = JSON.parse(cleaned);
    if (type === 'array') {
      // AI 可能返回单个对象而非数组，此时包装成数组
      return Array.isArray(whole) ? whole : [whole];
    }
    if (!Array.isArray(whole)) {
      return whole;
    }
  } catch {
    // 整体不是合法 JSON（可能夹带散文或前后缀），落到下面的正则提取
  }

  // 3. 按类型用正则提取
  const pattern = type === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = cleaned.match(pattern);
  if (!match) {
    // 检测是否截断
    const trimmed = cleaned.trim();
    const lastChar = trimmed[trimmed.length - 1];
    if (lastChar !== '}' && lastChar !== ']') {
      throw new Error('AI 输出被截断，请减少目标章节数（建议每次不超过 3 卷），或分批生成。');
    }
    throw new Error('未找到有效的 JSON 内容：' + raw.slice(0, 200));
  }

  // 4. 尝试解析
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    // 检测是否截断
    const jsonStr = match[0].trim();
    const lastChar = jsonStr[jsonStr.length - 1];
    if (lastChar !== '}' && lastChar !== ']') {
      throw new Error('AI 输出被截断，请减少目标章节数（建议每次不超过 3 卷），或分批生成。');
    }
    throw new Error('JSON 解析失败：' + match[0].slice(0, 200));
  }
}
