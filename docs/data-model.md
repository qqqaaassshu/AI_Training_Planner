# 数据模型 v2

这份文档是网页原型、未来 iOS / watchOS App 和 AI 之间共用的数据约定。

| 位置 | 内容 |
|---|---|
| `src/app/types.ts` | TypeScript 类型定义（以此为准） |
| `src/app/schema/plan.schema.json` | 计划格式 JSON Schema：导入计划、AI 输出的建议计划 |
| `src/app/schema/ai-analysis.schema.json` | AI 分析结果 JSON Schema：API 返回或手动粘贴回来 |
| `src/app/fixtures/samplePlan.json` | 示例计划，测试会同时用 JSON Schema 和代码校验它 |
| `src/app/utils/__tests__/` | 核心逻辑测试，移植到 Swift 时可作为对照用例 |

## 通用约定

- **日期**：`date`、`start_date`、`end_date` 均为本地日期 `YYYY-MM-DD`，按计划的 `timezone` 解释。不要用 UTC 日期（`toISOString().slice(0, 10)`），否则在 UTC+8 早上 8 点前会记到前一天。
- **时间戳**：所有 `*_at` 字段为 ISO 8601 格式。
- **id**：一律为字符串，新生成的 id 使用 UUID。
- **星期**：`0` = 周日 … `6` = 周六，与 JS `getDay()` 一致。注意 Swift `Calendar.component(.weekday)` 是 1 = 周日，需要减 1。
- **格式版本**：`schema_version` 当前为 `"2.0"`。

## 实体

```
PlanVersion 1 ── * PlanTask 1 ── * Exercise
                       │  └── * TaskPhase ── * Exercise   （按周渐进）
                       │
ExecutionRecord * ─────┘（task_id，跨版本稳定）
       └── * SetLog（每组一条）

DailyWellness（每天一条）
AIAnalysis ── suggested_plan → 接受后生成新的 PlanVersion（source = ai_analysis）
```

### PlanVersion：计划版本
- 每次导入或接受 AI 建议，都会生成一个新版本，`version` 依次 +1，`parent_version_id` 指向当前版本。
- `source` 记录来源：`json_import` / `nl_import` / `ai_analysis` / `manual`。
- `change_note` 是相对上一版的调整说明，一般由 AI 填写。

### PlanTask：任务
- **`id` 跨版本保持不变**。导入时，如果新任务的 id 在上一版不存在，App 会按标题匹配上一版的任务并沿用其 id；动作按名称匹配，沿用动作 id（`reconcileIds`）。所以自然语言导入或 AI 没带 id 时，版本对比和历史统计仍然是连续的。
- `schedule`：`daily: true`，或 `weekday: [1,3,5]`；`time` 是 `HH:mm` 格式的提醒时间。
- `phases`：第 `week_from`～`week_to` 周（含）用 `phases.exercises` 覆盖默认动作。周数从 `start_date` 起算，第 1 天属于第 1 周。

### Exercise：动作
- `reps`（每组次数）和 `duration_sec`（每组时长，秒）二选一。
- 可选字段：`weight_kg`（重量）、`rest_sec`（组间休息，手表倒计时用，默认 60 秒）、`cue`（动作要点）。

### ExecutionRecord：执行记录
- 每个任务每天最多一条记录，再次提交时覆盖原记录（保留原 id）。
- `status` 的取值：
  - `completed`：完成。
  - `partial`：实际组数少于计划组数时自动判定为部分完成。
  - `skipped`：跳过，同时记录 `skip_reason`（`pain` 疼痛 / `no_time` 没时间 / `sick` 生病 / `other` 其他）。
  - `snoozed`：延后，当天仍可再完成。
- `sets`：按组记录，每组一条 `SetLog`。`exercise_name` 冗余保存动作名，计划变更后记录依然可读。
- `plan_version_id`：记录完成时所用的计划版本。
- `source`：`phone` / `watch`。
- `health_workout_id`：预留，对应 HealthKit 训练记录的 UUID。

### AIAnalysis：AI 分析
- `kind`：`session_feedback`（单次训练反馈）/ `weekly_review`（每周复盘）/ `plan_adjustment`（计划调整）/ `alert`（异常提醒）。
- `channel`：`api`（App 直接调用模型）/ `manual_import`（导出后手动粘贴回来）。两种来源使用同一份输出格式（`ai-analysis.schema.json`）。
- `suggested_plan` 必须由用户确认后才会生成新版本，App 不会自动替换计划。

## 统计口径（`buildExportSummary`）

- 统计范围：从计划开始日期到今天，并截断在计划的起止日期之内。
- 过去的日期：所有排期任务都计入"应完成"。
- 今天：只有已有记录（完成、部分完成或跳过）的任务才计入，还没做的不算遗漏。
- 完成率 = (completed × 1 + partial × 0.5) / 应完成数。
- 遗漏：过去日期中既没有完成、也没有跳过的任务。跳过单独统计，并按原因计数。

## 迁移到 Swift 的对应关系

| 原型 | iOS / watchOS |
|---|---|
| `localStorage`（`utils/storage.ts`） | SwiftData |
| API Key 存在 localStorage | 钥匙串（Keychain），手表上不保存 Key |
| `WatchTrainingMode` 中的 ± 按钮 | 数码表冠 |
| 手表训练结束时写入记录 | 通过 `HKWorkoutSession` 训练，经 WatchConnectivity 同步到手机 |
| `source` / `updated_at` | 多设备同步时用于解决冲突 |

## AI 分析流程

```
执行数据 → buildAnalysisInput（共用） ─┬─ 导出：复制提示词 → 外部 AI → 粘贴回复 ─┐
                                      └─ API：runApiAnalysis → 服务商适配层 ─────┤
                                                                               ↓
                    parseAnalysisReply（按 JSON Schema 校验） → AnalysisCard 显示差异 → 用户确认 → 新的 PlanVersion
```

| 文件 | 作用 |
|---|---|
| `utils/analysis.ts` | 构建分析输入、提示词（含两份 JSON Schema）、解析回复；`detectAlerts` 本地安全规则 |
| `utils/ai/presets.ts` | 服务预设：Anthropic、OpenAI、DeepSeek、通义千问、Kimi、智谱、豆包、Ollama、自定义（OpenAI 兼容） |
| `utils/ai/providers.ts` | 按接口格式调用：Anthropic 用官方 SDK（默认 `claude-opus-5-5`，开启服务端拒绝时自动换模型重试）；其他走 OpenAI 兼容 `/chat/completions`。统一处理超时、错误提示、测试连接 |
| `utils/ai/run.ts` | 通过 API 运行一次分析并校验结果；手动分析和每周自动复盘共用 |

- **隐私**：第一次通过 API 调用前需要用户同意；默认不发送文字备注，可单独勾选。
- **本地安全规则**（`detectAlerts`，不依赖 AI）：近 7 天疼痛 ≥ 7 判为风险；连续两次疼痛 ≥ 5、因疼痛跳过 ≥ 2 次、跳过 ≥ 3 次、连续多日疲劳 ≥ 7 判为提醒。
- **多服务配置**（`AISettings.services`）：可保存多个服务，选一个为当前服务。每个服务可设置名称、接口格式、接口地址、模型、最大输出、超时、温度、JSON 模式、额外请求头。API Key 按服务 id 单独保存，不随状态导出。旧版单服务设置会自动迁移。
- **每周自动复盘**：需要开启开关、已同意数据上传、已配置 Key；距上次复盘满 7 天时，打开 App 会运行一次。

### 个人档案与提示词（PROMPT_VERSION = 2）

- **UserProfile**（右上角头像进入）：年龄段、性别、身高、体重、训练经验、伤病与身体限制、可训练时间、可用器械、目标、偏好。每次保存会对比前后差异，记入 `ProfileChange`（字段、旧值、新值、时间）。
- **系统提示词** = 教练调整规则 + 安全规则 + 输出风格 + 用户档案 + 输出格式（JSON Schema）。档案很少变化，因此系统提示词基本稳定，便于服务商缓存。
- **用户消息** = 任务类型 + 本次补充说明（可选） + 执行数据 JSON。执行数据中新增：
  - `plan_history`：最近 5 个版本，包括每版相对上一版的具体变化、`change_note`，以及该版本使用期间（从创建到下一版创建前一天）的完成率、跳过次数、疼痛均值和最高值、疲劳均值。AI 据此判断上次调整是否有效。
  - `profile_changes`：最近 10 条档案变更。
- 每条 `AIAnalysis` 记录 `prompt_version` 和 `user_note`，便于以后对比不同提示词版本的效果。
