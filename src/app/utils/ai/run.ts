import type { AIAnalysis, AIServiceConfig } from "../../types";
import { buildPrompt, createAnalysis, parseAnalysisReply, type AnalysisInput } from "../analysis";
import { callService } from "./providers";

export class AnalysisFormatError extends Error {
  constructor(readonly errors: string[]) {
    super("AI 返回的格式不符合要求");
  }
}

/** 通过 API 运行一次分析，返回经过校验的分析记录 */
export async function runApiAnalysis(args: {
  input: AnalysisInput;
  planVersionId: string;
  service: AIServiceConfig;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<AIAnalysis> {
  const { input, planVersionId, service, apiKey, signal } = args;
  const { system, user } = buildPrompt(input);
  const text = await callService(service, apiKey, { system, user, signal });
  const parsed = parseAnalysisReply(text);
  if (!parsed.ok) throw new AnalysisFormatError(parsed.errors);
  return createAnalysis(parsed.value, {
    kind: input.kind,
    channel: "api",
    plan_version_id: planVersionId,
    range: input.range,
    provider: service.name,
    model: service.model,
    user_note: input.user_note,
  });
}
