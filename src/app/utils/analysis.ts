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
  ProfileChange,
  UserProfile,
} from "../types";
import { SCHEMA_VERSION } from "../types";
import planSchema from "../schema/plan.schema.json";
import analysisSchema from "../schema/ai-analysis.schema.json";
import { addDays, toDateStr } from "./date";
import { buildExportSummary, comparePlanVersions, getCurrentWeek, getTotalWeeks, summarizeSets } from "./plan";
import { displayValue, formatProfileForPrompt, PROFILE_FIELDS } from "./profile";
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
  /** 历次计划版本：调整了什么，以及该版本使用期间的执行效果 */
  plan_history: PlanHistoryEntry[];
  /** 个人档案的变更记录（最近的在后） */
  profile_changes: { date: string; field: string; from: string; to: string }[];
  /** 用户为本次分析填写的补充说明 */
  user_note?: string;
  /** 写入系统提示词，不重复放进数据 JSON */
  profile: UserProfile;
}

export interface PlanHistoryEntry {
  version: number;
  created_date: string;
  source: PlanVersion["source"];
  change_note?: string;
  /** 相对上一版的具体变化 */
  changes: string[];
  /** 该版本使用期间（到下一版创建前一天） */
  active: { from: string; to: string };
  outcome: { completion_rate: number; scheduled: number; skipped: number; pain_average: number; pain_max: number; fatigue_average: number };
}

const MAX_HISTORY_VERSIONS = 5;
const MAX_PROFILE_CHANGES = 10;

/** 最近几个版本的调整内容与执行效果，帮助 AI 判断上次调整是否有效 */
export function buildPlanHistory(
  versions: PlanVersion[],
  records: ExecutionRecord[],
  dailyWellness: DailyWellness[],
  today: string
): PlanHistoryEntry[] {
  const sorted = [...versions].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return sorted
    .map((v, i): PlanHistoryEntry => {
      const created = toDateStr(new Date(v.created_at));
      const next = sorted[i + 1];
      const from = created > v.start_date ? created : v.start_date;
      const to = next ? addDays(toDateStr(new Date(next.created_at)), -1) : today;
      const parent = versions.find((x) => x.id === v.parent_version_id);
      const diff = parent ? comparePlanVersions(parent, v) : null;
      const changes = diff
        ? [
            ...diff.added.map((a) => `新增任务：${a.taskTitle}`),
            ...diff.removed.map((r) => `删除任务：${r.taskTitle}`),
            ...diff.modified.flatMap((m) => m.changes.map((c) => `${m.taskTitle} · ${c}`)),
          ]
        : [];
      const range = { from, to: to < from ? from : to };
      const s = buildExportSummary(v, records, dailyWellness, today, range);
      return {
        version: v.version,
        created_date: created,
        source: v.source,
        change_note: v.change_note,
        changes,
        active: range,
        outcome: {
          completion_rate: s.completion_rate,
          scheduled: s.scheduled_count,
          skipped: s.skipped_count,
          pain_average: s.pain_average,
          pain_max: s.pain_max,
          fatigue_average: s.fatigue_average,
        },
      };
    })
    .slice(-MAX_HISTORY_VERSIONS);
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
  profile?: UserProfile;
  profileHistory?: ProfileChange[];
  userNote?: string;
}): AnalysisInput {
  const { kind, plan, versions, records, dailyWellness, today, includeNotes = false } = args;
  const profile = args.profile ?? {};
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
    plan_history: buildPlanHistory(versions, records, dailyWellness, today),
    profile_changes: (args.profileHistory ?? []).slice(-MAX_PROFILE_CHANGES).map((c) => ({
      date: toDateStr(new Date(c.at)),
      field: PROFILE_FIELDS.find((f) => f.key === c.field)?.label ?? c.field,
      from: displayValue(c.field, c.from),
      to: displayValue(c.field, c.to),
    })),
    user_note: args.userNote?.trim() || undefined,
    profile,
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

/** 提示词有实质修改时加 1，记录在每条分析里，便于对比不同版本的效果 */
export const PROMPT_VERSION = 2;

const COACH_RULES = `你是一名谨慎、务实的体能训练与康复教练，帮助用户根据真实执行数据调整训练计划。用户是普通人，不是运动员，坚持下去比练得猛更重要。

【调整规则】
- 加量条件：近 2 周完成率 ≥ 85% 且疼痛 ≤ 3。每个动作一次只加一档（次数 +1~2、或时长 +5~10 秒、或组数 +1、或重量 +5%），不同时改多项。
- 某个动作疼痛 ≥ ${PAIN_WARN}：只针对该动作降一档，或换成同部位更轻的替代动作；其他动作不变。
- 因“没时间”跳过：缩短单次训练（减少动作数或组数），不降低强度；可建议更灵活的时间。
- 因“疼痛”或“生病”跳过：暂停加量，必要时安排一周恢复（量减至约 70%）。
- 完成率 < 60%：优先降低频率或难度，不新增任务。
- 不改训练时间和星期，除非数据显示当前安排执行不了，或用户补充说明中提出。
- 严格遵守用户档案中的伤病限制和器械条件，不安排需要所缺器械的动作。
- 参考 plan_history：若上一次调整后完成率下降或疼痛上升，说明该调整可能过量，应回退或放缓；若效果良好，可沿同方向小步推进。
- 参考 profile_changes：状态变好或变差（体重、伤病、可用时间）时相应调整。

【安全】
- 疼痛 ≥ ${PAIN_RISK}，或备注、补充说明中出现胸痛、头晕、呼吸困难、麻木、关节肿胀等情况：标为 level "risk"，建议停止相关训练并就医。
- 不做医学诊断，不推荐药物或补剂。

【输出风格】
- 使用中文。summary 2–4 句，引用具体数据（例如“周二深蹲后疼痛 6 分”），先说结论。
- findings 最多 5 条，按风险从高到低排列；没有问题时可为空数组。
- suggested_plan.change_note 逐条写“改了什么 + 为什么”。

【数据约定】
- 调整已有任务时沿用原任务的 id 和动作 id；新增任务可以省略 id。日期使用 YYYY-MM-DD；weekday 中 0 = 周日。
- 动作的 reps（次数）与 duration_sec（秒）二选一。`;

const OUTPUT_SPEC = `【输出格式】只输出一个 JSON 对象，不要输出任何其他文字或代码块标记。格式必须符合下面的 JSON Schema（AIAnalysisOutput），其中 suggested_plan 符合 PlanInput：

AIAnalysisOutput:
${JSON.stringify(analysisSchema)}

PlanInput:
${JSON.stringify(planSchema)}`;

/**
 * 系统提示词 = 教练规则 + 用户档案 + 输出格式。
 * 档案很少变化，系统提示词因此基本稳定；每次变化的数据都放在用户消息里。
 */
export function buildSystemPrompt(profile: UserProfile): string {
  return `${COACH_RULES}

【用户档案】
${formatProfileForPrompt(profile)}

${OUTPUT_SPEC}`;
}

export function buildPrompt(input: AnalysisInput): { system: string; user: string } {
  const { profile, user_note, ...data } = input;
  const note = user_note ? `\n本次补充说明（用户填写，优先考虑）：${user_note}\n` : "";
  const user = `任务：${ANALYSIS_KIND_LABEL[input.kind]}
${TASK_INSTRUCTIONS[input.kind]}
${note}
以下是执行数据（JSON）：
${JSON.stringify(data, null, 2)}`;
  return { system: buildSystemPrompt(profile), user };
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
  meta: Pick<AIAnalysis, "kind" | "channel" | "plan_version_id" | "range" | "provider" | "model" | "user_note">
): AIAnalysis {
  const a: AIAnalysis = { ...output, ...meta, id: newId(), created_at: new Date().toISOString(), status: "new", prompt_version: PROMPT_VERSION };
  if (!a.user_note) delete a.user_note;
  return a;
}
