import type { ProfileChange, ProfileField, UserProfile } from "../types";

export const EXPERIENCE_LABEL: Record<NonNullable<UserProfile["experience"]>, string> = {
  none: "几乎没有训练经验",
  beginner: "入门（偶尔训练）",
  intermediate: "有一定基础（规律训练半年以上）",
  advanced: "经验丰富",
};

export const SEX_LABEL: Record<NonNullable<UserProfile["sex"]>, string> = {
  male: "男",
  female: "女",
  other: "不便透露",
};

export const PROFILE_FIELDS: { key: ProfileField; label: string; unit?: string }[] = [
  { key: "age_range", label: "年龄段" },
  { key: "sex", label: "性别" },
  { key: "height_cm", label: "身高", unit: "cm" },
  { key: "weight_kg", label: "体重", unit: "kg" },
  { key: "experience", label: "训练经验" },
  { key: "injuries", label: "伤病与身体限制" },
  { key: "available_time", label: "可训练时间" },
  { key: "equipment", label: "可用器械" },
  { key: "goals", label: "目标" },
  { key: "preferences", label: "偏好与其他" },
];

const norm = (v: unknown): string | number | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  return v as number;
};

/** 比较前后档案，生成变更记录 */
export function diffProfile(before: UserProfile, after: UserProfile, at: string): ProfileChange[] {
  const changes: ProfileChange[] = [];
  for (const { key } of PROFILE_FIELDS) {
    const from = norm(before[key]);
    const to = norm(after[key]);
    if (from === to) continue;
    const c: ProfileChange = { at, field: key };
    if (from !== undefined) c.from = from;
    if (to !== undefined) c.to = to;
    changes.push(c);
  }
  return changes;
}

export function displayValue(field: ProfileField, v: string | number | undefined): string {
  if (v === undefined || v === "") return "（空）";
  if (field === "experience") return EXPERIENCE_LABEL[v as keyof typeof EXPERIENCE_LABEL] ?? String(v);
  if (field === "sex") return SEX_LABEL[v as keyof typeof SEX_LABEL] ?? String(v);
  const unit = PROFILE_FIELDS.find((f) => f.key === field)?.unit;
  return unit ? `${v}${unit}` : String(v);
}

export function isProfileEmpty(p: UserProfile): boolean {
  return PROFILE_FIELDS.every(({ key }) => norm(p[key]) === undefined);
}

/** 写入系统提示词的档案文本；未填写的项省略 */
export function formatProfileForPrompt(p: UserProfile): string {
  const lines = PROFILE_FIELDS.flatMap(({ key, label }) => {
    const v = norm(p[key]);
    return v === undefined ? [] : [`- ${label}：${displayValue(key, v)}`];
  });
  return lines.length ? lines.join("\n") : "（用户未填写档案，请按保守的入门水平安排，并在 findings 中提醒补充档案）";
}
