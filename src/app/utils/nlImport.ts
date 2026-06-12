import type { PlanTask, Exercise } from "../types";
import { generateId } from "./plan";

const WEEKDAY_MAP: Record<string, number> = {
  周日: 0, 星期天: 0, 星期日: 0,
  周一: 1, 星期一: 1,
  周二: 2, 星期二: 2,
  周三: 3, 星期三: 3,
  周四: 4, 星期四: 4,
  周五: 5, 星期五: 5,
  周六: 6, 星期六: 6,
};

function parseExerciseLine(line: string): Exercise | null {
  const trimmed = line.trim().replace(/^[-•*]\s*/, "");
  if (!trimmed) return null;

  const patterns = [
    /^(.+?)(\d+)\s*组\s*(\d+)\s*次/,
    /^(.+?)(\d+)\s*[x×X]\s*(\d+)/,
    /^(.+?)\s+(\d+)\s*组\s*(\d+)/,
  ];

  for (const pattern of patterns) {
    const m = trimmed.match(pattern);
    if (m) {
      return {
        name: m[1].trim(),
        sets: parseInt(m[2], 10),
        reps: parseInt(m[3], 10),
      };
    }
  }
  return null;
}

function parseWeekdays(header: string): number[] | undefined {
  const days: number[] = [];
  for (const [label, num] of Object.entries(WEEKDAY_MAP)) {
    if (header.includes(label)) days.push(num);
  }
  return days.length > 0 ? days : undefined;
}

export function parseNaturalLanguagePlan(text: string): {
  plan_name: string;
  start_date: string;
  tasks: PlanTask[];
} {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const tasks: PlanTask[] = [];
  let currentTask: PlanTask | null = null;
  let planName = "自然语言导入计划";
  let startDate = new Date().toISOString().slice(0, 10);

  const nameMatch = text.match(/计划[：:]\s*(.+)/);
  if (nameMatch) planName = nameMatch[1].trim();

  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) startDate = dateMatch[1];

  for (const line of lines) {
    const isHeader =
      line.endsWith("：") ||
      line.endsWith(":") ||
      /训练$/.test(line) ||
      /^(周[一二三四五六日天]|每日)/.test(line);

    if (isHeader && !parseExerciseLine(line)) {
      if (currentTask) tasks.push(currentTask);

      const title = line.replace(/[：:]$/, "").trim();
      const weekdays = parseWeekdays(line);
      const isDaily = line.includes("每日") || line.includes("每天");

      currentTask = {
        id: generateId(),
        title,
        type: "workout",
        schedule: isDaily ? { daily: true } : weekdays ? { weekday: weekdays } : { daily: true },
        exercises: [],
        reminder: true,
      };
      continue;
    }

    const exercise = parseExerciseLine(line);
    if (exercise) {
      if (!currentTask) {
        currentTask = {
          id: generateId(),
          title: "训练",
          type: "workout",
          schedule: { daily: true },
          exercises: [],
          reminder: true,
        };
      }
      currentTask.exercises!.push(exercise);
    } else if (/散步|睡觉|水果|习惯/.test(line)) {
      if (currentTask) tasks.push(currentTask);
      currentTask = {
        id: generateId(),
        title: line.replace(/^[-•*]\s*/, ""),
        type: "habit",
        schedule: { daily: true },
        reminder: true,
      };
      tasks.push(currentTask);
      currentTask = null;
    }
  }

  if (currentTask) tasks.push(currentTask);

  if (tasks.length === 0) {
    throw new Error("未能识别训练内容，请检查格式（例如：深蹲3组10次）");
  }

  return { plan_name: planName, start_date: startDate, tasks };
}
