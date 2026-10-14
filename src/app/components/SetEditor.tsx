import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Exercise, SetLog, SkipReason } from "../types";
import { formatExerciseTarget, summarizeSets, type SetSummary } from "../utils/plan";
import { formatDuration } from "../utils/date";
import { newId } from "../utils/id";

const MONO = "'DM Mono', monospace";
const inputStyle = {
  background: "var(--muted)",
  color: "var(--foreground)",
  fontSize: 13,
  border: "1px solid var(--border)",
  fontFamily: MONO,
} as const;

export function summariesFromPlan(exercises: Exercise[]): SetSummary[] {
  return exercises.map((e) => ({
    exercise_id: e.id,
    name: e.name,
    sets: e.sets,
    reps: e.duration_sec === undefined ? e.reps : undefined,
    duration_sec: e.duration_sec,
    weight_kg: e.weight_kg,
  }));
}

function NumField({ label, value, onChange, width = 48 }: { label: string; value: number | undefined; onChange: (v: number) => void; width?: number }) {
  return (
    <label className="flex items-center gap-1.5">
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{label}</span>
      <input
        type="number"
        min={0}
        value={value ?? ""}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="text-center rounded-lg py-1 outline-none"
        style={{ ...inputStyle, width }}
      />
    </label>
  );
}

interface SetEditorProps {
  items: SetSummary[];
  onChange: (items: SetSummary[]) => void;
  /** 计划目标，用于提示 */
  planned?: Exercise[];
  /** 允许改名 / 增删动作（补录时使用） */
  editable?: boolean;
}

/** 按动作编辑实际完成的组数、次数或时长、重量 */
export function SetEditor({ items, onChange, planned, editable }: SetEditorProps) {
  const [newName, setNewName] = useState("");
  const set = (i: number, patch: Partial<SetSummary>) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  function add() {
    onChange([...items, { exercise_id: newId(), name: newName.trim() || "自定义动作", sets: 3, reps: 10 }]);
    setNewName("");
  }

  return (
    <div className="space-y-2">
      {items.map((it, i) => {
        const target = planned?.find((p) => p.id === it.exercise_id);
        const timed = it.duration_sec !== undefined;
        return (
          <div key={it.exercise_id} className="rounded-xl p-3" style={{ background: "var(--secondary)" }}>
            <div className="flex items-center justify-between gap-2 mb-2">
              {editable ? (
                <input
                  value={it.name}
                  onChange={(e) => set(i, { name: e.target.value })}
                  className="flex-1 rounded-lg px-2 py-1 outline-none"
                  style={{ ...inputStyle, fontFamily: "inherit" }}
                />
              ) : (
                <span style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>{it.name}</span>
              )}
              {target && (
                <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: MONO }}>
                  计划 {formatExerciseTarget(target)}
                </span>
              )}
              {editable && (
                <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} title="删除">
                  <Trash2 size={14} color="#666" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <NumField label="组数" value={it.sets} onChange={(v) => set(i, { sets: v })} />
              {timed ? (
                <NumField label="秒/组" value={it.duration_sec} onChange={(v) => set(i, { duration_sec: v })} width={56} />
              ) : (
                <NumField label="次/组" value={it.reps} onChange={(v) => set(i, { reps: v })} />
              )}
              <NumField label="kg" value={it.weight_kg} onChange={(v) => set(i, { weight_kg: v || undefined })} width={52} />
            </div>
          </div>
        );
      })}

      {editable && (
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="添加动作名称…"
            className="flex-1 rounded-xl px-3 py-2 outline-none"
            style={{ background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)", fontSize: 13 }}
          />
          <button
            onClick={add}
            className="rounded-xl px-3 py-2 flex items-center gap-1"
            style={{ background: "var(--secondary)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
          >
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/** 只读展示组记录 */
export function SetList({ sets }: { sets: SetLog[] }) {
  return (
    <div className="space-y-1">
      {summarizeSets(sets).map((s) => (
        <div key={s.exercise_id} className="flex items-center justify-between">
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{s.name}</span>
          <span style={{ fontSize: 12, color: "#4ade80", fontFamily: MONO }}>
            {s.sets}×{s.duration_sec !== undefined ? formatDuration(s.duration_sec) : s.reps}
            {s.weight_kg ? ` @${s.weight_kg}kg` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export const SKIP_REASONS: { id: SkipReason; label: string }[] = [
  { id: "pain", label: "疼痛" },
  { id: "no_time", label: "没时间" },
  { id: "sick", label: "生病" },
  { id: "other", label: "其他" },
];

export function skipReasonLabel(r: SkipReason | undefined): string {
  return SKIP_REASONS.find((x) => x.id === r)?.label ?? "";
}
