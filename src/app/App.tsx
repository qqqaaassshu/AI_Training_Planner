import { useState } from "react";
import { CalendarCheck, Upload, History, Download } from "lucide-react";
import { TodayView } from "./components/TodayView";
import { ImportPlan } from "./components/ImportPlan";
import { HistoryView } from "./components/HistoryView";
import { ExportView } from "./components/ExportView";
import { WatchWidget } from "./components/WatchWidget";
import type { Plan, ExecutionRecord, PlanTask } from "./types";
import "../styles/fonts.css";

type Tab = "today" | "import" | "history" | "export";

const TABS: { id: Tab; label: string; icon: typeof CalendarCheck }[] = [
  { id: "today", label: "今日", icon: CalendarCheck },
  { id: "import", label: "导入", icon: Upload },
  { id: "history", label: "记录", icon: History },
  { id: "export", label: "导出", icon: Download },
];

export default function App() {
  {/* MARKER-MAKE-KIT-INVOKED */}

  const [tab, setTab] = useState<Tab>("today");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [records, setRecords] = useState<ExecutionRecord[]>([]);
  const [watchNotification, setWatchNotification] = useState<{ title: string; taskId: string } | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const todayDayOfWeek = new Date().getDay();

  function isTaskToday(t: PlanTask) {
    if (t.schedule.daily) return true;
    if (t.schedule.weekday) return t.schedule.weekday.includes(todayDayOfWeek);
    return false;
  }

  function handleRecord(r: Omit<ExecutionRecord, "id">) {
    setRecords((prev) => {
      const filtered = prev.filter((x) => !(x.task_id === r.task_id && x.date === r.date));
      return [...filtered, { ...r, id: `${r.task_id}-${r.date}-${Date.now()}` }];
    });
  }

  function handleTriggerNotification(task: PlanTask) {
    setWatchNotification({ title: task.title, taskId: task.id });
  }

  const todayTasks = plan?.tasks.filter(isTaskToday) ?? [];
  const watchTasks = todayTasks.map((t) => ({
    id: t.id,
    title: t.title,
    done: records.some((r) => r.task_id === t.id && r.date === today && r.status === "completed"),
  }));
  const completedCount = watchTasks.filter((t) => t.done).length;

  function handleWatchComplete(taskId: string) {
    handleRecord({
      task_id: taskId,
      date: today,
      status: "completed",
      completed_at: new Date().toISOString(),
      notes: "（Apple Watch 打卡）",
    });
  }

  function handleWatchSkip(taskId: string) {
    handleRecord({ task_id: taskId, date: today, status: "skipped", completed_at: new Date().toISOString(), notes: "" });
  }

  function handleWatchSnooze(taskId: string) {
    handleRecord({ task_id: taskId, date: today, status: "snoozed", completed_at: new Date().toISOString(), notes: "" });
  }

  function handleUpdateRecord(id: string, patch: Partial<ExecutionRecord>) {
    setRecords((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  function handleDeleteRecord(id: string) {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="min-h-screen flex items-start justify-center" style={{ background: "var(--background)" }}>
      <div className="flex gap-8 items-start justify-center w-full max-w-4xl px-4 py-8">

        {/* Phone frame */}
        <div className="flex-shrink-0" style={{ width: 390, minWidth: 320 }}>
          <div
            className="rounded-3xl overflow-hidden flex flex-col"
            style={{
              background: "var(--background)",
              border: "1px solid rgba(255,255,255,0.08)",
              minHeight: 720,
              boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)",
            }}
          >
            {/* App header */}
            <div
              className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--primary)" }}>
                  <CalendarCheck size={18} color="#fff" />
                </div>
                <div>
                  <p style={{ fontSize: 14, color: "var(--foreground)", fontWeight: 600, lineHeight: 1.2 }}>Training Planner</p>
                  {plan ? (
                    <p style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.2 }}>{plan.plan_name}</p>
                  ) : (
                    <p style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.2 }}>AI 驱动的训练执行器</p>
                  )}
                </div>
              </div>
              <div className="rounded-full px-2.5 py-1 flex items-center gap-1.5" style={{ background: "var(--secondary)" }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: completedCount === todayTasks.length && todayTasks.length > 0 ? "#4ade80" : "#ff6b35" }} />
                <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>
                  {completedCount}/{todayTasks.length}
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "none" }}>
              {tab === "today" && (
                <TodayView plan={plan} records={records} onRecord={handleRecord} onTriggerNotification={handleTriggerNotification} />
              )}
              {tab === "import" && (
                <ImportPlan plan={plan} onImport={setPlan} currentPlan={plan} />
              )}
              {tab === "history" && (
                <HistoryView plan={plan} records={records} onUpdateRecord={handleUpdateRecord} onDeleteRecord={handleDeleteRecord} />
              )}
              {tab === "export" && (
                <ExportView plan={plan} records={records} />
              )}
            </div>

            {/* Bottom nav */}
            <div
              className="flex items-center gap-1 px-3 py-3 flex-shrink-0"
              style={{ borderTop: "1px solid var(--border)", background: "var(--background)" }}
            >
              {TABS.map(({ id, label, icon: Icon }) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all"
                    style={{
                      background: active ? "rgba(255,107,53,0.12)" : "transparent",
                      color: active ? "var(--primary)" : "var(--muted-foreground)",
                    }}
                  >
                    <Icon size={20} />
                    <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Apple Watch widget */}
        <div className="hidden md:flex flex-col items-center pt-14">
          <WatchWidget
            completed={completedCount}
            total={todayTasks.length}
            tasks={watchTasks}
            onComplete={handleWatchComplete}
            onSnooze={handleWatchSnooze}
            onSkip={handleWatchSkip}
            notification={watchNotification}
            onDismissNotification={() => setWatchNotification(null)}
          />
          <div className="mt-5 rounded-2xl p-3 max-w-[190px]" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <p style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.6, textAlign: "center" }}>
              点任务卡片的 🔔 图标<br />模拟 Apple Watch 通知
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
