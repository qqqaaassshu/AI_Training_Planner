import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadApiKeys, loadState } from "../storage";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe("AI 设置迁移", () => {
  beforeEach(() => vi.stubGlobal("localStorage", fakeStorage()));

  it("旧版单服务设置迁移为服务列表，旧 Key 归到该服务", () => {
    localStorage.setItem(
      "atp:state:v2",
      JSON.stringify({ aiSettings: { provider: "anthropic", model: "claude-sonnet-5-5", consent_given: true, auto_weekly_review: false } })
    );
    localStorage.setItem("atp:ai-api-key", "sk-old");
    const s = loadState().aiSettings;
    expect(s.services).toHaveLength(1);
    expect(s.services[0]).toMatchObject({ preset: "anthropic", format: "anthropic", model: "claude-sonnet-5-5" });
    expect(s.active_service_id).toBe(s.services[0].id);
    expect(s.consent_given).toBe(true);
    expect(loadApiKeys()).toEqual({ [s.services[0].id]: "sk-old" });
    expect(localStorage.getItem("atp:ai-api-key")).toBeNull();
  });

  it("新版设置原样读取；无数据时为空列表", () => {
    expect(loadState().aiSettings.services).toEqual([]);
    const services = [{ id: "x", name: "n", preset: "custom", format: "openai", model: "m", max_tokens: 100, json_mode: false, timeout_sec: 60 }];
    localStorage.setItem("atp:state:v2", JSON.stringify({ aiSettings: { services, active_service_id: "x", consent_given: false, auto_weekly_review: false } }));
    expect(loadState().aiSettings.services).toEqual(services);
  });
});
