import type { PlanVersion, PlanTask, ExecutionRecord, DailyWellness, ExportSummary } from "../types";

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isTaskOnDate(task: PlanTask, dateStr: string): boolean {
  if (task.schedule.daily) return true;
  if (task.schedule.weekday) {
    const day = new Date(dateStr + "T12:00:00").getDay();
    return task.schedule.weekday.includes(day);
  }
  return false;
}

export function isTaskToday(task: PlanTask, today = new Date().toISOString().slice(0, 10)): boolean {
  return isTaskOnDate(task, today);
}

export function getTotalWeeks(plan: PlanVersion): number {
  if (!plan.end_date) return 12;
  const start = new Date(plan.start_date + "T12:00:00");
  const end = new Date(plan.end_date + "T12:00:00");
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  return Math.max(1, Math.ceil(days / 7));
}

export function getCurrentWeek(plan: PlanVersion, today = new Date().toISOString().slice(0, 10)): number {
  const start = new Date(plan.start_date + "T12:00:00");
  const now = new Date(today + "T12:00:00");
  if (now < start) return 1;
  const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return Math.min(getTotalWeeks(plan), Math.floor(days / 7) + 1);
}

export function getScheduledTasksInRange(
  plan: PlanVersion,
  fromDate: string,
  toDate: string
): { date: string; task: PlanTask }[] {
  const result: { date: string; task: PlanTask }[] = [];
  const start = new Date(fromDate + "T12:00:00");
  const end = new Date(toDate + "T12:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    for (const task of plan.tasks) {
      if (isTaskOnDate(task, dateStr)) {
        result.push({ date: dateStr, task });
      }
    }
  }
  return result;
}

export function computePlanCompletionRate(
  plan: PlanVersion,
  records: ExecutionRecord[],
  today = new Date().toISOString().slice(0, 10)
): number {
  const scheduled = getScheduledTasksInRange(plan, plan.start_date, today);
  if (scheduled.length === 0) return 0;
  const completed = scheduled.filter(({ date, task }) =>
    records.some((r) => r.task_id === task.id && r.date === date && r.status === "completed")
  ).length;
  return Math.round((completed / scheduled.length) * 100);
}

export function buildExportSummary(
  plan: PlanVersion | null,
  records: ExecutionRecord[],
  dailyWellness: DailyWellness[],
  today = new Date().toISOString().slice(0, 10)
): ExportSummary {
  const painScores = records
    .filter((r) => r.pain_score !== undefined)
    .map((r) => r.pain_score!);
  const fatigueFromRecords = records
    .filter((r) => r.fatigue_score !== undefined)
    .map((r) => r.fatigue_score!);
  const fatigueFromDaily = dailyWellness.map((d) => d.fatigue_score);
  const allFatigue = [...fatigueFromRecords, ...fatigueFromDaily];

  let missed_tasks: string[] = [];
  let completion_rate = 0;

  if (plan) {
    const scheduled = getScheduledTasksInRange(plan, plan.start_date, today);
    const missed = scheduled.filter(
      ({ date, task }) =>
        !records.some((r) => r.task_id === task.id && r.date === date && r.status === "completed")
    );
    missed_tasks = missed.map(({ date, task }) => `${date} · ${task.title}`);
    completion_rate = scheduled.length
      ? Math.round(
          ((scheduled.length - missed.length) / scheduled.length) * 100
        )
      : 0;
  } else {
    const completed = records.filter((r) => r.status === "completed").length;
    completion_rate = records.length ? Math.round((completed / records.length) * 100) : 0;
  }

  return {
    completion_rate,
    missed_tasks,
    pain_average: painScores.length
      ? Math.round((painScores.reduce((a, b) => a + b, 0) / painScores.length) * 10) / 10
      : 0,
    fatigue_average: allFatigue.length
      ? Math.round((allFatigue.reduce((a, b) => a + b, 0) / allFatigue.length) * 10) / 10
      : 0,
  };
}

export function createPlanVersion(
  data: Partial<PlanVersion> & Pick<PlanVersion, "plan_name" | "start_date" | "tasks">,
  existingVersions: PlanVersion[]
): PlanVersion {
  const latestVersion = existingVersions.reduce((max, v) => Math.max(max, v.version), 0);
  const parent = existingVersions.find((v) => v.version === latestVersion);
  return {
    id: generateId(),
    version: latestVersion + 1,
    plan_name: data.plan_name,
    created_at: new Date().toISOString(),
    ai_summary: data.ai_summary,
    start_date: data.start_date,
    end_date: data.end_date,
    parent_version_id: parent?.id,
    tasks: data.tasks,
  };
}

export function normalizeImportedPlan(
  data: Record<string, unknown>,
  existingVersions: PlanVersion[]
): PlanVersion {
  if (data.id && data.version && data.created_at) {
    return data as unknown as PlanVersion;
  }
  return createPlanVersion(
    {
      plan_name: String(data.plan_name),
      start_date: String(data.start_date),
      end_date: data.end_date ? String(data.end_date) : undefined,
      ai_summary: data.ai_summary ? String(data.ai_summary) : undefined,
      tasks: data.tasks as PlanVersion["tasks"],
    },
    existingVersions
  );
}

export interface PlanDiff {
  added: { taskTitle: string; exercises: string[] }[];
  removed: { taskTitle: string; exercises: string[] }[];
  modified: { taskTitle: string; changes: string[] }[];
}

export function comparePlanVersions(a: PlanVersion, b: PlanVersion): PlanDiff {
  const aTasks = new Map(a.tasks.map((t) => [t.id, t]));
  const bTasks = new Map(b.tasks.map((t) => [t.id, t]));

  const added: PlanDiff["added"] = [];
  const removed: PlanDiff["removed"] = [];
  const modified: PlanDiff["modified"] = [];

  for (const [id, task] of bTasks) {
    if (!aTasks.has(id)) {
      added.push({
        taskTitle: task.title,
        exercises: task.exercises?.map((e) => e.name) ?? [],
      });
    }
  }

  for (const [id, task] of aTasks) {
    if (!bTasks.has(id)) {
      removed.push({
        taskTitle: task.title,
        exercises: task.exercises?.map((e) => e.name) ?? [],
      });
    }
  }

  for (const [id, taskA] of aTasks) {
    const taskB = bTasks.get(id);
    if (!taskB) continue;
    const changes: string[] = [];

    const schedA = JSON.stringify(taskA.schedule);
    const schedB = JSON.stringify(taskB.schedule);
    if (schedA !== schedB) changes.push("训练频率/日程调整");

    const exA = taskA.exercises ?? [];
    const exB = taskB.exercises ?? [];
    const namesA = new Set(exA.map((e) => e.name));
    const namesB = new Set(exB.map((e) => e.name));

    for (const name of namesB) {
      if (!namesA.has(name)) changes.push(`新增动作：${name}`);
    }
    for (const name of namesA) {
      if (!namesB.has(name)) changes.push(`删除动作：${name}`);
    }
    for (const ex of exB) {
      const prev = exA.find((e) => e.name === ex.name);
      if (prev && (prev.sets !== ex.sets || prev.reps !== ex.reps)) {
        changes.push(`${ex.name}：${prev.sets}×${prev.reps} → ${ex.sets}×${ex.reps}`);
      }
    }

    if (changes.length > 0) {
      modified.push({ taskTitle: taskB.title, changes });
    }
  }

  return { added, removed, modified };
}
