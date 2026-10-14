/**
 * AI 分析的共用层：不论走 API 还是“导出 → 外部 AI → 粘贴回来”，
 * 都使用同一份输入（buildAnalysisInput）、同一套提示词（buildPrompt）
 * 和同一份输出格式（ai-analysis.schema.json + validateAIAnalysisOutput）。
 */
import type {
  AIAnalysis,
  AIAnalysisOutput,
  AnalysisKind,
  DailyWellness,
  ExecutionRecord,
  Finding,
  PlanVersion,
} from "../types";
import { SCHEMA_VERSION } from "../types";
import planSchema from "../schema/plan.schema.json";
import analysisSchema from "../schema/ai-analysis.schema.json";
import { addDays } from "./date";
import { buildExportSummary, getCurrentWeek, getTotalWeeks, summarizeSets } from "./plan";
import { newId } from "./id";
import { extractJSON, validateAIAnalysisOutput, type ValidationResult } from "./validate";

export const ANALYSIS_KIND_LABEL: Record<AnalysisKind, string> = {
  session_feedback: "训练反馈",
  weekly_review: "每周复盘",
  plan_adjustment: "计划调整",
  alert: "异常提醒",
};

// ---------- 本地安全规则（不依赖 AI，离线也生效） ----------

export const PAIN_RISK = 7;
export const PAIN_WARN = 5;

/** 最近 7 天的本地风险检测 */
export function detectAlerts(records: ExecutionRecord[], wellness: DailyWellness[], today: string): Finding[] {
  const from = addDays(today, -6);
  const recent = records.filter((r) => r.date >= from && r.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const findings: Finding[] = [];

  const maxPain = Math.max(-1, ...recent.map((r) => r.pain_score ?? -1));
  if (maxPain >= PAIN_RISK) {
    findings.push({ level: "risk", text: `近 7 天出现疼痛 ${maxPain}/10，建议暂停相关动作，疼痛持续请就医` });
  } else {
    const painRecords = recent.filter((r) => r.pain_score !== undefined);
    const lastTwo = painRecords.slice(-2);
    if (lastTwo.length === 2 && lastTwo.every((r) => r.pain_score! >= PAIN_WARN)) {
      findings.push({ level: "warn", text: `最近两次训练疼痛都在 ${PAIN_WARN} 分以上，建议降低强度` });
    }
  }

  const painSkips = recent.filter((r) => r.status === "skipped" && r.skip_reason === "pain").length;
  if (painSkips >= 2) findings.push({ level: "warn", text: `近 7 天有 ${painSkips} 次因疼痛跳过训练` });

  const skips = recent.filter((r) => r.status === "skipped").length;
  if (skips >= 3) findings.push({ level: "warn", text: `近 7 天跳过 ${skips} 次任务，计划可能偏重` });

  const lastFatigue = wellness
    .filter((d) => d.date >= addDays(today, -2) && d.date <= today)
    .map((d) => d.fatigue_score);
  if (lastFatigue.length >= 2 && lastFatigue.every((f) => f >= 7)) {
    findings.push({ level: "warn", text: "连续多日疲劳 7 分以上，注意恢复和睡眠" });
  }
  return findings;
}

// ---------- 分析输入 ----------

export function defaultRange(kind: AnalysisKind, plan: PlanVersion | null, today: string): { from: string; to: string } {
  if (kind === "plan_adjustment" && plan) {
    const from = plan.start_date > addDays(today, -27) ? plan.start_date : addDays(today, -27);
    return { from: from < today ? from : today, to: today };
  }
  return { from: addDays(today, -6), to: today };
}

export interface AnalysisInput {
  schema_version: string;
  kind: AnalysisKind;
  today: string;
  range: { from: string; to: string };
  plan: (Omit<PlanVersion, "parent_version_id" | "analysis_id"> & { current_week: number; total_weeks: number }) | null;
  summary: ReturnType<typeof buildExportSummary>;
  local_alerts: Finding[];
  records: {
    date: string;
    task_id: string;
    task_title: string;
    status: ExecutionRecord["status"];
    skip_reason?: ExecutionRecord["skip_reason"];
    sets?: { name: string; sets: number; reps?: number; duration_sec?: number; weight_kg?: number }[];
    pain_score?: number;
    fatigue_score?: number;
    notes?: string;
    source: ExecutionRecord["source"];
  }[];
  daily_wellness: { date: string; fatigue_score: number; sleep_hours?: number }[];
}

export function buildAnalysisInput(args: {
  kind: AnalysisKind;
  plan: PlanVersion | null;
  versions: PlanVersion[];
  records: ExecutionRecord[];
  dailyWellness: DailyWellness[];
  today: string;
  range?: { from: string; to: string };
  /** 是否包含文字备注（隐私：默认不发送原始备注） */
  includeNotes?: boolean;
}): AnalysisInput {
  const { kind, plan, versions, records, dailyWellness, today, includeNotes = false } = args;
  const range = args.range ?? defaultRange(kind, plan, today);
  const inRange = (d: string) => d >= range.from && d <= range.to;

  const titleOf = (taskId: string) => {
    for (const v of [plan, ...[...versions].sort((a, b) => b.version - a.version)]) {
      const t = v?.tasks.find((x) => x.id === taskId);
      if (t) return t.title;
    }
    return taskId;
  };

  return {
    schema_version: SCHEMA_VERSION,
    kind,
    today,
    range,
    plan: plan
      ? {
          schema_version: plan.schema_version,
          id: plan.id,
          version: plan.version,
          plan_name: plan.plan_name,
          created_at: plan.created_at,
          timezone: plan.timezone,
          start_date: plan.start_date,
          end_date: plan.end_date,
          source: plan.source,
          change_note: plan.change_note,
          ai_summary: plan.ai_summary,
          tasks: plan.tasks,
          current_week: getCurrentWeek(plan, today),
          total_weeks: getTotalWeeks(plan),
        }
      : null,
    summary: buildExportSummary(plan, records, dailyWellness, today, range),
    local_alerts: detectAlerts(records, dailyWellness, today),
    records: records
      .filter((r) => inRange(r.date))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date: r.date,
        task_id: r.task_id,
        task_title: titleOf(r.task_id),
        status: r.status,
        skip_reason: r.skip_reason,
        sets: r.sets?.length ? summarizeSets(r.sets).map(({ exercise_id: _id, ...s }) => s) : undefined,
        pain_score: r.pain_score,
        fatigue_score: r.fatigue_score,
        notes: includeNotes && r.notes ? r.notes : undefined,
        source: r.source,
      })),
    daily_wellness: dailyWellness
      .filter((d) => inRange(d.date))
      .map(({ date, fatigue_score, sleep_hours }) => ({ date, fatigue_score, sleep_hours })),
  };
}

// ---------- 提示词 ----------

const TASK_INSTRUCTIONS: Record<AnalysisKind, string> = {
  session_feedback: "针对最近一次训练给出简短反馈（summary 1-2 句），只在发现问题时给 findings。不要输出 suggested_plan。",
  weekly_review:
    "对统计区间（通常为最近 7 天）做复盘：完成情况、趋势、疼痛与疲劳风险。只有确有必要调整时才输出 suggested_plan，否则省略。",
  plan_adjustment:
    "基于执行数据给出下一版训练计划，必须输出 suggested_plan，并在 suggested_plan.change_note 中说明调整了什么、为什么。",
  alert: "数据触发了本地风险规则（见 local_alerts）。解释可能原因并给出调整建议；如需减量，输出降低强度的 suggested_plan。",
};

const SYSTEM_PROMPT = `你是一名谨慎的体能训练与康复教练，帮助用户根据真实执行数据调整训练计划。

原则：
- 安全第一：疼痛评分 ≥ ${PAIN_RISK} 视为风险（level: "risk"），建议停止相关动作并在疼痛持续时就医；不做医学诊断。
- 渐进调整：每次只做小幅调整（组数、次数、时长、重量或频率），说明原因。
- 尊重用户的目标（plan.ai_summary）和实际完成能力；完成率低时优先降低难度或频率，而不是加量。
- 调整已有任务时沿用原任务的 id 和动作 id；新增任务可以省略 id。日期使用 YYYY-MM-DD；weekday 中 0 = 周日。
- 动作的 reps（次数）与 duration_sec（秒）二选一。

输出要求：只输出一个 JSON 对象，不要输出任何其他文字或代码块标记。格式必须符合下面的 JSON Schema（AIAnalysisOutput），其中 suggested_plan 符合 PlanInput：

AIAnalysisOutput:
${JSON.stringify(analysisSchema)}

PlanInput:
${JSON.stringify(planSchema)}`;

export function buildPrompt(input: AnalysisInput): { system: string; user: string } {
  const user = `任务：${ANALYSIS_KIND_LABEL[input.kind]}
${TASK_INSTRUCTIONS[input.kind]}

以下是执行数据（JSON）：
${JSON.stringify(input, null, 2)}`;
  return { system: SYSTEM_PROMPT, user };
}

/** 手动复制给外部 AI 时，把系统提示与数据合成一段文本 */
export function buildManualPrompt(input: AnalysisInput): string {
  const { system, user } = buildPrompt(input);
  return `${system}\n\n---\n\n${user}`;
}

// ---------- 结果 ----------

export function parseAnalysisReply(text: string): ValidationResult<AIAnalysisOutput> {
  let raw: unknown;
  try {
    // 推理模型可能把思考过程放在 <think> 标签里
    raw = extractJSON(text.replace(/<think>[\s\S]*?<\/think>/g, ""));
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : "未找到有效的 JSON"] };
  }
  return validateAIAnalysisOutput(raw);
}

export function createAnalysis(
  output: AIAnalysisOutput,
  meta: Pick<AIAnalysis, "kind" | "channel" | "plan_version_id" | "range" | "provider" | "model">
): AIAnalysis {
  return { ...output, ...meta, id: newId(), created_at: new Date().toISOString(), status: "new" };
}
