import { useState } from "react";
import { Upload, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import type { PlanSource, PlanVersion } from "../types";
import samplePlan from "../fixtures/samplePlan.json";
import { createPlanVersion } from "../utils/plan";
import { parseNaturalLanguagePlan } from "../utils/nlImport";
import { validatePlanInput } from "../utils/validate";
import { addDays, weekdayOf } from "../utils/date";

/** 示例计划：从本周一开始的 12 周 */
function buildSamples(today: string) {
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const json = JSON.stringify({ ...samplePlan, start_date: monday, end_date: addDays(monday, 83) }, null, 2);
  const natural = `12周恢复计划
开始日期：${monday}

周一三五 07:30 力量训练：
深蹲3组10次
臀桥3组12次
Dead Bug 3组8次
平板支撑3组30秒

周二四训练：
俯卧撑3组8次
靠墙静蹲3组45秒

每日习惯：
散步20分钟
22:30准备睡觉`;
  return { json, natural };
}

interface ImportPlanProps {
  onImport: (plan: PlanVersion) => void;
  currentPlan: PlanVersion | null;
  existingVersions: PlanVersion[];
  today: string;
}

export function ImportPlan({ onImport, currentPlan, existingVersions, today }: ImportPlanProps) {
  const [mode, setMode] = useState<"json" | "natural">("json");
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);

  function reset() {
    setErrors([]);
    setWarnings([]);
    setSuccess(false);
  }

  function handleImport() {
    reset();
    let raw: unknown;
    let source: PlanSource;
    let nlWarnings: string[] = [];
    try {
      if (mode === "json") {
        raw = JSON.parse(text);
        source = "json_import";
      } else {
        const parsed = parseNaturalLanguagePlan(text, today);
        raw = parsed.plan;
        nlWarnings = parsed.warnings;
        source = "nl_import";
      }
    } catch (e: unknown) {
      setErrors([e instanceof SyntaxError ? `JSON 格式错误：${e.message}` : e instanceof Error ? e.message : "格式错误"]);
      return;
    }

    const result = validatePlanInput(raw);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onImport(createPlanVersion(result.value, existingVersions, { source, parent: currentPlan }));
    setWarnings(nlWarnings);
    setSuccess(true);
    setText("");
  }

  function loadSample() {
    const samples = buildSamples(today);
    setText(mode === "json" ? samples.json : samples.natural);
    reset();
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
            onClick={() => { setMode(m); reset(); }}
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
          onChange={(e) => { setText(e.target.value); reset(); }}
          placeholder={mode === "json" ? "粘贴 JSON 计划..." : "粘贴自然语言计划，例如：\n周二训练：\n深蹲3组10次 20kg\n平板支撑3组30秒"}
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
        {errors.length > 0 && (
          <div className="rounded-xl px-3 py-2 space-y-1" style={{ background: "#2a1a1a", border: "1px solid rgba(229,62,62,0.3)" }}>
            <div className="flex items-center gap-2">
              <AlertCircle size={14} color="#e53e3e" />
              <span style={{ fontSize: 12, color: "#e53e3e", fontWeight: 600 }}>导入失败，请修正以下问题：</span>
            </div>
            {errors.slice(0, 8).map((e) => (
              <p key={e} style={{ fontSize: 11, color: "#e88", fontFamily: "'DM Mono', monospace" }}>· {e}</p>
            ))}
            {errors.length > 8 && <p style={{ fontSize: 11, color: "#e88" }}>…还有 {errors.length - 8} 项</p>}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "#1a2a1a", border: "1px solid rgba(74,222,128,0.3)" }}>
            <CheckCircle2 size={14} color="#4ade80" />
            <span style={{ fontSize: 12, color: "#4ade80" }}>计划导入成功！已创建新版本</span>
          </div>
        )}
        {warnings.length > 0 && (
          <div className="rounded-xl px-3 py-2 space-y-1" style={{ background: "#2a2410", border: "1px solid rgba(245,158,11,0.3)" }}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} color="#f59e0b" />
              <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>以下内容未能识别，未导入：</span>
            </div>
            {warnings.map((w) => (
              <p key={w} style={{ fontSize: 11, color: "#d9b26a" }}>· {w}</p>
            ))}
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
