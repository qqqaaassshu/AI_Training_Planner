import { describe, expect, it } from "vitest";
import { diffProfile, formatProfileForPrompt, isProfileEmpty } from "../profile";

describe("profile", () => {
  it("diffProfile 只记录真正变化的字段，空白视为未填写", () => {
    const changes = diffProfile(
      { weight_kg: 72, injuries: "手腕恢复中", goals: "  " },
      { weight_kg: 70.5, injuries: "手腕恢复中", equipment: "弹力带", goals: "" },
      "2026-10-14T00:00:00Z"
    );
    expect(changes).toEqual([
      { at: "2026-10-14T00:00:00Z", field: "weight_kg", from: 72, to: 70.5 },
      { at: "2026-10-14T00:00:00Z", field: "equipment", to: "弹力带" },
    ]);
  });

  it("清空字段也记录", () => {
    expect(diffProfile({ injuries: "膝盖不适" }, {}, "t")).toEqual([{ at: "t", field: "injuries", from: "膝盖不适" }]);
  });

  it("提示词格式：省略未填项，枚举转中文", () => {
    const text = formatProfileForPrompt({ experience: "beginner", weight_kg: 70, injuries: "手腕恢复中" });
    expect(text).toBe("- 体重：70kg\n- 训练经验：入门（偶尔训练）\n- 伤病与身体限制：手腕恢复中");
    expect(formatProfileForPrompt({})).toContain("未填写档案");
    expect(isProfileEmpty({ goals: " " })).toBe(true);
  });
});
