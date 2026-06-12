import { useState } from "react";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Clock, SkipForward, Bell, ArrowLeft } from "lucide-react";
import type { PlanVersion, PlanTask, ExecutionRecord, ActualExercise } from "../types";
import { isTaskToday } from "../utils/plan";
import { ScoreSlider } from "./ScoreSlider";

interface TodayViewProps {
  plan: PlanVersion | null;
  records: ExecutionRecord[];
  dailyFatigue: number | undefined;
  onDailyFatigueChange: (score: number) => void;
  onRecord: (record: Omit<ExecutionRecord, "id">) => void;
  onTriggerNotification: (task: PlanTask) => void;
  onBack?: () => void;
}

function getRecordForTask(taskId: string, records: ExecutionRecord[]): ExecutionRecord | undefined {
  const today = new Date().toISOString().slice(0, 10);
  return records.find((r) => r.task_id === taskId && r.date === today);
}

interface ExerciseLogProps {
  exercises: { name: string; sets: number; reps: number }[];
  actual: ActualExercise[];
  onChange: (actual: ActualExercise[]) => void;
}

function ExerciseLog({ exercises, actual, onChange }: ExerciseLogProps) {
  function update(i: number, field: "sets" | "reps", value: number) {
    const next = actual.map((a, idx) => idx === i ? { ...a, [field]: value } : a);
    onChange(next);
  }

  return (
    <div className="space-y-2 mt-3">
      {exercises.map((ex, i) => (
        <div key={ex.name} className="rounded-xl p-3" style={{ background: "var(--secondary)" }}>
          <div className="flex items-center justify-between mb-2">
            <span style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>{ex.name}</span>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>
              计划 {ex.sets}×{ex.reps}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>实际组数</span>
              <input
                type="number"
                value={actual[i]?.sets ?? ex.sets}
                onChange={(e) => update(i, "sets", parseInt(e.target.value) || 0)}
                className="w-12 text-center rounded-lg py-1 outline-none"
                style={{ background: "var(--muted)", color: "var(--foreground)", fontSize: 13, border: "1px solid var(--border)", fontFamily: "'DM Mono', monospace" }}
              />
            </div>
            <span style={{ color: "var(--muted-foreground)" }}>×</span>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>次数</span>
              <input
                type="number"
                value={actual[i]?.reps ?? ex.reps}
                onChange={(e) => update(i, "reps", parseInt(e.target.value) || 0)}
                className="w-12 text-center rounded-lg py-1 outline-none"
                style={{ background: "var(--muted)", color: "var(--foreground)", fontSize: 13, border: "1px solid var(--border)", fontFamily: "'DM Mono', monospace" }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface TaskCardProps {
  task: PlanTask;
  record: ExecutionRecord | undefined;
  onRecord: (r: Omit<ExecutionRecord, "id">) => void;
  onTriggerNotification: (task: PlanTask) => void;
}

function TaskCard({ task, record, onRecord, onTriggerNotification }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const [painScore, setPainScore] = useState<number | undefined>(undefined);
  const [actual, setActual] = useState<ActualExercise[]>(
    task.exercises?.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps })) ?? []
  );

  const today = new Date().toISOString().slice(0, 10);
  const isDone = record?.status === "completed";
  const isSkipped = record?.status === "skipped";

  function submit(status: "completed" | "skipped" | "snoozed") {
    onRecord({
      task_id: task.id,
      date: today,
      status,
      completed_at: new Date().toISOString(),
      actual: task.exercises ? actual : undefined,
      notes: notes,
      pain_score: status === "completed" ? painScore : undefined,
    });
    setExpanded(false);
  }

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: "var(--card)",
        border: `1px solid ${isDone ? "rgba(74,222,128,0.25)" : isSkipped ? "rgba(255,255,255,0.05)" : "var(--border)"}`,
        opacity: isSkipped ? 0.5 : 1,
      }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <button
              onClick={() => !isDone && !isSkipped && setExpanded(true)}
              className="mt-0.5 flex-shrink-0"
            >
              {isDone ? (
                <CheckCircle2 size={22} color="#4ade80" />
              ) : (
                <Circle size={22} color={isSkipped ? "#444" : "#666"} />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p style={{ color: isDone ? "#666" : "var(--foreground)", textDecoration: isDone || isSkipped ? "line-through" : "none", fontWeight: 500 }}>
                {task.title}
              </p>
              {task.schedule.time && (
                <p className="flex items-center gap-1 mt-0.5" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  <Clock size={11} />
                  {task.schedule.time}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {task.reminder && !record && (
              <button
                onClick={() => onTriggerNotification(task)}
                title="模拟 Watch 通知"
                className="rounded-xl p-1.5 transition-opacity hover:opacity-80"
                style={{ background: "var(--secondary)" }}
              >
                <Bell size={14} color="var(--muted-foreground)" />
              </button>
            )}
            {task.type === "workout" && task.exercises && !record && (
              <button
                onClick={() => setExpanded((x) => !x)}
                className="rounded-xl p-1.5 transition-opacity hover:opacity-80"
                style={{ background: "var(--secondary)" }}
              >
                {expanded ? <ChevronUp size={14} color="var(--muted-foreground)" /> : <ChevronDown size={14} color="var(--muted-foreground)" />}
              </button>
            )}
            {!record && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="rounded-xl px-2 py-1"
                style={{ background: "var(--secondary)", fontSize: 11, color: "var(--muted-foreground)" }}
              >
                完成
              </button>
            )}
          </div>
        </div>

        {task.type === "workout" && task.exercises && record && record.actual && (
          <div className="mt-3 space-y-1">
            {record.actual.map((a) => (
              <div key={a.name} className="flex items-center justify-between">
                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{a.name}</span>
                <span style={{ fontSize: 12, color: "#4ade80", fontFamily: "'DM Mono', monospace" }}>
                  {a.sets}×{a.reps}
                </span>
              </div>
            ))}
          </div>
        )}

        {record?.pain_score !== undefined && (
          <p className="mt-2" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            疼痛评分：{record.pain_score}/10
          </p>
        )}

        {record?.notes && (
          <p className="mt-2 rounded-xl px-3 py-2" style={{ background: "var(--secondary)", fontSize: 12, color: "var(--muted-foreground)" }}>
            📝 {record.notes}
          </p>
        )}
      </div>

      {expanded && !record && (
        <div className="px-4 pb-4 space-y-3">
          {task.exercises && (
            <ExerciseLog exercises={task.exercises} actual={actual} onChange={setActual} />
          )}

          <ScoreSlider
            label="疼痛程度 (0-10)"
            value={painScore}
            onChange={setPainScore}
            hint="完成后记录当前疼痛感受"
            minLabel="无痛"
            maxLabel="剧痛"
          />

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="添加备注（状态、感受…）"
            rows={2}
            className="w-full rounded-xl p-3 resize-none outline-none"
            style={{
              background: "var(--secondary)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
              fontSize: 13,
            }}
          />

          <div className="flex gap-2">
            <button
              onClick={() => submit("completed")}
              className="flex-1 rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
              style={{ background: "#4ade80", color: "#000", fontSize: 13, fontWeight: 600 }}
            >
              <CheckCircle2 size={14} />
              完成
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
              onClick={() => submit("skipped")}
              className="rounded-xl py-2.5 px-4 flex items-center justify-center gap-1.5 transition-opacity hover:opacity-80"
              style={{ background: "var(--secondary)", color: "var(--muted-foreground)", fontSize: 13 }}
            >
              <SkipForward size={14} />
              跳过
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TodayView({
  plan,
  records,
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

  const today = new Date().toISOString().slice(0, 10);
  const todayTasks = plan.tasks.filter((t) => isTaskToday(t, today));
  const workouts = todayTasks.filter((t) => t.type === "workout");
  const habits = todayTasks.filter((t) => t.type === "habit");
  const completedCount = todayTasks.filter((t) => {
    const r = getRecordForTask(t.id, records);
    return r?.status === "completed";
  }).length;

  const dateStr = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });

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
              task={t}
              record={getRecordForTask(t.id, records)}
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
              task={t}
              record={getRecordForTask(t.id, records)}
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
