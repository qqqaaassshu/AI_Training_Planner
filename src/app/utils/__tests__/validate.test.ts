import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import planSchema from "../../schema/plan.schema.json";
import analysisSchema from "../../schema/ai-analysis.schema.json";
import samplePlan from "../../fixtures/samplePlan.json";
import { extractJSON, validateAIAnalysisOutput, validatePlanInput } from "../validate";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
ajv.addSchema(planSchema);
const schemaValidatePlan = ajv.getSchema(planSchema.$id)!;
const schemaValidateAnalysis = ajv.compile(analysisSchema);

const badPlans: [string, unknown][] = [
  ["缺少 tasks", { plan_name: "x", start_date: "2026-06-15" }],
  ["空 tasks", { plan_name: "x", start_date: "2026-06-15", tasks: [] }],
  ["无效日期", { plan_name: "x", start_date: "2026-02-30", tasks: [{ title: "a", type: "habit", schedule: { daily: true } }] }],
  ["动作缺 reps 与 duration", { plan_name: "x", start_date: "2026-06-15", tasks: [{ title: "a", type: "workout", schedule: { daily: true }, exercises: [{ name: "深蹲", sets: 3 }] }] }],
  ["weekday 越界", { plan_name: "x", start_date: "2026-06-15", tasks: [{ title: "a", type: "habit", schedule: { weekday: [7] } }] }],
  ["schedule 为空", { plan_name: "x", start_date: "2026-06-15", tasks: [{ title: "a", type: "habit", schedule: {} }] }],
  ["type 错误", { plan_name: "x", start_date: "2026-06-15", tasks: [{ title: "a", type: "run", schedule: { daily: true } }] }],
];

describe("validatePlanInput", () => {
  it("示例计划同时通过 JSON Schema 与代码校验", () => {
    expect(schemaValidatePlan(samplePlan)).toBe(true);
    const r = validatePlanInput(samplePlan);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.tasks).toHaveLength(3);
      expect(r.value.tasks[0].phases?.[0].exercises[0].weight_kg).toBe(10);
    }
  });

  it.each(badPlans)("拒绝：%s（与 JSON Schema 结论一致）", (_name, plan) => {
    expect(schemaValidatePlan(plan)).toBe(false);
    const r = validatePlanInput(plan);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });

  it("错误信息带字段路径", () => {
    const r = validatePlanInput(badPlans[3][1]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("tasks[0].exercises[0]");
  });

  it("缺少 id 时自动生成，reminder 默认 true", () => {
    const r = validatePlanInput({
      plan_name: "x",
      start_date: "2026-06-15",
      tasks: [{ title: "a", type: "workout", schedule: { weekday: [3, 1, 1] }, exercises: [{ name: "深蹲", sets: 3, reps: 10 }] }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const t = r.value.tasks[0];
      expect(t.id).toBeTruthy();
      expect(t.exercises![0].id).toBeTruthy();
      expect(t.reminder).toBe(true);
      expect(t.schedule.weekday).toEqual([1, 3]);
    }
  });

  it("拒绝重复任务 id", () => {
    const r = validatePlanInput({
      plan_name: "x",
      start_date: "2026-06-15",
      tasks: [
        { id: "a", title: "a", type: "habit", schedule: { daily: true } },
        { id: "a", title: "b", type: "habit", schedule: { daily: true } },
      ],
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateAIAnalysisOutput", () => {
  const good = {
    summary: "本周完成度良好。",
    findings: [{ level: "warn", text: "周三疼痛 6 分" }],
    suggested_plan: samplePlan,
  };

  it("合法输出", () => {
    expect(schemaValidateAnalysis(good)).toBe(true);
    expect(validateAIAnalysisOutput(good).ok).toBe(true);
  });

  it("suggested_plan 的错误带前缀", () => {
    const r = validateAIAnalysisOutput({ ...good, suggested_plan: { plan_name: "x" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.every((e) => e.startsWith("suggested_plan."))).toBe(true);
  });

  it("level 非法", () => {
    const bad = { summary: "x", findings: [{ level: "danger", text: "x" }] };
    expect(schemaValidateAnalysis(bad)).toBe(false);
    expect(validateAIAnalysisOutput(bad).ok).toBe(false);
  });
});

describe("extractJSON", () => {
  it("从代码块与说明文字中提取", () => {
    expect(extractJSON('好的：\n```json\n{"a":1}\n```\n以上')).toEqual({ a: 1 });
    expect(extractJSON('结果如下 {"a":{"b":2}} 谢谢')).toEqual({ a: { b: 2 } });
    expect(() => extractJSON("没有 JSON")).toThrow();
  });
});
