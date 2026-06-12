import { useState } from "react";
import { Download, Copy, CheckCircle2 } from "lucide-react";
import type { PlanVersion, ExecutionRecord, DailyWellness } from "../types";
import { buildExportSummary } from "../utils/plan";

interface ExportViewProps {
  plan: PlanVersion | null;
  records: ExecutionRecord[];
  dailyWellness: DailyWellness[];
}

function buildJSON(
  plan: PlanVersion | null,
  records: ExecutionRecord[],
  dailyWellness: DailyWellness[]
): string {
  const summary = buildExportSummary(plan, records, dailyWellness);
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      plan: plan ?? null,
      execution_records: records,
      daily_wellness: dailyWellness,
      summary: {
        ...summary,
        total: records.length,
        completed: records.filter((r) => r.status === "completed").length,
        skipped: records.filter((r) => r.status === "skipped").length,
      },
    },
    null,
    2
  );
}

function buildMarkdown(
  plan: PlanVersion | null,
  records: ExecutionRecord[],
  dailyWellness: DailyWellness[]
): string {
  const summary = buildExportSummary(plan, records, dailyWellness);
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
  lines.push(`- 疼痛均值：${summary.pain_average}/10`);
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
        const taskTitle = plan?.tasks.find((t) => t.id === r.task_id)?.title ?? r.task_id;
        const statusMap = { completed: "✅ 完成", skipped: "❌ 跳过", snoozed: "⏰ 延后" };
        lines.push(`**${taskTitle}** — ${statusMap[r.status]}`);
        if (r.actual && r.actual.length > 0) {
          lines.push("\n实际完成：");
          for (const a of r.actual) {
            lines.push(`- ${a.name}: ${a.sets}×${a.reps}`);
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

function buildAIPrompt(
  plan: PlanVersion | null,
  records: ExecutionRecord[],
  dailyWellness: DailyWellness[]
): string {
  const summary = buildExportSummary(plan, records, dailyWellness);
  const dataPayload = {
    plan: plan
      ? {
          plan_name: plan.plan_name,
          version: plan.version,
          start_date: plan.start_date,
          end_date: plan.end_date,
          ai_summary: plan.ai_summary,
          tasks: plan.tasks,
        }
      : null,
    execution_records: records,
    daily_wellness: dailyWellness,
    summary,
  };

  const goals = plan?.ai_summary
    ? plan.ai_summary.split(/[，,、]/).map((s) => s.trim()).filter(Boolean)
    : ["改善睡眠", "恢复手腕", "提升体能"];

  const goalLines = goals.map((g) => g).join("\n");

  return `请分析我的训练执行情况。

目标：

${goalLines}

以下是执行数据：

${JSON.stringify(dataPayload, null, 2)}

请输出：

1. 执行分析
2. 风险分析
3. 下一版训练计划
4. 是否需要调整恢复策略`;
}

type ExportFormat = "json" | "markdown" | "ai-prompt";

export function ExportView({ plan, records, dailyWellness }: ExportViewProps) {
  const [format, setFormat] = useState<ExportFormat>("ai-prompt");
  const [copied, setCopied] = useState(false);

  const content =
    format === "json"
      ? buildJSON(plan, records, dailyWellness)
      : format === "markdown"
        ? buildMarkdown(plan, records, dailyWellness)
        : buildAIPrompt(plan, records, dailyWellness);

  function copy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const ext = format === "json" ? "json" : format === "markdown" ? "md" : "txt";
    const mime =
      format === "json" ? "application/json" : format === "markdown" ? "text/markdown" : "text/plain";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `training-report-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const formatLabels: Record<ExportFormat, string> = {
    json: "JSON",
    markdown: "Markdown",
    "ai-prompt": "AI Prompt",
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <h2 style={{ color: "var(--foreground)" }}>导出执行记录</h2>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4 }}>
          将执行数据交给 AI，生成下一版训练计划
        </p>
      </div>

      <div className="flex rounded-2xl p-1 gap-1" style={{ background: "var(--secondary)" }}>
        {(["ai-prompt", "json", "markdown"] as const).map((f) => (
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
            const s = buildExportSummary(plan, records, dailyWellness);
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

      <div className="rounded-2xl p-4" style={{ background: "var(--secondary)", border: "1px solid var(--border)" }}>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
          💡 <strong style={{ color: "var(--foreground)" }}>AI Prompt 模式：</strong> 一键复制完整提示词，粘贴给 ChatGPT 或 Claude，自动包含执行数据、疼痛/疲劳统计与遗漏任务分析。
        </p>
      </div>
    </div>
  );
}
