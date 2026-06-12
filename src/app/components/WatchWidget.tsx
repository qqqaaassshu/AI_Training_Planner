import { CheckCircle2, Circle } from "lucide-react";

interface WatchWidgetProps {
  completed: number;
  total: number;
  tasks: { id: string; title: string; done: boolean }[];
  onComplete: (id: string) => void;
  onSnooze: (id: string) => void;
  onSkip: (id: string) => void;
  notification: { title: string; taskId: string } | null;
  onDismissNotification: () => void;
}

export function WatchWidget({
  completed,
  total,
  tasks,
  onComplete,
  onSnooze,
  onSkip,
  notification,
  onDismissNotification,
}: WatchWidgetProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Watch body */}
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
        {/* Status bar */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#888" }}>9:41</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#888" }}>●●●</span>
        </div>

        {notification ? (
          /* Notification card */
          <div className="absolute inset-0 flex flex-col justify-center px-3 pt-4 pb-3" style={{ background: "#1a1a1a" }}>
            <div className="rounded-2xl p-3" style={{ background: "#ff6b35" }}>
              <p style={{ fontSize: 11, color: "#fff", fontWeight: 600, lineHeight: 1.3 }}>🏋️ {notification.title}</p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>开始执行？</p>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { onComplete(notification.taskId); onDismissNotification(); }}
                className="flex-1 rounded-xl py-2 text-center"
                style={{ background: "#4ade80", fontSize: 10, color: "#000", fontWeight: 600 }}
              >
                完成
              </button>
              <button
                onClick={() => { onSnooze(notification.taskId); onDismissNotification(); }}
                className="flex-1 rounded-xl py-2 text-center"
                style={{ background: "#2a2a2a", fontSize: 10, color: "#fff", fontWeight: 500 }}
              >
                延后
              </button>
              <button
                onClick={() => { onSkip(notification.taskId); onDismissNotification(); }}
                className="flex-1 rounded-xl py-2 text-center"
                style={{ background: "#2a2a2a", fontSize: 10, color: "#888", fontWeight: 500 }}
              >
                跳过
              </button>
            </div>
          </div>
        ) : (
          /* Normal watch face */
          <div className="flex flex-col items-center px-3 pt-2">
            {/* Ring */}
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
                {completed}/{total}
              </text>
            </svg>

            {/* Task list */}
            <div className="w-full space-y-1">
              {tasks.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  {t.done ? (
                    <CheckCircle2 size={12} color="#4ade80" />
                  ) : (
                    <Circle size={12} color="#555" />
                  )}
                  <span style={{ fontSize: 10, color: t.done ? "#666" : "#ddd", textDecoration: t.done ? "line-through" : "none" }}>
                    {t.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Crown / band hints */}
      <p style={{ fontSize: 11, color: "#555", textAlign: "center" }}>Apple Watch 预览</p>
    </div>
  );
}
