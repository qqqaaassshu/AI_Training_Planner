import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Info, ShieldAlert, X } from "lucide-react";
import type { AIAnalysis, Finding, PlanVersion } from "../types";
import { ANALYSIS_KIND_LABEL } from "../utils/analysis";
import { comparePlanVersions, createPlanVersion } from "../utils/plan";
import { PlanDiffView } from "./PlanDiffView";

const LEVEL_STYLE: Record<Finding["level"], { color: string; bg: string; icon: typeof Info }> = {
  info: { color: "#93c5fd", bg: "rgba(147,197,253,0.08)", icon: Info },
  warn: { color: "#f59e0b", bg: "rgba(245,158,11,0.08)", icon: AlertTriangle },
  risk: { color: "#e53e3e", bg: "rgba(229,62,62,0.1)", icon: ShieldAlert },
};

export function FindingList({ findings }: { findings: Finding[] }) {
  return (
    <div className="space-y-1.5">
      {findings.map((f, i) => {
        const s = LEVEL_STYLE[f.level];
        const Icon = s.icon;
        return (
          <div key={i} className="flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: s.bg }}>
            <Icon size={13} color={s.color} className="mt-0.5 flex-shrink-0" />
            <span style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.5 }}>{f.text}</span>
          </div>
        );
      })}
    </div>
  );
}

interface AnalysisCardProps {
  analysis: AIAnalysis;
  currentPlan: PlanVersion | null;
  versions: PlanVersion[];
  defaultOpen?: boolean;
  onAccept: (analysis: AIAnalysis) => void;
  onReject: (analysis: AIAnalysis) => void;
}

export function AnalysisCard({ analysis, currentPlan, versions, defaultOpen, onAccept, onReject }: AnalysisCardProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [confirming, setConfirming] = useState(false);
  const plan = analysis.suggested_plan;

  // 预览：与正式应用时相同的 id 对齐逻辑，差异才准确
  const diff = useMemo(() => {
    if (!plan || !currentPlan) return null;
    const preview = createPlanVersion(plan, versions, { source: "ai_analysis", parent: currentPlan });
    return comparePlanVersions(currentPlan, preview);
  }, [plan, currentPlan, versions]);

  const statusLabel = analysis.status === "accepted" ? "已应用" : analysis.status === "rejected" ? "已忽略" : "待处理";

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <button onClick={() => setOpen((x) => !x)} className="w-full p-4 flex items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <p style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 600 }}>
            {ANALYSIS_KIND_LABEL[analysis.kind]}
            <span className="ml-2" style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 400 }}>
              {analysis.range.from} ~ {analysis.range.to}
            </span>
          </p>
          <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
            {new Date(analysis.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            {" · "}
            {analysis.channel === "api" ? analysis.model ?? "API" : "手动导入"}
            {" · "}
            <span style={{ color: analysis.status === "new" ? "var(--primary)" : undefined }}>{statusLabel}</span>
          </p>
        </div>
        {open ? <ChevronUp size={16} color="var(--muted-foreground)" /> : <ChevronDown size={16} color="var(--muted-foreground)" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p style={{ fontSize: 13, color: "var(--foreground)", lineHeight: 1.7 }}>{analysis.summary}</p>
          {analysis.findings.length > 0 && <FindingList findings={analysis.findings} />}

          {plan && (
            <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--secondary)" }}>
              <p style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>建议的新计划：{plan.plan_name}</p>
              {plan.change_note && (
                <p style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.6 }}>{plan.change_note}</p>
              )}
              {diff ? <PlanDiffView diff={diff} compact /> : <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{plan.tasks.length} 个任务</p>}
            </div>
          )}

          {analysis.status === "new" && (
            <div className="flex gap-2">
              {plan &&
                (confirming ? (
                  <button
                    onClick={() => onAccept(analysis)}
                    className="flex-1 rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                    style={{ background: "#4ade80", color: "#000", fontSize: 13, fontWeight: 600 }}
                  >
                    <Check size={14} />
                    确认生成 V{versions.reduce((m, v) => Math.max(m, v.version), 0) + 1}
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirming(true)}
                    className="flex-1 rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                    style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontSize: 13, fontWeight: 600 }}
                  >
                    应用为新版本
                  </button>
                ))}
              <button
                onClick={() => onReject(analysis)}
                className="rounded-xl py-2.5 px-4 flex items-center justify-center gap-1.5"
                style={{ background: "var(--secondary)", color: "var(--muted-foreground)", fontSize: 13, flex: plan ? undefined : 1 }}
              >
                <X size={14} />
                {plan ? "忽略" : "知道了"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
