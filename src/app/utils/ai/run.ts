import type { AIAnalysis, AISettings } from "../../types";
import { buildPrompt, createAnalysis, parseAnalysisReply, type AnalysisInput } from "../analysis";
import { getProvider } from "./providers";

export class AnalysisFormatError extends Error {
  constructor(readonly errors: string[]) {
    super("AI 返回的格式不符合要求");
  }
}

/** 通过 API 运行一次分析，返回经过校验的分析记录 */
export async function runApiAnalysis(args: {
  input: AnalysisInput;
  planVersionId: string;
  settings: AISettings;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<AIAnalysis> {
  const { input, planVersionId, settings, apiKey, signal } = args;
  const provider = getProvider(settings.provider);
  if (!provider) throw new Error(`未知的服务商：${settings.provider}`);
  const model = settings.model || provider.defaultModel;
  const { system, user } = buildPrompt(input);
  const text = await provider.call({ apiKey, model, baseUrl: settings.base_url, system, user, signal });
  const parsed = parseAnalysisReply(text);
  if (!parsed.ok) throw new AnalysisFormatError(parsed.errors);
  return createAnalysis(parsed.value, {
    kind: input.kind,
    channel: "api",
    plan_version_id: planVersionId,
    range: input.range,
    provider: provider.id,
    model,
  });
}
