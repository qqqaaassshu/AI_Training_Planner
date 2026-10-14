/**
 * 常用 AI 服务预设。模型名仅作建议，各家会更新型号，可在设置里自由填写。
 */
import type { AIApiFormat, AIServiceConfig } from "../../types";
import { newId } from "../id";

export interface AIPreset {
  id: string;
  label: string;
  format: AIApiFormat;
  base_url: string;
  default_model: string;
  /** 输入框下拉建议 */
  model_suggestions: string[];
  /** 本地服务（如 Ollama）不需要 Key */
  key_optional?: boolean;
  key_placeholder?: string;
  /** 获取 Key 的说明 */
  hint?: string;
  json_mode?: boolean;
}

export const PRESETS: AIPreset[] = [
  {
    id: "anthropic",
    label: "Anthropic Claude",
    format: "anthropic",
    base_url: "https://api.anthropic.com",
    default_model: "claude-opus-5-5",
    model_suggestions: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
    key_placeholder: "sk-ant-…",
    hint: "在 console.anthropic.com 创建 API Key",
  },
  {
    id: "openai",
    label: "OpenAI",
    format: "openai",
    base_url: "https://api.openai.com/v1",
    default_model: "",
    model_suggestions: [],
    key_placeholder: "sk-…",
    json_mode: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    format: "openai",
    base_url: "https://api.deepseek.com/v1",
    default_model: "deepseek-chat",
    model_suggestions: ["deepseek-chat", "deepseek-reasoner"],
    key_placeholder: "sk-…",
    json_mode: true,
  },
  {
    id: "qwen",
    label: "通义千问（阿里云百炼）",
    format: "openai",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    default_model: "qwen-plus",
    model_suggestions: ["qwen-plus", "qwen-max", "qwen-turbo"],
    key_placeholder: "sk-…",
    json_mode: true,
  },
  {
    id: "moonshot",
    label: "Kimi（月之暗面）",
    format: "openai",
    base_url: "https://api.moonshot.cn/v1",
    default_model: "",
    model_suggestions: [],
    key_placeholder: "sk-…",
    json_mode: true,
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    format: "openai",
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    default_model: "",
    model_suggestions: [],
    json_mode: false,
  },
  {
    id: "doubao",
    label: "豆包（火山方舟）",
    format: "openai",
    base_url: "https://ark.cn-beijing.volces.com/api/v3",
    default_model: "",
    model_suggestions: [],
    hint: "模型处填写方舟控制台里的模型 ID 或推理接入点 ID",
    json_mode: false,
  },
  {
    id: "ollama",
    label: "Ollama（本地模型）",
    format: "openai",
    base_url: "http://localhost:11434/v1",
    default_model: "",
    model_suggestions: [],
    key_optional: true,
    hint: "需在本机运行 Ollama，并允许浏览器跨域访问（OLLAMA_ORIGINS）",
    json_mode: true,
  },
  {
    id: "custom",
    label: "自定义（OpenAI 兼容）",
    format: "openai",
    base_url: "",
    default_model: "",
    model_suggestions: [],
    key_optional: true,
    hint: "任何兼容 /chat/completions 的服务或代理，例如 OpenRouter、One API、公司内网网关",
    json_mode: false,
  },
];

export function getPreset(id: string): AIPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1];
}

export function createServiceFromPreset(presetId: string, existing: AIServiceConfig[] = []): AIServiceConfig {
  const p = getPreset(presetId);
  const sameCount = existing.filter((s) => s.preset === p.id).length;
  return {
    id: newId(),
    name: sameCount > 0 ? `${p.label} ${sameCount + 1}` : p.label,
    preset: p.id,
    format: p.format,
    base_url: p.base_url || undefined,
    model: p.default_model,
    max_tokens: 16000,
    json_mode: p.json_mode ?? false,
    timeout_sec: 120,
  };
}

/** “Header: value” 每行一个 → 对象；返回无法解析的行 */
export function parseHeaders(text: string): { headers: Record<string, string>; invalid: string[] } {
  const headers: Record<string, string> = {};
  const invalid: string[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const i = line.indexOf(":");
    const key = i > 0 ? line.slice(0, i).trim() : "";
    if (!key || !/^[A-Za-z0-9-]+$/.test(key)) invalid.push(line);
    else headers[key] = line.slice(i + 1).trim();
  }
  return { headers, invalid };
}

export function formatHeaders(h: Record<string, string> | undefined): string {
  return Object.entries(h ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

/** 配置是否可以发起调用（不含 Key 检查） */
export function serviceProblems(s: AIServiceConfig): string[] {
  const problems: string[] = [];
  const url = s.base_url || getPreset(s.preset).base_url;
  if (!url) problems.push("请填写接口地址");
  else if (!/^https?:\/\//.test(url)) problems.push("接口地址需以 http:// 或 https:// 开头");
  if (!s.model.trim()) problems.push("请填写模型名称");
  return problems;
}
