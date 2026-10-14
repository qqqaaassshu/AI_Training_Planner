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
import { getPreset, serviceProblems } from "../utils/ai/presets";
import { AISettingsPanel } from "./AISettingsPanel";
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
  apiKeys: Record<string, string>;
  onSettingsChange: (s: AISettings) => void;
  onApiKeysChange: (keys: Record<string, string>) => void;
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
      {section === "settings" && (
        <AISettingsPanel
          settings={props.settings}
          apiKeys={props.apiKeys}
          onSettingsChange={props.onSettingsChange}
          onApiKeysChange={props.onApiKeysChange}
        />
      )}
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
  apiKeys,
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

  const service = settings.services.find((x) => x.id === settings.active_service_id);
  const apiKey = service ? apiKeys[service.id] ?? "" : "";
  const apiReady = !!service && serviceProblems(service).length === 0 && (!!apiKey || !!getPreset(service.preset).key_optional);
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
    if (!plan || !service) return;
    setErrors([]);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      onAddAnalysis(await runApiAnalysis({ input: input(), planVersionId: plan.id, service: service!, apiKey, signal: controller.signal }));
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
                用 {service!.name} 分析
              </button>
            )
          ) : (
            <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--secondary)" }}>
              <p style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.6 }}>
                分析时会把当前计划、所选范围内的执行统计、疼痛与疲劳评分发送给 {service!.name}
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
            {service ? `完善「${service.name}」的配置后可一键分析` : "配置 AI 服务后可一键分析"}
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
