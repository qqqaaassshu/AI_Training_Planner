/**
 * AI 服务商适配层。新增服务商时实现 AIProvider 并加入 PROVIDERS。
 *
 * 原型里由浏览器直接调用（用户自带 Key）。正式 App 中：
 * - 用户自带 Key：存钥匙串，由 iPhone 发起调用，手表不持有 Key
 * - 商业化：改为调用自建后端代理，App 内不放开发者 Key
 */
import Anthropic from "@anthropic-ai/sdk";

export interface AICallParams {
  apiKey: string;
  model: string;
  baseUrl?: string;
  system: string;
  user: string;
  signal?: AbortSignal;
}

export interface AIProvider {
  id: string;
  label: string;
  defaultModel: string;
  models: string[];
  /** 返回模型的文本回复（应为 JSON，由调用方解析与校验） */
  call(params: AICallParams): Promise<string>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
  }
}

const anthropic: AIProvider = {
  id: "anthropic",
  label: "Anthropic Claude",
  defaultModel: "claude-opus-5-5",
  models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  async call({ apiKey, model, baseUrl, system, user, signal }) {
    const client = new Anthropic({
      apiKey,
      baseURL: baseUrl || undefined,
      // 原型阶段由浏览器直连（用户自带 Key）；正式 App 不要这样做
      dangerouslyAllowBrowser: true,
    });
    try {
      const response = await client.beta.messages.create(
        {
          model,
          max_tokens: 16000,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { effort: "medium" },
          // 被安全分类器拒绝时由服务端自动换模型重试
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal }
      );
      if (response.stop_reason === "refusal") {
        throw new AIProviderError("模型拒绝了本次请求，请调整内容后重试", false);
      }
      if (response.stop_reason === "max_tokens") {
        throw new AIProviderError("回复超出长度上限，请缩小分析的时间范围后重试", false);
      }
      return response.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
    } catch (e) {
      if (e instanceof AIProviderError) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new AIProviderError("API Key 无效", false);
      if (e instanceof Anthropic.PermissionDeniedError) throw new AIProviderError("该 Key 无权使用此模型", false);
      if (e instanceof Anthropic.NotFoundError) throw new AIProviderError(`找不到模型 ${model}`, false);
      if (e instanceof Anthropic.RateLimitError) throw new AIProviderError("请求过于频繁，请稍后再试", true);
      if (e instanceof Anthropic.APIConnectionError) throw new AIProviderError("网络连接失败，可改用“复制提示词”方式", true);
      if (e instanceof Anthropic.APIError) throw new AIProviderError(`服务错误（${e.status}）：${e.message}`, (e.status ?? 0) >= 500);
      throw e;
    }
  },
};

export const PROVIDERS: AIProvider[] = [anthropic];

export function getProvider(id: string): AIProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
