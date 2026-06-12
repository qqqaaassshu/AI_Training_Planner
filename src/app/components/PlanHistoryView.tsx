import { useState } from "react";
import { GitBranch, ChevronRight, ArrowLeftRight } from "lucide-react";
import type { PlanVersion } from "../types";
import { comparePlanVersions } from "../utils/plan";

interface PlanHistoryViewProps {
  versions: PlanVersion[];
  currentVersionId: string | null;
  onSelectVersion: (id: string) => void;
}

export function PlanHistoryView({ versions, currentVersionId, onSelectVersion }: PlanHistoryViewProps) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);

  const sorted = [...versions].sort((a, b) => b.version - a.version);

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="text-5xl">📜</div>
        <p style={{ color: "var(--muted-foreground)", textAlign: "center" }}>
          还没有计划版本<br />
          <span style={{ fontSize: 13 }}>导入计划后将自动创建 V1</span>
        </p>
      </div>
    );
  }

  const viewing = viewingId ? versions.find((v) => v.id === viewingId) : null;
  const planA = compareA ? versions.find((v) => v.id === compareA) : null;
  const planB = compareB ? versions.find((v) => v.id === compareB) : null;
  const diff = planA && planB ? comparePlanVersions(planA, planB) : null;

  if (compareA && compareB && diff && planA && planB) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setCompareA(null); setCompareB(null); }}
          className="flex items-center gap-1"
          style={{ fontSize: 13, color: "var(--muted-foreground)" }}
        >
          ← 返回版本列表
        </button>

        <div className="rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 mb-1">
            <ArrowLeftRight size={16} color="var(--primary)" />
            <h2 style={{ color: "var(--foreground)", fontSize: 16 }}>版本对比</h2>
          </div>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            V{planA.version} vs V{planB.version}
          </p>
        </div>

        {diff.added.length > 0 && (
          <div className="rounded-2xl p-4 space-y-2" style={{ background: "#1a2a1a", border: "1px solid rgba(74,222,128,0.2)" }}>
            <p style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>新增</p>
            {diff.added.map((item, i) => (
              <div key={i}>
                <p style={{ fontSize: 13, color: "var(--foreground)" }}>{item.taskTitle}</p>
                {item.exercises.length > 0 && (
                  <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{item.exercises.join("、")}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {diff.removed.length > 0 && (
          <div className="rounded-2xl p-4 space-y-2" style={{ background: "#2a1a1a", border: "1px solid rgba(229,62,62,0.2)" }}>
            <p style={{ fontSize: 12, color: "#e53e3e", fontWeight: 600 }}>删除</p>
            {diff.removed.map((item, i) => (
              <div key={i}>
                <p style={{ fontSize: 13, color: "var(--foreground)" }}>{item.taskTitle}</p>
                {item.exercises.length > 0 && (
                  <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{item.exercises.join("、")}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {diff.modified.length > 0 && (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <p style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>修改频率 / 动作</p>
            {diff.modified.map((item, i) => (
              <div key={i}>
                <p style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>{item.taskTitle}</p>
                <ul className="mt-1 space-y-0.5">
                  {item.changes.map((c, j) => (
                    <li key={j} style={{ fontSize: 12, color: "var(--muted-foreground)" }}>· {c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", textAlign: "center", padding: 24 }}>
            两个版本没有明显差异
          </p>
        )}
      </div>
    );
  }

  if (viewing) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setViewingId(null)}
          className="flex items-center gap-1"
          style={{ fontSize: 13, color: "var(--muted-foreground)" }}
        >
          ← 返回版本列表
        </button>

        <div className="rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <h2 style={{ color: "var(--foreground)" }}>
            {viewing.plan_name} V{viewing.version}
          </h2>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
            创建于 {new Date(viewing.created_at).toLocaleDateString("zh-CN")}
          </p>
          {viewing.ai_summary && (
            <p className="mt-3 rounded-xl px-3 py-2" style={{ background: "var(--secondary)", fontSize: 12, color: "var(--muted-foreground)" }}>
              {viewing.ai_summary}
            </p>
          )}
        </div>

        <div className="space-y-2">
          {viewing.tasks.map((t) => (
            <div key={t.id} className="rounded-2xl p-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p style={{ fontSize: 14, color: "var(--foreground)", fontWeight: 500 }}>{t.title}</p>
              {t.exercises && (
                <div className="mt-2 space-y-1">
                  {t.exercises.map((e) => (
                    <p key={e.name} style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                      {e.name} {e.sets}×{e.reps}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {viewing.id !== currentVersionId && (
          <button
            onClick={() => { onSelectVersion(viewing.id); setViewingId(null); }}
            className="w-full rounded-2xl py-3"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontWeight: 600 }}
          >
            切换到此版本
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <GitBranch size={18} color="var(--primary)" />
          <h2 style={{ color: "var(--foreground)" }}>Plan History</h2>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4 }}>
          共 {versions.length} 个版本
        </p>
      </div>

      {sorted.length >= 2 && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--secondary)", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>对比版本</p>
          <div className="flex gap-2">
            <select
              value={compareA ?? ""}
              onChange={(e) => setCompareA(e.target.value || null)}
              className="flex-1 rounded-xl px-3 py-2 outline-none"
              style={{ background: "var(--muted)", color: "var(--foreground)", fontSize: 13, border: "1px solid var(--border)" }}
            >
              <option value="">选择 V…</option>
              {sorted.map((v) => (
                <option key={v.id} value={v.id}>V{v.version}</option>
              ))}
            </select>
            <span style={{ color: "var(--muted-foreground)", alignSelf: "center" }}>vs</span>
            <select
              value={compareB ?? ""}
              onChange={(e) => setCompareB(e.target.value || null)}
              className="flex-1 rounded-xl px-3 py-2 outline-none"
              style={{ background: "var(--muted)", color: "var(--foreground)", fontSize: 13, border: "1px solid var(--border)" }}
            >
              <option value="">选择 V…</option>
              {sorted.map((v) => (
                <option key={v.id} value={v.id}>V{v.version}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sorted.map((v) => {
          const isCurrent = v.id === currentVersionId;
          return (
            <button
              key={v.id}
              onClick={() => setViewingId(v.id)}
              className="w-full rounded-2xl p-4 flex items-center justify-between text-left transition-opacity hover:opacity-90"
              style={{
                background: "var(--card)",
                border: `1px solid ${isCurrent ? "rgba(255,107,53,0.4)" : "var(--border)"}`,
              }}
            >
              <div>
                <p style={{ fontSize: 15, color: "var(--foreground)", fontWeight: 600 }}>
                  V{v.version}
                  {isCurrent && (
                    <span className="ml-2 rounded-full px-2 py-0.5" style={{ background: "rgba(255,107,53,0.15)", fontSize: 10, color: "var(--primary)" }}>
                      当前
                    </span>
                  )}
                </p>
                <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
                  {v.plan_name} · {v.tasks.length} 个任务
                </p>
              </div>
              <ChevronRight size={18} color="var(--muted-foreground)" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
