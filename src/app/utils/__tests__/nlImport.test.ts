import { describe, expect, it } from "vitest";
import { parseExerciseLine, parseNaturalLanguagePlan } from "../nlImport";
import { validatePlanInput } from "../validate";

const strip = (e: ReturnType<typeof parseExerciseLine>) => {
  if (!e) return e;
  const { id: _id, ...rest } = e;
  return rest;
};

describe("parseExerciseLine", () => {
  it.each([
    ["深蹲3组10次", { name: "深蹲", sets: 3, reps: 10 }],
    ["Dead Bug 3组8次", { name: "Dead Bug", sets: 3, reps: 8 }],
    ["- 深蹲 3组 x 10次", { name: "深蹲", sets: 3, reps: 10 }],
    ["深蹲13组10次", { name: "深蹲", sets: 13, reps: 10 }],
    ["深蹲3组10次 20kg", { name: "深蹲", sets: 3, reps: 10, weight_kg: 20 }],
    ["深蹲 3x10", { name: "深蹲", sets: 3, reps: 10 }],
    ["深蹲3×10 @12.5kg", { name: "深蹲", sets: 3, reps: 10, weight_kg: 12.5 }],
    ["平板支撑3组30秒", { name: "平板支撑", sets: 3, duration_sec: 30 }],
    ["平板支撑 3x30秒", { name: "平板支撑", sets: 3, duration_sec: 30 }],
    ["靠墙静蹲3组1分钟", { name: "靠墙静蹲", sets: 3, duration_sec: 60 }],
    ["平板支撑60秒", { name: "平板支撑", sets: 1, duration_sec: 60 }],
    ["深蹲 3组 10", { name: "深蹲", sets: 3, reps: 10 }],
  ])("%s", (line, expected) => {
    expect(strip(parseExerciseLine(line))).toEqual(expected);
  });

  it.each(["12周恢复计划", "周二训练：", "", "深蹲0组10次"])("不是动作：%s", (line) => {
    expect(parseExerciseLine(line)).toBeNull();
  });
});

const SAMPLE_NL = `12周恢复计划
开始日期：2026-06-15

周二训练：
深蹲3组10次
臀桥3组12次
Dead Bug 3组8次

周四训练：
俯卧撑3组8次
平板支撑3组30秒

每日习惯：
散步20分钟
22:30准备睡觉`;

describe("parseNaturalLanguagePlan", () => {
  it("解析示例文本，平板支撑不再丢失", () => {
    const { plan, warnings } = parseNaturalLanguagePlan(SAMPLE_NL, "2026-06-01");
    expect(warnings).toEqual([]);
    expect(plan.plan_name).toBe("12周恢复计划");
    expect(plan.start_date).toBe("2026-06-15");
    expect(plan.tasks.map((t) => t.title)).toEqual(["周二训练", "周四训练", "散步20分钟", "22:30准备睡觉"]);
    expect(plan.tasks[0].schedule).toEqual({ weekday: [2] });
    expect(plan.tasks[1].exercises!.map((e) => e.name)).toEqual(["俯卧撑", "平板支撑"]);
    expect(plan.tasks[1].exercises![1].duration_sec).toBe(30);
    expect(plan.tasks[3]).toMatchObject({ type: "habit", schedule: { daily: true, time: "22:30" } });
    expect(validatePlanInput(plan).ok).toBe(true);
  });

  it("周一三五 与 时间", () => {
    const { plan } = parseNaturalLanguagePlan("周一三五 07:30 力量训练：\n深蹲3组10次", "2026-06-01");
    expect(plan.tasks[0].schedule).toEqual({ weekday: [1, 3, 5], time: "07:30" });
    expect(plan.tasks[0].title).toBe("周一三五 力量训练");
  });

  it("未识别的行进入 warnings 而不是被悄悄丢弃", () => {
    const { plan, warnings } = parseNaturalLanguagePlan("周二训练：\n深蹲3组10次\n弹力带激活一下", "2026-06-01");
    expect(plan.tasks[0].exercises).toHaveLength(1);
    expect(warnings).toEqual(["未识别：弹力带激活一下"]);
  });

  it("没有任何内容时报错", () => {
    expect(() => parseNaturalLanguagePlan("你好", "2026-06-01")).toThrow();
  });

  it("未指定开始日期时用今天", () => {
    expect(parseNaturalLanguagePlan("深蹲3组10次", "2026-06-01").plan.start_date).toBe("2026-06-01");
  });
});
