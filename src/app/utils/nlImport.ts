import type { Exercise, PlanInput, PlanTask } from "../types";
import { isDateStr, todayStr } from "./date";
import { newId } from "./id";

const WEEKDAY_MAP: [string, number][] = [
  ["星期一", 1], ["星期二", 2], ["星期三", 3], ["星期四", 4], ["星期五", 5], ["星期六", 6], ["星期日", 0], ["星期天", 0],
  ["周一", 1], ["周二", 2], ["周三", 3], ["周四", 4], ["周五", 5], ["周六", 6], ["周日", 0], ["周天", 0],
];

const NUM = String.raw`(\d+)`;
const UNIT_SEC = String.raw`(秒|s|sec|分钟|分|min)`;
const WEIGHT = String.raw`(?:\s*[@，,]?\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤|KG|Kg))?`;

/** 依次尝试的动作格式；name 之后的数字分组含义见 build */
const EXERCISE_PATTERNS: { re: RegExp; kind: "reps" | "duration" | "single-duration" }[] = [
  // 深蹲3组10次 / 深蹲 3组 x 10次 / 深蹲3组每组10个
  { re: new RegExp(String.raw`^(.+?)\s*${NUM}\s*组\s*(?:[x×X*]|每组)?\s*${NUM}\s*(?:次|个|下)${WEIGHT}`), kind: "reps" },
  // 平板支撑3组30秒 / 3组x1分钟
  { re: new RegExp(String.raw`^(.+?)\s*${NUM}\s*组\s*(?:[x×X*]|每组)?\s*${NUM}\s*${UNIT_SEC}${WEIGHT}`), kind: "duration" },
  // 平板支撑 3x30秒（必须先于次数格式，避免把 30 拆成 3 + 0）
  { re: new RegExp(String.raw`^(.+?)\s*${NUM}\s*[x×X*]\s*${NUM}\s*${UNIT_SEC}${WEIGHT}`), kind: "duration" },
  // 深蹲 3x10 / 深蹲3×10 20kg
  { re: new RegExp(String.raw`^(.+?)\s*${NUM}\s*[x×X*]\s*${NUM}(?![\d.])${WEIGHT}`), kind: "reps" },
  // 深蹲 3组 10
  { re: new RegExp(String.raw`^(.+?)\s+${NUM}\s*组\s*${NUM}\s*$`), kind: "reps" },
  // 平板支撑60秒（单组计时）
  { re: new RegExp(String.raw`^(.+?)\s*${NUM}\s*${UNIT_SEC}$`), kind: "single-duration" },
];

function toSeconds(n: number, unit: string): number {
  return /分|min/.test(unit) ? n * 60 : n;
}

export function parseExerciseLine(line: string): Exercise | null {
  const text = line.trim().replace(LIST_MARKER, "").trim();
  if (!text) return null;

  for (const { re, kind } of EXERCISE_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const name = m[1].trim().replace(/[：:，,]$/, "");
    if (!name) continue;
    const ex: Exercise = { id: newId(), name, sets: 1 };
    if (kind === "single-duration") {
      ex.duration_sec = toSeconds(parseInt(m[2], 10), m[3]);
    } else if (kind === "duration") {
      ex.sets = parseInt(m[2], 10);
      ex.duration_sec = toSeconds(parseInt(m[3], 10), m[4]);
      if (m[5]) ex.weight_kg = parseFloat(m[5]);
    } else {
      ex.sets = parseInt(m[2], 10);
      ex.reps = parseInt(m[3], 10);
      if (m[4]) ex.weight_kg = parseFloat(m[4]);
    }
    if (ex.sets < 1 || (ex.reps !== undefined && ex.reps < 1) || (ex.duration_sec !== undefined && ex.duration_sec < 1))
      return null;
    return ex;
  }
  return null;
}

function parseWeekdays(text: string): number[] | undefined {
  const days = new Set<number>();
  let rest = text;
  for (const [label, num] of WEEKDAY_MAP) {
    if (rest.includes(label)) {
      days.add(num);
      rest = rest.split(label).join("");
    }
  }
  // 周一三五 / 周二、四
  const compact = text.match(/(?:周|星期)([一二三四五六日天](?:[、,，/和及]?[一二三四五六日天])+)/);
  if (compact) {
    const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
    for (const ch of compact[1]) if (ch in map) days.add(map[ch]);
  }
  return days.size > 0 ? [...days].sort() : undefined;
}

function parseTime(text: string): string | undefined {
  const m = text.match(/\b([01]?\d|2[0-3])[:：]([0-5]\d)\b/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : undefined;
}

/** 列表符号：- • * · 或 “1.” “2、” “3)” */
const LIST_MARKER = /^(?:[-•*·]|\d+[.、)）])\s*/;

const HABIT_HINT = /散步|走路|睡|起床|水果|喝水|冥想|拉伸|习惯|步|蔬菜|早餐|午餐|晚餐|戒/;

function isHeader(line: string): boolean {
  if (/[：:]$/.test(line)) return true;
  if (/(训练|习惯|日常)$/.test(line)) return true;
  return /^(周[一二三四五六日天]|星期|每日|每天)/.test(line) && !parseExerciseLine(line);
}

export interface NLParseResult {
  plan: PlanInput;
  /** 未能识别的行，导入前展示给用户确认 */
  warnings: string[];
}

export function parseNaturalLanguagePlan(text: string, today = todayStr()): NLParseResult {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const tasks: PlanTask[] = [];
  const warnings: string[] = [];
  let planName = "自然语言导入计划";
  let startDate = today;
  let endDate: string | undefined;
  let current: { task: PlanTask; section: "workout" | "habit" } | null = null;
  let habitSection: { schedule: PlanTask["schedule"] } | null = null;

  const flush = () => {
    if (current && current.section === "workout") {
      if (current.task.exercises && current.task.exercises.length > 0) tasks.push(current.task);
      else warnings.push(`「${current.task.title}」下没有识别到动作，已忽略`);
    }
    current = null;
  };

  const makeHabit = (line: string, base?: PlanTask["schedule"]): PlanTask => {
    const title = line.replace(LIST_MARKER, "").trim();
    const time = parseTime(title);
    const weekday = parseWeekdays(title);
    const schedule: PlanTask["schedule"] = weekday ? { weekday } : base ? { ...base } : { daily: true };
    if (time) schedule.time = time;
    return { id: newId(), title, type: "habit", schedule, reminder: true };
  };

  lines.forEach((line, idx) => {
    // 元信息
    const nameMatch = line.match(/^(?:计划名称|计划)[：:]\s*(.+)$/);
    if (nameMatch) return void (planName = nameMatch[1].trim());
    if (/开始|起始/.test(line) && /\d{4}-\d{2}-\d{2}/.test(line)) {
      const d = line.match(/\d{4}-\d{2}-\d{2}/)![0];
      if (isDateStr(d)) startDate = d;
      return;
    }
    if (/结束|截止/.test(line) && /\d{4}-\d{2}-\d{2}/.test(line)) {
      const d = line.match(/\d{4}-\d{2}-\d{2}/)![0];
      if (isDateStr(d)) endDate = d;
      return;
    }
    if (idx === 0 && /计划$/.test(line) && !parseExerciseLine(line)) return void (planName = line);

    if (isHeader(line)) {
      flush();
      const header = line.replace(/[：:]$/, "").trim();
      const title = header.replace(/([01]?\d|2[0-3])[:：][0-5]\d/, "").replace(/\s+/g, " ").trim() || header;
      const weekday = parseWeekdays(title);
      const daily = /每日|每天/.test(title) || !weekday;
      const schedule: PlanTask["schedule"] = daily ? { daily: true } : { weekday };
      const time = parseTime(header);
      if (time) schedule.time = time;

      if (/习惯|日常/.test(title)) {
        habitSection = { schedule };
      } else {
        habitSection = null;
        current = {
          section: "workout",
          task: { id: newId(), title, type: "workout", schedule, exercises: [], reminder: true },
        };
      }
      return;
    }

    if (habitSection) {
      tasks.push(makeHabit(line, habitSection.schedule));
      return;
    }

    if (!current && HABIT_HINT.test(line)) {
      tasks.push(makeHabit(line));
      return;
    }

    const ex = parseExerciseLine(line);
    if (ex) {
      if (!current) {
        current = {
          section: "workout",
          task: { id: newId(), title: "训练", type: "workout", schedule: { daily: true }, exercises: [], reminder: true },
        };
      }
      current.task.exercises!.push(ex);
      return;
    }

    if (HABIT_HINT.test(line)) {
      tasks.push(makeHabit(line));
      return;
    }

    warnings.push(`未识别：${line}`);
  });
  flush();

  if (tasks.length === 0) {
    throw new Error("未能识别训练内容，请检查格式（例如：深蹲3组10次、平板支撑3组30秒）");
  }

  const plan: PlanInput = { plan_name: planName, start_date: startDate, tasks };
  if (endDate) plan.end_date = endDate;
  return { plan, warnings };
}
