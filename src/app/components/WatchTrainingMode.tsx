import { useState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import type { PlanTask, ActualExercise } from "../types";

interface WatchTrainingModeProps {
  task: PlanTask;
  onComplete: (actual: ActualExercise[], durationMinutes: number) => void;
  onExit: () => void;
}

type Phase = "exercise" | "done";

export function WatchTrainingMode({ task, onComplete, onExit }: WatchTrainingModeProps) {
  const exercises = task.exercises ?? [];
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("exercise");
  const [startTime] = useState(Date.now());
  const [completed, setCompleted] = useState<ActualExercise[]>([]);

  const current = exercises[index];
  const total = exercises.length;

  useEffect(() => {
    if (exercises.length === 0) onExit();
  }, [exercises.length, onExit]);

  function finishExercise() {
    if (!current) return;
    const nextCompleted = [...completed, { name: current.name, sets: current.sets, reps: current.reps }];
    setCompleted(nextCompleted);

    if (index + 1 < total) {
      setIndex((i) => i + 1);
    } else {
      const durationMinutes = Math.max(1, Math.round((Date.now() - startTime) / 60000));
      setPhase("done");
      setTimeout(() => onComplete(nextCompleted, durationMinutes), 1800);
    }
  }

  if (!current) return null;

  const durationMinutes = Math.max(1, Math.round((Date.now() - startTime) / 60000));

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: "#1a1a1a" }}>
      {phase === "done" ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <CheckCircle2 size={36} color="#4ade80" />
          <p style={{ fontSize: 16, color: "#fff", fontWeight: 700, marginTop: 12 }}>训练完成</p>
          <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>耗时</p>
          <p style={{ fontSize: 22, color: "#ff6b35", fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
            {durationMinutes} 分钟
          </p>
        </div>
      ) : (
        <>
          <div className="px-4 pt-3 pb-1">
            <p style={{ fontSize: 9, color: "#666", fontFamily: "'DM Mono', monospace" }}>
              动作 {index + 1} / {total}
            </p>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
            <p style={{ fontSize: 11, color: "#ff6b35", fontWeight: 600, marginBottom: 4 }}>
              {task.title}
            </p>
            <p style={{ fontSize: 18, color: "#fff", fontWeight: 700, lineHeight: 1.3 }}>
              {current.name}
            </p>
            <p
              style={{
                fontSize: 28,
                color: "#fff",
                fontWeight: 700,
                fontFamily: "'DM Mono', monospace",
                marginTop: 12,
              }}
            >
              {current.sets} × {current.reps}
            </p>
          </div>

          <div className="px-3 pb-4 space-y-2">
            <button
              onClick={finishExercise}
              className="w-full rounded-xl py-3 text-center"
              style={{ background: "#4ade80", fontSize: 12, color: "#000", fontWeight: 700 }}
            >
              完成本动作
            </button>
            <button
              onClick={onExit}
              className="w-full rounded-xl py-2 text-center"
              style={{ background: "#2a2a2a", fontSize: 10, color: "#888" }}
            >
              退出
            </button>
          </div>
        </>
      )}
    </div>
  );
}
