/**
 * 导入数据校验与归一化。规则与 src/app/schema/*.schema.json 保持一致。
 *
 * 校验失败时返回全部错误（带字段路径），而不是悄悄丢弃数据。
 */
import type { AIAnalysisOutput, Exercise, Finding, PlanInput, PlanTask, TaskPhase } from "../types";
import { isDateStr } from "./date";
import { newId } from "./id";

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isPosInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;
const isNonNegInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isNonEmptyStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function optStr(o: Obj, key: string): string | undefined {
  return typeof o[key] === "string" && (o[key] as string).trim() ? (o[key] as string).trim() : undefined;
}

function checkExercise(raw: unknown, path: string, errors: string[]): Exercise | null {
  if (!isObj(raw)) {
    errors.push(`${path}：应为对象`);
    return null;
  }
  const start = errors.length;
  if (!isNonEmptyStr(raw.name)) errors.push(`${path}.name：缺少动作名称`);
  if (!isPosInt(raw.sets)) errors.push(`${path}.sets：应为 ≥1 的整数`);
  const hasReps = raw.reps !== undefined;
  const hasDur = raw.duration_sec !== undefined;
  if (!hasReps && !hasDur) errors.push(`${path}：reps 与 duration_sec 至少填一个`);
  if (hasReps && !isPosInt(raw.reps)) errors.push(`${path}.reps：应为 ≥1 的整数`);
  if (hasDur && !isPosInt(raw.duration_sec)) errors.push(`${path}.duration_sec：应为 ≥1 的整数（秒）`);
  if (raw.weight_kg !== undefined && !(typeof raw.weight_kg === "number" && raw.weight_kg >= 0))
    errors.push(`${path}.weight_kg：应为 ≥0 的数字`);
  if (raw.rest_sec !== undefined && !isNonNegInt(raw.rest_sec)) errors.push(`${path}.rest_sec：应为 ≥0 的整数（秒）`);
  if (errors.length > start) return null;

  const ex: Exercise = {
    id: optStr(raw, "id") ?? newId(),
    name: (raw.name as string).trim(),
    sets: raw.sets as number,
  };
  if (hasReps) ex.reps = raw.reps as number;
  if (hasDur) ex.duration_sec = raw.duration_sec as number;
  if (raw.weight_kg !== undefined) ex.weight_kg = raw.weight_kg as number;
  if (raw.rest_sec !== undefined) ex.rest_sec = raw.rest_sec as number;
  const cue = optStr(raw, "cue");
  if (cue) ex.cue = cue;
  return ex;
}

function checkExercises(raw: unknown, path: string, errors: string[]): Exercise[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    errors.push(`${path}：应为数组`);
    return undefined;
  }
  return raw.map((e, i) => checkExercise(e, `${path}[${i}]`, errors)).filter((e): e is Exercise => e !== null);
}

function checkTask(raw: unknown, path: string, errors: string[]): PlanTask | null {
  if (!isObj(raw)) {
    errors.push(`${path}：应为对象`);
    return null;
  }
  const start = errors.length;
  if (!isNonEmptyStr(raw.title)) errors.push(`${path}.title：缺少任务名称`);
  if (raw.type !== "workout" && raw.type !== "habit") errors.push(`${path}.type：应为 "workout" 或 "habit"`);

  const sched = raw.schedule;
  let schedule: PlanTask["schedule"] = {};
  if (!isObj(sched)) {
    errors.push(`${path}.schedule：缺少日程`);
  } else {
    const weekday = sched.weekday;
    const weekdayOk =
      Array.isArray(weekday) && weekday.length > 0 && weekday.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (weekday !== undefined && !weekdayOk) errors.push(`${path}.schedule.weekday：应为 0-6 的整数数组（0=周日）`);
    if (sched.daily !== true && !weekdayOk) errors.push(`${path}.schedule：需设置 daily: true 或 weekday`);
    if (sched.time !== undefined && !(typeof sched.time === "string" && TIME_RE.test(sched.time)))
      errors.push(`${path}.schedule.time：格式应为 HH:mm`);
    schedule = sched.daily === true ? { daily: true } : { weekday: weekdayOk ? [...new Set(weekday as number[])].sort() : [] };
    if (typeof sched.time === "string") schedule.time = sched.time;
  }

  const exercises = checkExercises(raw.exercises, `${path}.exercises`, errors);

  let phases: TaskPhase[] | undefined;
  if (raw.phases !== undefined) {
    if (!Array.isArray(raw.phases)) {
      errors.push(`${path}.phases：应为数组`);
    } else {
      phases = [];
      raw.phases.forEach((p, i) => {
        const pp = `${path}.phases[${i}]`;
        if (!isObj(p)) return errors.push(`${pp}：应为对象`);
        if (!isPosInt(p.week_from) || !isPosInt(p.week_to) || (p.week_to as number) < (p.week_from as number)) {
          return errors.push(`${pp}：week_from / week_to 应为 ≥1 的整数且 week_from ≤ week_to`);
        }
        const exs = checkExercises(p.exercises, `${pp}.exercises`, errors) ?? [];
        phases!.push({ week_from: p.week_from as number, week_to: p.week_to as number, exercises: exs });
      });
    }
  }

  if (errors.length > start) return null;
  const task: PlanTask = {
    id: optStr(raw, "id") ?? newId(),
    title: (raw.title as string).trim(),
    type: raw.type as PlanTask["type"],
    schedule,
    reminder: raw.reminder === undefined ? true : raw.reminder === true,
  };
  if (exercises && exercises.length > 0) task.exercises = exercises;
  if (phases && phases.length > 0) task.phases = phases;
  return task;
}

export function validatePlanInput(raw: unknown): ValidationResult<PlanInput> {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["计划应为 JSON 对象"] };

  if (!isNonEmptyStr(raw.plan_name)) errors.push("plan_name：缺少计划名称");
  if (!isDateStr(raw.start_date)) errors.push("start_date：应为有效日期 YYYY-MM-DD");
  if (raw.end_date !== undefined && !isDateStr(raw.end_date)) errors.push("end_date：应为有效日期 YYYY-MM-DD");
  if (isDateStr(raw.start_date) && isDateStr(raw.end_date) && raw.end_date < raw.start_date)
    errors.push("end_date：不能早于 start_date");

  let tasks: PlanTask[] = [];
  if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) {
    errors.push("tasks：至少需要一个任务");
  } else {
    tasks = raw.tasks.map((t, i) => checkTask(t, `tasks[${i}]`, errors)).filter((t): t is PlanTask => t !== null);
    const ids = tasks.map((t) => t.id);
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dup) errors.push(`tasks：任务 id "${dup}" 重复`);
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: PlanInput = {
    plan_name: (raw.plan_name as string).trim(),
    start_date: raw.start_date as string,
    tasks,
  };
  if (raw.end_date) value.end_date = raw.end_date as string;
  for (const key of ["ai_summary", "change_note", "timezone"] as const) {
    const v = optStr(raw, key);
    if (v) value[key] = v;
  }
  return { ok: true, value };
}

export function validateAIAnalysisOutput(raw: unknown): ValidationResult<AIAnalysisOutput> {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["分析结果应为 JSON 对象"] };
  if (!isNonEmptyStr(raw.summary)) errors.push("summary：缺少总结");

  const findings: Finding[] = [];
  if (!Array.isArray(raw.findings)) {
    errors.push("findings：应为数组");
  } else {
    raw.findings.forEach((f, i) => {
      if (!isObj(f) || !["info", "warn", "risk"].includes(f.level as string) || !isNonEmptyStr(f.text)) {
        errors.push(`findings[${i}]：需要 level（info/warn/risk）与 text`);
      } else {
        findings.push({ level: f.level as Finding["level"], text: (f.text as string).trim() });
      }
    });
  }

  let suggested_plan: PlanInput | undefined;
  if (raw.suggested_plan !== undefined && raw.suggested_plan !== null) {
    const r = validatePlanInput(raw.suggested_plan);
    if (r.ok) suggested_plan = r.value;
    else errors.push(...r.errors.map((e) => `suggested_plan.${e}`));
  }

  if (errors.length > 0) return { ok: false, errors };
  const value: AIAnalysisOutput = { summary: (raw.summary as string).trim(), findings };
  if (suggested_plan) value.suggested_plan = suggested_plan;
  return { ok: true, value };
}

/** 从 AI 回复文本中提取 JSON（兼容 ```json 代码块与前后说明文字） */
export function extractJSON(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(candidate.slice(first, last + 1));
    throw new Error("未找到有效的 JSON");
  }
}
