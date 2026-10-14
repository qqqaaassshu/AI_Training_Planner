import type { PlanDiff } from "../utils/plan";

/** 计划差异展示（版本对比、AI 建议预览共用） */
export function PlanDiffView({ diff, compact }: { diff: PlanDiff; compact?: boolean }) {
  const box = compact ? "rounded-xl p-3 space-y-1.5" : "rounded-2xl p-4 space-y-2";
  const empty = diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0;

  if (empty) {
    return (
      <p style={{ fontSize: compact ? 12 : 13, color: "var(--muted-foreground)", textAlign: "center", padding: compact ? 4 : 24 }}>
        与当前版本没有明显差异
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {diff.added.length > 0 && (
        <div className={box} style={{ background: "#1a2a1a", border: "1px solid rgba(74,222,128,0.2)" }}>
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
        <div className={box} style={{ background: "#2a1a1a", border: "1px solid rgba(229,62,62,0.2)" }}>
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
        <div className={box} style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>修改</p>
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
    </div>
  );
}
