/**
 * 数据模型 v2。
 *
 * 这些类型同时是：
 * - 网页原型的状态结构
 * - 未来 iOS / watchOS（Swift）模型的参考
 * - 与 AI 交换数据的契约（对应 src/app/schema/*.schema.json）
 *
 * 约定：
 * - 所有 `date` 字段为本地日期字符串 YYYY-MM-DD（按计划的 timezone 解释）
 * - 所有 `*_at` 字段为 ISO 8601 时间戳
 * - id 一律为字符串；新生成的 id 使用 UUID
 */

export const SCHEMA_VERSION = "2.0";

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  /** 每组次数。与 duration_sec 二选一 */
  reps?: number;
  /** 每组时长（秒），用于平板支撑等计时动作。与 reps 二选一 */
  duration_sec?: number;
  weight_kg?: number;
  /** 组间休息（秒） */
  rest_sec?: number;
  /** 动作要点 */
  cue?: string;
}

/** 按周渐进：week_from ~ week_to（含）期间用 exercises 覆盖任务默认动作 */
export interface TaskPhase {
  week_from: number;
  week_to: number;
  exercises: Exercise[];
}

export interface TaskSchedule {
  daily?: boolean;
  /** 0 = 周日 … 6 = 周六 */
  weekday?: number[];
  /** HH:mm，本地时间 */
  time?: string;
}

export interface PlanTask {
  /** 跨版本保持不变，用于版本对比与历史统计 */
  id: string;
  title: string;
  type: "workout" | "habit";
  schedule: TaskSchedule;
  exercises?: Exercise[];
  phases?: TaskPhase[];
  reminder: boolean;
}

export type PlanSource = "json_import" | "nl_import" | "ai_analysis" | "manual";

export interface PlanVersion {
  schema_version: string;
  id: string;
  version: number;
  plan_name: string;
  created_at: string;
  /** IANA 时区，如 "Asia/Shanghai" */
  timezone: string;
  start_date: string;
  end_date?: string;
  parent_version_id?: string;
  source: PlanSource;
  /** 由哪次 AI 分析生成 */
  analysis_id?: string;
  /** 本版本相对上一版的调整说明 */
  change_note?: string;
  ai_summary?: string;
  tasks: PlanTask[];
}

/** 导入 / AI 输出的计划内容（不含由 App 分配的版本元数据） */
export type PlanInput = Pick<PlanVersion, "plan_name" | "start_date" | "tasks"> &
  Partial<Pick<PlanVersion, "end_date" | "ai_summary" | "change_note" | "timezone">>;

export type RecordStatus = "completed" | "partial" | "skipped" | "snoozed";
export type SkipReason = "pain" | "no_time" | "sick" | "other";
export type RecordSource = "phone" | "watch";

export interface SetLog {
  exercise_id: string;
  /** 冗余保存动作名，计划变更或自定义动作时仍可读 */
  exercise_name: string;
  /** 从 1 开始 */
  set_index: number;
  reps?: number;
  duration_sec?: number;
  weight_kg?: number;
  completed_at: string;
}

export interface ExecutionRecord {
  id: string;
  task_id: string;
  plan_version_id: string;
  date: string;
  status: RecordStatus;
  skip_reason?: SkipReason;
  sets?: SetLog[];
  /** 0–10 */
  pain_score?: number;
  /** 0–10 */
  fatigue_score?: number;
  notes: string;
  source: RecordSource;
  started_at?: string;
  completed_at?: string;
  updated_at: string;
  /** 预留：对应 HealthKit HKWorkout 的 UUID */
  health_workout_id?: string;
}

export interface DailyWellness {
  date: string;
  fatigue_score: number;
  sleep_hours?: number;
  updated_at: string;
}

export type AnalysisKind = "session_feedback" | "weekly_review" | "plan_adjustment" | "alert";
export type FindingLevel = "info" | "warn" | "risk";

export interface Finding {
  level: FindingLevel;
  text: string;
}

/** AI 输出的分析结果（API 返回或手动粘贴回来的内容） */
export interface AIAnalysisOutput {
  summary: string;
  findings: Finding[];
  suggested_plan?: PlanInput;
}

export interface AIAnalysis extends AIAnalysisOutput {
  id: string;
  created_at: string;
  kind: AnalysisKind;
  /** api：App 直接调用模型；manual_import：导出后手动粘贴回来 */
  channel: "api" | "manual_import";
  plan_version_id: string;
  range: { from: string; to: string };
  provider?: string;
  model?: string;
  status: "new" | "accepted" | "rejected";
}

export interface AISettings {
  provider: string;
  model: string;
  base_url?: string;
  consent_given: boolean;
  auto_weekly_review: boolean;
}

export interface ExportSummary {
  /** 统计区间内应完成任务数（过去日期 + 今天已有记录的任务） */
  scheduled_count: number;
  completed_count: number;
  partial_count: number;
  skipped_count: number;
  /** completed 计 1，partial 计 0.5 */
  completion_rate: number;
  /** 过去日期中既没完成也没跳过的任务 */
  missed_tasks: string[];
  skip_reasons: Partial<Record<SkipReason, number>>;
  pain_average: number;
  pain_max: number;
  fatigue_average: number;
}
