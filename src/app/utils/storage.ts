/**
 * 本地持久化（网页原型用 localStorage；iOS 上对应 SwiftData）。
 *
 * API Key 单独存放，不随状态导出。原型里存在 localStorage 仅用于演示，
 * 正式 App 必须存入钥匙串（Keychain）。
 */
import type { AIAnalysis, AIServiceConfig, AISettings, DailyWellness, ExecutionRecord, PlanVersion } from "../types";
import { createServiceFromPreset } from "./ai/presets";
import { SCHEMA_VERSION } from "../types";

export interface PersistedState {
  schema_version: string;
  planVersions: PlanVersion[];
  currentPlanId: string | null;
  records: ExecutionRecord[];
  dailyWellness: DailyWellness[];
  analyses: AIAnalysis[];
  aiSettings: AISettings;
}

const STATE_KEY = "atp:state:v2";
/** 旧版：单个 Key */
const LEGACY_API_KEY_KEY = "atp:ai-api-key";
/** 新版：按服务 id 保存 Key */
const API_KEYS_KEY = "atp:ai-api-keys";

export const DEFAULT_AI_SETTINGS: AISettings = {
  services: [],
  active_service_id: null,
  consent_given: false,
  auto_weekly_review: false,
};

/** 兼容旧版设置 { provider, model, base_url } */
function migrateAISettings(raw: unknown): AISettings {
  const r = (raw ?? {}) as Partial<AISettings> & { provider?: string; model?: string; base_url?: string };
  if (Array.isArray(r.services)) return { ...DEFAULT_AI_SETTINGS, ...r, services: r.services };
  const settings: AISettings = {
    ...DEFAULT_AI_SETTINGS,
    consent_given: !!r.consent_given,
    auto_weekly_review: !!r.auto_weekly_review,
  };
  if (r.provider) {
    const service: AIServiceConfig = createServiceFromPreset(r.provider);
    if (r.model) service.model = r.model;
    if (r.base_url) service.base_url = r.base_url;
    settings.services = [service];
    settings.active_service_id = service.id;
    // 旧 Key 归到这个服务下
    const legacyKey = storage()?.getItem(LEGACY_API_KEY_KEY);
    if (legacyKey) {
      saveApiKeys({ ...loadApiKeys(), [service.id]: legacyKey });
      storage()?.removeItem(LEGACY_API_KEY_KEY);
    }
  }
  return settings;
}

export function emptyState(): PersistedState {
  return {
    schema_version: SCHEMA_VERSION,
    planVersions: [],
    currentPlanId: null,
    records: [],
    dailyWellness: [],
    analyses: [],
    aiSettings: DEFAULT_AI_SETTINGS,
  };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadState(): PersistedState {
  try {
    const raw = storage()?.getItem(STATE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const base = emptyState();
    return {
      ...base,
      ...parsed,
      aiSettings: migrateAISettings(parsed.aiSettings),
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state: PersistedState): void {
  try {
    storage()?.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用（隐私模式 / 配额已满）时忽略，页面仍可使用
  }
}

export function clearState(): void {
  try {
    storage()?.removeItem(STATE_KEY);
  } catch {
    // ignore
  }
}

export function loadApiKeys(): Record<string, string> {
  try {
    const raw = storage()?.getItem(API_KEYS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveApiKeys(keys: Record<string, string>): void {
  try {
    const clean = Object.fromEntries(Object.entries(keys).filter(([, v]) => v));
    if (Object.keys(clean).length > 0) storage()?.setItem(API_KEYS_KEY, JSON.stringify(clean));
    else storage()?.removeItem(API_KEYS_KEY);
  } catch {
    // ignore
  }
}

/** 训练中途的草稿（已勾选的动作与实际数值），按日期 + 任务保存，提交后清除 */
export interface TaskDraft {
  doneIds: string[];
  items: { exercise_id: string; name: string; sets: number; reps?: number; duration_sec?: number; weight_kg?: number }[];
}

const draftKey = (date: string, taskId: string) => `atp:draft:${date}:${taskId}`;

export function loadDraft(date: string, taskId: string): TaskDraft | null {
  try {
    const raw = storage()?.getItem(draftKey(date, taskId));
    return raw ? (JSON.parse(raw) as TaskDraft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(date: string, taskId: string, draft: TaskDraft | null): void {
  try {
    if (draft && draft.doneIds.length > 0) storage()?.setItem(draftKey(date, taskId), JSON.stringify(draft));
    else storage()?.removeItem(draftKey(date, taskId));
  } catch {
    // ignore
  }
}
