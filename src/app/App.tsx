import { useState } from "react";
import { CalendarCheck, Upload, History, Download, GitBranch } from "lucide-react";
import { DashboardView } from "./components/DashboardView";
import { TodayView } from "./components/TodayView";
import { ImportPlan } from "./components/ImportPlan";
import { HistoryView } from "./components/HistoryView";
import { ExportView } from "./components/ExportView";
import { PlanHistoryView } from "./components/PlanHistoryView";
import { WatchWidget } from "./components/WatchWidget";
import type { PlanVersion, ExecutionRecord, PlanTask, DailyWellness, ActualExercise } from "./types";
import { isTaskToday } from "./utils/plan";
import "../styles/fonts.css";

type Tab = "home" | "import" | "history" | "export" | "versions";
type HomeView = "dashboard" | "today";

const TABS: { id: Tab; label: string; icon: typeof CalendarCheck }[] = [
  { id: "home", label: "首页", icon: CalendarCheck },
  { id: "import", label: "导入", icon: Upload },
  { id: "versions", label: "版本", icon: GitBranch },
  { id: "history", label: "记录", icon: History },
  { id: "export", label: "导出", icon: Download },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [homeView, setHomeView] = useState<HomeView>("dashboard");
  const [planVersions, setPlanVersions] = useState<PlanVersion[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [records, setRecords] = useState<ExecutionRecord[]>([]);
  const [dailyWellness, setDailyWellness] = useState<DailyWellness[]>([]);
  const [watchNotification, setWatchNotification] = useState<{ title: string; taskId: string } | null>(null);
  const [watchTrainingTask, setWatchTrainingTask] = useState<PlanTask | null>(null);

  const plan = planVersions.find((p) => p.id === currentPlanId) ?? null;
  const today = new Date().toISOString().slice(0, 10);

  function handleImport(newPlan: PlanVersion) {
    setPlanVersions((prev) => [...prev, newPlan]);
    setCurrentPlanId(newPlan.id);
  }

  function handleSelectVersion(id: string) {
    setCurrentPlanId(id);
  }

  function handleRecord(r: Omit<ExecutionRecord, "id">) {
    setRecords((prev) => {
      const filtered = prev.filter((x) => !(x.task_id === r.task_id && x.date === r.date));
      return [...filtered, { ...r, id: `${r.task_id}-${r.date}-${Date.now()}` }];
    });
  }

  function handleDailyFatigue(score: number) {
    setDailyWellness((prev) => {
      const filtered = prev.filter((d) => d.date !== today);
      return [...filtered, { date: today, fatigue_score: score }];
    });
  }

  function handleTriggerNotification(task: PlanTask) {
    setWatchNotification({ title: task.title, taskId: task.id });
  }

  const todayTasks = plan?.tasks.filter((t) => isTaskToday(t, today)) ?? [];
  const remainingCount = todayTasks.filter((t) => {
    const r = records.find((rec) => rec.task_id === t.id && rec.date === today);
    return !r || r.status !== "completed";
  }).length;

  function getFirstWorkoutTask(): PlanTask | null {
    const pending = todayTasks.filter((t) => {
      const r = records.find((rec) => rec.task_id === t.id && rec.date === today);
      return (!r || r.status !== "completed") && t.type === "workout" && t.exercises && t.exercises.length > 0;
    });
    return pending[0] ?? null;
  }

  function handleWatchStartTraining() {
    const task = getFirstWorkoutTask();
    if (task) setWatchTrainingTask(task);
  }

  function handleWatchTrainingComplete(actual: ActualExercise[], _durationMinutes: number) {
    if (!watchTrainingTask) return;
    handleRecord({
      task_id: watchTrainingTask.id,
      date: today,
      status: "completed",
      completed_at: new Date().toISOString(),
      actual,
      notes: "（Apple Watch 训练模式）",
    });
    setWatchTrainingTask(null);
  }

  function handleNotificationStart(taskId: string) {
    const task = plan?.tasks.find((t) => t.id === taskId);
    if (task?.exercises?.length) {
      setWatchTrainingTask(task);
    }
  }

  function handleUpdateRecord(id: string, patch: Partial<ExecutionRecord>) {
    setRecords((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  function handleDeleteRecord(id: string) {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  const todayFatigue = dailyWellness.find((d) => d.date === today)?.fatigue_score;

  return (
    <div className="min-h-screen flex items-start justify-center" style={{ background: "var(--background)" }}>
      <div className="flex gap-8 items-start justify-center w-full max-w-4xl px-4 py-8">

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
                    <p style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.2 }}>
                      {plan.plan_name} V{plan.version}
                    </p>
                  ) : (
                    <p style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.2 }}>AI 驱动的训练执行器</p>
                  )}
                </div>
              </div>
              <div className="rounded-full px-2.5 py-1 flex items-center gap-1.5" style={{ background: "var(--secondary)" }}>
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: remainingCount === 0 && todayTasks.length > 0 ? "#4ade80" : "#ff6b35",
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>
                  {todayTasks.length - remainingCount}/{todayTasks.length}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "none" }}>
              {tab === "home" && homeView === "dashboard" && (
                <DashboardView
                  plan={plan}
                  records={records}
                  onStartToday={() => setHomeView("today")}
                />
              )}
              {tab === "home" && homeView === "today" && (
                <TodayView
                  plan={plan}
                  records={records}
                  dailyFatigue={todayFatigue}
                  onDailyFatigueChange={handleDailyFatigue}
                  onRecord={handleRecord}
                  onTriggerNotification={handleTriggerNotification}
                  onBack={() => setHomeView("dashboard")}
                />
              )}
              {tab === "import" && (
                <ImportPlan
                  onImport={handleImport}
                  currentPlan={plan}
                  existingVersions={planVersions}
                />
              )}
              {tab === "versions" && (
                <PlanHistoryView
                  versions={planVersions}
                  currentVersionId={currentPlanId}
                  onSelectVersion={handleSelectVersion}
                />
              )}
              {tab === "history" && (
                <HistoryView
                  plan={plan}
                  records={records}
                  dailyWellness={dailyWellness}
                  onUpdateRecord={handleUpdateRecord}
                  onDeleteRecord={handleDeleteRecord}
                />
              )}
              {tab === "export" && (
                <ExportView plan={plan} records={records} dailyWellness={dailyWellness} />
              )}
            </div>

            <div
              className="flex items-center gap-0.5 px-2 py-3 flex-shrink-0"
              style={{ borderTop: "1px solid var(--border)", background: "var(--background)" }}
            >
              {TABS.map(({ id, label, icon: Icon }) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      setTab(id);
                      if (id === "home") setHomeView("dashboard");
                    }}
                    className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all"
                    style={{
                      background: active ? "rgba(255,107,53,0.12)" : "transparent",
                      color: active ? "var(--primary)" : "var(--muted-foreground)",
                    }}
                  >
                    <Icon size={18} />
                    <span style={{ fontSize: 9, fontWeight: active ? 600 : 400 }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="hidden md:flex flex-col items-center pt-14">
          <WatchWidget
            remaining={remainingCount}
            total={todayTasks.length}
            trainingTask={watchTrainingTask}
            onStartTraining={handleWatchStartTraining}
            onTrainingComplete={handleWatchTrainingComplete}
            onExitTraining={() => setWatchTrainingTask(null)}
            notification={watchNotification}
            onDismissNotification={() => setWatchNotification(null)}
            onNotificationStart={handleNotificationStart}
          />
          <div className="mt-5 rounded-2xl p-3 max-w-[190px]" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <p style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.6, textAlign: "center" }}>
              Watch 首页显示剩余任务<br />点击「开始训练」进入逐步训练模式
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
