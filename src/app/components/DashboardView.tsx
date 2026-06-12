import { ChevronRight, Target } from "lucide-react";
import type { PlanVersion, ExecutionRecord, PlanTask } from "../types";
import { computePlanCompletionRate, getCurrentWeek, getTotalWeeks, isTaskToday } from "../utils/plan";

interface DashboardViewProps {
  plan: PlanVersion | null;
  records: ExecutionRecord[];
  onStartToday: () => void;
}

function getRemainingToday(tasks: PlanTask[], records: ExecutionRecord[], today: string): number {
  return tasks.filter((t) => {
    const r = records.find((rec) => rec.task_id === t.id && rec.date === today);
    return !r || r.status !== "completed";
  }).length;
}

export function DashboardView({ plan, records, onStartToday }: DashboardViewProps) {
  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="text-5xl">🏋️</div>
        <p style={{ color: "var(--muted-foreground)", textAlign: "center", lineHeight: 1.6 }}>
          还没有训练计划<br />
          <span style={{ fontSize: 13 }}>前往「导入」标签页，粘贴 AI 生成的计划</span>
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayTasks = plan.tasks.filter((t) => isTaskToday(t, today));
  const remaining = getRemainingToday(todayTasks, records, today);
  const completionRate = computePlanCompletionRate(plan, records, today);
  const currentWeek = getCurrentWeek(plan, today);
  const totalWeeks = getTotalWeeks(plan);

  return (
    <div className="space-y-5">
      {/* Current Plan Dashboard */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,107,53,0.15)" }}
          >
            <Target size={20} color="var(--primary)" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 style={{ color: "var(--foreground)", fontWeight: 600, fontSize: 18 }}>
              {plan.plan_name} V{plan.version}
            </h2>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4 }}>
              第 {currentWeek} 周 / 共 {totalWeeks} 周
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>完成率</span>
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "var(--primary)",
                fontFamily: "'DM Mono', monospace",
              }}
            >
              {completionRate}%
            </span>
          </div>
          <div className="rounded-full overflow-hidden h-2" style={{ background: "var(--secondary)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${completionRate}%`, background: "var(--primary)" }}
            />
          </div>
        </div>

        {plan.ai_summary && (
          <p
            className="rounded-xl px-3 py-2"
            style={{ background: "var(--secondary)", fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.6 }}
          >
            {plan.ai_summary}
          </p>
        )}
      </div>

      {/* Today summary */}
      <div
        className="rounded-2xl p-5 text-center"
        style={{ background: "var(--secondary)", border: "1px solid var(--border)" }}
      >
        {todayTasks.length === 0 ? (
          <p style={{ color: "var(--muted-foreground)", fontSize: 15 }}>今天没有任务，好好休息！</p>
        ) : remaining === 0 ? (
          <>
            <p style={{ fontSize: 28 }}>🎉</p>
            <p style={{ color: "var(--foreground)", fontSize: 15, fontWeight: 500, marginTop: 8 }}>
              今日任务已全部完成
            </p>
          </>
        ) : (
          <p style={{ color: "var(--foreground)", fontSize: 20, fontWeight: 600 }}>
            今天还有{" "}
            <span style={{ color: "var(--primary)", fontFamily: "'DM Mono', monospace" }}>{remaining}</span>{" "}
            个任务
          </p>
        )}
      </div>

      {/* CTA */}
      {todayTasks.length > 0 && remaining > 0 && (
        <button
          onClick={onStartToday}
          className="w-full rounded-2xl py-4 flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontSize: 16, fontWeight: 600 }}
        >
          开始今日任务
          <ChevronRight size={18} />
        </button>
      )}

      {todayTasks.length > 0 && remaining === 0 && (
        <button
          onClick={onStartToday}
          className="w-full rounded-2xl py-3 flex items-center justify-center gap-2 transition-opacity hover:opacity-80"
          style={{ background: "var(--secondary)", color: "var(--muted-foreground)", fontSize: 14 }}
        >
          查看今日记录
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
