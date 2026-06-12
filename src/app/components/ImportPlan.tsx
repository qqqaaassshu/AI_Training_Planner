import { useState } from "react";
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import type { PlanVersion } from "../types";
import { normalizeImportedPlan } from "../utils/plan";
import { parseNaturalLanguagePlan } from "../utils/nlImport";

const SAMPLE_PLAN = `{
  "plan_name": "12周体能恢复计划",
  "start_date": "2026-06-15",
  "end_date": "2026-09-07",
  "ai_summary": "改善睡眠，恢复手腕，提升体能",
  "tasks": [
    {
      "id": "t1",
      "title": "身体维护训练A",
      "type": "workout",
      "schedule": { "weekday": [1, 3, 5], "time": "07:30" },
      "exercises": [
        { "name": "深蹲", "sets": 3, "reps": 10 },
        { "name": "臀桥", "sets": 3, "reps": 12 },
        { "name": "Dead Bug", "sets": 3, "reps": 8 }
      ],
      "reminder": true
    },
    {
      "id": "t2",
      "title": "散步20分钟",
      "type": "habit",
      "schedule": { "daily": true, "time": "18:00" },
      "reminder": true
    },
    {
      "id": "t3",
      "title": "水果1份",
      "type": "habit",
      "schedule": { "daily": true, "time": "12:00" },
      "reminder": false
    },
    {
      "id": "t4",
      "title": "22:30准备睡觉",
      "type": "habit",
      "schedule": { "daily": true, "time": "22:30" },
      "reminder": true
    }
  ]
}`;

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

interface ImportPlanProps {
  onImport: (plan: PlanVersion) => void;
  currentPlan: PlanVersion | null;
  existingVersions: PlanVersion[];
}

export function ImportPlan({ onImport, currentPlan, existingVersions }: ImportPlanProps) {
  const [mode, setMode] = useState<"json" | "natural">("json");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleImport() {
    setError(null);
    setSuccess(false);
    try {
      let raw: Record<string, unknown>;
      if (mode === "json") {
        raw = JSON.parse(text) as Record<string, unknown>;
        if (!raw.plan_name || !raw.tasks) throw new Error("缺少 plan_name 或 tasks 字段");
      } else {
        raw = parseNaturalLanguagePlan(text) as unknown as Record<string, unknown>;
      }
      const version = normalizeImportedPlan(raw, existingVersions);
      onImport(version);
      setSuccess(true);
      setText("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "格式错误");
    }
  }

  function loadSample() {
    setText(mode === "json" ? SAMPLE_PLAN : SAMPLE_NL);
    setError(null);
    setSuccess(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <h2 className="mb-1" style={{ color: "var(--foreground)" }}>导入训练计划</h2>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
          支持 JSON 或自然语言导入，自动创建新版本
        </p>
      </div>

      {currentPlan && (
        <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: "#1a2a1a", border: "1px solid rgba(74,222,128,0.2)" }}>
          <CheckCircle2 size={18} color="#4ade80" className="mt-0.5" />
          <div>
            <p style={{ fontSize: 13, color: "#4ade80", fontWeight: 600 }}>
              当前计划：{currentPlan.plan_name} V{currentPlan.version}
            </p>
            <p style={{ fontSize: 12, color: "#666" }}>
              开始日期 {currentPlan.start_date} · {currentPlan.tasks.length} 个任务
            </p>
          </div>
        </div>
      )}

      <div className="flex rounded-2xl p-1 gap-1" style={{ background: "var(--secondary)" }}>
        {(["json", "natural"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null); setSuccess(false); }}
            className="flex-1 rounded-xl py-2 transition-all"
            style={{
              background: mode === m ? "var(--primary)" : "transparent",
              color: mode === m ? "var(--primary-foreground)" : "var(--muted-foreground)",
              fontSize: 13,
              fontWeight: mode === m ? 600 : 400,
            }}
          >
            {m === "json" ? "JSON" : "自然语言"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); setSuccess(false); }}
          placeholder={mode === "json" ? "粘贴 JSON 计划..." : "粘贴自然语言计划，例如：\n周二训练：\n深蹲3组10次\n臀桥3组12次"}
          rows={12}
          className="w-full rounded-2xl p-4 resize-none outline-none"
          style={{
            background: "var(--input-background)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
            fontFamily: mode === "json" ? "'DM Mono', monospace" : "inherit",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        />
        {error && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "#2a1a1a", border: "1px solid rgba(229,62,62,0.3)" }}>
            <AlertCircle size={14} color="#e53e3e" />
            <span style={{ fontSize: 12, color: "#e53e3e" }}>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "#1a2a1a", border: "1px solid rgba(74,222,128,0.3)" }}>
            <CheckCircle2 size={14} color="#4ade80" />
            <span style={{ fontSize: 12, color: "#4ade80" }}>计划导入成功！已创建新版本</span>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={loadSample}
          className="flex-1 rounded-2xl py-3 transition-opacity hover:opacity-80"
          style={{ background: "var(--secondary)", color: "var(--muted-foreground)", fontSize: 14 }}
        >
          加载示例
        </button>
        <button
          onClick={handleImport}
          disabled={!text.trim()}
          className="flex-1 rounded-2xl py-3 flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontSize: 14 }}
        >
          <Upload size={16} />
          导入计划
        </button>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "var(--secondary)", border: "1px solid var(--border)" }}>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
          💡 每次导入将自动递增版本号（V1 → V2 → V3），保留历史记录供对比与回溯。
        </p>
      </div>
    </div>
  );
}
