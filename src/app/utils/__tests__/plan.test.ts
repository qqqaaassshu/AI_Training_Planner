import { describe, expect, it } from "vitest";
import samplePlan from "../../fixtures/samplePlan.json";
import type { ExecutionRecord, PlanVersion } from "../../types";
import { validatePlanInput } from "../validate";
import { parseNaturalLanguagePlan } from "../nlImport";
import {
  buildExportSummary,
  comparePlanVersions,
  createPlanVersion,
  expandSets,
  formatExerciseTarget,
  getCurrentWeek,
  getExercisesForDate,
  getScheduledTasksInRange,
  getTasksOnDate,
  getTotalWeeks,
  statusForSets,
  summarizeSets,
} from "../plan";

function makePlan(): PlanVersion {
  const r = validatePlanInput(samplePlan);
  if (!r.ok) throw new Error(r.errors.join());
  return createPlanVersion(r.value, [], { source: "json_import", now: new Date("2026-06-01T00:00:00Z") });
}

let seq = 0;
function rec(task_id: string, date: string, status: ExecutionRecord["status"], extra: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: `r${seq++}`,
    task_id,
    plan_version_id: "p",
    date,
    status,
    notes: "",
    source: "phone",
    updated_at: `${date}T12:00:00Z`,
    ...extra,
  };
}

describe("日程与周数", () => {
  const plan = makePlan();

  it("总周数与当前周", () => {
    expect(getTotalWeeks(plan)).toBe(12);
    expect(getCurrentWeek(plan, "2026-06-15")).toBe(1);
    expect(getCurrentWeek(plan, "2026-06-22")).toBe(2);
    expect(getCurrentWeek(plan, "2026-12-01")).toBe(12);
  });

  it("计划开始前 / 结束后没有任务", () => {
    expect(getTasksOnDate(plan, "2026-06-14")).toEqual([]);
    expect(getTasksOnDate(plan, "2026-09-07")).toEqual([]);
    expect(getTasksOnDate(plan, "2026-06-15").map((t) => t.id)).toEqual(["t1", "t2", "t3"]); // 周一
    expect(getTasksOnDate(plan, "2026-06-16").map((t) => t.id)).toEqual(["t2", "t3"]); // 周二
  });

  it("按周渐进：第 5 周起使用 phase 动作", () => {
    const t1 = plan.tasks[0];
    expect(formatExerciseTarget(getExercisesForDate(plan, t1, "2026-07-10")[0])).toBe("3×10"); // 第 4 周
    expect(formatExerciseTarget(getExercisesForDate(plan, t1, "2026-07-13")[0])).toBe("4×10 @10kg"); // 第 5 周
    expect(formatExerciseTarget(getExercisesForDate(plan, t1, "2026-07-13")[2])).toBe("3×45秒");
  });

  it("排期范围截断到计划起止日期", () => {
    const s = getScheduledTasksInRange(plan, "2026-06-01", "2026-06-16");
    expect(s[0].date).toBe("2026-06-15");
    expect(s).toHaveLength(5);
  });
});

describe("buildExportSummary", () => {
  const plan = makePlan();

  it("今天还没做的任务不算遗漏，partial 计半", () => {
    // 6/15 周一：t1 t2 t3；6/16 周二（今天）：t2 t3
    const records = [
      rec("t1", "2026-06-15", "partial"),
      rec("t2", "2026-06-15", "completed", { pain_score: 2 }),
      rec("t3", "2026-06-15", "skipped", { skip_reason: "no_time" }),
      rec("t2", "2026-06-16", "completed", { pain_score: 6 }),
    ];
    const s = buildExportSummary(plan, records, [], "2026-06-16");
    expect(s.scheduled_count).toBe(4); // 昨天 3 + 今天已记录 1
    expect(s.completed_count).toBe(2);
    expect(s.partial_count).toBe(1);
    expect(s.skipped_count).toBe(1);
    expect(s.completion_rate).toBe(63); // (2 + 0.5) / 4
    expect(s.missed_tasks).toEqual([]);
    expect(s.skip_reasons).toEqual({ no_time: 1 });
    expect(s.pain_average).toBe(4);
    expect(s.pain_max).toBe(6);
  });

  it("过去没有记录的任务计为遗漏", () => {
    const s = buildExportSummary(plan, [], [], "2026-06-16");
    expect(s.scheduled_count).toBe(3);
    expect(s.missed_tasks).toEqual(["2026-06-15 · 身体维护训练A", "2026-06-15 · 散步20分钟", "2026-06-15 · 22:30准备睡觉"]);
    expect(s.completion_rate).toBe(0);
  });

  it("疲劳来自记录与每日评分，支持区间", () => {
    const s = buildExportSummary(
      plan,
      [rec("t1", "2026-06-15", "completed", { fatigue_score: 4 })],
      [
        { date: "2026-06-15", fatigue_score: 6, updated_at: "" },
        { date: "2026-06-01", fatigue_score: 10, updated_at: "" },
      ],
      "2026-06-16",
      { from: "2026-06-10", to: "2026-06-16" }
    );
    expect(s.fatigue_average).toBe(5);
  });
});

describe("组记录", () => {
  it("expandSets / summarizeSets 互逆", () => {
    const items = [
      { exercise_id: "e1", name: "深蹲", sets: 3, reps: 10, weight_kg: 10 },
      { exercise_id: "e3", name: "平板支撑", sets: 2, duration_sec: 30 },
    ];
    const sets = expandSets(items, "2026-06-15T08:00:00Z");
    expect(sets).toHaveLength(5);
    expect(sets[4]).toMatchObject({ exercise_id: "e3", set_index: 2, duration_sec: 30 });
    expect(summarizeSets(sets)).toEqual(items);
  });

  it("组数不足为 partial", () => {
    const plan = makePlan();
    const planned = plan.tasks[0].exercises!; // 共 9 组
    const sets = expandSets([{ exercise_id: "e1", name: "深蹲", sets: 3, reps: 10 }], "");
    expect(statusForSets(planned, sets)).toBe("partial");
    const all = expandSets(planned.map((e) => ({ exercise_id: e.id, name: e.name, sets: e.sets, reps: e.reps })), "");
    expect(statusForSets(planned, all)).toBe("completed");
  });
});

describe("版本", () => {
  it("版本号递增并记录父版本", () => {
    const v1 = makePlan();
    const r = validatePlanInput(samplePlan);
    if (!r.ok) throw new Error();
    const v2 = createPlanVersion(r.value, [v1], { source: "ai_analysis", analysis_id: "a1" });
    expect(v2.version).toBe(2);
    expect(v2.parent_version_id).toBe(v1.id);
    expect(v2.analysis_id).toBe("a1");
    expect(v2.schema_version).toBe("2.0");
  });

  it("自然语言重新导入时按标题沿用任务与动作 id，对比只显示真实变化", () => {
    const text = (squatReps: number) => `周二训练：\n深蹲3组${squatReps}次\n平板支撑3组30秒\n\n每日习惯：\n散步20分钟`;
    const v1 = createPlanVersion(parseNaturalLanguagePlan(text(10), "2026-06-01").plan, [], { source: "nl_import" });
    const v2 = createPlanVersion(parseNaturalLanguagePlan(text(12), "2026-06-01").plan, [v1], { source: "nl_import" });

    expect(v2.tasks.map((t) => t.id)).toEqual(v1.tasks.map((t) => t.id));
    expect(v2.tasks[0].exercises![0].id).toBe(v1.tasks[0].exercises![0].id);

    const diff = comparePlanVersions(v1, v2);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.modified).toEqual([{ taskTitle: "周二训练", changes: ["深蹲：3×10 → 3×12"] }]);
  });

  it("对比：新增 / 删除 / 日程变化", () => {
    const v1 = makePlan();
    const v2: PlanVersion = {
      ...v1,
      tasks: [
        { ...v1.tasks[0], schedule: { weekday: [1, 4] } },
        { id: "t9", title: "冥想", type: "habit", schedule: { daily: true }, reminder: true },
        v1.tasks[2],
      ],
    };
    const diff = comparePlanVersions(v1, v2);
    expect(diff.added.map((a) => a.taskTitle)).toEqual(["冥想"]);
    expect(diff.removed.map((a) => a.taskTitle)).toEqual(["散步20分钟"]);
    expect(diff.modified[0].changes).toEqual(["日程：周一、周三、周五 07:30 → 周一、周四"]);
  });
});
