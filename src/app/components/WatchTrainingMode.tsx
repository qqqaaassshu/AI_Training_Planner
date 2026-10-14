import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Minus, Plus } from "lucide-react";
import type { Exercise, PlanTask, SetLog } from "../types";
import { formatDuration } from "../utils/date";

interface WatchTrainingModeProps {
  task: PlanTask;
  exercises: Exercise[];
  onComplete: (sets: SetLog[], startedAt: string) => void;
  onExit: () => void;
}

type Phase = "set" | "rest" | "done";

const MONO = "'DM Mono', monospace";
const DEFAULT_REST_SEC = 60;

/**
 * 手表逐组训练：完成一组 → 组间休息倒计时 → 下一组。
 * 次数 / 时长可在完成前用 ± 调整（真机上对应表冠）。
 * 中途退出时，已完成的组会作为“部分完成”保存。
 */
export function WatchTrainingMode({ task, exercises, onComplete, onExit }: WatchTrainingModeProps) {
  const [startedAt] = useState(() => new Date().toISOString());
  const [exIndex, setExIndex] = useState(0);
  const [setIndex, setSetIndex] = useState(1);
  const [phase, setPhase] = useState<Phase>("set");
  const [logs, setLogs] = useState<SetLog[]>([]);
  const [restLeft, setRestLeft] = useState(0);
  const current = exercises[exIndex];
  const timed = current?.duration_sec !== undefined;
  const [value, setValue] = useState(() => (timed ? current.duration_sec! : current?.reps ?? 0));
  const finishedRef = useRef(false);

  useEffect(() => {
    if (exercises.length === 0) onExit();
  }, [exercises.length, onExit]);

  useEffect(() => {
    if (phase !== "rest") return;
    if (restLeft <= 0) {
      setPhase("set");
      return;
    }
    const t = setTimeout(() => setRestLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, restLeft]);

  function finish(finalLogs: SetLog[]) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase("done");
    setTimeout(() => onComplete(finalLogs, startedAt), 1500);
  }

  function completeSet() {
    if (!current) return;
    const log: SetLog = {
      exercise_id: current.id,
      exercise_name: current.name,
      set_index: setIndex,
      completed_at: new Date().toISOString(),
    };
    if (timed) log.duration_sec = value;
    else log.reps = value;
    if (current.weight_kg) log.weight_kg = current.weight_kg;
    const next = [...logs, log];
    setLogs(next);

    if (setIndex < current.sets) {
      setSetIndex(setIndex + 1);
    } else if (exIndex + 1 < exercises.length) {
      const nextEx = exercises[exIndex + 1];
      setExIndex(exIndex + 1);
      setSetIndex(1);
      setValue(nextEx.duration_sec ?? nextEx.reps ?? 0);
    } else {
      finish(next);
      return;
    }
    setRestLeft(current.rest_sec ?? DEFAULT_REST_SEC);
    setPhase("rest");
  }

  function exit() {
    if (logs.length > 0) finish(logs);
    else onExit();
  }

  if (!current) return null;

  const totalSets = exercises.reduce((n, e) => n + e.sets, 0);
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(startedAt)) / 60000));

  if (phase === "done") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center" style={{ background: "#1a1a1a" }}>
        <CheckCircle2 size={36} color="#4ade80" />
        <p style={{ fontSize: 16, color: "#fff", fontWeight: 700, marginTop: 12 }}>
          {logs.length < totalSets ? "已保存进度" : "训练完成"}
        </p>
        <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
          {logs.length}/{totalSets} 组 · {minutes} 分钟
        </p>
      </div>
    );
  }

  if (phase === "rest") {
    return (
      <div className="absolute inset-0 flex flex-col" style={{ background: "#1a1a1a" }}>
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <p style={{ fontSize: 11, color: "#888" }}>组间休息</p>
          <p style={{ fontSize: 34, color: "#4ade80", fontWeight: 700, fontFamily: MONO }}>{restLeft}</p>
          <p style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
            下一组：{current.name} 第 {setIndex}/{current.sets} 组
          </p>
        </div>
        <div className="px-3 pb-4">
          <button
            onClick={() => setRestLeft(0)}
            className="w-full rounded-xl py-2.5"
            style={{ background: "#2a2a2a", fontSize: 11, color: "#ccc", fontWeight: 600 }}
          >
            跳过休息
          </button>
        </div>
      </div>
    );
  }

  const step = timed ? 5 : 1;
  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: "#1a1a1a" }}>
      <div className="px-4 pt-3 pb-1 flex justify-between">
        <p style={{ fontSize: 9, color: "#666", fontFamily: MONO }}>
          动作 {exIndex + 1}/{exercises.length}
        </p>
        <p style={{ fontSize: 9, color: "#666", fontFamily: MONO }}>
          组 {setIndex}/{current.sets}
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-3 text-center">
        <p style={{ fontSize: 10, color: "#ff6b35", fontWeight: 600 }}>{task.title}</p>
        <p style={{ fontSize: 16, color: "#fff", fontWeight: 700, lineHeight: 1.3 }}>{current.name}</p>
        <div className="flex items-center gap-2 mt-2">
          <button onClick={() => setValue((v) => Math.max(0, v - step))} className="rounded-full p-1" style={{ background: "#2a2a2a" }}>
            <Minus size={12} color="#aaa" />
          </button>
          <p style={{ fontSize: 24, color: "#fff", fontWeight: 700, fontFamily: MONO, minWidth: 64 }}>
            {timed ? formatDuration(value) : value}
          </p>
          <button onClick={() => setValue((v) => v + step)} className="rounded-full p-1" style={{ background: "#2a2a2a" }}>
            <Plus size={12} color="#aaa" />
          </button>
        </div>
        {current.weight_kg ? <p style={{ fontSize: 10, color: "#888" }}>@{current.weight_kg}kg</p> : null}
      </div>

      <div className="px-3 pb-3 space-y-1.5">
        <button
          onClick={completeSet}
          className="w-full rounded-xl py-2.5 text-center"
          style={{ background: "#4ade80", fontSize: 12, color: "#000", fontWeight: 700 }}
        >
          完成本组
        </button>
        <button onClick={exit} className="w-full rounded-xl py-1.5 text-center" style={{ background: "#2a2a2a", fontSize: 10, color: "#888" }}>
          {logs.length > 0 ? "结束并保存" : "退出"}
        </button>
      </div>
    </div>
  );
}
