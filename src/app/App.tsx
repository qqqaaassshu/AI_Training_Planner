import { useEffect, useState } from "react";
import { CalendarCheck, Upload, History, Sparkles, GitBranch } from "lucide-react";
import { DashboardView } from "./components/DashboardView";
import { TodayView } from "./components/TodayView";
import { ImportPlan } from "./components/ImportPlan";
import { HistoryView } from "./components/HistoryView";
import { AIView } from "./components/AIView";
import { PlanHistoryView } from "./components/PlanHistoryView";
import { WatchWidget } from "./components/WatchWidget";
import type { AIAnalysis, AISettings, ExecutionRecord, PlanTask, PlanVersion, RecordSource, SetLog } from "./types";
import { createPlanVersion, findRecord, getExercisesForDate, getTasksOnDate, isDone, statusForSets } from "./utils/plan";
import { daysBetween, todayStr } from "./utils/date";
import { newId } from "./utils/id";
import { loadApiKeys, loadState, saveApiKeys, saveState, type PersistedState } from "./utils/storage";
import { getPreset, serviceProblems } from "./utils/ai/presets";
import { buildAnalysisInput } from "./utils/analysis";
import { runApiAnalysis } from "./utils/ai/run";
import "../styles/fonts.css";

type Tab = "home" | "import" | "history" | "ai" | "versions";
type HomeView = "dashboard" | "today";

/** 组件提交记录时只需提供这些字段，其余由 App 补全 */
export type RecordDraft = Pick<ExecutionRecord, "task_id" | "status" | "notes"> &
  Partial<Pick<ExecutionRecord, "skip_reason" | "sets" | "pain_score" | "fatigue_score" | "started_at">>;

const TABS: { id: Tab; label: string; icon: typeof CalendarCheck }[] = [
  { id: "home", label: "首页", icon: CalendarCheck },
  { id: "import", label: "导入", icon: Upload },
  { id: "versions", label: "版本", icon: GitBranch },
  { id: "history", label: "记录", icon: History },
  { id: "ai", label: "AI", icon: Sparkles },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [homeView, setHomeView] = useState<HomeView>("dashboard");
  const [state, setState] = useState<PersistedState>(loadState);
  const [watchNotification, setWatchNotification] = useState<{ title: string; taskId: string } | null>(null);
  const [watchTrainingTask, setWatchTrainingTask] = useState<PlanTask | null>(null);
  const [today, setToday] = useState(todayStr);
  const [apiKeys, setApiKeys] = useState(loadApiKeys);

  const { planVersions, currentPlanId, records, dailyWellness, analyses, aiSettings } = state;
  const plan = planVersions.find((p) => p.id === currentPlanId) ?? null;

  useEffect(() => saveState(state), [state]);

  // 跨过午夜时刷新“今天”
  useEffect(() => {
    const timer = setInterval(() => setToday(todayStr()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const update = (fn: (s: PersistedState) => PersistedState) => setState(fn);

  function handleImport(newPlan: PlanVersion) {
    update((s) => ({ ...s, planVersions: [...s.planVersions, newPlan], currentPlanId: newPlan.id }));
  }

  function handleApiKeysChange(keys: Record<string, string>) {
    setApiKeys(keys);
    saveApiKeys(keys);
  }

  function handleAISettings(aiSettings: AISettings) {
    update((s) => ({ ...s, aiSettings }));
  }

  function handleAddAnalysis(a: AIAnalysis) {
    update((s) => ({ ...s, analyses: [...s.analyses, a] }));
  }

  function setAnalysisStatus(id: string, status: AIAnalysis["status"]) {
    update((s) => ({ ...s, analyses: s.analyses.map((x) => (x.id === id ? { ...x, status } : x)) }));
  }

  /** 接受 AI 建议：基于当前版本生成新版本并切换 */
  function handleAcceptAnalysis(a: AIAnalysis) {
    if (!a.suggested_plan) return setAnalysisStatus(a.id, "accepted");
    update((s) => {
      const parent = s.planVersions.find((v) => v.id === s.currentPlanId) ?? null;
      const next = createPlanVersion(a.suggested_plan!, s.planVersions, { source: "ai_analysis", parent, analysis_id: a.id });
      return {
        ...s,
        planVersions: [...s.planVersions, next],
        currentPlanId: next.id,
        analyses: s.analyses.map((x) => (x.id === a.id ? { ...x, status: "accepted" } : x)),
      };
    });
  }

  const activeService = aiSettings.services.find((x) => x.id === aiSettings.active_service_id);
  const activeKey = activeService ? apiKeys[activeService.id] ?? "" : "";
  const activeReady =
    !!activeService && serviceProblems(activeService).length === 0 && (!!activeKey || !!getPreset(activeService.preset).key_optional);

  // 每周自动复盘：距上次复盘满 7 天时运行一次（需开启、已同意、当前服务配置完整）
  useEffect(() => {
    if (!plan || !activeService || !activeReady || !aiSettings.auto_weekly_review || !aiSettings.consent_given) return;
    const last = analyses
      .filter((a) => a.kind === "weekly_review")
      .reduce<string | null>((m, a) => (!m || a.created_at > m ? a.created_at : m), null);
    if (last && daysBetween(todayStr(new Date(last)), today) < 7) return;
    if (daysBetween(plan.start_date, today) < 7) return;

    const controller = new AbortController();
    runApiAnalysis({
      input: buildAnalysisInput({ kind: "weekly_review", plan, versions: planVersions, records, dailyWellness, today }),
      planVersionId: plan.id,
      service: activeService,
      apiKey: activeKey,
      signal: controller.signal,
    })
      .then(handleAddAnalysis)
      .catch(() => {
        // 自动复盘失败时静默，用户可在 AI 页手动重试
      });
    return () => controller.abort();
    // 只在日期、计划或开关变化时检查，避免每次记录变动都触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, plan?.id, activeService?.id, activeReady, aiSettings.auto_weekly_review, aiSettings.consent_given]);

  function handleSelectVersion(id: string) {
    update((s) => ({ ...s, currentPlanId: id }));
  }

  function handleRecord(draft: RecordDraft, source: RecordSource = "phone") {
    if (!plan) return;
    const now = new Date().toISOString();
    update((s) => {
      const existing = findRecord(s.records, draft.task_id, today);
      const record: ExecutionRecord = {
        ...draft,
        id: existing?.id ?? newId(),
        plan_version_id: plan.id,
        date: today,
        source,
        completed_at: draft.status === "completed" || draft.status === "partial" ? now : undefined,
        updated_at: now,
      };
      return { ...s, records: [...s.records.filter((r) => r !== existing), record] };
    });
  }

  function handleDailyFatigue(score: number) {
    update((s) => ({
      ...s,
      dailyWellness: [
        ...s.dailyWellness.filter((d) => d.date !== today),
        { date: today, fatigue_score: score, updated_at: new Date().toISOString() },
      ],
    }));
  }

  function handleUpdateRecord(id: string, patch: Partial<ExecutionRecord>) {
    update((s) => ({
      ...s,
      records: s.records.map((r) => (r.id === id ? { ...r, ...patch, updated_at: new Date().toISOString() } : r)),
    }));
  }

  function handleDeleteRecord(id: string) {
    update((s) => ({ ...s, records: s.records.filter((r) => r.id !== id) }));
  }

  function handleTriggerNotification(task: PlanTask) {
    setWatchNotification({ title: task.title, taskId: task.id });
  }

  const todayTasks = plan ? getTasksOnDate(plan, today) : [];
  const remainingCount = todayTasks.filter((t) => !isDone(findRecord(records, t.id, today))).length;

  function startWatchTraining(task: PlanTask | undefined) {
    if (plan && task && getExercisesForDate(plan, task, today).length > 0) setWatchTrainingTask(task);
  }

  function handleWatchStartTraining() {
    startWatchTraining(todayTasks.find((t) => t.type === "workout" && !isDone(findRecord(records, t.id, today))));
  }

  function handleWatchTrainingComplete(sets: SetLog[], startedAt: string) {
    if (!watchTrainingTask || !plan) return;
    const planned = getExercisesForDate(plan, watchTrainingTask, today);
    handleRecord(
      {
        task_id: watchTrainingTask.id,
        status: statusForSets(planned, sets),
        sets,
        started_at: startedAt,
        notes: "",
      },
      "watch"
    );
    setWatchTrainingTask(null);
  }

  function handleNotificationStart(taskId: string) {
    startWatchTraining(plan?.tasks.find((t) => t.id === taskId));
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
                  dailyWellness={dailyWellness}
                  pendingAnalyses={analyses.filter((a) => a.status === "new").length}
                  onOpenAI={() => setTab("ai")}
                  today={today}
                  onStartToday={() => setHomeView("today")}
                />
              )}
              {tab === "home" && homeView === "today" && (
                <TodayView
                  plan={plan}
                  records={records}
                  today={today}
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
                  today={today}
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
                  versions={planVersions}
                  records={records}
                  today={today}
                  dailyWellness={dailyWellness}
                  onUpdateRecord={handleUpdateRecord}
                  onDeleteRecord={handleDeleteRecord}
                />
              )}
              {tab === "ai" && (
                <AIView
                  plan={plan}
                  versions={planVersions}
                  records={records}
                  dailyWellness={dailyWellness}
                  today={today}
                  analyses={analyses}
                  settings={aiSettings}
                  apiKeys={apiKeys}
                  onSettingsChange={handleAISettings}
                  onApiKeysChange={handleApiKeysChange}
                  onAddAnalysis={handleAddAnalysis}
                  onAcceptAnalysis={handleAcceptAnalysis}
                  onRejectAnalysis={(a) => setAnalysisStatus(a.id, "rejected")}
                />
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
            trainingExercises={plan && watchTrainingTask ? getExercisesForDate(plan, watchTrainingTask, today) : []}
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
