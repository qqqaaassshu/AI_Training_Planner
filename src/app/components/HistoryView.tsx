import { useState } from "react";
import { CheckCircle2, CircleDashed, SkipForward, Clock, Pencil, Plus, Check, X } from "lucide-react";
import type { PlanVersion, ExecutionRecord, DailyWellness, PlanTask } from "../types";
import { expandSets, getExercisesForDate, summarizeSets, type SetSummary } from "../utils/plan";
import { SetEditor, SetList, skipReasonLabel, summariesFromPlan } from "./SetEditor";

interface HistoryViewProps {
  versions: PlanVersion[];
  records: ExecutionRecord[];
  today: string;
  dailyWellness: DailyWellness[];
  onUpdateRecord: (id: string, patch: Partial<ExecutionRecord>) => void;
  onDeleteRecord: (id: string) => void;
}

const STATUS: Record<ExecutionRecord["status"], { label: string; color: string; icon: JSX.Element }> = {
  completed: { label: "完成", color: "#4ade80", icon: <CheckCircle2 size={16} color="#4ade80" /> },
  partial: { label: "部分完成", color: "#a3e635", icon: <CircleDashed size={16} color="#a3e635" /> },
  skipped: { label: "跳过", color: "#555", icon: <SkipForward size={16} color="#666" /> },
  snoozed: { label: "延后", color: "#f59e0b", icon: <Clock size={16} color="#f59e0b" /> },
};

/** 记录对应的任务：优先查记录所属版本，其次任意版本（任务 id 跨版本稳定） */
function findTask(versions: PlanVersion[], r: ExecutionRecord): { plan: PlanVersion; task: PlanTask } | undefined {
  const ordered = [...versions].sort((a, b) => (a.id === r.plan_version_id ? -1 : b.id === r.plan_version_id ? 1 : b.version - a.version));
  for (const plan of ordered) {
    const task = plan.tasks.find((t) => t.id === r.task_id);
    if (task) return { plan, task };
  }
  return undefined;
}

interface RecordDetailEditorProps {
  record: ExecutionRecord;
  taskTitle: string;
  initial: SetSummary[];
  onSave: (patch: Partial<ExecutionRecord>) => void;
  onClose: () => void;
}

function RecordDetailEditor({ record, taskTitle, initial, onSave, onClose }: RecordDetailEditorProps) {
  const [items, setItems] = useState(initial);
  const [notes, setNotes] = useState(record.notes ?? "");

  function save() {
    onSave({ sets: expandSets(items.filter((it) => it.sets > 0), record.completed_at ?? new Date().toISOString()), notes });
    onClose();
  }

  return (
    <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl p-5 space-y-4"
        style={{ background: "var(--card)", border: "1px solid var(--border)", maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center -mt-1 mb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border)" }} />
        </div>

        <div className="flex items-center justify-between">
          <h3 style={{ color: "var(--foreground)" }}>{taskTitle}</h3>
          <button onClick={onClose}>
            <X size={18} color="var(--muted-foreground)" />
          </button>
        </div>

        <div className="space-y-2">
          <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>实际完成动作</p>
          <SetEditor items={items} onChange={setItems} editable />
        </div>

        <div className="space-y-1.5">
          <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>备注</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="疲劳、疼痛、状态…"
            rows={2}
            className="w-full rounded-xl p-3 resize-none outline-none"
            style={{ background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)", fontSize: 13 }}
          />
        </div>

        <button
          onClick={save}
          className="w-full rounded-2xl py-3 flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontWeight: 600 }}
        >
          <Check size={16} />
          保存
        </button>
      </div>
    </div>
  );
}

export function HistoryView({ versions, records, today, dailyWellness, onUpdateRecord, onDeleteRecord }: HistoryViewProps) {
  const [editingRecord, setEditingRecord] = useState<ExecutionRecord | null>(null);

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="text-5xl">📋</div>
        <p style={{ color: "var(--muted-foreground)", textAlign: "center" }}>
          还没有执行记录<br />
          <span style={{ fontSize: 13 }}>完成任务后，记录会出现在这里</span>
        </p>
      </div>
    );
  }

  const byDate = records.reduce<Record<string, ExecutionRecord[]>>((acc, r) => {
    acc[r.date] = acc[r.date] ? [...acc[r.date], r] : [r];
    return acc;
  }, {});

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  const completed = records.filter((r) => r.status === "completed" || r.status === "partial").length;
  const skipped = records.filter((r) => r.status === "skipped").length;
  const rate = records.length > 0 ? Math.round((completed / records.length) * 100) : 0;

  function editorInitial(r: ExecutionRecord): SetSummary[] {
    if (r.sets && r.sets.length > 0) return summarizeSets(r.sets);
    const found = findTask(versions, r);
    return found ? summariesFromPlan(getExercisesForDate(found.plan, found.task, r.date)) : [];
  }

  return (
    <>
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "完成", value: completed, color: "#4ade80" },
            { label: "跳过", value: skipped, color: "#666" },
            { label: "完成率", value: `${rate}%`, color: "var(--primary)" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl p-3 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "'DM Mono', monospace" }}>{s.value}</p>
              <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Timeline */}
        {dates.map((date) => (
          <div key={date} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                {new Date(`${date}T12:00:00`).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })}
              </p>
              {dailyWellness.find((d) => d.date === date) && (
                <p style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                  疲劳 {dailyWellness.find((d) => d.date === date)!.fatigue_score}/10
                </p>
              )}
            </div>
            {byDate[date].map((r) => {
              const task = findTask(versions, r)?.task;
              const taskTitle = task?.title ?? "（已删除的任务）";
              const status = STATUS[r.status];
              const canEdit = r.status === "completed" || r.status === "partial";

              return (
                <div key={r.id} className="rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-0.5">{status.icon}</div>
                      <div className="flex-1">
                        <p style={{ color: "var(--foreground)", fontWeight: 500, fontSize: 14 }}>{taskTitle}</p>

                        {r.sets && r.sets.length > 0 ? (
                          <div className="mt-2">
                            <SetList sets={r.sets} />
                          </div>
                        ) : canEdit && task?.type === "workout" && (
                          <button
                            onClick={() => setEditingRecord(r)}
                            className="mt-2 flex items-center gap-1 rounded-lg px-2 py-1 transition-opacity hover:opacity-80"
                            style={{ background: "var(--secondary)", border: "1px dashed rgba(255,107,53,0.4)" }}
                          >
                            <Plus size={11} color="var(--primary)" />
                            <span style={{ fontSize: 11, color: "var(--primary)" }}>填写实际动作</span>
                          </button>
                        )}

                        {r.skip_reason && (
                          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
                            原因：{skipReasonLabel(r.skip_reason)}
                          </p>
                        )}

                        {r.pain_score !== undefined && (
                          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
                            疼痛 {r.pain_score}/10
                          </p>
                        )}

                        {r.notes && (
                          <p className="mt-2 rounded-lg px-2 py-1" style={{ background: "var(--secondary)", fontSize: 12, color: "var(--muted-foreground)" }}>
                            📝 {r.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span style={{ fontSize: 12, color: status.color, fontWeight: 500 }}>
                        {status.label}
                      </span>
                      {r.source === "watch" && <span title="来自 Apple Watch">⌚</span>}
                      {canEdit && (
                        <button
                          onClick={() => setEditingRecord(r)}
                          className="rounded-lg p-1.5 transition-opacity hover:opacity-80"
                          style={{ background: "var(--secondary)" }}
                          title="编辑详情"
                        >
                          <Pencil size={12} color="var(--muted-foreground)" />
                        </button>
                      )}
                      {(r.status === "skipped" || r.status === "snoozed") && r.date === today && (
                        <button
                          onClick={() => onDeleteRecord(r.id)}
                          className="rounded-lg px-2 py-1 transition-opacity hover:opacity-80"
                          style={{ background: "rgba(255,107,53,0.12)", border: "1px solid rgba(255,107,53,0.3)" }}
                          title="重新加入今日任务"
                        >
                          <span style={{ fontSize: 11, color: "var(--primary)", fontWeight: 500 }}>重做</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8, fontFamily: "'DM Mono', monospace" }}>
                    {new Date(r.completed_at ?? r.updated_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {editingRecord && (
        <RecordDetailEditor
          record={editingRecord}
          taskTitle={findTask(versions, editingRecord)?.task.title ?? "（已删除的任务）"}
          initial={editorInitial(editingRecord)}
          onSave={(patch) => onUpdateRecord(editingRecord.id, patch)}
          onClose={() => setEditingRecord(null)}
        />
      )}
    </>
  );
}
