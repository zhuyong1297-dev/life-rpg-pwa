# 地球 Online V2.0.0 技术规格

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
- `Activity.schedule` 支持每天和每周 N 次；任务可有计划日期。
- `Completion.status` 为 `active | undone`，保存可选成果备注。
- `LedgerEvent.kind` 为 `reward | correction | redemption`，保存 XP、金币和可选属性。
- 每个 reward event 使用确定性幂等键；correction 引用被撤销的 reward event。

## 4. 原子事务

### 完成

1. 校验活动、备注和当前有效完成。
2. 在 Dexie `rw` 事务中写入 completion。
3. 在同一事务写入 reward ledger event。
4. 事务提交后才触发界面反馈、振动和通知。

### 撤销

1. 找到有效 completion 和对应 reward event。
2. 在同一事务把 completion 标记为 `undone` 并追加反向 correction。
3. 不删除任何完成或账本记录。

### 兑换

1. 在事务内从账本求余额并校验。
2. 追加 `redemption` 负金币事件。

## 5. 导入导出

- JSON 备份包含 `schemaVersion`、`exportedAt` 和六张表的完整内容。
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
- fake-indexeddb：事务原子性、双击防重、撤销后重做、导入回滚。
- Playwright：完成证据、反馈速度、导航、响应式、备份恢复、离线启动和 PWA 资源。
- 发布前扫描源码、`dist` 和 Git 历史中的个人数据与凭据模式。

## 8. 失败策略

- 通知、振动或声音失败只影响附加反馈，不回滚已提交奖励。
- 数据写入失败不显示成功反馈。
- 导入失败保留导入前的全部数据并显示可理解的错误。
- Service Worker 更新失败时继续运行当前缓存版本。
