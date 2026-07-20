# 地球 Online V2.6.0 技术规格

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
- `Activity.schedule` 支持每天和每周 N 次；`goal.kind` 支持旧次数、旧时长和 `tiered` 分层目标；任务可有计划日期。
- 分层目标支持二元或三元阈值、纯次数、旧分钟、规范化秒级时间和组合目标；组合阈值保存次数与 `durationSeconds`。
- `Activity.revision` 在每次完整编辑时递增；`archivedAt` 表示可恢复归档，归档活动必须同时关闭启用和关键状态。
- `tiered` 目标保存 `duration | count` 度量、共享单位和三个严格递增阈值。
- `Completion.status` 为 `active | undone`，新分层完成使用 `tierGoalSnapshot` 保存完整目标；V2.1/V2.2 的旧度量、单位和阈值快照继续兼容读取。
- 周复盘为分层目标保存二元或三元层次分布，并可保存最低次数、最低时间秒数和次数单位。
- `LedgerEvent.kind` 为 `reward | correction | redemption | milestone`，保存 XP、金币和可选属性；milestone 礼券流水固定为零 XP、零金币。
- 每个 reward event 使用确定性幂等键；correction 引用被撤销的 reward event。
- `settings.meta.levelSystem` 保存启用时间、基线等级、历史最高等级、当前成长方向，以及每级里程碑的查看和礼券领取状态。
- `settings.meta.targetRewardId` 可选保存唯一当前奖励目标；`preferences.feedbackIntensity` 为 `gentle | clear | strong`，旧数据默认 `clear`。
- `settings.meta.gameDayBoundaryActivatedAt` 保存 04:00 游戏日规则的启用时间；旧记录的 `occurredOn` 不迁移。

## 4. 游戏日

- `gameDate(now)` 将设备本地时间减四小时后取 `YYYY-MM-DD`；真实 `createdAt`、`exportedAt` 和备份文件名不偏移。
- 首次升级若发生在 00:00 至 03:59，新规则从当日 04:00 生效；启用前继续使用自然日，避免同一夜被拆分。
- 每日完成、取消、任务到期、兑换、礼券、日志和复盘统一使用游戏日；周周期为周一 04:00 至下周一 03:59:59。
- React 在下一个 04:00 设置刷新定时器，并在页面从后台恢复时重新读取时间与快照；不创建后台结算流水。

## 5. 原子事务

### 完成

1. 校验活动、完成证据和当前有效 completion。
2. 两层完成按 `60%/100%`、三层按 `60%/80%/100%` 计算累计 XP，并在首次完成时发完整金币；目标秒数、次数和组合工作量不参与奖励计算。
3. 首次完成在同一 Dexie `rw` 事务写入 completion 和 reward event。
4. 同日升级更新 completion 的最高层次并追加 XP 差额事件，金币差额固定为零。
5. 用户点击完成时，在首个 IndexedDB `await` 前创建或恢复可复用 AudioContext；事务提交后才触发界面反馈、音效、振动和通知。

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
3. 商品新增和编辑校验名称与正整数价格；停用不删除商品或历史流水，并在同一事务清除失效的当前目标。

### 等级固化与礼券

1. 初始化等级系统时，以当前账本等级作为基线，不生成历史里程碑。
2. 完成反馈 10 秒后，以当前净 XP 和稳定截止时间内的 XP 共同判断新等级，防止撤销后仍固化。
3. 新等级只追加到 `settings.meta.levelSystem.milestones`；历史最高等级不随 XP 下降而回退。
4. 礼券领取在一个 Dexie 事务中校验节点、奖励额度和幂等键，同时更新 milestone 并追加 `milestone:level:<等级>` 流水。

## 6. 导入导出

- JSON schema 5 备份包含 `appVersion`、`exportedAt` 和六张表的完整内容，接受 V2.5.0 与 V2.6.0 并兼容读取 schema 1～4；恢复旧备份时保留当前设备的游戏日启用状态。
- 导入时校验当前奖励目标必须指向启用商品。
- Zod 先在事务外校验结构和业务约束。
- 校验通过后在一个 `rw` 事务中清空并批量写入全部表；任何异常自动回滚。
- Markdown 从当前账本派生，只用于人类阅读。

## 7. 界面架构

- 界面只从现有活动、完成和账本派生状态，不新增数据表或公共领域接口。
- 今天页手机端为单栏和五栏底部导航，中央创建按钮完全位于导航内部；桌面端为约 720px 任务主栏与 260 至 300px 状态右栏。
- 关键行动渲染为委托任务条，普通习惯和一次性任务复用紧凑行组件。
- 创建表单通过原生 `details` 渐进展示属性和难度；分层目标先选择两层或三层，高级目标继续使用现有分段控件。
- 完成反馈使用 React 本地显示状态和 CSS 收缩动画；10 秒撤销窗口与账本事务保持解耦。
- 反馈层默认不截获指针事件，只有撤销按钮可点击；弹窗层级高于反馈层，收缩态为右侧完成按钮保留空间。
- 完成音效由单例 Web Audio `AudioContext` 使用三角波合成；普通完成、层次升级、角色升级分别使用双音、三音、四音，峰值增益由统一三档强度控制，页面从后台恢复时调用 `resume()`。
- 振动与声音共享三档强度，并按普通完成、层次升级、角色升级使用不同节奏；设备拒绝测试请求时关闭对应开关。
- 角色页只常驻 88px 等级摘要、最近 7 天最多 3 条有效成长和约 104px 商店摘要；完整路线、月历行动日志和商店目录使用移动端底部弹层、桌面居中弹窗。
- 行动日志从 active completion、未被 correction 抵消的 reward 与等级里程碑派生；同一 completion 的层次奖励合并，撤销记录和普通兑换不进入界面，不新增汇总表。
- 所有非必要动画在 `prefers-reduced-motion: reduce` 下缩短到近似无动画。

## 8. PWA 与部署

- `vite-plugin-pwa` 生成 manifest 和 Workbox Service Worker。
- 预缓存入口、JS、CSS、manifest、图标和四阶段人物 PNG。
- 正式版 Vite `base` 为 `/life-rpg-pwa/`，由 `main` 构建；预览版为 `/life-rpg-pwa/preview/`，由 `ui-redesign` 构建。
- 预览版使用独立数据库 `earth-online-preview-v2`、独立 manifest 和更具体的 Service Worker scope；正式版 Service Worker 明确排除 `/preview/` 导航。
- 任一分支推送时，GitHub Actions 分别测试并构建两个分支，再组合为一个 Pages 产物；预览失败不得覆盖正式站点。

## 9. 测试分层

- Vitest：奖励、等级路线、游戏日边界、有效行动日志、两/三层目标、三档 Web Audio 与振动、关键行为上限、余额、撤销和幂等。
- fake-indexeddb：事务原子性、游戏日过渡、商品管理、里程碑固化、双击防重、旧快照升级、当前游戏日取消和 schema 1～5 导入回滚。
- Playwright：两/三层选级、完成证据、2/3/4 音语义、月历行动日志、商品管理、五栏移动导航、响应式、离线启动和 PWA 资源。
- 发布前扫描源码、`dist` 和 Git 历史中的个人数据与凭据模式。

## 10. 失败策略

- 通知、振动或声音失败只影响附加反馈，不回滚已提交奖励；音频不支持时声音开关保持关闭并显示提示。
- 数据写入失败不显示成功反馈。
- 导入失败保留导入前的全部数据并显示可理解的错误。
- Service Worker 更新失败时继续运行当前缓存版本。
