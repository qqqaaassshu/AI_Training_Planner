import { useState } from "react";
import { Download, Copy, CheckCircle2 } from "lucide-react";
import type { Plan, ExecutionRecord } from "../types";

interface ExportViewProps {
  plan: Plan | null;
  records: ExecutionRecord[];
}

function buildJSON(plan: Plan | null, records: ExecutionRecord[]): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      plan: plan ?? null,
      execution_records: records,
      summary: {
        total: records.length,
        completed: records.filter((r) => r.status === "completed").length,
        skipped: records.filter((r) => r.status === "skipped").length,
        completion_rate: records.length
          ? `${Math.round((records.filter((r) => r.status === "completed").length / records.length) * 100)}%`
          : "0%",
      },
    },
    null,
    2
  );
}

function buildMarkdown(plan: Plan | null, records: ExecutionRecord[]): string {
  const lines: string[] = [];
  lines.push(`# 训练执行报告`);
  lines.push(`\n导出时间：${new Date().toLocaleString("zh-CN")}\n`);

  if (plan) {
    lines.push(`## 训练计划：${plan.plan_name}`);
    lines.push(`\n开始日期：${plan.start_date}`);
    lines.push(`\n任务数量：${plan.tasks.length} 个\n`);
  }

  const completed = records.filter((r) => r.status === "completed").length;
  const skipped = records.filter((r) => r.status === "skipped").length;
  const rate = records.length ? Math.round((completed / records.length) * 100) : 0;

  lines.push(`## 执行摘要`);
  lines.push(`\n- 总记录：${records.length} 条`);
  lines.push(`- 完成：${completed} 次`);
  lines.push(`- 跳过：${skipped} 次`);
  lines.push(`- 完成率：${rate}%\n`);

  if (records.length > 0) {
    lines.push(`## 执行记录\n`);
    // Group by date
    const byDate = records.reduce<Record<string, ExecutionRecord[]>>((acc, r) => {
      acc[r.date] = acc[r.date] ? [...acc[r.date], r] : [r];
      return acc;
    }, {});

    for (const date of Object.keys(byDate).sort((a, b) => b.localeCompare(a))) {
      lines.push(`### ${date}\n`);
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
        if (r.notes) lines.push(`\n备注：${r.notes}`);
        lines.push("");
      }
    }
  }

  lines.push(`---\n*由 AI Training Planner 导出 · 将此报告提供给 AI 以生成下一版训练计划*`);
  return lines.join("\n");
}

export function ExportView({ plan, records }: ExportViewProps) {
  const [format, setFormat] = useState<"json" | "markdown">("json");
  const [copied, setCopied] = useState(false);

  const content = format === "json" ? buildJSON(plan, records) : buildMarkdown(plan, records);

  function copy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `training-report-${new Date().toISOString().slice(0, 10)}.${format === "json" ? "json" : "md"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <h2 style={{ color: "var(--foreground)" }}>导出执行记录</h2>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4 }}>
          将执行数据交给 AI，生成下一版训练计划
        </p>
      </div>

      {/* Format selector */}
      <div className="flex rounded-2xl p-1 gap-1" style={{ background: "var(--secondary)" }}>
        {(["json", "markdown"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            className="flex-1 rounded-xl py-2 transition-all"
            style={{
              background: format === f ? "var(--primary)" : "transparent",
              color: format === f ? "var(--primary-foreground)" : "var(--muted-foreground)",
              fontSize: 13,
              fontWeight: format === f ? 600 : 400,
            }}
          >
            {f === "json" ? "JSON（AI 分析）" : "Markdown（人工查看）"}
          </button>
        ))}
      </div>

      {/* Preview */}
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
          💡 <strong style={{ color: "var(--foreground)" }}>下一步：</strong> 复制上方内容，粘贴给 ChatGPT 或 Claude，告诉 AI：
          "这是我的训练执行记录，请根据完成情况调整下一周的训练计划。"
        </p>
      </div>
    </div>
  );
}
