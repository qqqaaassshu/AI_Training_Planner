import { useState } from "react";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Clock, SkipForward, Bell, ArrowLeft, CircleDashed } from "lucide-react";
import type { PlanVersion, PlanTask, ExecutionRecord, SkipReason } from "../types";
import type { RecordDraft } from "../App";
import { expandSets, findRecord, getExercisesForDate, getTasksOnDate, isDone, statusForSets, summarizeSets, type SetSummary } from "../utils/plan";
import { loadDraft, saveDraft } from "../utils/storage";
import { ScoreSlider } from "./ScoreSlider";
import { SetEditor, SetList, SKIP_REASONS, skipReasonLabel, summariesFromPlan } from "./SetEditor";

interface TodayViewProps {
  plan: PlanVersion | null;
  records: ExecutionRecord[];
  today: string;
  dailyFatigue: number | undefined;
  onDailyFatigueChange: (score: number) => void;
  onRecord: (record: RecordDraft) => void;
  onTriggerNotification: (task: PlanTask) => void;
  onBack?: () => void;
}

interface TaskCardProps {
  plan: PlanVersion;
  task: PlanTask;
  today: string;
  record: ExecutionRecord | undefined;
  onRecord: (r: RecordDraft) => void;
  onTriggerNotification: (task: PlanTask) => void;
}

function TaskCard({ plan, task, today, record, onRecord, onTriggerNotification }: TaskCardProps) {
  const planned = getExercisesForDate(plan, task, today);
  const [expanded, setExpanded] = useState(false);
  const [choosingSkip, setChoosingSkip] = useState(false);
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [painScore, setPainScore] = useState<number | undefined>(record?.pain_score);

  // 初始进度：部分完成的记录 > 本地草稿 > 计划默认值
  const [initial] = useState(() => {
    const base = summariesFromPlan(planned);
    if (record?.status === "partial" && record.sets?.length) {
      const logged = summarizeSets(record.sets);
      return {
        items: base.map((b) => logged.find((l) => l.exercise_id === b.exercise_id) ?? b),
        doneIds: logged.map((l) => l.exercise_id),
      };
    }
    const draft = loadDraft(today, task.id);
    if (draft) return { items: base.map((b) => draft.items.find((d) => d.exercise_id === b.exercise_id) ?? b), doneIds: draft.doneIds };
    return { items: base, doneIds: [] as string[] };
  });
  const [items, setItemsState] = useState<SetSummary[]>(initial.items);
  const [doneIds, setDoneIds] = useState<string[]>(initial.doneIds);

  const isCompleted = record?.status === "completed";
  const done = isDone(record);
  const isPartial = record?.status === "partial";
  const isSkipped = record?.status === "skipped";
  // “延后”和“部分完成”的任务仍可继续
  const open = !record || record.status === "snoozed" || isPartial;
  const allExercisesDone = planned.length > 0 && planned.every((e) => doneIds.includes(e.id));

  function setItems(next: SetSummary[]) {
    setItemsState(next);
    saveDraft(today, task.id, { doneIds, items: next });
  }

  function toggleDone(id: string) {
    const next = doneIds.includes(id) ? doneIds.filter((x) => x !== id) : [...doneIds, id];
    setDoneIds(next);
    saveDraft(today, task.id, { doneIds: next, items });
  }

  function submit(status: "done" | "skipped" | "snoozed", skip_reason?: SkipReason) {
    const startedAt = new Date().toISOString();
    if (status === "done") {
      // 勾选过动作时只记录勾选的；一个都没勾时视为按计划全部完成
      const chosen = doneIds.length > 0 ? items.filter((it) => doneIds.includes(it.exercise_id)) : items;
      const sets = planned.length > 0 ? expandSets(chosen.filter((it) => it.sets > 0), startedAt) : undefined;
      onRecord({
        task_id: task.id,
        status: sets ? statusForSets(planned, sets) : "completed",
        sets,
        notes,
        pain_score: task.type === "workout" ? painScore : undefined,
      });
    } else {
      onRecord({ task_id: task.id, status, skip_reason, notes });
    }
    saveDraft(today, task.id, null);
    setExpanded(false);
    setChoosingSkip(false);
  }

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: "var(--card)",
        border: `1px solid ${done ? "rgba(74,222,128,0.25)" : isSkipped ? "rgba(255,255,255,0.05)" : "var(--border)"}`,
        opacity: isSkipped ? 0.5 : 1,
      }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <button onClick={() => open && setExpanded(true)} className="mt-0.5 flex-shrink-0">
              {isPartial ? (
                <CircleDashed size={22} color="#4ade80" />
              ) : done ? (
                <CheckCircle2 size={22} color="#4ade80" />
              ) : (
                <Circle size={22} color={isSkipped ? "#444" : "#666"} />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p style={{ color: isCompleted ? "#666" : "var(--foreground)", textDecoration: isCompleted || isSkipped ? "line-through" : "none", fontWeight: 500 }}>
                {task.title}
              </p>
              <p className="flex items-center gap-1 mt-0.5" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                {task.schedule.time && (
                  <>
                    <Clock size={11} />
                    {task.schedule.time}
                  </>
                )}
                {isPartial && <span>· 部分完成，可继续</span>}
                {!record && doneIds.length > 0 && planned.length > 0 && (
                  <span style={{ color: "var(--primary)" }}>· 进行中 {doneIds.length}/{planned.length}</span>
                )}
                {record?.status === "snoozed" && <span>· 已延后</span>}
                {isSkipped && record?.skip_reason && <span>· 跳过（{skipReasonLabel(record.skip_reason)}）</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {task.reminder && open && (
              <button
                onClick={() => onTriggerNotification(task)}
                title="模拟 Watch 通知"
                className="rounded-xl p-1.5 transition-opacity hover:opacity-80"
                style={{ background: "var(--secondary)" }}
              >
                <Bell size={14} color="var(--muted-foreground)" />
              </button>
            )}
            {planned.length > 0 && open && (
              <button
                onClick={() => setExpanded((x) => !x)}
                className="rounded-xl p-1.5 transition-opacity hover:opacity-80"
                style={{ background: "var(--secondary)" }}
              >
                {expanded ? <ChevronUp size={14} color="var(--muted-foreground)" /> : <ChevronDown size={14} color="var(--muted-foreground)" />}
              </button>
            )}
            {open && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="rounded-xl px-2 py-1"
                style={{ background: "var(--secondary)", fontSize: 11, color: isPartial || doneIds.length > 0 ? "var(--primary)" : "var(--muted-foreground)" }}
              >
                {isPartial || doneIds.length > 0 ? "继续" : "完成"}
              </button>
            )}
          </div>
        </div>

        {!expanded && record?.sets && record.sets.length > 0 && (
          <div className="mt-3">
            <SetList sets={record.sets} />
          </div>
        )}

        {record?.pain_score !== undefined && (
          <p className="mt-2" style={{ fontSize: 12, color: record.pain_score >= 7 ? "#e53e3e" : "var(--muted-foreground)" }}>
            疼痛评分：{record.pain_score}/10
          </p>
        )}

        {record?.notes && (
          <p className="mt-2 rounded-xl px-3 py-2" style={{ background: "var(--secondary)", fontSize: 12, color: "var(--muted-foreground)" }}>
            📝 {record.notes}
          </p>
        )}
      </div>

      {expanded && open && (
        <div className="px-4 pb-4 space-y-3">
          {planned.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>点圆圈逐个完成动作</span>
                <span style={{ fontSize: 12, color: allExercisesDone ? "#4ade80" : "var(--primary)", fontFamily: "'DM Mono', monospace" }}>
                  {doneIds.filter((id) => planned.some((e) => e.id === id)).length}/{planned.length}
                </span>
              </div>
              <div className="rounded-full overflow-hidden h-1" style={{ background: "var(--secondary)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(doneIds.filter((id) => planned.some((e) => e.id === id)).length / planned.length) * 100}%`,
                    background: allExercisesDone ? "#4ade80" : "var(--primary)",
                  }}
                />
              </div>
              <SetEditor items={items} onChange={setItems} planned={planned} doneIds={doneIds} onToggleDone={toggleDone} />
              {allExercisesDone && (
                <p style={{ fontSize: 12, color: "#4ade80" }}>🎉 全部动作完成！记录一下疼痛感受再提交</p>
              )}
            </>
          )}

          {task.type === "workout" && (
            <ScoreSlider
              label="疼痛程度 (0-10)"
              value={painScore}
              onChange={setPainScore}
              hint={painScore !== undefined && painScore >= 7 ? "⚠️ 疼痛较明显，建议停止训练并观察，必要时就医" : "完成后记录当前疼痛感受"}
              minLabel="无痛"
              maxLabel="剧痛"
            />
          )}

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="添加备注（状态、感受…）"
            rows={2}
            className="w-full rounded-xl p-3 resize-none outline-none"
            style={{ background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)", fontSize: 13 }}
          />

          {choosingSkip ? (
            <div className="space-y-2">
              <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>跳过原因</p>
              <div className="flex gap-2">
                {SKIP_REASONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => submit("skipped", r.id)}
                    className="flex-1 rounded-xl py-2 transition-opacity hover:opacity-80"
                    style={{ background: "var(--secondary)", color: "var(--foreground)", fontSize: 12 }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setChoosingSkip(false)} style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                取消
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => submit("done")}
                className="flex-1 rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
                style={{ background: "#4ade80", color: "#000", fontSize: 13, fontWeight: 600 }}
              >
                <CheckCircle2 size={14} />
                {doneIds.length > 0 && !allExercisesDone ? "保存进度" : "完成"}
              </button>
              <button
                onClick={() => submit("snoozed")}
                className="rounded-xl py-2.5 px-4 flex items-center justify-center gap-1.5 transition-opacity hover:opacity-80"
                style={{ background: "var(--secondary)", color: "var(--muted-foreground)", fontSize: 13 }}
              >
                <Clock size={14} />
                延后
              </button>
              <button
                onClick={() => setChoosingSkip(true)}
                className="rounded-xl py-2.5 px-4 flex items-center justify-center gap-1.5 transition-opacity hover:opacity-80"
                style={{ background: "var(--secondary)", color: "var(--muted-foreground)", fontSize: 13 }}
              >
                <SkipForward size={14} />
                跳过
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TodayView({
  plan,
  records,
  today,
  dailyFatigue,
  onDailyFatigueChange,
  onRecord,
  onTriggerNotification,
  onBack,
}: TodayViewProps) {
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

  const todayTasks = getTasksOnDate(plan, today);
  const workouts = todayTasks.filter((t) => t.type === "workout");
  const habits = todayTasks.filter((t) => t.type === "habit");
  const completedCount = todayTasks.filter((t) => isDone(findRecord(records, t.id, today))).length;

  const dateStr = new Date(`${today}T12:00:00`).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });

  return (
    <div className="space-y-5">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1"
          style={{ fontSize: 13, color: "var(--muted-foreground)" }}
        >
          <ArrowLeft size={14} />
          返回首页
        </button>
      )}

      <div className="rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{dateStr}</p>
        <div className="flex items-end justify-between mt-1">
          <h2 style={{ color: "var(--foreground)" }}>今日任务</h2>
          <div className="flex items-baseline gap-1">
            <span style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", fontFamily: "'DM Mono', monospace" }}>
              {completedCount}
            </span>
            <span style={{ fontSize: 14, color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>
              /{todayTasks.length}
            </span>
          </div>
        </div>
        <div className="mt-3 rounded-full overflow-hidden h-1.5" style={{ background: "var(--secondary)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${todayTasks.length > 0 ? (completedCount / todayTasks.length) * 100 : 0}%`,
              background: "var(--primary)",
            }}
          />
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <ScoreSlider
          label="今日疲劳 (0-10)"
          value={dailyFatigue}
          onChange={onDailyFatigueChange}
          hint="记录今天的整体疲劳感受"
          minLabel="精力充沛"
          maxLabel="极度疲劳"
        />
      </div>

      {workouts.length > 0 && (
        <div className="space-y-2">
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", paddingLeft: 4, letterSpacing: "0.05em" }}>今日训练</p>
          {workouts.map((t) => (
            <TaskCard
              key={t.id}
              plan={plan}
              task={t}
              today={today}
              record={findRecord(records, t.id, today)}
              onRecord={onRecord}
              onTriggerNotification={onTriggerNotification}
            />
          ))}
        </div>
      )}

      {habits.length > 0 && (
        <div className="space-y-2">
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", paddingLeft: 4, letterSpacing: "0.05em" }}>今日习惯</p>
          {habits.map((t) => (
            <TaskCard
              key={t.id}
              plan={plan}
              task={t}
              today={today}
              record={findRecord(records, t.id, today)}
              onRecord={onRecord}
              onTriggerNotification={onTriggerNotification}
            />
          ))}
        </div>
      )}

      {todayTasks.length === 0 && (
        <div className="rounded-2xl p-8 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: 28 }}>🎉</p>
          <p style={{ color: "var(--muted-foreground)", marginTop: 8 }}>今天没有任务，好好休息！</p>
        </div>
      )}
    </div>
  );
}
