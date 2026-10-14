import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isDateStr, todayStr, weekdayOf } from "../date";

describe("date", () => {
  it("todayStr 使用本地日期而非 UTC", () => {
    // 本地时间 2026-06-16 07:30（在 UTC+8 下对应 UTC 前一天 23:30）
    expect(todayStr(new Date(2026, 5, 16, 7, 30))).toBe("2026-06-16");
    expect(todayStr(new Date(2026, 5, 16, 0, 1))).toBe("2026-06-16");
    expect(todayStr(new Date(2026, 5, 16, 23, 59))).toBe("2026-06-16");
  });

  it("addDays 跨月跨年", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("daysBetween / weekdayOf", () => {
    expect(daysBetween("2026-06-15", "2026-06-22")).toBe(7);
    expect(weekdayOf("2026-06-15")).toBe(1); // 周一
    expect(weekdayOf("2026-06-21")).toBe(0); // 周日
  });

  it("isDateStr 拒绝无效日期", () => {
    expect(isDateStr("2026-02-30")).toBe(false);
    expect(isDateStr("2026-6-1")).toBe(false);
    expect(isDateStr("2026-06-01")).toBe(true);
  });
});
