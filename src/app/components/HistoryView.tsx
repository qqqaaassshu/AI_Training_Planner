import { useState } from "react";
import { CheckCircle2, SkipForward, Clock, Pencil, Plus, Trash2, Check, X } from "lucide-react";
import type { PlanVersion, ExecutionRecord, ActualExercise, DailyWellness } from "../types";

interface HistoryViewProps {
  plan: PlanVersion | null;
  records: ExecutionRecord[];
  dailyWellness: DailyWellness[];
  onUpdateRecord: (id: string, patch: Partial<ExecutionRecord>) => void;
  onDeleteRecord: (id: string) => void;
}

function statusIcon(status: ExecutionRecord["status"]) {
  if (status === "completed") return <CheckCircle2 size={16} color="#4ade80" />;
  if (status === "skipped") return <SkipForward size={16} color="#666" />;
  return <Clock size={16} color="#f59e0b" />;
}

function statusLabel(status: ExecutionRecord["status"]) {
  if (status === "completed") return "完成";
  if (status === "skipped") return "跳过";
  return "延后";
}

function statusColor(status: ExecutionRecord["status"]) {
  if (status === "completed") return "#4ade80";
  if (status === "skipped") return "#555";
  return "#f59e0b";
}

interface RecordDetailEditorProps {
  record: ExecutionRecord;
  taskTitle: string;
  plannedExercises?: { name: string; sets: number; reps: number }[];
  onSave: (patch: Partial<ExecutionRecord>) => void;
  onClose: () => void;
}

function RecordDetailEditor({ record, taskTitle, plannedExercises, onSave, onClose }: RecordDetailEditorProps) {
  const [actual, setActual] = useState<ActualExercise[]>(
    record.actual && record.actual.length > 0
      ? record.actual
      : plannedExercises?.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps })) ?? []
  );
  const [notes, setNotes] = useState(record.notes ?? "");
  const [newName, setNewName] = useState("");

  function updateItem(i: number, field: keyof ActualExercise, value: string | number) {
    setActual((prev) => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a));
  }

  function removeItem(i: number) {
    setActual((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addItem() {
    const name = newName.trim() || "自定义动作";
    setActual((prev) => [...prev, { name, sets: 3, reps: 10 }]);
    setNewName("");
  }

  function save() {
    onSave({ actual, notes });
    onClose();
  }

  return (
    <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl p-5 space-y-4"
        style={{ background: "var(--card)", border: "1px solid var(--border)", maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center -mt-1 mb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border)" }} />
        </div>

        <div className="flex items-center justify-between">
          <h3 style={{ color: "var(--foreground)" }}>{taskTitle}</h3>
          <button onClick={onClose}>
            <X size={18} color="var(--muted-foreground)" />
          </button>
        </div>

        {/* Exercise list */}
        <div className="space-y-2">
          <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>实际完成动作</p>

          {actual.map((a, i) => (
            <div key={i} className="rounded-xl p-3" style={{ background: "var(--secondary)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={a.name}
                  onChange={(e) => updateItem(i, "name", e.target.value)}
                  className="flex-1 rounded-lg px-2 py-1 outline-none"
                  style={{ background: "var(--muted)", color: "var(--foreground)", fontSize: 13, border: "1px solid var(--border)" }}
                />
                <button onClick={() => removeItem(i)}>
                  <Trash2 size={14} color="#666" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>组数</span>
                  <input
                    type="number"
                    value={a.sets}
                    onChange={(e) => updateItem(i, "sets", parseInt(e.target.value) || 0)}
                    className="w-14 text-center rounded-lg py-1 outline-none"
                    style={{ background: "var(--muted)", color: "var(--foreground)", fontSize: 13, border: "1px solid var(--border)", fontFamily: "'DM Mono', monospace" }}
                  />
                </div>
                <span style={{ color: "var(--muted-foreground)" }}>×</span>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>次数</span>
                  <input
                    type="number"
                    value={a.reps}
                    onChange={(e) => updateItem(i, "reps", parseInt(e.target.value) || 0)}
                    className="w-14 text-center rounded-lg py-1 outline-none"
                    style={{ background: "var(--muted)", color: "var(--foreground)", fontSize: 13, border: "1px solid var(--border)", fontFamily: "'DM Mono', monospace" }}
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Add new exercise */}
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="添加动作名称…"
              className="flex-1 rounded-xl px-3 py-2 outline-none"
              style={{ background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)", fontSize: 13 }}
            />
            <button
              onClick={addItem}
              className="rounded-xl px-3 py-2 flex items-center gap-1"
              style={{ background: "var(--secondary)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Notes */}
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

export function HistoryView({ plan, records, dailyWellness, onUpdateRecord, onDeleteRecord }: HistoryViewProps) {
  const [editingRecord, setEditingRecord] = useState<ExecutionRecord | null>(null);
  const todayStr = new Date().toISOString().slice(0, 10);

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

  function getTask(taskId: string) {
    return plan?.tasks.find((t) => t.id === taskId);
  }

  const completed = records.filter((r) => r.status === "completed").length;
  const skipped = records.filter((r) => r.status === "skipped").length;
  const rate = records.length > 0 ? Math.round((completed / records.length) * 100) : 0;

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
                {new Date(date).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })}
              </p>
              {dailyWellness.find((d) => d.date === date) && (
                <p style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                  疲劳 {dailyWellness.find((d) => d.date === date)!.fatigue_score}/10
                </p>
              )}
            </div>
            {byDate[date].map((r) => {
              const task = getTask(r.task_id);
              const taskTitle = task?.title ?? r.task_id;

              return (
                <div key={r.id} className="rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-0.5">{statusIcon(r.status)}</div>
                      <div className="flex-1">
                        <p style={{ color: "var(--foreground)", fontWeight: 500, fontSize: 14 }}>{taskTitle}</p>

                        {/* Exercise details */}
                        {r.actual && r.actual.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {r.actual.map((a, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{a.name}</span>
                                <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#4ade80" }}>
                                  {a.sets}×{a.reps}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : r.status === "completed" && task?.type === "workout" && (
                          <button
                            onClick={() => setEditingRecord(r)}
                            className="mt-2 flex items-center gap-1 rounded-lg px-2 py-1 transition-opacity hover:opacity-80"
                            style={{ background: "var(--secondary)", border: "1px dashed rgba(255,107,53,0.4)" }}
                          >
                            <Plus size={11} color="var(--primary)" />
                            <span style={{ fontSize: 11, color: "var(--primary)" }}>填写实际动作</span>
                          </button>
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
                      <span style={{ fontSize: 12, color: statusColor(r.status), fontWeight: 500 }}>
                        {statusLabel(r.status)}
                      </span>
                      {r.status === "completed" && (
                        <button
                          onClick={() => setEditingRecord(r)}
                          className="rounded-lg p-1.5 transition-opacity hover:opacity-80"
                          style={{ background: "var(--secondary)" }}
                          title="编辑详情"
                        >
                          <Pencil size={12} color="var(--muted-foreground)" />
                        </button>
                      )}
                      {r.status === "skipped" && r.date === todayStr && (
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
                    {new Date(r.completed_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
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
          taskTitle={getTask(editingRecord.task_id)?.title ?? editingRecord.task_id}
          plannedExercises={getTask(editingRecord.task_id)?.exercises}
          onSave={(patch) => onUpdateRecord(editingRecord.id, patch)}
          onClose={() => setEditingRecord(null)}
        />
      )}
    </>
  );
}
