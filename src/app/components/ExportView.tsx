import { useState } from "react";
import { Download, Copy, CheckCircle2 } from "lucide-react";
import type { PlanVersion, ExecutionRecord, DailyWellness } from "../types";
import { buildExportSummary, summarizeSets } from "../utils/plan";
import { formatDuration } from "../utils/date";
import { skipReasonLabel } from "./SetEditor";

interface ExportViewProps {
  plan: PlanVersion | null;
  versions: PlanVersion[];
  records: ExecutionRecord[];
  dailyWellness: DailyWellness[];
  today: string;
}

function taskTitle(versions: PlanVersion[], taskId: string): string {
  for (const v of [...versions].sort((a, b) => b.version - a.version)) {
    const t = v.tasks.find((x) => x.id === taskId);
    if (t) return t.title;
  }
  return taskId;
}

function buildJSON(
  plan: PlanVersion | null,
  records: ExecutionRecord[],
  dailyWellness: DailyWellness[],
  today: string
): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      today,
      plan: plan ?? null,
      execution_records: records,
      daily_wellness: dailyWellness,
      summary: buildExportSummary(plan, records, dailyWellness, today),
    },
    null,
    2
  );
}

function buildMarkdown(
  plan: PlanVersion | null,
  versions: PlanVersion[],
  records: ExecutionRecord[],
  dailyWellness: DailyWellness[],
  today: string
): string {
  const summary = buildExportSummary(plan, records, dailyWellness, today);
  const lines: string[] = [];
  lines.push(`# 训练执行报告`);
  lines.push(`\n导出时间：${new Date().toLocaleString("zh-CN")}\n`);

  if (plan) {
    lines.push(`## 训练计划：${plan.plan_name} V${plan.version}`);
    lines.push(`\n开始日期：${plan.start_date}`);
    if (plan.end_date) lines.push(`结束日期：${plan.end_date}`);
    lines.push(`\n任务数量：${plan.tasks.length} 个\n`);
  }

  lines.push(`## 执行摘要`);
  lines.push(`\n- 完成率：${summary.completion_rate}%`);
  lines.push(`- 完成 ${summary.completed_count} · 部分 ${summary.partial_count} · 跳过 ${summary.skipped_count} / 应完成 ${summary.scheduled_count}`);
  lines.push(`- 疼痛均值：${summary.pain_average}/10（最高 ${summary.pain_max}）`);
  lines.push(`- 疲劳均值：${summary.fatigue_average}/10`);
  if (summary.missed_tasks.length > 0) {
    lines.push(`- 遗漏任务：${summary.missed_tasks.length} 项`);
    for (const m of summary.missed_tasks.slice(0, 10)) {
      lines.push(`  - ${m}`);
    }
  }
  lines.push("");

  if (records.length > 0) {
    lines.push(`## 执行记录\n`);
    const byDate = records.reduce<Record<string, ExecutionRecord[]>>((acc, r) => {
      acc[r.date] = acc[r.date] ? [...acc[r.date], r] : [r];
      return acc;
    }, {});

    for (const date of Object.keys(byDate).sort((a, b) => b.localeCompare(a))) {
      lines.push(`### ${date}\n`);
      const wellness = dailyWellness.find((d) => d.date === date);
      if (wellness) lines.push(`今日疲劳：${wellness.fatigue_score}/10\n`);

      for (const r of byDate[date]) {
        const statusMap = { completed: "✅ 完成", partial: "🟡 部分完成", skipped: "❌ 跳过", snoozed: "⏰ 延后" };
        const reason = r.skip_reason ? `（${skipReasonLabel(r.skip_reason)}）` : "";
        lines.push(`**${taskTitle(versions, r.task_id)}** — ${statusMap[r.status]}${reason}`);
        if (r.sets && r.sets.length > 0) {
          lines.push("\n实际完成：");
          for (const a of summarizeSets(r.sets)) {
            const per = a.duration_sec !== undefined ? formatDuration(a.duration_sec) : `${a.reps}`;
            lines.push(`- ${a.name}: ${a.sets}×${per}${a.weight_kg ? ` @${a.weight_kg}kg` : ""}`);
          }
        }
        if (r.pain_score !== undefined) lines.push(`\n疼痛评分：${r.pain_score}/10`);
        if (r.notes) lines.push(`\n备注：${r.notes}`);
        lines.push("");
      }
    }
  }

  lines.push(`---\n*由 AI Training Planner 导出 · 将此报告提供给 AI 以生成下一版训练计划*`);
  return lines.join("\n");
}

type ExportFormat = "json" | "markdown";

export function ExportView({ plan, versions, records, dailyWellness, today }: ExportViewProps) {
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [copied, setCopied] = useState(false);

  const content =
    format === "json"
      ? buildJSON(plan, records, dailyWellness, today)
      : buildMarkdown(plan, versions, records, dailyWellness, today);

  function copy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const ext = format === "json" ? "json" : "md";
    const mime = format === "json" ? "application/json" : "text/markdown";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `training-report-${today}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const formatLabels: Record<ExportFormat, string> = {
    json: "JSON",
    markdown: "Markdown",
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <h2 style={{ color: "var(--foreground)" }}>导出执行记录</h2>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4 }}>
          备份或分享完整执行数据。给 AI 分析请用「分析」页
        </p>
      </div>

      <div className="flex rounded-2xl p-1 gap-1" style={{ background: "var(--secondary)" }}>
        {(["markdown", "json"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            className="flex-1 rounded-xl py-2 transition-all"
            style={{
              background: format === f ? "var(--primary)" : "transparent",
              color: format === f ? "var(--primary-foreground)" : "var(--muted-foreground)",
              fontSize: 12,
              fontWeight: format === f ? 600 : 400,
            }}
          >
            {formatLabels[f]}
          </button>
        ))}
      </div>

      {plan && (
        <div className="grid grid-cols-2 gap-2">
          {(() => {
            const s = buildExportSummary(plan, records, dailyWellness, today);
            return [
              { label: "完成率", value: `${s.completion_rate}%` },
              { label: "疼痛均值", value: `${s.pain_average}` },
              { label: "疲劳均值", value: `${s.fatigue_average}` },
              { label: "遗漏", value: `${s.missed_tasks.length} 项` },
            ].map((item) => (
              <div key={item.label} className="rounded-xl p-3 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: "var(--primary)", fontFamily: "'DM Mono', monospace" }}>{item.value}</p>
                <p style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{item.label}</p>
              </div>
            ));
          })()}
        </div>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--secondary)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>
            预览 · {records.length} 条记录
          </span>
          <div className="flex gap-2">
            <button
              onClick={copy}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-opacity hover:opacity-80"
              style={{ background: "var(--muted)", color: "var(--foreground)", fontSize: 12 }}
            >
              {copied ? <CheckCircle2 size={13} color="#4ade80" /> : <Copy size={13} />}
              {copied ? "已复制" : "复制"}
            </button>
            <button
              onClick={download}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-opacity hover:opacity-80"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontSize: 12 }}
            >
              <Download size={13} />
              下载
            </button>
          </div>
        </div>
        <pre
          className="p-4 overflow-auto"
          style={{
            maxHeight: 360,
            fontSize: 11,
            color: "var(--muted-foreground)",
            fontFamily: "'DM Mono', monospace",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {content}
        </pre>
      </div>

    </div>
  );
}
