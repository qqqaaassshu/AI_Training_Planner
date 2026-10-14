import type {
  DailyWellness,
  ExecutionRecord,
  Exercise,
  ExportSummary,
  PlanInput,
  PlanSource,
  PlanTask,
  PlanVersion,
  SetLog,
  SkipReason,
} from "../types";
import { SCHEMA_VERSION } from "../types";
import { addDays, daysBetween, formatDuration, localTimeZone, weekdayOf } from "./date";
import { newId } from "./id";

// ---------- 日程 ----------

export function isTaskOnDate(task: PlanTask, date: string): boolean {
  if (task.schedule.daily) return true;
  return task.schedule.weekday?.includes(weekdayOf(date)) ?? false;
}

export function isDateInPlan(plan: PlanVersion, date: string): boolean {
  return date >= plan.start_date && (!plan.end_date || date <= plan.end_date);
}

export function getTasksOnDate(plan: PlanVersion, date: string): PlanTask[] {
  if (!isDateInPlan(plan, date)) return [];
  return plan.tasks.filter((t) => isTaskOnDate(t, date));
}

export function getTotalWeeks(plan: PlanVersion): number {
  if (!plan.end_date) return 12;
  return Math.max(1, Math.ceil((daysBetween(plan.start_date, plan.end_date) + 1) / 7));
}

/** date 位于计划第几周（从 1 开始，计划开始前视为第 1 周） */
export function getWeekOfPlan(plan: PlanVersion, date: string): number {
  const days = daysBetween(plan.start_date, date);
  if (days < 0) return 1;
  return Math.floor(days / 7) + 1;
}

export function getCurrentWeek(plan: PlanVersion, today: string): number {
  return Math.min(getTotalWeeks(plan), getWeekOfPlan(plan, today));
}

/** 按周渐进：若当周有 phase 覆盖则用 phase 的动作 */
export function getExercisesForDate(plan: PlanVersion, task: PlanTask, date: string): Exercise[] {
  const week = getWeekOfPlan(plan, date);
  const phase = task.phases?.find((p) => week >= p.week_from && week <= p.week_to);
  return phase?.exercises ?? task.exercises ?? [];
}

export function getScheduledTasksInRange(
  plan: PlanVersion,
  fromDate: string,
  toDate: string
): { date: string; task: PlanTask }[] {
  const result: { date: string; task: PlanTask }[] = [];
  const from = fromDate > plan.start_date ? fromDate : plan.start_date;
  const to = plan.end_date && plan.end_date < toDate ? plan.end_date : toDate;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const task of plan.tasks) {
      if (isTaskOnDate(task, d)) result.push({ date: d, task });
    }
  }
  return result;
}

export function findRecord(records: ExecutionRecord[], taskId: string, date: string): ExecutionRecord | undefined {
  return records.find((r) => r.task_id === taskId && r.date === date);
}

export function isDone(r: ExecutionRecord | undefined): boolean {
  return r?.status === "completed" || r?.status === "partial";
}

// ---------- 统计 ----------

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

/**
 * 统计口径：
 * - 过去的日期：所有排期任务都计入
 * - 今天：只有已有记录（完成/部分/跳过）的任务才计入，还没做的不算遗漏
 * - completed 计 1，partial 计 0.5，skipped 计 0
 */
export function buildExportSummary(
  plan: PlanVersion | null,
  records: ExecutionRecord[],
  dailyWellness: DailyWellness[],
  today: string,
  range?: { from: string; to: string }
): ExportSummary {
  const inRange = (date: string) => !range || (date >= range.from && date <= range.to);
  const scopedRecords = records.filter((r) => inRange(r.date));

  let scheduled_count = 0;
  let completed_count = 0;
  let partial_count = 0;
  let skipped_count = 0;
  const missed_tasks: string[] = [];
  const skip_reasons: ExportSummary["skip_reasons"] = {};

  if (plan) {
    const to = range && range.to < today ? range.to : today;
    const scheduled = getScheduledTasksInRange(plan, range?.from ?? plan.start_date, to);
    for (const { date, task } of scheduled) {
      const r = findRecord(records, task.id, date);
      if (date === today && (!r || r.status === "snoozed")) continue;
      scheduled_count++;
      if (r?.status === "completed") completed_count++;
      else if (r?.status === "partial") partial_count++;
      else if (r?.status === "skipped") {
        skipped_count++;
        const reason: SkipReason = r.skip_reason ?? "other";
        skip_reasons[reason] = (skip_reasons[reason] ?? 0) + 1;
      } else missed_tasks.push(`${date} · ${task.title}`);
    }
  }

  const painScores = scopedRecords.flatMap((r) => (r.pain_score !== undefined ? [r.pain_score] : []));
  const fatigue = [
    ...scopedRecords.flatMap((r) => (r.fatigue_score !== undefined ? [r.fatigue_score] : [])),
    ...dailyWellness.filter((d) => inRange(d.date)).map((d) => d.fatigue_score),
  ];

  return {
    scheduled_count,
    completed_count,
    partial_count,
    skipped_count,
    completion_rate: scheduled_count
      ? Math.round(((completed_count + partial_count * 0.5) / scheduled_count) * 100)
      : 0,
    missed_tasks,
    skip_reasons,
    pain_average: avg(painScores),
    pain_max: painScores.length ? Math.max(...painScores) : 0,
    fatigue_average: avg(fatigue),
  };
}

// ---------- 动作 / 组记录 ----------

export function formatExerciseTarget(ex: Pick<Exercise, "sets" | "reps" | "duration_sec" | "weight_kg">): string {
  const per = ex.duration_sec !== undefined ? formatDuration(ex.duration_sec) : `${ex.reps ?? 0}`;
  return `${ex.sets}×${per}${ex.weight_kg ? ` @${ex.weight_kg}kg` : ""}`;
}

export interface SetSummary {
  exercise_id: string;
  name: string;
  sets: number;
  reps?: number;
  duration_sec?: number;
  weight_kg?: number;
}

/** 把组记录按动作汇总，用于展示（取每个动作最后一组的数值） */
export function summarizeSets(sets: SetLog[]): SetSummary[] {
  const map = new Map<string, SetSummary>();
  for (const s of sets) {
    const key = s.exercise_id;
    const prev = map.get(key);
    map.set(key, {
      exercise_id: s.exercise_id,
      name: s.exercise_name,
      sets: (prev?.sets ?? 0) + 1,
      reps: s.reps,
      duration_sec: s.duration_sec,
      weight_kg: s.weight_kg,
    });
  }
  return [...map.values()];
}

/** 由汇总值生成每组记录（手动补录时使用） */
export function expandSets(items: SetSummary[], completedAt: string): SetLog[] {
  return items.flatMap((it) =>
    Array.from({ length: Math.max(0, it.sets) }, (_, i) => {
      const log: SetLog = {
        exercise_id: it.exercise_id,
        exercise_name: it.name,
        set_index: i + 1,
        completed_at: completedAt,
      };
      if (it.duration_sec !== undefined) log.duration_sec = it.duration_sec;
      else log.reps = it.reps ?? 0;
      if (it.weight_kg) log.weight_kg = it.weight_kg;
      return log;
    })
  );
}

/** 实际完成组数少于计划时视为 partial */
export function statusForSets(planned: Exercise[], sets: SetLog[]): "completed" | "partial" {
  const plannedSets = planned.reduce((n, e) => n + e.sets, 0);
  return plannedSets > 0 && sets.length < plannedSets ? "partial" : "completed";
}

// ---------- 版本 ----------

/**
 * 让新计划沿用上一版的任务 / 动作 id：
 * - 已存在于上一版的 id 保持不变
 * - 否则按任务标题（动作名称）匹配上一版，沿用其 id
 * 这样自然语言导入或 AI 未带 id 时，版本对比和历史统计仍然连续。
 */
export function reconcileIds(tasks: PlanTask[], prev: PlanVersion | undefined): PlanTask[] {
  if (!prev) return tasks;
  const prevById = new Map(prev.tasks.map((t) => [t.id, t]));
  const claimed = new Set(tasks.filter((t) => prevById.has(t.id)).map((t) => t.id));

  return tasks.map((task) => {
    let prevTask = prevById.get(task.id);
    if (!prevTask) {
      prevTask = prev.tasks.find((p) => !claimed.has(p.id) && p.title === task.title);
      if (prevTask) claimed.add(prevTask.id);
    }
    if (!prevTask) return task;

    const prevExercises = [...(prevTask.exercises ?? []), ...(prevTask.phases?.flatMap((p) => p.exercises) ?? [])];
    const matchEx = (ex: Exercise): Exercise => {
      const same = prevExercises.find((p) => p.name === ex.name);
      return same ? { ...ex, id: same.id } : ex;
    };
    return {
      ...task,
      id: prevTask.id,
      exercises: task.exercises?.map(matchEx),
      phases: task.phases?.map((p) => ({ ...p, exercises: p.exercises.map(matchEx) })),
    };
  });
}

export function createPlanVersion(
  input: PlanInput,
  existingVersions: PlanVersion[],
  opts: { source: PlanSource; parent?: PlanVersion | null; analysis_id?: string; now?: Date }
): PlanVersion {
  const latest = existingVersions.reduce<PlanVersion | undefined>(
    (max, v) => (!max || v.version > max.version ? v : max),
    undefined
  );
  const parent = opts.parent ?? latest;
  const version: PlanVersion = {
    schema_version: SCHEMA_VERSION,
    id: newId(),
    version: (latest?.version ?? 0) + 1,
    plan_name: input.plan_name,
    created_at: (opts.now ?? new Date()).toISOString(),
    timezone: input.timezone ?? parent?.timezone ?? localTimeZone(),
    start_date: input.start_date,
    source: opts.source,
    tasks: reconcileIds(input.tasks, parent),
  };
  if (input.end_date) version.end_date = input.end_date;
  if (parent) version.parent_version_id = parent.id;
  if (opts.analysis_id) version.analysis_id = opts.analysis_id;
  if (input.change_note) version.change_note = input.change_note;
  if (input.ai_summary) version.ai_summary = input.ai_summary;
  return version;
}

export interface PlanDiff {
  added: { taskTitle: string; exercises: string[] }[];
  removed: { taskTitle: string; exercises: string[] }[];
  modified: { taskTitle: string; changes: string[] }[];
}

const WEEKDAY_LABEL = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function describeSchedule(s: PlanTask["schedule"]): string {
  const days = s.daily ? "每天" : (s.weekday ?? []).map((d) => WEEKDAY_LABEL[d]).join("、");
  return s.time ? `${days} ${s.time}` : days;
}

function diffExercises(a: Exercise[], b: Exercise[], prefix = ""): string[] {
  const changes: string[] = [];
  const byName = (xs: Exercise[]) => new Map(xs.map((e) => [e.name, e]));
  const mA = byName(a);
  const mB = byName(b);
  for (const [name, ex] of mB) {
    const prev = mA.get(name);
    if (!prev) changes.push(`${prefix}新增动作：${name} ${formatExerciseTarget(ex)}`);
    else if (formatExerciseTarget(prev) !== formatExerciseTarget(ex))
      changes.push(`${prefix}${name}：${formatExerciseTarget(prev)} → ${formatExerciseTarget(ex)}`);
  }
  for (const name of mA.keys()) if (!mB.has(name)) changes.push(`${prefix}删除动作：${name}`);
  return changes;
}

export function comparePlanVersions(a: PlanVersion, b: PlanVersion): PlanDiff {
  const aById = new Map(a.tasks.map((t) => [t.id, t]));
  const matched = new Set<string>();
  const added: PlanDiff["added"] = [];
  const modified: PlanDiff["modified"] = [];

  for (const taskB of b.tasks) {
    const taskA = aById.get(taskB.id) ?? a.tasks.find((t) => !matched.has(t.id) && t.title === taskB.title);
    if (!taskA) {
      added.push({ taskTitle: taskB.title, exercises: taskB.exercises?.map((e) => e.name) ?? [] });
      continue;
    }
    matched.add(taskA.id);

    const changes: string[] = [];
    if (taskA.title !== taskB.title) changes.push(`名称：${taskA.title} → ${taskB.title}`);
    if (describeSchedule(taskA.schedule) !== describeSchedule(taskB.schedule))
      changes.push(`日程：${describeSchedule(taskA.schedule)} → ${describeSchedule(taskB.schedule)}`);
    changes.push(...diffExercises(taskA.exercises ?? [], taskB.exercises ?? []));
    if (JSON.stringify(stripIds(taskA.phases)) !== JSON.stringify(stripIds(taskB.phases)))
      changes.push("分阶段安排调整");
    if (changes.length > 0) modified.push({ taskTitle: taskB.title, changes });
  }

  const removed = a.tasks
    .filter((t) => !matched.has(t.id))
    .map((t) => ({ taskTitle: t.title, exercises: t.exercises?.map((e) => e.name) ?? [] }));

  return { added, removed, modified };
}

function stripIds(phases: PlanTask["phases"]) {
  return phases?.map((p) => ({ ...p, exercises: p.exercises.map(({ id: _id, ...rest }) => rest) }));
}
