# 地球 Online V2.3.0 技术规格

## 1. 系统结构

应用是部署在 GitHub Pages 的静态 React PWA。所有用户数据保存在浏览器 IndexedDB，界面通过 Dexie live query 读取。Service Worker 只负责静态资源缓存和完成通知，不执行定时提醒或业务写入。

## 2. 数据表

| 表 | 主键/索引 | 用途 |
|---|---|---|
| `activities` | `id`；`type`、`enabled`、`isKey` | 习惯和一次性任务定义 |
| `completions` | `id`；`activityId`、`occurredOn`、`status` | 完成与撤销状态 |
| `ledgerEvents` | `id`；`completionId`、`occurredOn`、`kind` | XP、属性经验和金币流水 |
| `rewards` | `id`；`enabled` | 奖励商店 |
| `weeklyReviews` | `id`；`weekStart` | 坚持率、帮助、阻力和决策 |
| `settings` | `key` | 本机偏好和版本信息 |

## 3. 核心模型

- `Activity.type` 为 `habit | task`。
- `Activity.attribute` 为六项属性之一，`difficulty` 为四档难度之一。
- `Activity.schedule` 支持每天和每周 N 次；`goal.kind` 支持旧次数、旧时长和 `tiered` 三层目标；任务可有计划日期。
- 三层目标支持纯次数、旧分钟、规范化秒级时间和组合目标；组合阈值保存次数与 `durationSeconds`。
- `Activity.revision` 在每次完整编辑时递增；`archivedAt` 表示可恢复归档，归档活动必须同时关闭启用和关键状态。
- `tiered` 目标保存 `duration | count` 度量、共享单位和三个严格递增阈值。
- `Completion.status` 为 `active | undone`，新三层完成使用 `tierGoalSnapshot` 保存完整目标；V2.1/V2.2 的旧度量、单位和阈值快照继续兼容读取。
- 周复盘为三层目标保存层次分布，并可保存最低次数、最低时间秒数和次数单位。
- `LedgerEvent.kind` 为 `reward | correction | redemption`，保存 XP、金币和可选属性。
- 每个 reward event 使用确定性幂等键；correction 引用被撤销的 reward event。

## 4. 原子事务

### 完成

1. 校验活动、完成证据和当前有效 completion。
2. 三层完成按 `60%/80%/100%` 计算累计 XP，并在首次完成时发完整金币；目标秒数、次数和组合工作量不参与奖励计算。
3. 首次完成在同一 Dexie `rw` 事务写入 completion 和 reward event。
4. 同日升级更新 completion 的最高层次并追加 XP 差额事件，金币差额固定为零。
5. 事务提交后才触发界面反馈、振动和通知。

### 编辑与归档

1. 完整编辑只更新活动定义并递增 `revision`，不修改完成或账本。
2. 当前完成的层次升级使用 completion 快照；每周奖励额度只统计当前活动版本的完成。
3. 归档只写入 `archivedAt` 并关闭启用和关键状态；恢复清除 `archivedAt`，默认启用且不自动设为关键行为。

### 撤销

1. 找到有效 completion 和全部关联 reward event。
2. 在同一事务把 completion 标记为 `undone`，并为首次奖励和升级差额分别追加反向 correction。
3. 不删除任何完成或账本记录。
4. 反馈层撤销不限制日期；完成记录中的持久取消只接受本地今天，且界面要求二次确认。

### 兑换

1. 在事务内从账本求余额并校验。
2. 追加 `redemption` 负金币事件。

## 5. 导入导出

- JSON schema 4 备份包含 `appVersion`、`exportedAt` 和六张表的完整内容，并兼容读取 schema 1～3。
- Zod 先在事务外校验结构和业务约束。
- 校验通过后在一个 `rw` 事务中清空并批量写入全部表；任何异常自动回滚。
- Markdown 从当前账本派生，只用于人类阅读。

## 6. PWA 与部署

- `vite-plugin-pwa` 生成 manifest 和 Workbox Service Worker。
- 预缓存入口、JS、CSS、manifest、图标和四阶段人物 PNG。
- Vite `base` 固定为 `/life-rpg-pwa/`。
- GitHub Actions 在 `main` 推送时安装、测试、构建并部署 `dist`。

## 7. 测试分层

- Vitest：奖励、等级、目标、关键行为上限、余额、撤销和幂等。
- fake-indexeddb：事务原子性、双击防重、秒级与组合目标奖励、旧快照升级、归档恢复、当天取消和导入回滚。
- Playwright：完成证据、反馈速度、导航、响应式、备份恢复、离线启动和 PWA 资源。
- 发布前扫描源码、`dist` 和 Git 历史中的个人数据与凭据模式。

## 8. 失败策略

- 通知、振动或声音失败只影响附加反馈，不回滚已提交奖励。
- 数据写入失败不显示成功反馈。
- 导入失败保留导入前的全部数据并显示可理解的错误。
- Service Worker 更新失败时继续运行当前缓存版本。
