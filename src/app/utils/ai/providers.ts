/**
 * AI 调用适配层：按服务配置的接口格式发送请求，返回模型的文本回复。
 *
 * - anthropic：Anthropic 官方 SDK（Messages API）
 * - openai：OpenAI 兼容的 /chat/completions（DeepSeek、通义千问、Kimi、Ollama、各类代理等）
 *
 * 原型里由浏览器直接调用（用户自带 Key）。正式 App 中：
 * - 用户自带 Key：存钥匙串，由 iPhone 发起调用，手表不持有 Key
 * - 商业化：改为调用自建后端代理，App 内不放开发者 Key
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AIServiceConfig } from "../../types";
import { getPreset } from "./presets";

export interface AICallParams {
  system: string;
  user: string;
  signal?: AbortSignal;
  /** 覆盖配置里的 max_tokens（测试连接时用） */
  maxTokens?: number;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
  }
}

/** 把外部取消信号与超时合并成一个 AbortSignal */
function withTimeout(signal: AbortSignal | undefined, timeoutSec: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutSec * 1000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

function baseUrlOf(config: AIServiceConfig): string {
  return (config.base_url || getPreset(config.preset).base_url).replace(/\/+$/, "");
}

async function callAnthropic(config: AIServiceConfig, apiKey: string, p: AICallParams, signal: AbortSignal): Promise<string> {
  const client = new Anthropic({
    apiKey,
    baseURL: baseUrlOf(config),
    defaultHeaders: config.extra_headers,
    maxRetries: 1,
    // 原型阶段由浏览器直连（用户自带 Key）；正式 App 不要这样做
    dangerouslyAllowBrowser: true,
  });
  try {
    const response = await client.beta.messages.create(
      {
        model: config.model,
        max_tokens: p.maxTokens ?? config.max_tokens,
        system: p.system,
        messages: [{ role: "user", content: p.user }],
        output_config: { effort: p.maxTokens ? "low" : "medium" },
        // 被安全分类器拒绝时由服务端自动换模型重试
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal }
    );
    if (response.stop_reason === "refusal") throw new AIProviderError("模型拒绝了本次请求，请调整内容后重试", false);
    if (response.stop_reason === "max_tokens" && !p.maxTokens)
      throw new AIProviderError("回复超出长度上限，可在高级设置里调大最大输出长度", false);
    return response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  } catch (e) {
    if (e instanceof AIProviderError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AIProviderError("API Key 无效", false);
    if (e instanceof Anthropic.PermissionDeniedError) throw new AIProviderError("该 Key 无权使用此模型", false);
    if (e instanceof Anthropic.NotFoundError) throw new AIProviderError(`找不到模型 ${config.model}，或接口地址有误`, false);
    if (e instanceof Anthropic.RateLimitError) throw new AIProviderError("请求过于频繁或额度不足，请稍后再试", true);
    if (e instanceof Anthropic.APIConnectionError) throw networkError();
    if (e instanceof Anthropic.APIError) throw new AIProviderError(`服务错误（${e.status}）：${e.message}`, (e.status ?? 0) >= 500);
    throw e;
  }
}

function networkError() {
  return new AIProviderError(
    "无法连接到服务：可能是网络问题、接口地址错误，或该服务不允许浏览器直接访问（跨域限制）。可改用代理地址，或用“复制提示词”方式",
    true
  );
}

function httpError(status: number, detail: string): AIProviderError {
  const d = detail ? `：${detail.slice(0, 200)}` : "";
  if (status === 401) return new AIProviderError(`API Key 无效${d}`, false);
  if (status === 403) return new AIProviderError(`没有权限${d}`, false);
  if (status === 404) return new AIProviderError(`接口地址或模型不存在${d}`, false);
  if (status === 429) return new AIProviderError(`请求过于频繁或额度不足${d}`, true);
  return new AIProviderError(`服务错误（${status}）${d}`, status >= 500);
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null; reasoning_content?: string }; finish_reason?: string }[];
  error?: { message?: string };
}

async function callOpenAICompatible(config: AIServiceConfig, apiKey: string, p: AICallParams, signal: AbortSignal): Promise<string> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: "system", content: p.system },
      { role: "user", content: p.user },
    ],
    max_tokens: p.maxTokens ?? config.max_tokens,
  };
  if (config.temperature !== undefined) body.temperature = config.temperature;
  if (config.json_mode && !p.maxTokens) body.response_format = { type: "json_object" };

  const headers: Record<string, string> = { "Content-Type": "application/json", ...config.extra_headers };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let res: Response;
  try {
    res = await fetch(`${baseUrlOf(config)}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal });
  } catch (e) {
    if (signal.aborted) throw e;
    throw networkError();
  }

  const text = await res.text();
  let data: ChatCompletionResponse = {};
  try {
    data = JSON.parse(text) as ChatCompletionResponse;
  } catch {
    // 非 JSON 响应，下面按状态码处理
  }
  if (!res.ok) throw httpError(res.status, data.error?.message ?? text);

  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (!content) throw new AIProviderError("服务返回了空内容，请检查模型名称", false);
  if (choice?.finish_reason === "length" && !p.maxTokens)
    throw new AIProviderError("回复超出长度上限，可在高级设置里调大最大输出长度", false);
  return content.trim();
}

/** 按服务配置调用模型，返回文本回复（应为 JSON，由调用方解析与校验） */
export async function callService(config: AIServiceConfig, apiKey: string, p: AICallParams): Promise<string> {
  const t = withTimeout(p.signal, config.timeout_sec);
  try {
    return config.format === "anthropic"
      ? await callAnthropic(config, apiKey, p, t.signal)
      : await callOpenAICompatible(config, apiKey, p, t.signal);
  } catch (e) {
    if (t.timedOut()) throw new AIProviderError(`超过 ${config.timeout_sec} 秒未响应，可在高级设置里调大超时时间`, true);
    throw e;
  } finally {
    t.done();
  }
}

/** 测试连接：发送一条极短的请求，返回耗时 */
export async function testService(config: AIServiceConfig, apiKey: string, signal?: AbortSignal): Promise<{ ms: number; reply: string }> {
  const start = performance.now();
  const reply = await callService(config, apiKey, {
    system: "这是连接测试。",
    user: "请只回复两个字母：OK",
    maxTokens: 512,
    signal,
  });
  return { ms: Math.round(performance.now() - start), reply: reply.slice(0, 40) };
}
