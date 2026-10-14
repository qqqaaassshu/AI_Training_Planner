# iPhone / Apple Watch 开发计划

新仓库：`qqqaaassshu/AI_Training_Planner_iOS`。本仓库（网页原型）是需求、数据格式和测试用例的参考来源。

## 已确定的决定

- 原生 SwiftUI；iPhone 与 Watch 共用 `TrainingCore` Swift Package
- 最低版本：iOS 17 / watchOS 10（SwiftData）
- 数据格式沿用 `docs/data-model.md` 与 `src/app/schema/*.schema.json`（v2）
- 核心逻辑的测试用例移植自 `src/app/utils/__tests__/`，保证两端结果一致
- AI：Anthropic 走官方接口，其他服务走 OpenAI 兼容接口；API Key 存钥匙串，手表不保存 Key

## 硬性要求：到点手表必须自动震动提醒

三层保障：

1. **手表自己安排本地通知（主力）**：提醒由 Watch App 通过 `UNUserNotificationCenter` 安排，不依赖 iPhone 转发（iPhone 解锁使用时通知不会转到手表）。手机不重复安排同一提醒。通知使用 `interruptionLevel = .timeSensitive`（需开启 Time Sensitive Notifications 能力）。每个 App 最多 64 条待发通知：只排未来若干天，在打开 App、后台刷新（`WKApplicationRefreshBackgroundTask`）、收到手机同步的新计划时滚动续排。
2. **训练任务的闹钟式强提醒**：`WKExtendedRuntimeSession`（智能闹钟会话，需开启对应后台模式），用 `start(at:)` 排到训练时间，到点调用 `notifyUser(hapticType:repeatHandler:)` 反复震动，直到用户点“开始”或“稍后”。同一时间只能排一个且须在前台安排，所以只用于“下一次训练”，每次打开 App 或完成训练后重排。
3. **训练中**：`HKWorkoutSession` 保持后台运行，组间休息结束时用 `WKInterfaceDevice.current().play(_:)` 震动。

系统限制（App 无法绕过，需在 App 内检测并提示用户）：手表需佩戴且解锁；勿扰、影院模式、睡眠专注会压制普通通知（时效性通知可穿透普通专注模式，需用户允许）；Critical Alerts 需苹果特批，健身类基本拿不到；通知权限被关闭时引导用户开启。

## 阶段

| 阶段 | 内容 | 验证 |
|---|---|---|
| 1 | `TrainingCore`：模型、日期、统计、版本对比、自然语言解析、校验、AI 提示词与服务适配、**提醒排程逻辑**（要提醒哪些任务、64 条上限下的滚动窗口、下一次强提醒时间），连同测试 | Linux 上 `swift test`（需允许 `download.swift.org`） |
| 2 | iPhone：导入计划、今日任务、逐个动作打勾、历史；SwiftData | Mac + Xcode |
| 3 | Watch：逐组训练、休息倒计时、表冠调整、HKWorkoutSession、WatchConnectivity 同步、三层提醒 | Mac + 真机 |
| 4 | AI 分析、个人档案、通知操作（完成/稍后）、表盘复杂功能 | Mac + 真机 |

## 新会话开始前的环境要求

- 会话同时选择两个仓库：`AI_Training_Planner_iOS`（主）与 `AI_Training_Planner`（参考）
- 环境网络允许 `download.swift.org`（安装 Swift 6.x Linux 工具链，Ubuntu 24.04）
- Claude GitHub App 的仓库访问范围包含 `AI_Training_Planner_iOS`
