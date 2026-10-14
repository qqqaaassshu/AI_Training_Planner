import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, KeyRound, Loader2, Sparkles, Square } from "lucide-react";
import type { AIAnalysis, AISettings, AnalysisKind, DailyWellness, ExecutionRecord, PlanVersion } from "../types";
import {
  ANALYSIS_KIND_LABEL,
  buildAnalysisInput,
  buildManualPrompt,
  createAnalysis,
  defaultRange,
  detectAlerts,
  parseAnalysisReply,
} from "../utils/analysis";
import { getProvider, PROVIDERS } from "../utils/ai/providers";
import { AnalysisFormatError, runApiAnalysis } from "../utils/ai/run";
import { AnalysisCard, FindingList } from "./AnalysisCard";
import { ExportView } from "./ExportView";

type Section = "analyze" | "export" | "settings";

interface AIViewProps {
  plan: PlanVersion | null;
  versions: PlanVersion[];
  records: ExecutionRecord[];
  dailyWellness: DailyWellness[];
  today: string;
  analyses: AIAnalysis[];
  settings: AISettings;
  apiKey: string;
  onSettingsChange: (s: AISettings) => void;
  onApiKeyChange: (key: string) => void;
  onAddAnalysis: (a: AIAnalysis) => void;
  onAcceptAnalysis: (a: AIAnalysis) => void;
  onRejectAnalysis: (a: AIAnalysis) => void;
}

const card = { background: "var(--card)", border: "1px solid var(--border)" } as const;
const fieldStyle = {
  background: "var(--input-background)",
  color: "var(--foreground)",
  border: "1px solid var(--border)",
  fontSize: 13,
} as const;

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-2xl p-1 gap-1" style={{ background: "var(--secondary)" }}>
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="flex-1 rounded-xl py-2 transition-all"
          style={{
            background: value === id ? "var(--primary)" : "transparent",
            color: value === id ? "var(--primary-foreground)" : "var(--muted-foreground)",
            fontSize: 12,
            fontWeight: value === id ? 600 : 400,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ErrorBox({ errors }: { errors: string[] }) {
  return (
    <div className="rounded-xl px-3 py-2 space-y-1" style={{ background: "#2a1a1a", border: "1px solid rgba(229,62,62,0.3)" }}>
      {errors.slice(0, 6).map((e) => (
        <p key={e} className="flex items-start gap-1.5" style={{ fontSize: 11, color: "#e88" }}>
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          {e}
        </p>
      ))}
    </div>
  );
}

export function AIView(props: AIViewProps) {
  const [section, setSection] = useState<Section>("analyze");
  return (
    <div className="space-y-4">
      <Segmented<Section>
        value={section}
        onChange={setSection}
        options={[
          ["analyze", "AI 分析"],
          ["export", "导出"],
          ["settings", "设置"],
        ]}
      />
      {section === "analyze" && <AnalyzePanel {...props} onOpenSettings={() => setSection("settings")} />}
      {section === "export" && (
        <ExportView plan={props.plan} versions={props.versions} records={props.records} dailyWellness={props.dailyWellness} today={props.today} />
      )}
      {section === "settings" && <SettingsPanel {...props} />}
    </div>
  );
}

function AnalyzePanel({
  plan,
  versions,
  records,
  dailyWellness,
  today,
  analyses,
  settings,
  apiKey,
  onSettingsChange,
  onAddAnalysis,
  onAcceptAnalysis,
  onRejectAnalysis,
  onOpenSettings,
}: AIViewProps & { onOpenSettings: () => void }) {
  const [kind, setKind] = useState<AnalysisKind>("weekly_review");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const provider = getProvider(settings.provider);
  const apiReady = !!provider && !!apiKey;
  const alerts = detectAlerts(records, dailyWellness, today);
  const range = defaultRange(kind, plan, today);
  const newest = [...analyses].sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (!plan) {
    return (
      <div className="rounded-2xl p-6 text-center" style={card}>
        <p style={{ color: "var(--muted-foreground)", fontSize: 13 }}>先导入一个训练计划，才能进行分析</p>
      </div>
    );
  }

  const input = () => buildAnalysisInput({ kind, plan, versions, records, dailyWellness, today, range, includeNotes });

  async function runApi() {
    if (!plan) return;
    setErrors([]);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      onAddAnalysis(await runApiAnalysis({ input: input(), planVersionId: plan.id, settings, apiKey, signal: controller.signal }));
    } catch (e) {
      if (controller.signal.aborted) setErrors(["已取消"]);
      else if (e instanceof AnalysisFormatError) setErrors(["AI 返回的格式不符合要求，可重试：", ...e.errors]);
      else setErrors([e instanceof Error ? e.message : "调用失败"]);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function copyPrompt() {
    navigator.clipboard.writeText(buildManualPrompt(input()));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function importReply() {
    if (!plan) return;
    setErrors([]);
    const parsed = parseAnalysisReply(pasted);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    onAddAnalysis(createAnalysis(parsed.value, { kind, channel: "manual_import", plan_version_id: plan.id, range }));
    setPasted("");
  }

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <div className="rounded-2xl p-4 space-y-2" style={card}>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>本地安全提示（无需联网）</p>
          <FindingList findings={alerts} />
        </div>
      )}

      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <div className="flex items-center gap-2">
          <Sparkles size={16} color="var(--primary)" />
          <h2 style={{ color: "var(--foreground)", fontSize: 16 }}>分析执行情况</h2>
        </div>

        <Segmented<AnalysisKind>
          value={kind}
          onChange={(k) => {
            setKind(k);
            setErrors([]);
          }}
          options={[
            ["weekly_review", ANALYSIS_KIND_LABEL.weekly_review],
            ["plan_adjustment", ANALYSIS_KIND_LABEL.plan_adjustment],
          ]}
        />
        <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          数据范围：{range.from} ~ {range.to}
          {kind === "plan_adjustment" ? " · 将生成下一版计划草稿，需你确认后才生效" : ""}
        </p>
        <label className="flex items-center gap-2" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />
          包含文字备注（默认只发送统计数据）
        </label>

        {/* 方式一：API */}
        {apiReady ? (
          settings.consent_given ? (
            running ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="w-full rounded-xl py-3 flex items-center justify-center gap-2"
                style={{ background: "var(--secondary)", color: "var(--foreground)", fontSize: 14 }}
              >
                <Loader2 size={16} className="animate-spin" />
                分析中…（点击取消）
                <Square size={12} />
              </button>
            ) : (
              <button
                onClick={runApi}
                className="w-full rounded-xl py-3 flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontSize: 14, fontWeight: 600 }}
              >
                <Sparkles size={16} />
                用 {provider!.label} 分析
              </button>
            )
          ) : (
            <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--secondary)" }}>
              <p style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.6 }}>
                分析时会把当前计划、所选范围内的执行统计、疼痛与疲劳评分发送给 {provider!.label}
                {includeNotes ? "（含文字备注）" : "（不含文字备注）"}。数据仅用于本次分析。
              </p>
              <button
                onClick={() => onSettingsChange({ ...settings, consent_given: true })}
                className="w-full rounded-xl py-2.5"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontSize: 13, fontWeight: 600 }}
              >
                同意并继续
              </button>
            </div>
          )
        ) : (
          <button
            onClick={onOpenSettings}
            className="w-full rounded-xl py-2.5 flex items-center justify-center gap-2"
            style={{ background: "var(--secondary)", color: "var(--muted-foreground)", fontSize: 13 }}
          >
            <KeyRound size={14} />
            配置 API Key 后可一键分析
          </button>
        )}

        {/* 方式二：手动 */}
        <div className="pt-2 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            或手动：复制提示词发给任意 AI，再把回复粘贴回来
          </p>
          <button
            onClick={copyPrompt}
            className="w-full rounded-xl py-2.5 flex items-center justify-center gap-2"
            style={{ background: "var(--secondary)", color: "var(--foreground)", fontSize: 13 }}
          >
            {copied ? <CheckCircle2 size={14} color="#4ade80" /> : <Copy size={14} />}
            {copied ? "已复制提示词" : "复制提示词"}
          </button>
          <textarea
            value={pasted}
            onChange={(e) => {
              setPasted(e.target.value);
              setErrors([]);
            }}
            placeholder="粘贴 AI 的回复（JSON）…"
            rows={4}
            className="w-full rounded-xl p-3 resize-none outline-none"
            style={{ ...fieldStyle, fontFamily: "'DM Mono', monospace", fontSize: 11 }}
          />
          <button
            onClick={importReply}
            disabled={!pasted.trim()}
            className="w-full rounded-xl py-2.5 disabled:opacity-40"
            style={{ background: "var(--secondary)", color: "var(--foreground)", fontSize: 13 }}
          >
            导入 AI 结果
          </button>
        </div>

        {errors.length > 0 && <ErrorBox errors={errors} />}
      </div>

      {newest.length > 0 && (
        <div className="space-y-2">
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", paddingLeft: 4 }}>分析记录</p>
          {newest.map((a, i) => (
            <AnalysisCard
              key={a.id}
              analysis={a}
              currentPlan={plan}
              versions={versions}
              defaultOpen={i === 0 && a.status === "new"}
              onAccept={onAcceptAnalysis}
              onReject={onRejectAnalysis}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ settings, apiKey, onSettingsChange, onApiKeyChange }: AIViewProps) {
  const provider = getProvider(settings.provider) ?? PROVIDERS[0];
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <h2 style={{ color: "var(--foreground)", fontSize: 16 }}>AI 服务</h2>

        <label className="block space-y-1">
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>服务商</span>
          <select
            value={provider.id}
            onChange={(e) => onSettingsChange({ ...settings, provider: e.target.value, model: "" })}
            className="w-full rounded-xl px-3 py-2 outline-none"
            style={fieldStyle}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>模型</span>
          <select
            value={settings.model || provider.defaultModel}
            onChange={(e) => onSettingsChange({ ...settings, model: e.target.value })}
            className="w-full rounded-xl px-3 py-2 outline-none"
            style={fieldStyle}
          >
            {provider.models.map((m) => (
              <option key={m} value={m}>
                {m}
                {m === provider.defaultModel ? "（默认）" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>API Key</span>
          <input
            type="password"
            value={keyDraft}
            onChange={(e) => {
              setKeyDraft(e.target.value);
              setSaved(false);
            }}
            placeholder="sk-ant-…"
            autoComplete="off"
            className="w-full rounded-xl px-3 py-2 outline-none"
            style={{ ...fieldStyle, fontFamily: "'DM Mono', monospace" }}
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => {
              onApiKeyChange(keyDraft.trim());
              setSaved(true);
            }}
            className="flex-1 rounded-xl py-2.5"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontSize: 13, fontWeight: 600 }}
          >
            {saved ? "已保存" : "保存 Key"}
          </button>
          {apiKey && (
            <button
              onClick={() => {
                onApiKeyChange("");
                setKeyDraft("");
              }}
              className="rounded-xl py-2.5 px-4"
              style={{ background: "var(--secondary)", color: "var(--muted-foreground)", fontSize: 13 }}
            >
              清除
            </button>
          )}
        </div>
        <p style={{ fontSize: 11, color: "#d9b26a", lineHeight: 1.6 }}>
          ⚠️ 原型阶段 Key 保存在本浏览器的 localStorage 中，仅用于演示。正式 App 会存入系统钥匙串，手表端不保存 Key。
        </p>

        <label className="block space-y-1">
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>自定义接口地址（可选，用于代理）</span>
          <input
            value={settings.base_url ?? ""}
            onChange={(e) => onSettingsChange({ ...settings, base_url: e.target.value.trim() || undefined })}
            placeholder="默认官方地址"
            className="w-full rounded-xl px-3 py-2 outline-none"
            style={fieldStyle}
          />
        </label>
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
            允许把训练数据发送给 AI 服务商用于分析
            <span className="block" style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
              关闭后仍可使用「复制提示词」手动分析
            </span>
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
              打开 App 时，若距上次复盘已满 7 天则自动分析一次（会产生 API 费用）
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
