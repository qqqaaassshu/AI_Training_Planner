import { describe, expect, it } from "vitest";
import samplePlan from "../../fixtures/samplePlan.json";
import type { ExecutionRecord } from "../../types";
import { validatePlanInput } from "../validate";
import { createPlanVersion } from "../plan";
import { buildAnalysisInput, buildManualPrompt, createAnalysis, defaultRange, detectAlerts, parseAnalysisReply } from "../analysis";

const r = validatePlanInput(samplePlan);
if (!r.ok) throw new Error();
const plan = createPlanVersion(r.value, [], { source: "json_import" });

let seq = 0;
const rec = (date: string, status: ExecutionRecord["status"], extra: Partial<ExecutionRecord> = {}): ExecutionRecord => ({
  id: `r${seq++}`,
  task_id: "t1",
  plan_version_id: plan.id,
  date,
  status,
  notes: "",
  source: "phone",
  updated_at: "",
  ...extra,
});

describe("detectAlerts", () => {
  it("无数据时无提醒", () => {
    expect(detectAlerts([], [], "2026-06-20")).toEqual([]);
  });

  it("疼痛 ≥7 为 risk", () => {
    const f = detectAlerts([rec("2026-06-19", "completed", { pain_score: 8 })], [], "2026-06-20");
    expect(f).toHaveLength(1);
    expect(f[0].level).toBe("risk");
  });

  it("连续两次疼痛 ≥5 为 warn；超过 7 天的不计", () => {
    const records = [rec("2026-06-17", "completed", { pain_score: 5 }), rec("2026-06-19", "completed", { pain_score: 6 })];
    expect(detectAlerts(records, [], "2026-06-20").map((f) => f.level)).toEqual(["warn"]);
    expect(detectAlerts([rec("2026-06-01", "completed", { pain_score: 9 })], [], "2026-06-20")).toEqual([]);
  });

  it("频繁跳过与持续疲劳", () => {
    const skips = [1, 2, 3].map((d) => rec(`2026-06-1${d}`, "skipped", { skip_reason: "pain" }));
    const wellness = ["2026-06-12", "2026-06-13"].map((date) => ({ date, fatigue_score: 8, updated_at: "" }));
    const texts = detectAlerts(skips, wellness, "2026-06-13").map((f) => f.text);
    expect(texts.some((t) => t.includes("因疼痛跳过"))).toBe(true);
    expect(texts.some((t) => t.includes("跳过 3 次"))).toBe(true);
    expect(texts.some((t) => t.includes("疲劳"))).toBe(true);
  });
});

describe("buildAnalysisInput", () => {
  const records = [
    rec("2026-06-15", "completed", { notes: "膝盖有点酸", pain_score: 3 }),
    rec("2026-06-01", "completed"),
  ];

  it("默认不包含备注，只含区间内记录", () => {
    const input = buildAnalysisInput({ kind: "weekly_review", plan, versions: [plan], records, dailyWellness: [], today: "2026-06-16" });
    expect(input.range).toEqual({ from: "2026-06-10", to: "2026-06-16" });
    expect(input.records).toHaveLength(1);
    expect(input.records[0].notes).toBeUndefined();
    expect(input.records[0].task_title).toBe("身体维护训练A");
    expect(input.plan?.current_week).toBe(1);
  });

  it("用户同意后包含备注", () => {
    const input = buildAnalysisInput({ kind: "weekly_review", plan, versions: [plan], records, dailyWellness: [], today: "2026-06-16", includeNotes: true });
    expect(input.records[0].notes).toBe("膝盖有点酸");
  });

  it("计划调整默认看最近 4 周（不早于计划开始）", () => {
    expect(defaultRange("plan_adjustment", plan, "2026-06-20")).toEqual({ from: "2026-06-15", to: "2026-06-20" });
    expect(defaultRange("plan_adjustment", plan, "2026-08-01")).toEqual({ from: "2026-07-05", to: "2026-08-01" });
  });

  it("手动提示词包含输出格式说明与数据", () => {
    const text = buildManualPrompt(buildAnalysisInput({ kind: "plan_adjustment", plan, versions: [plan], records, dailyWellness: [], today: "2026-06-16" }));
    expect(text).toContain("AIAnalysisOutput");
    expect(text).toContain("suggested_plan");
    expect(text).toContain("身体维护训练A");
  });
});

describe("parseAnalysisReply", () => {
  it("解析带说明文字的回复并生成分析记录", () => {
    const reply = `好的，以下是分析：\n\`\`\`json\n${JSON.stringify({
      summary: "完成率良好",
      findings: [{ level: "info", text: "保持" }],
      suggested_plan: { ...samplePlan, change_note: "深蹲加到 4 组" },
    })}\n\`\`\``;
    const parsed = parseAnalysisReply(reply);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const a = createAnalysis(parsed.value, {
      kind: "plan_adjustment",
      channel: "manual_import",
      plan_version_id: plan.id,
      range: { from: "2026-06-15", to: "2026-06-16" },
    });
    expect(a.status).toBe("new");
    expect(a.suggested_plan?.change_note).toBe("深蹲加到 4 组");
  });

  it("格式错误时返回错误列表", () => {
    expect(parseAnalysisReply("抱歉我无法回答").ok).toBe(false);
    const bad = parseAnalysisReply('{"summary": ""}');
    expect(bad.ok).toBe(false);
  });
});

import { buildPlanHistory, buildPrompt, PROMPT_VERSION } from "../analysis";

describe("历史与档案进入提示词", () => {
  const v1 = { ...plan, created_at: "2026-06-14T12:00:00" };
  const v2Input = validatePlanInput({
    ...samplePlan,
    tasks: samplePlan.tasks.map((t) =>
      t.id === "t1" ? { ...t, exercises: t.exercises!.map((e) => (e.id === "e1" ? { ...e, sets: 4 } : e)) } : t
    ),
    change_note: "深蹲加到 4 组",
  });
  if (!v2Input.ok) throw new Error();
  const v2 = { ...createPlanVersion(v2Input.value, [v1], { source: "ai_analysis", parent: v1 }), created_at: "2026-06-22T12:00:00" };

  it("plan_history：每个版本的变化与使用期间效果", () => {
    const records = [
      rec("2026-06-15", "completed", { task_id: "t1" }),
      rec("2026-06-22", "completed", { task_id: "t1", pain_score: 6 }),
    ];
    const h = buildPlanHistory([v1, v2], records, [], "2026-06-24");
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ version: 1, active: { from: "2026-06-15", to: "2026-06-21" }, changes: [] });
    expect(h[1].version).toBe(2);
    expect(h[1].change_note).toBe("深蹲加到 4 组");
    expect(h[1].changes).toEqual(["身体维护训练A · 深蹲：3×10 → 4×10"]);
    expect(h[1].active).toEqual({ from: "2026-06-22", to: "2026-06-24" });
    expect(h[1].outcome.pain_max).toBe(6);
  });

  it("档案在系统提示词，补充说明与变更在用户消息；档案不重复放进数据", () => {
    const input = buildAnalysisInput({
      kind: "weekly_review",
      plan: v2,
      versions: [v1, v2],
      records: [],
      dailyWellness: [],
      today: "2026-06-24",
      profile: { injuries: "右手腕恢复中", available_time: "工作日晚上 20 分钟" },
      profileHistory: [{ at: "2026-06-20T08:00:00", field: "weight_kg", from: 72, to: 71 }],
      userNote: "下周出差",
    });
    const { system, user } = buildPrompt(input);
    expect(system).toContain("伤病与身体限制：右手腕恢复中");
    expect(system).toContain("可训练时间：工作日晚上 20 分钟");
    expect(system).toContain("plan_history");
    expect(user).toContain("本次补充说明（用户填写，优先考虑）：下周出差");
    expect(user).toContain('"to": "71kg"');
    expect(user).toContain('"plan_history"');
    expect(user).not.toContain("右手腕恢复中");
  });

  it("系统提示词只随档案变化（便于缓存）", () => {
    const base = { kind: "weekly_review" as const, plan: v2, versions: [v1, v2], dailyWellness: [], profile: { goals: "睡好" } };
    const a = buildPrompt(buildAnalysisInput({ ...base, records: [], today: "2026-06-24" }));
    const b = buildPrompt(buildAnalysisInput({ ...base, records: [rec("2026-06-23", "skipped")], today: "2026-06-25", userNote: "x" }));
    expect(a.system).toBe(b.system);
    expect(a.user).not.toBe(b.user);
  });

  it("分析记录带提示词版本与补充说明", () => {
    const a = createAnalysis({ summary: "s", findings: [] }, {
      kind: "weekly_review", channel: "api", plan_version_id: "p", range: { from: "a", to: "b" }, user_note: "下周出差",
    });
    expect(a.prompt_version).toBe(PROMPT_VERSION);
    expect(a.user_note).toBe("下周出差");
  });
});
