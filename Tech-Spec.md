# 地球 Online V5.9.0 技术规格

## 1. 系统结构

应用是部署在 GitHub Pages 的静态 React PWA。所有用户数据保存在浏览器 IndexedDB，界面通过 Dexie 事务和快照读取。Service Worker 只负责静态资源缓存和完成通知，不执行定时提醒或业务写入。

`V5.9.0` 在兼容字段中增加旅者外观与每日习惯启动锚点，不新增数据表。正式版固定使用 `earth-online-v2`，预览版固定使用 `earth-online-preview-v2`，两者不自动读取或复制对方数据。Dexie 仍为 version 4、八张表，备份保持 JSON schema 12 并兼容 schema 1～11。

### 新手与反馈边界

- `ensureGrowthDomainsForEmptyDatabase` 只在七张用户数据表均为空且尚未启用领域体系时写入 `Meta.growthDomainSystem`；存在活动、完成、流水、奖励、奖励券、复盘或赛季时均不按全新数据库处理。
- `Meta.onboarding` 可选保存开始游戏日、第一项活动 ID 和安装/反馈提示时间；完成天数与活跃天数始终从有效 completion 派生。
- 快速创建调用既有活动事务，并在同一事务内建立新手状态；随机 ID、关键行为上限与活动 Schema 仍由数据层统一校验。
- 环境检测只使用 User-Agent 的微信标识、平台提示和 `display-mode: standalone`；不保存完整 User-Agent，也不把环境信息发送到网络。
- 邮件反馈正文由白名单字段构造：普通反馈只含版本与使用方式，七日体验才增加活跃天数和首项行动完成天数。`mailto:` 只交给本机邮件应用；复制回退只写入剪贴板，应用没有反馈 API 或遥测请求。

奖励预览是纯派生视图，不写入数据库：

- `getV5ActionRewardPreview` 根据活动目标、当前有效 completion 和分层快照返回本次奖励、可得范围、升级差额或已获奖励。
- `getV5WeeklyRewardPreview` 复用当前周有效进度与 `calculateIncrementalProgress`，未跨层时返回下一层所需次数或时间，跨层后返回净奖励。
- `getV5DailyRewardSummary` 从有效 `JourneyMonth` 行动条目汇总当前游戏日净 XP、金币和达标行动数；撤销与 correction 已在旅程派生层排除。
- 当前愿望进度只读取主目标价格和账本金币余额；完成行动不会自动锁定或兑换愿望。

每日习惯可保存可选 `scheduledTime: HH:mm`；旧活动仍可从 `cue` 中兼容识别时间。时间排序以 `04:00` 为零点，并按已到点、无固定时间、稍后派生。`Meta.todayActionPriority` 只保存当前游戏日最多 5 个无时间普通每日习惯 ID，不增加数据表或备份 schema。

## 2. 数据表

| 表 | 主键/索引 | 用途 |
|---|---|---|
| `activities` | `id`；`type`、`enabled`、`isKey` | 习惯和一次性任务定义 |
| `completions` | `id`；`activityId`、`occurredOn`、`status` | 完成与撤销状态 |
| `ledgerEvents` | `id`；`completionId`、`occurredOn`、`kind` | XP、领域经验和金币流水；旧事件保留旧属性 |
| `rewards` | `id`；`enabled` | 奖励商店 |
| `rewardClaims` | `id`；`rewardId`、`status`、`plannedFor` | 奖励预留、兑现、取消与轻复盘 |
| `weeklyReviews` | `id`；`weekStart` | 坚持率、帮助、阻力和决策 |
| `seasons` | `id`；`status`、`startsOn`、`endsOn` | 28 天赛季、活动快照、今日重点和本地建议 |
| `settings` | `key` | 本机偏好、版本信息、唯一目标规划草稿和独立 7 天 Application 试跑 |

## 3. 核心模型

- `Activity.type` 为 `habit | task`。
- 新 `Activity.domain` 使用 `health | learning | creation | career | life | mindset`；旧 `Activity.attribute` 仅在迁移前兼容读取，`difficulty` 保持四档难度。
- `Activity.schedule` 支持每天和每周 N 次；`goal.kind` 支持旧次数、旧时长、`tiered` 分层目标和仅限每日习惯的 `rating` 评分目标；任务可有计划日期。
- `rating` 保存固定 `scale: 5`、问题、1/3/5 分锚点和可选备注提示；问题与锚点限制 1～60 字。
- `Activity.cue` 与 `Activity.protocol` 可选保存触发条件和执行协议；它们随活动及赛季快照保存，但不参与计分。
- `Meta.travelerAppearance` 可选保存 `masculine | feminine`；缺失时视图回退男性。统一素材解析器按外观与四阶段返回透明 PNG，切换只写 Meta。
- 每日习惯可选保存 `habitFormation.configuredAt` 与 `time | event | after_activity` 锚点；其他活动类型保存该结构会被 Schema 拒绝。
- `after_activity` 只接受另一项启用且未归档的每日习惯。创建和编辑事务在写入前沿引用链检查自引用与任意深度循环，失败时整笔事务回滚。
- 旧 `scheduledTime` 优先解释为时间锚点；旧 `cue` 中的合法 `HH:mm` 继续解释为时间，其余文本解释为现实事件，旧记录不批量重写。
- 分层目标支持二元或三元阈值、纯次数、旧分钟、规范化秒级时间和组合目标；组合阈值保存次数与 `durationSeconds`。
- 每周纯次数和组合目标可保存 `progressMode: incremental`；组合目标同时保存默认时长和最多四个去重后的快捷时长选项，内部统一使用整数秒。
- `Activity.revision` 在每次完整编辑时递增；`archivedAt` 表示可恢复归档，归档活动必须同时关闭启用和关键状态。
- `tiered` 目标保存 `duration | count` 度量、共享单位和三个严格递增阈值。
- `Completion.status` 为 `active | undone`，新分层完成使用 `tierGoalSnapshot` 保存完整目标，评分完成使用 `ratingValue`、`ratingGoalSnapshot` 和可选 `ratingUpdatedAt`；V2.1/V2.2 的旧度量、单位和阈值快照继续兼容读取。
- `updateTodayRating` 仅更新当前游戏日最终评分、备注和修订时间，不访问 `ledgerEvents`；首次评分完成仍通过 `completeActivity` 原子写入 completion 与固定奖励流水。
- 逐次 completion 保存周期开始日、次数增量、实际时长、周期序号、请求 ID 和完整目标/领域/难度/版本快照；导入的旧层次进度带有 `imported` 标记。
- 周复盘为分层目标保存二元或三元层次分布，并可保存最低次数、最低时间秒数和次数单位；新条目同时保存可选标题与领域快照，旧条目保留属性快照。
- `LedgerEvent.kind` 为 `reward | correction | redemption | redemption_refund | milestone`，新事件保存 XP、金币和可选领域，旧事件保留可选属性。
- 每个 reward event 使用确定性幂等键；correction 引用被撤销的 reward event。
- `settings.meta.levelSystem` 保存启用时间、基线等级、历史最高等级、当前成长方向，以及每级里程碑的查看和礼券领取状态。
- `Reward` 可兼容保存愿望理由、现实成本、档位、WebP 图片和重复策略；缺少字段的旧商品处于待整理状态。
- `RewardClaim` 保存愿望、金币、预算和重复方式快照，状态为 `reserved | fulfilled | cancelled`；历史不随愿望编辑重写。
- `settings.rewardSystem` 保存主目标、候选队列、月额度、基金上限、可用额度和最后补充月份；旧 `meta.targetRewardId` 只用于迁移。
- `updateRewardBudget` 在 `settings + rewardClaims` 单个事务内先按旧配置结转到当前游戏月，再保存新的月额度和累计上限；新配置从下个游戏月起生效。新上限不得低于月额度，也不得低于当前可用基金与已预留奖励券预算之和。
- `preferences.feedbackIntensity` 为 `gentle | clear | strong`，旧数据默认 `clear`。
- `settings.meta.gameDayBoundaryActivatedAt` 保存 04:00 游戏日规则的启用时间；旧记录的 `occurredOn` 不迁移。
- `settings.meta.growthDomainSystem` 保存领域体系版本和启用时间；领域 XP 只汇总带 `domain` 的新流水，角色总 XP 和金币继续汇总全部流水。
- `settings.meta.releaseNotes` 可选保存最后确认的 SemVer 和首次确认时间；旧数据缺少字段时无需迁移，同版本重复确认保持首次时间。
- `Season` 固定覆盖 28 个游戏日，保存现实目标、开始状态、期望结果、1 至 3 项核心活动快照、每日重点、建议响应和最终现实证据。
- `Season.calibration` 保存一次性蓝图 ID、校准时间和旧赛季定义；`dailySignals` 保存每个游戏日唯一的起床达标、晨间精力、掌控感和真实记录时间。
- `CoachSuggestion` 保存周起始日、规则类型、依据、预期作用和用户响应；响应不会直接写入 `activities`。
- `settings.coachPlanDraft` 保存唯一目标规划草稿，区分复用现有活动和新建行为方案；草稿可处于 `editing` 或通过完整校验的 `ready` 状态。
- schema 1 知识行动包来源继续保存旧标题、稳定引用和短原则；schema 2 保存 `applicationId`、阶段、一个主原则、最多两个辅助知识、结果指标和导入时间；schema 3 进一步保留评分目标，不保存 Obsidian 全文。
- `settings.applicationTrial` 保存 7 天周期、知识上下文、现实目标、核心行为快照、原关键行为 ID 和用户阶段结论；不复制每日流水。
- `settings.applicationTrialRestart` 保存待启动修正方案与最早启动游戏日。激活事务归档原定义、创建新 ID、替换试跑快照并删除待启动方案；旧 completion 与 ledger 不改写。
- 知识应用赛季在既有 `Season` 上附加可选 `applicationContext`；结束时额外保存现实指标、用户决定和理由。普通旧赛季继续兼容。
- `Season.concludedOn`、`conclusionType` 和 `earlyConclusionReason` 记录实际结项；`endsOn` 始终保留原计划第 28 天。旧赛季缺少新字段时继续按计划结束日解释。
- `settings.meta.knowledgeActionImports` 最多保存 200 条已激活追溯记录，通过 `packageId → draftId → seasonId` 解释知识方案来源；活动模型和追加式流水不增加来源字段。
- `Season.sourcePlanId` 可选保存来源草稿 ID，用于双击启用的幂等判断；不改变赛季快照或历史解释。

## 4. 游戏日

- `gameDate(now)` 将设备本地时间减四小时后取 `YYYY-MM-DD`；真实 `createdAt`、`exportedAt` 和备份文件名不偏移。
- 首次升级若发生在 00:00 至 03:59，新规则从当日 04:00 生效；启用前继续使用自然日，避免同一夜被拆分。
- 每日完成、取消、任务到期、兑换、礼券、日志和复盘统一使用游戏日；周周期为周一 04:00 至下周一 03:59:59。
- React 在下一个 04:00 设置刷新定时器，并在页面从后台恢复时重新读取时间与快照；不创建后台结算流水。

## 5. 原子事务

### 成长领域迁移

1. 首次启动查询进行中、暂停、归档及仍可取消或重做的一次性活动，排除已经收尾的历史任务。
2. 界面按旧属性给出建议，但每项必须由用户显式选择；未全部确认前禁止提交，并显示首个未确认活动名称与定位操作。
3. 单个 Dexie `rw` 事务更新活动的 `domain`、同步当前赛季活动快照、写入领域体系启用时间并清除旧的当前成长方向；已结束赛季及旧完成、流水、复盘和里程碑不改写。
4. 事务失败时整体回滚；恢复不含领域启用状态的 schema 1 至 6 备份后重新进入向导。

### 完成

1. 校验活动、完成证据和当前有效 completion。
2. 两层完成按 `60%/100%`、三层按 `60%/80%/100%` 计算累计 XP，并在首次完成时发完整金币；目标秒数、次数和组合工作量不参与奖励计算。
3. 首次完成在同一 Dexie `rw` 事务写入 completion 和 reward event。
4. 同日升级更新 completion 的最高层次并追加 XP 差额事件，金币差额固定为零。
5. 用户点击完成时，在首个 IndexedDB `await` 前创建或恢复可复用 AudioContext；事务提交后才触发界面反馈、音效、振动和通知。

### 每周逐次累计

1. 只接受每周纯次数、次数乘每次时长和总次数加累计总时长目标；纯时间和每天目标继续直接选层。
2. 每次记录在单个 Dexie `rw` 事务中校验请求 ID、当前周周期、活动状态、快捷时长与周期快照，再追加一条 completion；请求 ID 重复时返回原结果。
3. 当前周第一条记录冻结目标、领域、难度和活动版本。后续记录即使活动已编辑，也继续使用冻结快照；新配置从下一周一 04:00 生效。
4. 系统从当前周期全部有效进度计算最高层次。未跨层不写零值流水；跨层只追加达到最高新层次所需的净 XP，金币只在本周第一次跨层时发放。
5. 撤销只允许当前周期最后一条有效进度，并为其关联奖励追加 correction；导入进度按整批撤销，重新记录后周净奖励仍受原上限约束。
6. 直接选层切换为逐次累计时，只在本周恰有一条旧分层完成时按该层阈值原位折算；多条旧完成不推断组成，延迟到下周启用。
7. 组合目标的记录入口只设置 React 弹层状态；用户点选活动已有的时长预设后，才调用既有 `recordIncrementalProgress` 事务。关闭弹层不产生 completion 或流水。

### 编辑与归档

1. 完整编辑只更新活动定义并递增 `revision`，不修改完成或账本。
2. 当前完成的层次升级使用 completion 快照；每周奖励额度只统计当前活动版本的完成。
3. 归档只写入 `archivedAt` 并关闭启用和关键状态；恢复清除 `archivedAt`，默认启用且不自动设为关键行为。
4. 归档接口同时支持习惯和未完成任务；已完成任务不需要归档。

### 永久移除活动定义

1. 只接受已归档活动，或完成游戏日早于当前游戏日的一次性任务；当前游戏日存在 active completion 时拒绝。
2. 在同一 Dexie 事务内为旧 completion 补齐名称、领域或旧属性、难度和版本快照，为旧 review item 补齐标题和分类快照。
3. 只删除 `activities` 记录，不修改 `completions`、`ledgerEvents` 或 `weeklyReviews`；活动已缺失时返回幂等成功结果。

### 撤销

1. 找到有效 completion 和全部关联 reward event。
2. 在同一事务把 completion 标记为 `undone`，并为首次奖励和升级差额分别追加反向 correction。
3. 不删除任何完成或账本记录。
4. 反馈层撤销不限制日期；完成记录中的持久取消只接受本地今天，且界面要求二次确认。

### 奖励锁定与兑现

1. `reserveRewardClaim` 在同一事务校验愿望、金币、冷却、基金和等级礼券，追加负金币 `redemption` 并写入奖励券；请求 ID 保证双击幂等。
2. `cancelRewardClaim` 只取消待兑现奖励券，追加等额 `redemption_refund`、释放预算，并在等级礼券来源时恢复里程碑可用状态。
3. `fulfillRewardClaim` 保存满足感和重复意愿；兑现不再次扣币，一次性愿望停用，等级礼券此时才追加零值 milestone 流水。
4. `applyRewardBudgetRollover` 只在访问时按 04:00 游戏月补充额度，连同已预留金额计算 1200 元总上限。

### 等级固化与礼券

1. 初始化等级系统时，以当前账本等级作为基线，不生成历史里程碑。
2. 完成反馈 10 秒后，以当前净 XP 和稳定截止时间内的 XP 共同判断新等级，防止撤销后仍固化。
3. 新等级只追加到 `settings.meta.levelSystem.milestones`；历史最高等级不随 XP 下降而回退。
4. 礼券先进入奖励券预留状态，兑现后更新 milestone 并追加 `milestone:level:<等级>` 流水；取消只清除预留，不消耗礼券。

### 赛季与建议

1. 创建赛季在单个事务中校验唯一活动赛季、1 至 3 项启用活动并保存完整活动快照。
2. 每周复盘在原事务中保存复盘，再针对与赛季重叠的周生成最多三条规则建议；重复保存同一周按确定性 ID 替换，不重复追加。
3. 接受、修改后接受或忽略只更新 `seasons.suggestions`；活动编辑和暂停仍由用户单独执行。
4. `completeSeason` 与 `completeApplicationSeason` 从第 1 天起可调用。提前结项必须填写原因；存在建议时至少一条状态不是 `pending`。完成事务保存实际日期和类型，重复同一请求返回同一结果。
5. 二次确认、不可恢复勾选和提交锁属于界面防误触；最终事务成功后不提供撤销。
6. 个人策略、坚持率、复盘和 Application 结果包统一使用 `concludedOn ?? endsOn` 作为有效结束日，不增加汇总表。

### 目标规划与启用

1. 一级路由和目标规划器使用原生 URL Hash：`#/today`、`#/character`、`#/review`、`#/settings`、`#/coach/plan`；不引入 React Router。
2. 规划器编辑采用 350ms 串行自动保存；刷新直接从 `settings.coachPlanDraft` 恢复，替换旧草稿需要二次确认。
3. `ready` 草稿必须包含四项现实结果、1 至 3 项已确认行为和两项现实检查；新行为只允许每天或每周习惯及有效分层目标。
4. 存在活动赛季时最终操作只写入 `ready` 草稿；不创建活动、不修改当前关键状态、赛季快照或账本。
5. 没有活动赛季时，单个 Dexie `rw` 事务校验复用活动、创建新活动、降级其他关键行为、创建 28 天赛季并删除草稿。
6. 新活动和赛季使用来源草稿派生的确定性 ID；重复启用先按 `sourcePlanId` 返回既有赛季，失败时事务整体回滚。
7. 如果草稿带有知识来源，激活事务在创建赛季后同步追加最小追溯记录；追溯写入、活动创建、关键行为切换、赛季创建和草稿删除属于同一个事务。

### 推荐模板

1. `starterHabitTemplates` 与 `starterPlanTemplates` 是匿名静态配置，加载和预览不执行 IndexedDB 写入或网络请求。
2. 十二项习惯必须通过现有 `ActivitySchema`；确认首项时复用新手原子事务，已有用户复用普通活动事务并明确写入 `isKey: false`。
3. 四套计划通过现有 `CoachPlanDraftSchema` 生成 `editing` 草稿，个人基线为空、所有新行为为 `confirmed: false`，不得绕过四步规划器。
4. 替换已有草稿复用 `saveCoachPlanDraft`；活动创建和赛季激活继续由现有事务负责，推荐模块不维护第二份进度或历史。

### 启动锚点推荐与复查

1. 今日推荐纯派生全部启用且未完成的每日习惯，分组顺序为已到时间、前置行动已有有效完成、事件或无锚点、尚未到时间；组内关键行动优先。
2. 前置行动任意有效层次均算触发；撤销后立即从完成 ID 集合消失。锚点未触发不参与 `completeActivity` 校验，因此始终允许手动完成。
3. 暂停、归档或删除前置活动不级联改写后续活动，视图显示“锚点需要调整”；恢复后重新按实时状态派生。
4. 七日复查从 `configuredAt` 所属游戏日起统计七个游戏日的唯一有效完成日期；不足七天或坚持率至少 60% 时不显示建议。
5. 修改锚点写入新的 `configuredAt` 并重启观察，标题等无关修改保留原时间；建议只提供用户可确认的选项，不执行事务。

### Obsidian 知识行动包

1. `KnowledgeActionPackageSchema` 使用独立常量 `packageType = earth-online.obsidian-knowledge-action`，并以 discriminated union 同时接受 schema 1 与 schema 2，不引用 `BackupSchema`。
2. schema 1 保持旧契约；schema 2 接受稳定 `packageId`、`applicationId`、`trial | season`、一主两辅知识、现实结果字段和 1 至 3 项行为，主知识必须是 `principle`。
3. 文件选择先运行 Zod 完整校验和只读预览；预览读取当前草稿、已激活 packageId、活动标题、关键行为数量和活动赛季，不执行写入。
4. `importKnowledgeActionPackage` 在独立 `rw` 事务内重新校验重复包和关键行为上限，只写一条 `settings.coachPlanDraft`；已有不同草稿时，用户在预览确认后原子替换，失败自动回滚。
5. 候选行为写入草稿时全部为 `confirmed: false`。导入器不调用 `createActivity`、`activateCoachPlanDraft` 或 `restoreBackup`。
6. 同名活动以规范化标题匹配并作为预览警告，用户在规划器中决定复用或修改；系统不自动绑定或创建替代项。
7. schema 2 `trial` 激活事务原子创建/复用行为、临时切换关键行为、写入 `settings.applicationTrial` 并删除草稿；严格设置 `endsOn = startsOn + 6`。
8. 试跑完成事务只允许第 7 个游戏日及以后执行，聚合完成数与活跃日，保存用户现实结果/决定/理由，并恢复仍有效的原关键行为。
9. schema 2 `season` 只有在同一 Application 的试跑已完成、决定为继续或调整且 `derivedFromResultPackageId` 匹配本机结果时可激活；随后复用既有 28 天 Season 事务。
10. 试跑或赛季进行中时允许导入并保存下一份草稿，但拒绝启动另一阶段；规划器完成确认后继续保存草稿，写入失败必须回滚活动、关键状态、草稿、试跑或赛季。
11. `earth-online.obsidian-planning-context / schema 1` 只导出当前阶段与最多三项关键行为定义；`earth-online.obsidian-application-result / schema 1` 只导出阶段边界、行为聚合、现实指标和用户决定，不得包含每日日期流水、XP、金币、愿望、奖励或账本。

### 赛季校准与每日状态

1. 校准仅接受活动赛季第 1 至 3 个游戏日且没有既有校准记录的赛季。
2. 单个 Dexie `rw` 事务保存旧赛季定义、取消全部旧关键状态、创建稳定生活三项习惯、重设 28 天日期和核心快照，并清除旧今日重点及未处理建议。
3. 相同蓝图的重复提交返回现有活动，不重复创建；事务任一步失败时全部回滚。
4. 每日状态按游戏日 upsert，同一天只保留一条且可以修改；评分只允许 1 至 5，状态不写账本。
5. schema 7 旧赛季可能没有 `dailySignals`；快照读取与状态写入均先通过 `SeasonSchema` 补齐默认数组，禁止直接对原始 Dexie 对象调用数组方法。
6. 初始化、快照读取和 PWA 更新路径不得调用校准事务；唯一入口是赛季弹层中的二次确认操作。

## 6. 导入导出

- 全量 Backup JSON 使用 `BackupSchema` 和 `restoreBackup`：schema 12 包含 `appVersion`、`exportedAt`、八张表、评分快照、愿望图片、奖励券、逐次进度、目标规划草稿、`settings.applicationTrial` 与待启动重启方案，并兼容读取 schema 1～11。
- Obsidian 行动包 v3、规划上下文 v2 和结果包 v2 保留评分目标；结果聚合只统计已评分日期，输出平均分、覆盖天数和 `5/7` 证据充分标记。
- `previewBackupRestore` 只解析 `BackupSchema` 并比较当前与备份的 XP、金币、活动、完成、赛季和奖励券数量，不写数据库；用户确认后仍复用原有 `restoreBackup` 原子整体恢复。
- 导入时校验主目标和候选队列必须指向启用愿望；旧备份恢复后奖励券为空，旧商品进入待整理。
- Zod 先在事务外校验结构和业务约束。
- 校验通过后在一个 `rw` 事务中清空并批量写入全部表；任何异常自动回滚。
- Application 行动包 JSON 使用 `KnowledgeActionPackageSchema` 和 `importKnowledgeActionPackage`，只生成规划草稿；阶段启动必须经过目标规划器和独立事务。
- 两类 JSON 通过不同的文件入口、`packageType`/`schemaVersion` 和确认文案区分；不得互相回退解析。
- Markdown 从当前账本派生，只用于人类阅读。

## 7. 界面架构

- 界面只从现有活动、完成和账本派生状态，不新增数据表或公共领域接口。
- V5 成长页使用独立旅者主卡：移动端按人物、等级进度、累计数值和重点领域排列，桌面端与下一奖励形成双栏；累计 XP 和金币不使用内嵌卡片，也不保留重复的阶段侧栏或底部总成长行。
- V5 每日工作台将“已达标”和“已封顶”分开派生：使用 completion 的 `tierGoalSnapshot` 判断下一层，未到最高层的每日行动继续留在首页并进入“可提升”视图；编辑后的活动定义不得改变当天既有完成的升级路径。
- `V5GrowthPage` 接收现有行动日志派生出的 `JourneyMonth[]`；领域详情纯函数截取含今天在内的最近 28 个游戏日，只汇总最终有效的同领域行动，并输出活跃天数、行动数、XP、前三贡献行动和最近八条记录。
- 领域详情复用按需弹层：手机为底部弹层，桌面为居中对话框；弹层锁定背景滚动、支持 `Escape`、焦点循环并在关闭后将焦点还给触发按钮。
- V5 交互令牌统一悬停背景、强调边框、焦点环、按下状态和短过渡；状态只作用于真实控件。触摸使用 `:active`，键盘使用 `:focus-visible`，减少动态效果时关闭位移和动画。
- `.v5-preview-shell` 是 V5 设计命名空间，并为暂时复用的 V4 控件提供同一交互状态，但不改变其数据事务或页面布局。
- 今天页手机端为单栏和五栏底部导航，中央创建按钮完全位于导航内部；桌面端为约 720px 任务主栏与 260 至 300px 状态右栏。
- 目标规划器和 `#/coach/library` 是隐藏主导航的全屏二级页；手机使用单栏页面，桌面使用受约束的居中工作区。
- 数据中心使用 `#/profile/data` 二级地址，主页面只保留上次备份时间摘要；备份导出、Obsidian 交换和危险恢复按风险分组。
- 今天页赛季摘要只派生当前第几天和今日重点，完整赛季、建议和策略库复用同一个按需弹层。
- 赛季弹层在前三天提供校准预览，并展示最近 7 天现实状态和三项核心行为完成日；每日状态表单是非阻塞的独立入口。
- 今天页活动卡片通过原生 `details` 按需展示 `cue` 和 `protocol`；夜间收尾成功且今日状态未记录时，在本次反馈上附加 `daily-signal` 后续动作。
- 复盘页只常驻建议数量摘要；透明依据、响应和策略历史不进入首屏长列表。
- 首页固定按关键行动、每日行动、本周进度、一次性任务排列；每日行动只接收非关键每日习惯，本周进度接收全部每周习惯并以关键优先的稳定顺序展示。
- 本周进度首页最多渲染三项，更多内容进入按需弹层；关键每周行动在关键区和周进度区各有一个派生视图，但完成、累计与奖励始终读取同一组 completion。
- 关键每周卡只常驻累计、下一层差额、详情与明确记录按钮；本周进度使用两或三个横向里程碑节点，目标、历史和撤销进入详情弹层。
- 组合逐次累计点击“选择时长”后打开手机底部弹层或桌面居中弹窗，点选预设值后立即记录；不再使用默认时长直写或独立箭头菜单。
- 设置页只渲染固定高度活动摘要；完整管理器的标签、搜索和展开状态均为 React 临时状态，不写入 IndexedDB。
- V5.9.0 更新说明复用统一焦点弹层：已有数据且未确认当前版本时每次启动提示，新空库不自动展示；“我的”保留手动入口。“稍后”不写库，“知道了”或直达功能入口时通过 `acknowledgeReleaseNotes` 原子合并 Meta。
- 创建表单通过原生 `details` 渐进展示成长领域和难度，并常驻领域定义与示例；分层目标先选择两层或三层，高级目标继续使用现有分段控件。
- 完成反馈使用 React 本地显示状态，约 1.2 秒后从奖励回执收缩为行动条；普通完成保留撤销，`daily-signal` 后续动作可将赛季弹层直接初始化为今日状态视图。
- 反馈总生命周期仍为 10 秒并与账本事务解耦；全局通知使用 `info | success | warning | error` 临时状态，不进入 IndexedDB。
- 完成音效由单例 Web Audio `AudioContext` 使用三角波合成；普通完成、层次升级、角色升级分别使用双音、三音、四音，峰值增益由统一三档强度控制，页面从后台恢复时调用 `resume()`。
- 振动与声音共享三档强度，并按普通完成、层次升级、角色升级使用不同节奏；设备拒绝测试请求时关闭对应开关。
- 角色页只常驻 88px 等级摘要、最近 7 天最多 3 条有效成长和约 104px 商店摘要；完整路线、月历行动日志和商店目录使用移动端底部弹层、桌面居中弹窗。
- `.attribute-grid` 在所有视口保持两列，430px 以下只缩小横向间距和单项内边距；Playwright 断言六项始终排列为两列三行且页面无横向溢出。
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
- fake-indexeddb：事务原子性、规划草稿保存与启用幂等、v1/v2 行动包校验、7 天试跑期限、提前结项边界、有效结束日聚合、恢复预览无写入和旧备份恢复。
- Playwright：Hash 刷新与返回、数据中心恢复预览、四步规划、v3 评分试跑预览、试跑修正重启与人工复盘、赛季结项确认、五栏导航、320px/Android/桌面响应式和离线启动。
- 推荐库测试覆盖十二项 Activity Schema、四套未确认规划草稿、预览无写入、确认幂等、旧草稿替换及进行中赛季边界。
- 启动锚点测试覆盖四种输入、旧时间兼容、04:00 排序、完成与撤销触发、自引用与多级循环拒绝、失效锚点和七日 60% 边界。
- 双旅者测试覆盖新用户未预选、旧用户回退男性、四阶段素材、设置切换以及 schema 12 备份往返。
- 更新说明测试覆盖新空库不打断、已有数据首次展示、稍后重启再提示、确认后不再自动展示、我的页重复查看和直达推荐库。
- 发布前扫描源码、`dist` 和 Git 历史中的个人数据与凭据模式。

## 10. 失败策略

- 通知、振动或声音失败只影响附加反馈，不回滚已提交奖励；音频不支持时声音开关保持关闭并显示提示。
- 数据写入失败不显示成功反馈。
- 导入失败保留导入前的全部数据并显示可理解的错误。
- Service Worker 更新失败时继续运行当前缓存版本。
