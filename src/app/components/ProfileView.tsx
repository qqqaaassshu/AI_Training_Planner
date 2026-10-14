import { useState } from "react";
import { ArrowLeft, Check, History, UserRound } from "lucide-react";
import type { ProfileChange, UserProfile } from "../types";
import { diffProfile, displayValue, EXPERIENCE_LABEL, PROFILE_FIELDS, SEX_LABEL } from "../utils/profile";

const card = { background: "var(--card)", border: "1px solid var(--border)" } as const;
const fieldStyle = {
  background: "var(--input-background)",
  color: "var(--foreground)",
  border: "1px solid var(--border)",
  fontSize: 13,
} as const;

const AGE_RANGES = ["18-29", "30-39", "40-49", "50-59", "60+"];

interface ProfileViewProps {
  profile: UserProfile;
  history: ProfileChange[];
  onSave: (p: UserProfile) => void;
  onClose: () => void;
}

function Label({ text, hint }: { text: string; hint?: string }) {
  return (
    <span className="block" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
      {text}
      {hint && <span style={{ opacity: 0.7 }}> · {hint}</span>}
    </span>
  );
}

function TextArea({ value, onChange, placeholder }: { value?: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <textarea
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="w-full rounded-xl px-3 py-2 resize-none outline-none"
      style={{ ...fieldStyle, lineHeight: 1.6 }}
    />
  );
}

export function ProfileView({ profile, history, onSave, onClose }: ProfileViewProps) {
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<UserProfile>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };
  const num = (v: string) => (v === "" ? undefined : Math.max(0, Number(v)));
  const pending = diffProfile(profile, draft, "");

  const byDate = [...history].reverse().reduce<{ date: string; items: ProfileChange[] }[]>((acc, c) => {
    const date = new Date(c.at).toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" });
    const last = acc[acc.length - 1];
    if (last && last.date === date) last.items.push(c);
    else acc.push({ date, items: [c] });
    return acc;
  }, []);

  return (
    <div className="space-y-4">
      <button onClick={onClose} className="flex items-center gap-1" style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
        <ArrowLeft size={14} />
        返回
      </button>

      <div className="rounded-2xl p-4" style={card}>
        <div className="flex items-center gap-2">
          <UserRound size={18} color="var(--primary)" />
          <h2 style={{ color: "var(--foreground)" }}>个人档案</h2>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.6 }}>
          AI 分析时会参考这些信息安排动作和强度。只需填写你愿意提供的部分，每次修改都会记入变更记录，帮助 AI 了解你的状态变化。
        </p>
      </div>

      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <p style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 600 }}>基本情况</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <Label text="年龄段" />
            <select value={draft.age_range ?? ""} onChange={(e) => set({ age_range: e.target.value || undefined })} className="w-full rounded-xl px-3 py-2 outline-none" style={fieldStyle}>
              <option value="">未填写</option>
              {AGE_RANGES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <Label text="性别" />
            <select
              value={draft.sex ?? ""}
              onChange={(e) => set({ sex: (e.target.value || undefined) as UserProfile["sex"] })}
              className="w-full rounded-xl px-3 py-2 outline-none"
              style={fieldStyle}
            >
              <option value="">未填写</option>
              {Object.entries(SEX_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <Label text="身高 cm" />
            <input type="number" value={draft.height_cm ?? ""} onChange={(e) => set({ height_cm: num(e.target.value) })} className="w-full rounded-xl px-3 py-2 outline-none" style={fieldStyle} />
          </label>
          <label className="block space-y-1">
            <Label text="体重 kg" />
            <input type="number" step={0.1} value={draft.weight_kg ?? ""} onChange={(e) => set({ weight_kg: num(e.target.value) })} className="w-full rounded-xl px-3 py-2 outline-none" style={fieldStyle} />
          </label>
        </div>
        <label className="block space-y-1">
          <Label text="训练经验" />
          <select
            value={draft.experience ?? ""}
            onChange={(e) => set({ experience: (e.target.value || undefined) as UserProfile["experience"] })}
            className="w-full rounded-xl px-3 py-2 outline-none"
            style={fieldStyle}
          >
            <option value="">未填写</option>
            {Object.entries(EXPERIENCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <p style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 600 }}>训练条件</p>
        <label className="block space-y-1">
          <Label text="伤病与身体限制" hint="AI 会避开相关动作" />
          <TextArea value={draft.injuries} onChange={(v) => set({ injuries: v })} placeholder="例如：右手腕扭伤恢复中，避免手腕负重；膝盖久蹲不适" />
        </label>
        <label className="block space-y-1">
          <Label text="可训练时间" />
          <TextArea value={draft.available_time} onChange={(v) => set({ available_time: v })} placeholder="例如：工作日 21:00 后约 20 分钟；周末上午可练 40 分钟" />
        </label>
        <label className="block space-y-1">
          <Label text="可用器械" />
          <TextArea value={draft.equipment} onChange={(v) => set({ equipment: v })} placeholder="例如：无器械 / 瑜伽垫、弹力带、一对 5kg 哑铃" />
        </label>
      </div>

      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <p style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 600 }}>目标与偏好</p>
        <label className="block space-y-1">
          <Label text="目标" />
          <TextArea value={draft.goals} onChange={(v) => set({ goals: v })} placeholder="例如：改善睡眠、恢复体能、能轻松抱娃爬楼" />
        </label>
        <label className="block space-y-1">
          <Label text="偏好与其他" />
          <TextArea value={draft.preferences} onChange={(v) => set({ preferences: v })} placeholder="例如：不喜欢跳跃动作；晚上练太累会影响睡眠" />
        </label>
      </div>

      <button
        onClick={() => {
          onSave(draft);
          setSaved(true);
        }}
        disabled={pending.length === 0}
        className="w-full rounded-2xl py-3 flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontWeight: 600 }}
      >
        <Check size={16} />
        {saved && pending.length === 0 ? "已保存" : pending.length > 0 ? `保存（${pending.length} 项修改）` : "没有修改"}
      </button>

      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <div className="flex items-center gap-2">
          <History size={15} color="var(--muted-foreground)" />
          <p style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 600 }}>变更记录</p>
        </div>
        {byDate.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>保存后，每次修改都会记录在这里</p>
        ) : (
          byDate.map((g) => (
            <div key={g.date} className="space-y-1">
              <p style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{g.date}</p>
              {g.items.map((c, i) => (
                <p key={i} style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.6 }}>
                  <span style={{ color: "var(--muted-foreground)" }}>{PROFILE_FIELDS.find((f) => f.key === c.field)?.label}：</span>
                  {c.from !== undefined && (
                    <>
                      <span style={{ textDecoration: "line-through", opacity: 0.6 }}>{displayValue(c.field, c.from)}</span>
                      {" → "}
                    </>
                  )}
                  {displayValue(c.field, c.to)}
                </p>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
