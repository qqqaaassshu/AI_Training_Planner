import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceFromPreset, formatHeaders, parseHeaders, serviceProblems } from "../ai/presets";
import { callService, AIProviderError } from "../ai/providers";
import { parseAnalysisReply } from "../analysis";

describe("presets", () => {
  it("从预设创建服务，同类自动编号", () => {
    const a = createServiceFromPreset("deepseek");
    expect(a).toMatchObject({ name: "DeepSeek", format: "openai", model: "deepseek-chat", json_mode: true });
    const b = createServiceFromPreset("deepseek", [a]);
    expect(b.name).toBe("DeepSeek 2");
    expect(b.id).not.toBe(a.id);
  });

  it("配置检查", () => {
    const custom = createServiceFromPreset("custom");
    expect(serviceProblems(custom)).toEqual(["请填写接口地址", "请填写模型名称"]);
    expect(serviceProblems({ ...custom, base_url: "api.x.com", model: "m" })).toEqual(["接口地址需以 http:// 或 https:// 开头"]);
    expect(serviceProblems({ ...custom, base_url: "https://api.x.com/v1", model: "m" })).toEqual([]);
  });

  it("请求头解析与格式化", () => {
    const { headers, invalid } = parseHeaders("X-Token: abc\n\nX-Org:  1 \n坏行");
    expect(headers).toEqual({ "X-Token": "abc", "X-Org": "1" });
    expect(invalid).toEqual(["坏行"]);
    expect(formatHeaders(headers)).toBe("X-Token: abc\nX-Org: 1");
  });
});

describe("OpenAI 兼容调用", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    vi.useRealTimers();
  });

  const service = {
    ...createServiceFromPreset("custom"),
    base_url: "https://gw.example.com/v1/",
    model: "my-model",
    temperature: 0.3,
    json_mode: true,
    extra_headers: { "X-Proxy": "p1" },
  };
  const ok = (content: string, finish_reason = "stop") =>
    new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason }] }), { status: 200 });

  it("请求格式正确", async () => {
    fetchMock.mockResolvedValue(ok('{"a":1}'));
    const text = await callService(service, "k1", { system: "S", user: "U" });
    expect(text).toBe('{"a":1}');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gw.example.com/v1/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer k1", "X-Proxy": "p1", "Content-Type": "application/json" });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: "my-model",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "S" },
        { role: "user", content: "U" },
      ],
    });
  });

  it("没有 Key 时不发送 Authorization；未设温度时不发送", async () => {
    fetchMock.mockResolvedValue(ok("x"));
    await callService({ ...service, temperature: undefined, json_mode: false }, "", { system: "S", user: "U" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    const body = JSON.parse(init.body);
    expect(body.temperature).toBeUndefined();
    expect(body.response_format).toBeUndefined();
  });

  it.each([
    [401, "API Key 无效", false],
    [404, "接口地址或模型不存在", false],
    [429, "请求过于频繁", true],
    [503, "服务错误（503）", true],
  ])("HTTP %i → %s", async (status, msg, retryable) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "detail" } }), { status }));
    const err = await callService(service, "k", { system: "", user: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(AIProviderError);
    expect(err.message).toContain(msg);
    expect(err.message).toContain("detail");
    expect(err.retryable).toBe(retryable);
  });

  it("网络或跨域失败给出可操作的提示", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await callService(service, "k", { system: "", user: "" }).catch((e) => e);
    expect(err.message).toContain("跨域");
  });

  it("输出被截断时报错", async () => {
    fetchMock.mockResolvedValue(ok('{"a":', "length"));
    const err = await callService(service, "k", { system: "", user: "" }).catch((e) => e);
    expect(err.message).toContain("长度上限");
  });

  it("超时", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const p = callService({ ...service, timeout_sec: 10 }, "k", { system: "", user: "" }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await p).message).toContain("超过 10 秒");
  });
});

describe("推理模型回复", () => {
  it("忽略 <think> 中的内容", () => {
    const reply = '<think>先看看 {这里有括号} 的数据</think>\n{"summary":"好","findings":[]}';
    const r = parseAnalysisReply(reply);
    expect(r.ok).toBe(true);
  });
});
