/**
 * 本地持久化（网页原型用 localStorage；iOS 上对应 SwiftData）。
 *
 * API Key 单独存放，不随状态导出。原型里存在 localStorage 仅用于演示，
 * 正式 App 必须存入钥匙串（Keychain）。
 */
import type { AIAnalysis, AISettings, DailyWellness, ExecutionRecord, PlanVersion } from "../types";
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
const API_KEY_KEY = "atp:ai-api-key";

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "anthropic",
  model: "",
  consent_given: false,
  auto_weekly_review: false,
};

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
      aiSettings: { ...base.aiSettings, ...parsed.aiSettings },
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

export function loadApiKey(): string {
  try {
    return storage()?.getItem(API_KEY_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(key: string): void {
  try {
    if (key) storage()?.setItem(API_KEY_KEY, key);
    else storage()?.removeItem(API_KEY_KEY);
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
