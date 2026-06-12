import { Play } from "lucide-react";
import { WatchTrainingMode } from "./WatchTrainingMode";
import type { PlanTask, ActualExercise } from "../types";

interface WatchWidgetProps {
  remaining: number;
  total: number;
  trainingTask: PlanTask | null;
  onStartTraining: () => void;
  onTrainingComplete: (actual: ActualExercise[], durationMinutes: number) => void;
  onExitTraining: () => void;
  notification: { title: string; taskId: string } | null;
  onDismissNotification: () => void;
  onNotificationStart: (taskId: string) => void;
}

export function WatchWidget({
  remaining,
  total,
  trainingTask,
  onStartTraining,
  onTrainingComplete,
  onExitTraining,
  notification,
  onDismissNotification,
  onNotificationStart,
}: WatchWidgetProps) {
  const completed = total - remaining;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative rounded-[38px] overflow-hidden shadow-2xl"
        style={{
          width: 180,
          height: 216,
          background: "#1a1a1a",
          border: "2px solid rgba(255,255,255,0.1)",
          boxShadow: "0 0 0 6px #2a2a2a, 0 20px 60px rgba(0,0,0,0.8)",
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#888" }}>9:41</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#888" }}>●●●</span>
        </div>

        {trainingTask ? (
          <WatchTrainingMode
            task={trainingTask}
            onComplete={onTrainingComplete}
            onExit={onExitTraining}
          />
        ) : notification ? (
          <div className="absolute inset-0 flex flex-col justify-center px-3 pt-4 pb-3" style={{ background: "#1a1a1a" }}>
            <div className="rounded-2xl p-3" style={{ background: "#ff6b35" }}>
              <p style={{ fontSize: 11, color: "#fff", fontWeight: 600, lineHeight: 1.3 }}>🏋️ {notification.title}</p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>开始训练？</p>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { onNotificationStart(notification.taskId); onDismissNotification(); }}
                className="flex-1 rounded-xl py-2 text-center"
                style={{ background: "#4ade80", fontSize: 10, color: "#000", fontWeight: 600 }}
              >
                开始训练
              </button>
              <button
                onClick={onDismissNotification}
                className="flex-1 rounded-xl py-2 text-center"
                style={{ background: "#2a2a2a", fontSize: 10, color: "#888", fontWeight: 500 }}
              >
                稍后
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center px-3 pt-2 pb-4">
            <svg width={72} height={72} className="my-1">
              <circle cx={36} cy={36} r={r} fill="none" stroke="#2a2a2a" strokeWidth={5} />
              <circle
                cx={36} cy={36} r={r}
                fill="none" stroke="#ff6b35" strokeWidth={5}
                strokeDasharray={`${dash} ${circ}`}
                strokeLinecap="round"
                transform="rotate(-90 36 36)"
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
              <text x={36} y={39} textAnchor="middle" fill="#fff" style={{ fontSize: 14, fontWeight: 700, fontFamily: "Inter" }}>
                {remaining}
              </text>
            </svg>

            <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>今天剩余</p>
            <p style={{ fontSize: 18, color: "#fff", fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
              {remaining} 项
            </p>

            {remaining > 0 && (
              <button
                onClick={onStartTraining}
                className="mt-3 w-full rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                style={{ background: "#ff6b35", fontSize: 11, color: "#fff", fontWeight: 700 }}
              >
                <Play size={12} fill="#fff" />
                开始训练
              </button>
            )}
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: "#555", textAlign: "center" }}>Apple Watch 预览</p>
    </div>
  );
}
