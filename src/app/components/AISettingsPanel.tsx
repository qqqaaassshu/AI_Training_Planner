import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Eye, EyeOff, Loader2, Plus, Trash2, Zap } from "lucide-react";
import type { AIServiceConfig, AISettings } from "../types";
import { createServiceFromPreset, formatHeaders, getPreset, parseHeaders, PRESETS, serviceProblems } from "../utils/ai/presets";
import { testService } from "../utils/ai/providers";

const card = { background: "var(--card)", border: "1px solid var(--border)" } as const;
const fieldStyle = {
  background: "var(--input-background)",
  color: "var(--foreground)",
  border: "1px solid var(--border)",
  fontSize: 13,
} as const;
const MONO = "'DM Mono', monospace";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{label}</span>
      {children}
      {hint && <span className="block" style={{ fontSize: 11, color: "var(--muted-foreground)", opacity: 0.8 }}>{hint}</span>}
    </label>
  );
}

interface AISettingsPanelProps {
  settings: AISettings;
  apiKeys: Record<string, string>;
  onSettingsChange: (s: AISettings) => void;
  onApiKeysChange: (keys: Record<string, string>) => void;
}

export function AISettingsPanel({ settings, apiKeys, onSettingsChange, onApiKeysChange }: AISettingsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(settings.active_service_id);
  const [adding, setAdding] = useState(settings.services.length === 0);

  function addService(presetId: string) {
    const s = createServiceFromPreset(presetId, settings.services);
    onSettingsChange({
      ...settings,
      services: [...settings.services, s],
      active_service_id: settings.active_service_id ?? s.id,
    });
    setEditingId(s.id);
    setAdding(false);
  }

  function updateService(s: AIServiceConfig) {
    onSettingsChange({ ...settings, services: settings.services.map((x) => (x.id === s.id ? s : x)) });
  }

  function removeService(id: string) {
    const services = settings.services.filter((x) => x.id !== id);
    onSettingsChange({
      ...settings,
      services,
      active_service_id: settings.active_service_id === id ? services[0]?.id ?? null : settings.active_service_id,
    });
    const { [id]: _removed, ...rest } = apiKeys;
    onApiKeysChange(rest);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <div className="flex items-center justify-between">
          <h2 style={{ color: "var(--foreground)", fontSize: 16 }}>AI 服务</h2>
          <button
            onClick={() => setAdding((x) => !x)}
            className="rounded-xl px-3 py-1.5 flex items-center gap-1"
            style={{ background: "var(--secondary)", color: "var(--foreground)", fontSize: 12 }}
          >
            <Plus size={13} />
            添加服务
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          可以保存多个服务，选一个作为当前使用的。分析时只会调用当前服务。
        </p>

        {adding && (
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => addService(p.id)}
                className="rounded-xl px-3 py-2.5 text-left transition-opacity hover:opacity-80"
                style={{ background: "var(--secondary)", border: "1px solid var(--border)" }}
              >
                <span className="block" style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>{p.label}</span>
                <span className="block" style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
                  {p.format === "anthropic" ? "Anthropic 接口" : "OpenAI 兼容接口"}
                </span>
              </button>
            ))}
          </div>
        )}

        {settings.services.length === 0 && !adding && (
          <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>还没有配置服务</p>
        )}

        <div className="space-y-2">
          {settings.services.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              apiKey={apiKeys[s.id] ?? ""}
              active={settings.active_service_id === s.id}
              open={editingId === s.id}
              onToggle={() => setEditingId(editingId === s.id ? null : s.id)}
              onActivate={() => onSettingsChange({ ...settings, active_service_id: s.id })}
              onChange={updateService}
              onApiKeyChange={(key) => onApiKeysChange({ ...apiKeys, [s.id]: key })}
              onRemove={() => removeService(s.id)}
            />
          ))}
        </div>

        <p style={{ fontSize: 11, color: "#d9b26a", lineHeight: 1.6 }}>
          ⚠️ 原型阶段 Key 保存在本浏览器的 localStorage 中，仅用于演示。正式 App 会存入系统钥匙串，手表端不保存 Key。
        </p>
      </div>

      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <h2 style={{ color: "var(--foreground)", fontSize: 16 }}>隐私与自动化</h2>
        <label className="flex items-start gap-2" style={{ fontSize: 13, color: "var(--foreground)" }}>
          <input
            type="checkbox"
            className="mt-1"
            checked={settings.consent_given}
            onChange={(e) => onSettingsChange({ ...settings, consent_given: e.target.checked })}
          />
          <span>
            允许把训练数据发送给 AI 服务用于分析
            <span className="block" style={{ fontSize: 11, color: "var(--muted-foreground)" }}>关闭后仍可使用「复制提示词」手动分析</span>
          </span>
        </label>
        <label className="flex items-start gap-2" style={{ fontSize: 13, color: "var(--foreground)" }}>
          <input
            type="checkbox"
            className="mt-1"
            checked={settings.auto_weekly_review}
            onChange={(e) => onSettingsChange({ ...settings, auto_weekly_review: e.target.checked })}
          />
          <span>
            每周自动复盘
            <span className="block" style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
              打开 App 时，若距上次复盘已满 7 天则用当前服务自动分析一次（会产生 API 费用）
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

interface ServiceCardProps {
  service: AIServiceConfig;
  apiKey: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onActivate: () => void;
  onChange: (s: AIServiceConfig) => void;
  onApiKeyChange: (key: string) => void;
  onRemove: () => void;
}

type TestState = { status: "idle" } | { status: "running" } | { status: "ok"; ms: number; reply: string } | { status: "error"; message: string };

function ServiceCard({ service: s, apiKey, active, open, onToggle, onActivate, onChange, onApiKeyChange, onRemove }: ServiceCardProps) {
  const preset = getPreset(s.preset);
  const [showKey, setShowKey] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [headersText, setHeadersText] = useState(formatHeaders(s.extra_headers));
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const problems = serviceProblems(s);
  const missingKey = !apiKey && !preset.key_optional;
  const set = (patch: Partial<AIServiceConfig>) => {
    onChange({ ...s, ...patch });
    setTest({ status: "idle" });
  };

  async function runTest() {
    setTest({ status: "running" });
    try {
      const r = await testService(s, apiKey);
      setTest({ status: "ok", ...r });
    } catch (e) {
      setTest({ status: "error", message: e instanceof Error ? e.message : "测试失败" });
    }
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--secondary)", border: `1px solid ${active ? "rgba(255,107,53,0.5)" : "var(--border)"}` }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={onActivate}
          title="设为当前服务"
          className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
          style={{ border: `1.5px solid ${active ? "var(--primary)" : "#666"}` }}
        >
          {active && <span className="w-2 h-2 rounded-full" style={{ background: "var(--primary)" }} />}
        </button>
        <button onClick={onToggle} className="flex-1 min-w-0 text-left">
          <span className="block truncate" style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>
            {s.name}
            {active && (
              <span className="ml-2 rounded-full px-1.5 py-0.5" style={{ background: "rgba(255,107,53,0.15)", fontSize: 10, color: "var(--primary)" }}>
                当前
              </span>
            )}
          </span>
          <span className="block truncate" style={{ fontSize: 11, color: problems.length || missingKey ? "#f59e0b" : "var(--muted-foreground)", fontFamily: MONO }}>
            {problems[0] ?? (missingKey ? "未填写 API Key" : s.model)}
          </span>
        </button>
        <button onClick={onToggle}>
          {open ? <ChevronUp size={16} color="var(--muted-foreground)" /> : <ChevronDown size={16} color="var(--muted-foreground)" />}
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-3" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          {preset.hint && <p style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.6 }}>💡 {preset.hint}</p>}

          <Field label="名称">
            <input value={s.name} onChange={(e) => set({ name: e.target.value })} className="w-full rounded-xl px-3 py-2 outline-none" style={fieldStyle} />
          </Field>

          <Field label="接口格式">
            <select
              value={s.format}
              onChange={(e) => set({ format: e.target.value as AIServiceConfig["format"] })}
              className="w-full rounded-xl px-3 py-2 outline-none"
              style={fieldStyle}
            >
              <option value="anthropic">Anthropic Messages（/v1/messages）</option>
              <option value="openai">OpenAI 兼容（/chat/completions）</option>
            </select>
          </Field>

          <Field label="接口地址" hint={s.format === "openai" ? "填到 /v1 这一级，会自动拼接 /chat/completions" : "默认官方地址；使用代理时填代理地址"}>
            <input
              value={s.base_url ?? ""}
              onChange={(e) => set({ base_url: e.target.value.trim() || undefined })}
              placeholder={preset.base_url || "https://…/v1"}
              className="w-full rounded-xl px-3 py-2 outline-none"
              style={{ ...fieldStyle, fontFamily: MONO, fontSize: 12 }}
            />
          </Field>

          <Field label="模型" hint={preset.model_suggestions.length ? "可从下拉建议中选，也可直接填写" : "填写服务商提供的模型名称"}>
            <input
              value={s.model}
              onChange={(e) => set({ model: e.target.value.trim() })}
              list={`models-${s.id}`}
              placeholder="模型名称"
              className="w-full rounded-xl px-3 py-2 outline-none"
              style={{ ...fieldStyle, fontFamily: MONO, fontSize: 12 }}
            />
            <datalist id={`models-${s.id}`}>
              {preset.model_suggestions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>

          <Field label={preset.key_optional ? "API Key（可选）" : "API Key"}>
            <div className="flex gap-2">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => {
                  onApiKeyChange(e.target.value.trim());
                  setTest({ status: "idle" });
                }}
                placeholder={preset.key_placeholder ?? "API Key"}
                autoComplete="off"
                className="flex-1 min-w-0 rounded-xl px-3 py-2 outline-none"
                style={{ ...fieldStyle, fontFamily: MONO, fontSize: 12 }}
              />
              <button onClick={() => setShowKey((x) => !x)} className="rounded-xl px-2.5" style={{ background: "var(--muted)" }} title={showKey ? "隐藏" : "显示"}>
                {showKey ? <EyeOff size={14} color="var(--muted-foreground)" /> : <Eye size={14} color="var(--muted-foreground)" />}
              </button>
            </div>
          </Field>

          <button onClick={() => setAdvanced((x) => !x)} className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {advanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            高级设置
          </button>

          {advanced && (
            <div className="space-y-3 rounded-xl p-3" style={{ background: "var(--card)" }}>
              <div className="grid grid-cols-2 gap-2">
                <Field label="最大输出 tokens">
                  <input
                    type="number"
                    min={256}
                    value={s.max_tokens}
                    onChange={(e) => set({ max_tokens: Math.max(256, Number(e.target.value) || 16000) })}
                    className="w-full rounded-xl px-3 py-2 outline-none"
                    style={{ ...fieldStyle, fontFamily: MONO }}
                  />
                </Field>
                <Field label="超时（秒）">
                  <input
                    type="number"
                    min={10}
                    value={s.timeout_sec}
                    onChange={(e) => set({ timeout_sec: Math.max(10, Number(e.target.value) || 120) })}
                    className="w-full rounded-xl px-3 py-2 outline-none"
                    style={{ ...fieldStyle, fontFamily: MONO }}
                  />
                </Field>
              </div>

              {s.format === "openai" && (
                <>
                  <Field label="温度 temperature（留空用服务默认值）" hint="越低越稳定，生成计划建议 0.2–0.5">
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={s.temperature ?? ""}
                      onChange={(e) => set({ temperature: e.target.value === "" ? undefined : Math.min(2, Math.max(0, Number(e.target.value))) })}
                      className="w-full rounded-xl px-3 py-2 outline-none"
                      style={{ ...fieldStyle, fontFamily: MONO }}
                    />
                  </Field>
                  <label className="flex items-start gap-2" style={{ fontSize: 12, color: "var(--foreground)" }}>
                    <input type="checkbox" className="mt-0.5" checked={s.json_mode} onChange={(e) => set({ json_mode: e.target.checked })} />
                    <span>
                      要求 JSON 输出（response_format）
                      <span className="block" style={{ fontSize: 11, color: "var(--muted-foreground)" }}>服务不支持此参数而报错时请关闭</span>
                    </span>
                  </label>
                </>
              )}

              <Field label="额外请求头（每行一个，格式 Header: value）" hint="例如代理鉴权或组织 ID">
                <textarea
                  value={headersText}
                  onChange={(e) => {
                    setHeadersText(e.target.value);
                    const { headers, invalid } = parseHeaders(e.target.value);
                    setHeaderErrors(invalid);
                    if (invalid.length === 0) set({ extra_headers: Object.keys(headers).length ? headers : undefined });
                  }}
                  rows={2}
                  placeholder="X-Proxy-Token: abc123"
                  className="w-full rounded-xl px-3 py-2 resize-none outline-none"
                  style={{ ...fieldStyle, fontFamily: MONO, fontSize: 11 }}
                />
                {headerErrors.length > 0 && <span style={{ fontSize: 11, color: "#e88" }}>无法解析：{headerErrors.join("；")}</span>}
              </Field>
            </div>
          )}

          {test.status === "ok" && (
            <p className="flex items-center gap-1.5 rounded-xl px-3 py-2" style={{ background: "rgba(74,222,128,0.08)", fontSize: 12, color: "#4ade80" }}>
              <CheckCircle2 size={13} />
              连接成功 · {test.ms} ms · 回复「{test.reply}」
            </p>
          )}
          {test.status === "error" && (
            <p className="rounded-xl px-3 py-2" style={{ background: "#2a1a1a", fontSize: 12, color: "#e88", lineHeight: 1.6 }}>
              {test.message}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={runTest}
              disabled={test.status === "running" || problems.length > 0 || missingKey}
              className="flex-1 rounded-xl py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-40"
              style={{ background: "var(--muted)", color: "var(--foreground)", fontSize: 13 }}
            >
              {test.status === "running" ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              测试连接
            </button>
            {!active && (
              <button
                onClick={onActivate}
                className="flex-1 rounded-xl py-2.5"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontSize: 13, fontWeight: 600 }}
              >
                设为当前
              </button>
            )}
            <button
              onClick={() => (confirmDelete ? onRemove() : setConfirmDelete(true))}
              onBlur={() => setConfirmDelete(false)}
              className="rounded-xl px-3 flex items-center gap-1"
              style={{ background: confirmDelete ? "rgba(229,62,62,0.15)" : "var(--muted)", color: confirmDelete ? "#e53e3e" : "var(--muted-foreground)", fontSize: 12 }}
              title="删除服务"
            >
              <Trash2 size={14} />
              {confirmDelete && "确认删除"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
