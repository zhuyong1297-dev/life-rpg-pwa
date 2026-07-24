import { z } from 'zod'

export const attributes = ['体魄', '智识', '专注', '创造', '关系', '心境'] as const
export const growthDomains = ['health', 'learning', 'creation', 'career', 'life', 'mindset'] as const
export const difficulties = ['简单', '普通', '困难', 'Boss'] as const
export const reviewDecisions = ['保留', '调整', '暂停'] as const
export const tierLevels = [1, 2, 3] as const
export const tierLabels = { 1: '基础', 2: '标准', 3: '突破' } as const
export const timeInputUnits = ['秒', '分钟'] as const
export const combinedModes = ['per_occurrence', 'total'] as const

export type Attribute = (typeof attributes)[number]
export type GrowthDomain = (typeof growthDomains)[number]
export type Difficulty = (typeof difficulties)[number]
export type ReviewDecision = (typeof reviewDecisions)[number]
export type TierLevel = (typeof tierLevels)[number]
export type TierMetric = 'duration' | 'count'
export type TimeInputUnit = (typeof timeInputUnits)[number]
export type CombinedMode = (typeof combinedModes)[number]
export type ProgressMode = 'incremental'

export const growthDomainDetails: Record<GrowthDomain, { label: string; description: string; examples: string; identity: string }> = {
  health: { label: '健康', description: '改善身体状态与恢复能力', examples: '运动、睡眠、饮食、卫生', identity: '你正在照顾并增强自己的身体' },
  learning: { label: '学习', description: '理解知识并练习可迁移的技能', examples: '阅读、课程、复习、技能练习', identity: '你正在把知识变成真正的能力' },
  creation: { label: '创作', description: '把想法转化为可以看见的作品', examples: '写作、绘画、制作内容、个人作品', identity: '你正在把想法变成作品' },
  career: { label: '事业', description: '推进工作交付、职业发展与收入', examples: '完成项目、客户工作、职业规划', identity: '你正在推进长期事业' },
  life: { label: '生活', description: '改善环境、财务、行政和日常秩序', examples: '整理房间、记账、处理事务', identity: '你正在建立更有秩序的生活' },
  mindset: { label: '心境', description: '调节情绪、反思并恢复心理状态', examples: '日记、冥想、呼吸练习', identity: '你正在培养稳定而清醒的内在状态' },
}

export const legacyDomainSuggestions: Record<Attribute, GrowthDomain> = {
  体魄: 'health',
  智识: 'learning',
  专注: 'career',
  创造: 'creation',
  关系: 'life',
  心境: 'mindset',
}

export function domainLabel(domain: GrowthDomain) {
  return growthDomainDetails[domain].label
}

export const rewardTable: Record<Difficulty, { xp: number; coins: number }> = {
  简单: { xp: 5, coins: 2 },
  普通: { xp: 10, coins: 5 },
  困难: { xp: 20, coins: 10 },
  Boss: { xp: 50, coins: 25 },
}

const threeTierXpRates: Record<TierLevel, number> = { 1: 0.6, 2: 0.8, 3: 1 }

export function getTierReward(difficulty: Difficulty, tier: TierLevel, tierCount: 2 | 3 = 3) {
  const reward = rewardTable[difficulty]
  const rate = tierCount === 2 && tier === 2 ? 1 : threeTierXpRates[tier]
  return { xp: Math.round(reward.xp * rate), coins: reward.coins }
}

export function getTierUpgradeXp(difficulty: Difficulty, from: TierLevel, to: TierLevel, tierCount: 2 | 3 = 3) {
  return Math.max(0, getTierReward(difficulty, to, tierCount).xp - getTierReward(difficulty, from, tierCount).xp)
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const dateString = z.string().regex(datePattern, '日期必须使用 YYYY-MM-DD')
const scheduledTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间必须使用 HH:mm')
const timestamp = z.string().datetime()

export const ScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily') }),
  z.object({ kind: z.literal('weekly'), times: z.number().int().min(1).max(999) }),
  z.object({ kind: z.literal('once') }),
])

const LegacyGoalSchema = z.object({
  kind: z.enum(['count', 'duration']).optional(),
  count: z.number().positive().max(1440),
  unit: z.string().trim().min(1).max(12),
})

export type LegacyGoal = z.infer<typeof LegacyGoalSchema>

const ScalarThresholdsSchema = z.union([
  z.tuple([z.number().int().positive(), z.number().int().positive()]),
  z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]),
])

function validateScalarThresholds(thresholds: readonly number[], maximum: number, context: z.RefinementCtx) {
  thresholds.forEach((value, index) => {
    if (value > maximum) context.addIssue({ code: 'custom', path: ['thresholds', index], message: `目标不能超过 ${maximum}` })
  })
  if (thresholds.some((value, index) => index > 0 && value <= thresholds[index - 1])) {
    context.addIssue({ code: 'custom', path: ['thresholds'], message: '分层目标必须按基础、标准、突破严格递增' })
  }
}

const CountTieredGoalSchema = z
  .object({
    kind: z.literal('tiered'),
    metric: z.literal('count'),
    unit: z.string().trim().min(1).max(12),
    thresholds: ScalarThresholdsSchema,
    progressMode: z.literal('incremental').optional(),
  })
  .superRefine((goal, context) => validateScalarThresholds(goal.thresholds, 999, context))

const LegacyDurationTieredGoalSchema = z
  .object({
    kind: z.literal('tiered'),
    metric: z.literal('duration'),
    unit: z.literal('分钟'),
    thresholds: ScalarThresholdsSchema,
  })
  .superRefine((goal, context) => validateScalarThresholds(goal.thresholds, 1440, context))

const DurationTieredGoalSchema = z
  .object({
    kind: z.literal('tiered'),
    metric: z.literal('duration'),
    unit: z.literal('秒'),
    inputUnit: z.enum(timeInputUnits),
    thresholds: ScalarThresholdsSchema,
  })
  .superRefine((goal, context) => {
    validateScalarThresholds(goal.thresholds, 86_400, context)
    if (goal.inputUnit === '分钟' && goal.thresholds.some((value) => value % 60 !== 0)) {
      context.addIssue({ code: 'custom', path: ['thresholds'], message: '分钟输入必须换算为完整的整数分钟' })
    }
  })

export const CombinedThresholdSchema = z.object({
  count: z.number().int().min(1).max(999),
  durationSeconds: z.number().int().min(1).max(86_400),
})

const CombinedTieredGoalSchema = z
  .object({
    kind: z.literal('tiered'),
    metric: z.literal('combined'),
    mode: z.enum(combinedModes),
    countUnit: z.string().trim().min(1).max(12),
    inputUnit: z.enum(timeInputUnits),
    progressMode: z.literal('incremental').optional(),
    defaultDurationSeconds: z.number().int().min(1).max(86_400).optional(),
    durationOptionsSeconds: z.array(z.number().int().min(1).max(86_400)).min(1).max(4).optional(),
    thresholds: z.union([
      z.tuple([CombinedThresholdSchema, CombinedThresholdSchema]),
      z.tuple([CombinedThresholdSchema, CombinedThresholdSchema, CombinedThresholdSchema]),
    ]),
  })
  .superRefine((goal, context) => {
    if (goal.progressMode === 'incremental') {
      if (!goal.defaultDurationSeconds || goal.durationOptionsSeconds?.[0] !== goal.defaultDurationSeconds) {
        context.addIssue({ code: 'custom', path: ['defaultDurationSeconds'], message: '逐次累计组合目标必须把默认时长放在快捷时长首位' })
      }
      if (goal.durationOptionsSeconds && new Set(goal.durationOptionsSeconds).size !== goal.durationOptionsSeconds.length) {
        context.addIssue({ code: 'custom', path: ['durationOptionsSeconds'], message: '快捷时长不能重复' })
      }
    } else if (goal.defaultDurationSeconds !== undefined || goal.durationOptionsSeconds !== undefined) {
      context.addIssue({ code: 'custom', path: ['progressMode'], message: '快捷时长只用于逐次累计目标' })
    }
    if (goal.inputUnit === '分钟' && (goal.thresholds.some((value) => value.durationSeconds % 60 !== 0) || goal.durationOptionsSeconds?.some((value) => value % 60 !== 0))) {
      context.addIssue({ code: 'custom', path: ['thresholds'], message: '分钟输入必须换算为完整的整数分钟' })
    }
    goal.thresholds.forEach((threshold, index) => {
      if (goal.mode === 'per_occurrence' && threshold.count * threshold.durationSeconds > 86_400) {
        context.addIssue({ code: 'custom', path: ['thresholds', index], message: '单层最低总时长不能超过 24 小时' })
      }
      if (index === 0) return
      const previous = goal.thresholds[index - 1]
      if (
        threshold.count < previous.count ||
        threshold.durationSeconds < previous.durationSeconds ||
        (threshold.count === previous.count && threshold.durationSeconds === previous.durationSeconds)
      ) {
        context.addIssue({ code: 'custom', path: ['thresholds', index], message: '层次升级时次数和时间不能下降，且至少一项必须增加' })
      }
    })
  })

export const TieredGoalSchema = z.union([
  CountTieredGoalSchema,
  LegacyDurationTieredGoalSchema,
  DurationTieredGoalSchema,
  CombinedTieredGoalSchema,
])

export type TieredGoal = z.infer<typeof TieredGoalSchema>

export const ActivityGoalSchema = z.union([LegacyGoalSchema, TieredGoalSchema])

export const coachBehaviorRoles = ['start', 'progress', 'maintain'] as const
export const coachBehaviorRoleLabels: Record<(typeof coachBehaviorRoles)[number], string> = {
  start: '启动',
  progress: '推进',
  maintain: '维护/收尾',
}

const CoachPlanExistingBehaviorSchema = z.object({
  id: z.string().min(1),
  role: z.enum(coachBehaviorRoles),
  source: z.literal('existing'),
  activityId: z.string().min(1),
  confirmed: z.boolean(),
})

const CoachPlanNewBehaviorSchema = z.object({
  id: z.string().min(1),
  role: z.enum(coachBehaviorRoles),
  source: z.literal('new'),
  title: z.string().trim().max(60),
  scheduledTime: scheduledTime.optional(),
  cue: z.string().trim().max(80),
  protocol: z.string().trim().max(280),
  domain: z.enum(growthDomains),
  difficulty: z.enum(difficulties),
  goal: TieredGoalSchema,
  schedule: z.union([
    z.object({ kind: z.literal('daily') }),
    z.object({ kind: z.literal('weekly'), times: z.number().int().min(1).max(999) }),
  ]),
  confirmed: z.boolean(),
})

export const CoachPlanBehaviorSchema = z.discriminatedUnion('source', [
  CoachPlanExistingBehaviorSchema,
  CoachPlanNewBehaviorSchema,
])

export const CoachPlanDraftSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().max(40),
    successCriterion: z.string().trim().max(180),
    baseline: z.string().trim().max(280),
    targetOutcome: z.string().trim().max(280),
    currentStep: z.number().int().min(1).max(4),
    status: z.enum(['editing', 'ready']),
    behaviors: z.array(CoachPlanBehaviorSchema).max(3),
    badDayConfirmed: z.boolean(),
    evidenceConfirmed: z.boolean(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .superRefine((draft, context) => {
    const behaviorIds = draft.behaviors.map((behavior) => behavior.id)
    if (new Set(behaviorIds).size !== behaviorIds.length) {
      context.addIssue({ code: 'custom', path: ['behaviors'], message: '行为方案不能重复' })
    }
    const activityIds = draft.behaviors.flatMap((behavior) => behavior.source === 'existing' ? [behavior.activityId] : [])
    if (new Set(activityIds).size !== activityIds.length) {
      context.addIssue({ code: 'custom', path: ['behaviors'], message: '不能重复复用同一项活动' })
    }
    if (draft.status !== 'ready') return
    for (const [field, value, label] of [
      ['title', draft.title, '成长主题'],
      ['successCriterion', draft.successCriterion, '成功标准'],
      ['baseline', draft.baseline, '开始状态'],
      ['targetOutcome', draft.targetOutcome, '期望结果'],
    ] as const) {
      if (!value) context.addIssue({ code: 'custom', path: [field], message: `请填写${label}` })
    }
    if (draft.behaviors.length < 1) {
      context.addIssue({ code: 'custom', path: ['behaviors'], message: '请规划 1 至 3 项核心行为' })
    }
    draft.behaviors.forEach((behavior, index) => {
      if (behavior.source === 'existing' && !behavior.confirmed) {
        context.addIssue({ code: 'custom', path: ['behaviors', index], message: '请确认复用活动的当前标准' })
      }
      if (behavior.source === 'new' && (!behavior.title || !behavior.cue || !behavior.protocol || !behavior.confirmed)) {
        context.addIssue({ code: 'custom', path: ['behaviors', index], message: '请确认新行为的名称、触发条件、执行协议和最低标准' })
      }
    })
    if (!draft.badDayConfirmed || !draft.evidenceConfirmed) {
      context.addIssue({ code: 'custom', path: ['badDayConfirmed'], message: '请完成现实检查' })
    }
  })

export type CoachPlanBehavior = z.infer<typeof CoachPlanBehaviorSchema>
export type CoachPlanDraft = z.infer<typeof CoachPlanDraftSchema>
export type CoachBehaviorRole = (typeof coachBehaviorRoles)[number]

export function createCoachPlanDraft(now = new Date(), id: string = crypto.randomUUID()): CoachPlanDraft {
  const timestampValue = now.toISOString()
  return CoachPlanDraftSchema.parse({
    id,
    title: '',
    successCriterion: '',
    baseline: '',
    targetOutcome: '',
    currentStep: 1,
    status: 'editing',
    behaviors: [],
    badDayConfirmed: false,
    evidenceConfirmed: false,
    createdAt: timestampValue,
    updatedAt: timestampValue,
  })
}

export const ActivitySchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(60),
    scheduledTime: scheduledTime.optional(),
    cue: z.string().trim().min(1).max(80).optional(),
    protocol: z.string().trim().min(1).max(280).optional(),
    type: z.enum(['habit', 'task']),
    attribute: z.enum(attributes).optional(),
    domain: z.enum(growthDomains).optional(),
    difficulty: z.enum(difficulties),
    goal: ActivityGoalSchema,
    schedule: ScheduleSchema,
    plannedOn: dateString.optional(),
    isKey: z.boolean(),
    enabled: z.boolean(),
    revision: z.number().int().positive().optional(),
    archivedAt: timestamp.optional(),
    createdAt: timestamp,
  })
  .superRefine((activity, context) => {
    if ((activity.attribute === undefined) === (activity.domain === undefined)) {
      context.addIssue({ code: 'custom', path: ['domain'], message: '活动必须且只能使用一个成长领域体系' })
    }
    if (activity.type === 'habit' && activity.schedule.kind === 'once') {
      context.addIssue({ code: 'custom', path: ['schedule'], message: '习惯必须设置每天或每周计划' })
    }
    if (activity.type === 'task' && activity.schedule.kind !== 'once') {
      context.addIssue({ code: 'custom', path: ['schedule'], message: '一次性任务必须使用单次计划' })
    }
    if (activity.type === 'task' && activity.goal.kind === 'tiered') {
      context.addIssue({ code: 'custom', path: ['goal'], message: '分层目标只能用于习惯' })
    }
    if (activity.archivedAt && (activity.enabled || activity.isKey)) {
      context.addIssue({ code: 'custom', path: ['archivedAt'], message: '已归档活动不能启用或设为关键行为' })
    }
    if (activity.goal.kind !== 'tiered' && (activity.goal.kind === 'duration' || activity.goal.unit === '分钟') && (!Number.isInteger(activity.goal.count) || activity.goal.count > 1440)) {
      context.addIssue({ code: 'custom', path: ['goal', 'count'], message: '时长目标必须是 1 至 1440 分钟的整数' })
    }
    const incremental = activity.goal.kind === 'tiered' && 'progressMode' in activity.goal && activity.goal.progressMode === 'incremental'
    if (incremental && (activity.type !== 'habit' || activity.schedule.kind !== 'weekly' || (activity.goal.kind === 'tiered' && activity.goal.metric === 'duration'))) {
      context.addIssue({ code: 'custom', path: ['goal', 'progressMode'], message: '逐次累计只适用于每周次数或组合分层习惯' })
    }
    if (activity.schedule.kind === 'weekly' && !incremental && activity.schedule.times > 7) {
      context.addIssue({ code: 'custom', path: ['schedule', 'times'], message: '直接选层的每周计划最多 7 次' })
    }
    if (incremental && activity.schedule.kind === 'weekly' && activity.goal.kind === 'tiered' && activity.goal.metric !== 'duration') {
      const standard = activity.goal.thresholds[1]
      const standardCount = typeof standard === 'number' ? standard : standard.count
      if (activity.schedule.times !== standardCount) {
        context.addIssue({ code: 'custom', path: ['schedule', 'times'], message: '逐次累计的每周计划次数必须等于标准层次数' })
      }
    }
  })

export type Activity = z.infer<typeof ActivitySchema>

export function parseScheduledTime(cue?: string) {
  const match = cue?.match(/(?:^|\D)([01]\d|2[0-3]):([0-5]\d)(?:\D|$)/)
  return match ? `${match[1]}:${match[2]}` : undefined
}

export function getActivityScheduledTime(activity: Pick<Activity, 'scheduledTime' | 'cue'>) {
  return activity.scheduledTime ?? parseScheduledTime(activity.cue)
}

export const IncrementalProgressSchema = z.object({
  mode: z.literal('weekly_incremental'),
  cycleStart: dateString,
  countDelta: z.number().int().min(1).max(999),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
  perOccurrenceDurationSeconds: z.number().int().min(1).max(86_400).optional(),
  sequence: z.number().int().positive(),
  requestId: z.string().min(1),
  imported: z.boolean().optional(),
})

export type IncrementalProgress = z.infer<typeof IncrementalProgressSchema>

export const CompletionSchema = z
  .object({
    id: z.string().min(1),
    activityId: z.string().min(1),
    occurredOn: dateString,
    status: z.enum(['active', 'undone']),
    note: z.string().max(140).optional(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    tierMetric: z.enum(['duration', 'count']).optional(),
    tierUnit: z.string().trim().min(1).max(12).optional(),
    tierThresholds: ScalarThresholdsSchema.optional(),
    achievedValue: z.number().int().positive().optional(),
    tierGoalSnapshot: TieredGoalSchema.optional(),
    activityRevision: z.number().int().positive().optional(),
    titleSnapshot: z.string().trim().min(1).max(60).optional(),
    attributeSnapshot: z.enum(attributes).optional(),
    domainSnapshot: z.enum(growthDomains).optional(),
    difficultySnapshot: z.enum(difficulties).optional(),
    progress: IncrementalProgressSchema.optional(),
    createdAt: timestamp,
    undoneAt: timestamp.optional(),
  })
  .superRefine((completion, context) => {
    const legacyValues = [completion.tierMetric, completion.tierUnit, completion.tierThresholds, completion.achievedValue]
    if (legacyValues.some((value) => value !== undefined) && legacyValues.some((value) => value === undefined)) {
      context.addIssue({ code: 'custom', path: ['tier'], message: '分层完成快照字段不完整' })
      return
    }
    if (completion.tier && !completion.tierGoalSnapshot && legacyValues.every((value) => value === undefined)) {
      context.addIssue({ code: 'custom', path: ['tier'], message: '分层完成必须保存目标快照' })
    }
    if (!completion.tier && !completion.progress && (completion.tierGoalSnapshot || legacyValues.some((value) => value !== undefined))) {
      context.addIssue({ code: 'custom', path: ['tier'], message: '目标快照缺少完成层次' })
    }
    if (completion.progress) {
      const goal = completion.tierGoalSnapshot
      if (!goal || !('progressMode' in goal) || goal.progressMode !== 'incremental') {
        context.addIssue({ code: 'custom', path: ['progress'], message: '逐次进度必须保存可累计的每周目标快照' })
      }
      if (goal?.metric === 'count' && (completion.progress.durationSeconds !== undefined || completion.progress.perOccurrenceDurationSeconds !== undefined)) {
        context.addIssue({ code: 'custom', path: ['progress', 'durationSeconds'], message: '纯次数进度不能保存时长' })
      }
      if (goal?.metric === 'combined' && completion.progress.durationSeconds === undefined) {
        context.addIssue({ code: 'custom', path: ['progress', 'durationSeconds'], message: '组合进度必须保存本次时长' })
      }
    }
    if (completion.tier && completion.tierMetric && completion.tierUnit && completion.tierThresholds && completion.achievedValue) {
      const goal = TieredGoalSchema.safeParse({ kind: 'tiered', metric: completion.tierMetric, unit: completion.tierUnit, thresholds: completion.tierThresholds })
      if (!goal.success || completion.achievedValue !== completion.tierThresholds[completion.tier - 1]) {
        context.addIssue({ code: 'custom', path: ['achievedValue'], message: '三层完成快照与所选层次不一致' })
      }
    }
    const activitySnapshot = [completion.activityRevision, completion.titleSnapshot, completion.difficultySnapshot]
    const classificationSnapshot = [completion.attributeSnapshot, completion.domainSnapshot]
    if (activitySnapshot.some((value) => value !== undefined) && (activitySnapshot.some((value) => value === undefined) || classificationSnapshot.every((value) => value === undefined))) {
      context.addIssue({ code: 'custom', path: ['activityRevision'], message: '完成时的活动配置快照不完整' })
    }
    if (classificationSnapshot.every((value) => value !== undefined)) {
      context.addIssue({ code: 'custom', path: ['domainSnapshot'], message: '完成快照不能同时使用旧属性和成长领域' })
    }
  })

export type Completion = z.infer<typeof CompletionSchema>

export const LedgerEventSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['reward', 'correction', 'redemption', 'redemption_refund', 'milestone']),
  sourceId: z.string().min(1),
  occurredOn: dateString,
  title: z.string().min(1).max(80),
  attribute: z.enum(attributes).optional(),
  domain: z.enum(growthDomains).optional(),
  xpDelta: z.number().int(),
  coinDelta: z.number().int(),
  createdAt: timestamp,
})

export type LedgerEvent = z.infer<typeof LedgerEventSchema>

export const rewardHorizons = ['near', 'medium', 'far'] as const
export type RewardHorizon = (typeof rewardHorizons)[number]

export const RewardRepeatPolicySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('one_time') }),
  z.object({ kind: z.literal('repeatable'), cooldownDays: z.number().int().min(1).max(365) }),
])

export type RewardRepeatPolicy = z.infer<typeof RewardRepeatPolicySchema>

export const RewardSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  cost: z.number().int().positive(),
  reason: z.string().trim().min(1).max(100).optional(),
  cashCostCents: z.number().int().min(0).max(120_000).optional(),
  horizon: z.enum(rewardHorizons).optional(),
  imageDataUrl: z.string().startsWith('data:image/webp;base64,').max(410_000).optional(),
  repeatPolicy: RewardRepeatPolicySchema.optional(),
  enabled: z.boolean(),
  createdAt: timestamp,
})

export type Reward = z.infer<typeof RewardSchema>

export function isRewardConfigured(
  reward: Reward,
): reward is Reward & Required<Pick<Reward, 'reason' | 'cashCostCents' | 'horizon' | 'repeatPolicy'>> {
  return reward.reason !== undefined &&
    reward.cashCostCents !== undefined &&
    reward.horizon !== undefined &&
    reward.repeatPolicy !== undefined
}

export function getRewardCooldownUntil(reward: Reward, claims: RewardClaim[]) {
  if (reward.repeatPolicy?.kind !== 'repeatable') return undefined
  const lastFulfilled = claims
    .filter((claim) => claim.rewardId === reward.id && claim.status === 'fulfilled')
    .sort((left, right) => right.fulfilledAt!.localeCompare(left.fulfilledAt!))[0]
  return lastFulfilled?.fulfilledOn
    ? addDays(lastFulfilled.fulfilledOn, reward.repeatPolicy.cooldownDays)
    : undefined
}

export const RewardClaimSchema = z
  .object({
    id: z.string().min(1),
    rewardId: z.string().min(1),
    source: z.enum(['coins', 'milestone']),
    milestoneLevel: z.number().int().min(2).optional(),
    status: z.enum(['reserved', 'fulfilled', 'cancelled']),
    plannedFor: dateString,
    reservedOn: dateString,
    reservedAt: timestamp,
    fulfilledOn: dateString.optional(),
    fulfilledAt: timestamp.optional(),
    cancelledAt: timestamp.optional(),
    satisfaction: z.number().int().min(1).max(5).optional(),
    repeatAgain: z.boolean().optional(),
    titleSnapshot: z.string().trim().min(1).max(60),
    coinCostSnapshot: z.number().int().nonnegative(),
    cashCostCentsSnapshot: z.number().int().min(0).max(120_000),
    horizonSnapshot: z.enum(rewardHorizons),
    repeatPolicySnapshot: RewardRepeatPolicySchema,
  })
  .superRefine((claim, context) => {
    if ((claim.source === 'milestone') !== (claim.milestoneLevel !== undefined)) {
      context.addIssue({ code: 'custom', path: ['milestoneLevel'], message: '等级礼券奖励必须保存里程碑等级' })
    }
    if (claim.status === 'reserved' && (claim.fulfilledOn || claim.fulfilledAt || claim.cancelledAt || claim.satisfaction || claim.repeatAgain !== undefined)) {
      context.addIssue({ code: 'custom', path: ['status'], message: '待兑现奖励不能包含完成或取消信息' })
    }
    if (claim.status === 'fulfilled' && (!claim.fulfilledOn || !claim.fulfilledAt || claim.satisfaction === undefined || claim.repeatAgain === undefined || claim.cancelledAt)) {
      context.addIssue({ code: 'custom', path: ['status'], message: '已兑现奖励必须包含轻复盘且不能包含取消时间' })
    }
    if (claim.status === 'cancelled' && (!claim.cancelledAt || claim.fulfilledOn || claim.fulfilledAt || claim.satisfaction || claim.repeatAgain !== undefined)) {
      context.addIssue({ code: 'custom', path: ['status'], message: '已取消奖励只能包含取消时间' })
    }
  })

export type RewardClaim = z.infer<typeof RewardClaimSchema>

export const RewardSystemSchema = z
  .object({
    version: z.literal(1),
    activatedAt: timestamp,
    activeRewardId: z.string().min(1).optional(),
    queueIds: z.array(z.string().min(1)),
    monthlyAllowanceCents: z.number().int().positive(),
    maxFundCents: z.number().int().positive(),
    availableCents: z.number().int().nonnegative(),
    lastFundedMonth: z.string().regex(/^\d{4}-\d{2}$/),
  })
  .superRefine((system, context) => {
    if (system.maxFundCents < system.monthlyAllowanceCents) {
      context.addIssue({ code: 'custom', path: ['maxFundCents'], message: '奖励基金上限不能低于每月额度' })
    }
    if (system.availableCents > system.maxFundCents) {
      context.addIssue({ code: 'custom', path: ['availableCents'], message: '可用奖励基金不能超过上限' })
    }
    if (new Set(system.queueIds).size !== system.queueIds.length || (system.activeRewardId && system.queueIds.includes(system.activeRewardId))) {
      context.addIssue({ code: 'custom', path: ['queueIds'], message: '奖励目标和候选队列不能重复' })
    }
  })

export type RewardSystem = z.infer<typeof RewardSystemSchema>

export const ReviewItemSchema = z.object({
  activityId: z.string().min(1),
  titleSnapshot: z.string().trim().min(1).max(60).optional(),
  attributeSnapshot: z.enum(attributes).optional(),
  domainSnapshot: z.enum(growthDomains).optional(),
  adherence: z.number().min(0).max(1),
  completed: z.number().int().nonnegative(),
  planned: z.number().int().positive(),
  impact: z.number().int().min(1).max(5),
  friction: z.number().int().min(1).max(5),
  decision: z.enum(reviewDecisions),
  note: z.string().max(280).optional(),
  actualDurationMinutes: z.number().int().nonnegative().optional(),
  plannedDurationMinutes: z.number().int().positive().optional(),
  tierCounts: z.union([
    z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
    z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative()]),
  ]).optional(),
  achievedTotal: z.number().int().nonnegative().optional(),
  achievedUnit: z.string().trim().min(1).max(12).optional(),
  achievedCountTotal: z.number().int().nonnegative().optional(),
  achievedDurationSeconds: z.number().int().nonnegative().optional(),
  achievedCountUnit: z.string().trim().min(1).max(12).optional(),
})

export const WeeklyReviewSchema = z.object({
  id: z.string().min(1),
  weekStart: dateString,
  items: z.array(ReviewItemSchema).max(3),
  createdAt: timestamp,
})

export type WeeklyReview = z.infer<typeof WeeklyReviewSchema>

export const feedbackIntensities = ['gentle', 'clear', 'strong'] as const

export const PreferencesSchema = z.object({
  notifications: z.boolean(),
  vibration: z.boolean(),
  sound: z.boolean(),
  feedbackIntensity: z.enum(feedbackIntensities).default('clear'),
})

export const LevelMilestoneSchema = z
  .object({
    level: z.number().int().min(2),
    reachedAt: timestamp,
    sourceEventId: z.string().min(1),
    acknowledgedAt: timestamp.optional(),
    focusAttribute: z.enum(attributes).optional(),
    focusDomain: z.enum(growthDomains).optional(),
    voucherMaxCost: z.number().int().positive().optional(),
    claimedRewardId: z.string().min(1).optional(),
    claimedAt: timestamp.optional(),
    reservedClaimId: z.string().min(1).optional(),
  })
  .superRefine((milestone, context) => {
    const focus = milestone.focusDomain ?? milestone.focusAttribute
    if ((milestone.acknowledgedAt === undefined) !== (focus === undefined)) {
      context.addIssue({ code: 'custom', path: ['focusDomain'], message: '查看升级报告时必须选择下一等级方向' })
    }
    if (milestone.focusDomain && milestone.focusAttribute) {
      context.addIssue({ code: 'custom', path: ['focusDomain'], message: '等级方向不能同时使用旧属性和成长领域' })
    }
    if ((milestone.claimedRewardId === undefined) !== (milestone.claimedAt === undefined)) {
      context.addIssue({ code: 'custom', path: ['claimedRewardId'], message: '阶段礼券领取信息不完整' })
    }
    if (milestone.claimedRewardId && !milestone.voucherMaxCost) {
      context.addIssue({ code: 'custom', path: ['voucherMaxCost'], message: '没有礼券额度的等级不能领取奖励' })
    }
    if (milestone.claimedAt && milestone.reservedClaimId) {
      context.addIssue({ code: 'custom', path: ['reservedClaimId'], message: '已领取礼券不能继续保留预留奖励' })
    }
  })

export type LevelMilestone = z.infer<typeof LevelMilestoneSchema>

export const LevelSystemSchema = z
  .object({
    activatedAt: timestamp,
    baselineLevel: z.number().int().positive(),
    highestLevelReached: z.number().int().positive(),
    focusAttribute: z.enum(attributes).optional(),
    focusDomain: z.enum(growthDomains).optional(),
    milestones: z.array(LevelMilestoneSchema),
  })
  .superRefine((system, context) => {
    if (system.focusDomain && system.focusAttribute) {
      context.addIssue({ code: 'custom', path: ['focusDomain'], message: '当前方向不能同时使用旧属性和成长领域' })
    }
    if (system.highestLevelReached < system.baselineLevel) {
      context.addIssue({ code: 'custom', path: ['highestLevelReached'], message: '历史最高等级不能低于启用基线' })
    }
    const levels = system.milestones.map((milestone) => milestone.level)
    if (new Set(levels).size !== levels.length) {
      context.addIssue({ code: 'custom', path: ['milestones'], message: '等级里程碑不能重复' })
    }
    if (levels.some((level) => level <= system.baselineLevel || level > system.highestLevelReached)) {
      context.addIssue({ code: 'custom', path: ['milestones'], message: '等级里程碑超出启用基线或历史最高等级' })
    }
  })

export type LevelSystem = z.infer<typeof LevelSystemSchema>

export const MetaSchema = z.object({
  lastBackupAt: timestamp.optional(),
  migrationImportedAt: timestamp.optional(),
  levelSystem: LevelSystemSchema.optional(),
  targetRewardId: z.string().min(1).optional(),
  gameDayBoundaryActivatedAt: timestamp.optional(),
  growthDomainSystem: z.object({ version: z.literal(1), activatedAt: timestamp }).optional(),
  todayActionPriority: z.object({
    gameDate: dateString,
    activityIds: z.array(z.string().min(1)).max(5).refine((ids) => new Set(ids).size === ids.length, '今日优先行动不能重复'),
  }).optional(),
})

export const SettingSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('preferences'), value: PreferencesSchema }),
  z.object({ key: z.literal('meta'), value: MetaSchema }),
  z.object({ key: z.literal('coachPlanDraft'), value: CoachPlanDraftSchema }),
  z.object({ key: z.literal('rewardSystem'), value: RewardSystemSchema }),
])

export type Setting = z.infer<typeof SettingSchema>
export type Preferences = z.infer<typeof PreferencesSchema>
export type FeedbackIntensity = Preferences['feedbackIntensity']

export interface CharacterStats {
  totalXp: number
  coins: number
  attributeXp: Record<Attribute, number>
  domainXp: Record<GrowthDomain, number>
}

export function getLevel(totalXp: number) {
  let level = 1
  let current = Math.max(0, Math.floor(totalXp))
  while (current >= level * 100) {
    current -= level * 100
    level += 1
  }
  const needed = level * 100
  return { level, current, needed, progress: needed === 0 ? 0 : current / needed }
}

export function getTotalXpForLevel(level: number) {
  const safeLevel = Math.max(1, Math.floor(level))
  return 50 * safeLevel * (safeLevel - 1)
}

export function getCharacterStage(level: number) {
  if (level <= 2) return 1
  if (level <= 5) return 2
  if (level <= 9) return 3
  return 4
}

export function getCharacterStageName(level: number) {
  const names = ['启程者', '行动者', '践行者', '塑造者'] as const
  return names[getCharacterStage(level) - 1]
}

export function getMilestoneVoucherCost(level: number) {
  if (level === 3) return 30
  if (level === 6) return 80
  if (level === 10 || (level > 10 && level % 5 === 0)) return 200
  return undefined
}

export function getNextVoucherLevel(level: number) {
  if (level < 3) return 3
  if (level < 6) return 6
  if (level < 10) return 10
  return Math.ceil((level + 1) / 5) * 5
}

export function createLevelSystem(totalXp: number, activatedAt = new Date().toISOString()): LevelSystem {
  const level = getLevel(totalXp).level
  return { activatedAt, baselineLevel: level, highestLevelReached: level, milestones: [] }
}

export interface LevelReport {
  activeDays: number
  completionCount: number
  attributeXp: Record<Attribute, number>
  strongestAttribute?: Attribute
  domainXp: Record<GrowthDomain, number>
  strongestDomain?: GrowthDomain
  topActions: Array<{ title: string; xp: number }>
}

export function getLevelReport(events: LedgerEvent[], milestone: LevelMilestone, periodStart: string): LevelReport {
  const corrections = new Set(
    events
      .filter((event) => event.kind === 'correction' && event.createdAt <= milestone.reachedAt)
      .map((event) => event.sourceId),
  )
  const rewards = events.filter(
    (event) =>
      event.kind === 'reward' &&
      event.createdAt > periodStart &&
      event.createdAt <= milestone.reachedAt &&
      !corrections.has(event.id),
  )
  const attributeXp = Object.fromEntries(attributes.map((attribute) => [attribute, 0])) as Record<Attribute, number>
  const domainXp = Object.fromEntries(growthDomains.map((domain) => [domain, 0])) as Record<GrowthDomain, number>
  const completions = new Map<string, { title: string; xp: number; occurredOn: string }>()
  for (const event of rewards) {
    if (event.attribute) attributeXp[event.attribute] += event.xpDelta
    if (event.domain) domainXp[event.domain] += event.xpDelta
    const current = completions.get(event.sourceId)
    completions.set(event.sourceId, {
      title: current?.title ?? event.title,
      xp: (current?.xp ?? 0) + event.xpDelta,
      occurredOn: current?.occurredOn ?? event.occurredOn,
    })
  }
  const strongestAttribute = [...attributes]
    .sort((left, right) => attributeXp[right] - attributeXp[left])
    .find((attribute) => attributeXp[attribute] > 0)
  const strongestDomain = [...growthDomains]
    .sort((left, right) => domainXp[right] - domainXp[left])
    .find((domain) => domainXp[domain] > 0)
  return {
    activeDays: new Set([...completions.values()].map((completion) => completion.occurredOn)).size,
    completionCount: completions.size,
    attributeXp,
    strongestAttribute,
    domainXp,
    strongestDomain,
    topActions: [...completions.values()]
      .sort((left, right) => right.xp - left.xp)
      .slice(0, 3)
      .map(({ title, xp }) => ({ title, xp })),
  }
}

export interface JourneyEntry {
  id: string
  kind: 'action' | 'level' | 'voucher'
  occurredOn: string
  createdAt: string
  title: string
  attribute?: Attribute
  domain?: GrowthDomain
  xp: number
  coins: number
  tier?: TierLevel
  note?: string
  durationMinutes?: number
  durationSeconds?: number
  count?: number
  progressLabel?: string
  tierGoalSnapshot?: TieredGoal
  level?: number
}

export interface JourneyDay {
  date: string
  entries: JourneyEntry[]
  actionCount: number
  hasMilestone: boolean
}

export interface JourneyMonth {
  month: string
  label: string
  activeDays: number
  actionCount: number
  xp: number
  coins: number
  strongestAttribute?: Attribute
  strongestDomain?: GrowthDomain
  days: JourneyDay[]
}

export function getJourneyMonths(completions: Completion[], events: LedgerEvent[], levelSystem?: LevelSystem): JourneyMonth[] {
  const correctedRewards = new Set(events.filter((event) => event.kind === 'correction').map((event) => event.sourceId))
  const rewardsByCompletion = new Map<string, LedgerEvent[]>()
  events
    .filter((event) => event.kind === 'reward' && !correctedRewards.has(event.id))
    .forEach((event) => rewardsByCompletion.set(event.sourceId, [...(rewardsByCompletion.get(event.sourceId) ?? []), event]))

  const activeCompletions = completions.filter((completion) => completion.status === 'active')
  const entries: JourneyEntry[] = activeCompletions
    .filter((completion) => !completion.progress)
    .flatMap((completion) => {
      const rewards = rewardsByCompletion.get(completion.id) ?? []
      if (rewards.length === 0) return []
      const first = [...rewards].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]
      return [{
        id: `action:${completion.id}`,
        kind: 'action' as const,
        occurredOn: completion.occurredOn,
        createdAt: first.createdAt,
        title: completion.titleSnapshot ?? first.title.replace(/^层次升级：/, '').replace(/（(?:标准|突破)）$/, ''),
        attribute: completion.attributeSnapshot ?? first.attribute,
        domain: completion.domainSnapshot ?? first.domain,
        xp: rewards.reduce((total, event) => total + event.xpDelta, 0),
        coins: rewards.reduce((total, event) => total + event.coinDelta, 0),
        tier: completion.tier,
        note: completion.note,
        durationMinutes: completion.durationMinutes,
        tierGoalSnapshot: completion.tierGoalSnapshot,
      }]
    })

  const progressGroups = new Map<string, Completion[]>()
  activeCompletions.filter((completion) => completion.progress).forEach((completion) => {
    const key = `${completion.activityId}:${completion.occurredOn}:${completion.progress!.cycleStart}`
    progressGroups.set(key, [...(progressGroups.get(key) ?? []), completion])
  })
  for (const [key, group] of progressGroups) {
    const first = [...group].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]
    const goal = first.tierGoalSnapshot
    if (!goal || !('progressMode' in goal) || goal.progressMode !== 'incremental') continue
    const progress = calculateIncrementalProgress(goal as IncrementalTieredGoal, group)
    const cumulative = calculateIncrementalProgress(
      goal as IncrementalTieredGoal,
      activeCompletions.filter((completion) => completion.activityId === first.activityId && completion.progress?.cycleStart === first.progress?.cycleStart && completion.occurredOn <= first.occurredOn),
    )
    const cumulativeLabel = cumulative.goal.metric === 'count'
      ? `${cumulative.totalCount}/${cumulative.goal.thresholds[1]}${cumulative.goal.unit}`
      : (() => {
        const standard = cumulative.goal.thresholds[1]
        return `${cumulative.totalCount}/${standard.count} 次${cumulative.goal.mode === 'total' ? ` · ${formatDurationSeconds(cumulative.totalDurationSeconds)}/${formatDurationSeconds(standard.durationSeconds)}` : ''}`
      })()
    const rewards = group.flatMap((completion) => rewardsByCompletion.get(completion.id) ?? [])
    entries.push({
      id: `action:${key}`,
      kind: 'action',
      occurredOn: first.occurredOn,
      createdAt: [...group].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0].createdAt,
      title: first.titleSnapshot ?? rewards[0]?.title ?? '累计行动',
      attribute: first.attributeSnapshot ?? rewards[0]?.attribute,
      domain: first.domainSnapshot ?? rewards[0]?.domain,
      xp: rewards.reduce((total, event) => total + event.xpDelta, 0),
      coins: rewards.reduce((total, event) => total + event.coinDelta, 0),
      tier: progress.highestTier,
      durationSeconds: progress.totalDurationSeconds || undefined,
      count: progress.totalCount,
      progressLabel: `完成 ${progress.totalCount} 次${progress.totalDurationSeconds ? ` · ${formatDurationSeconds(progress.totalDurationSeconds)}` : ''} · 本周累计 ${cumulativeLabel}`,
      tierGoalSnapshot: goal,
    })
  }

  const eventById = new Map(events.map((event) => [event.id, event]))
  for (const milestone of levelSystem?.milestones ?? []) {
    const source = eventById.get(milestone.sourceEventId)
    if (source) {
      entries.push({
        id: `level:${milestone.level}`,
        kind: 'level',
        occurredOn: source.occurredOn,
        createdAt: milestone.reachedAt,
        title: `达到 Lv.${milestone.level} · ${getCharacterStageName(milestone.level)}`,
        xp: 0,
        coins: 0,
        level: milestone.level,
      })
    }
  }
  events.filter((event) => event.kind === 'milestone').forEach((event) => entries.push({
    id: event.id,
    kind: 'voucher',
    occurredOn: event.occurredOn,
    createdAt: event.createdAt,
    title: event.title,
    xp: 0,
    coins: 0,
  }))

  const months = new Map<string, JourneyEntry[]>()
  entries.forEach((entry) => {
    const month = entry.occurredOn.slice(0, 7)
    months.set(month, [...(months.get(month) ?? []), entry])
  })
  return [...months.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([month, monthEntries]) => {
      const dayMap = new Map<string, JourneyEntry[]>()
      monthEntries.forEach((entry) => dayMap.set(entry.occurredOn, [...(dayMap.get(entry.occurredOn) ?? []), entry]))
      const actions = monthEntries.filter((entry) => entry.kind === 'action')
      const attributeXp = Object.fromEntries(attributes.map((attribute) => [attribute, 0])) as Record<Attribute, number>
      const domainXp = Object.fromEntries(growthDomains.map((domain) => [domain, 0])) as Record<GrowthDomain, number>
      actions.forEach((entry) => { if (entry.attribute) attributeXp[entry.attribute] += entry.xp })
      actions.forEach((entry) => { if (entry.domain) domainXp[entry.domain] += entry.xp })
      const strongestAttribute = [...attributes].sort((left, right) => attributeXp[right] - attributeXp[left]).find((attribute) => attributeXp[attribute] > 0)
      const strongestDomain = [...growthDomains].sort((left, right) => domainXp[right] - domainXp[left]).find((domain) => domainXp[domain] > 0)
      const [year, monthNumber] = month.split('-')
      return {
        month,
        label: `${year} 年 ${Number(monthNumber)} 月`,
        activeDays: new Set(actions.map((entry) => entry.occurredOn)).size,
        actionCount: actions.length,
        xp: actions.reduce((total, entry) => total + entry.xp, 0),
        coins: actions.reduce((total, entry) => total + entry.coins, 0),
        strongestAttribute,
        strongestDomain,
        days: [...dayMap.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([date, dayEntries]) => ({
          date,
          entries: dayEntries.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
          actionCount: dayEntries.filter((entry) => entry.kind === 'action').length,
          hasMilestone: dayEntries.some((entry) => entry.kind !== 'action'),
        })),
      }
    })
}

export function calculateStats(events: LedgerEvent[]): CharacterStats {
  const attributeXp = Object.fromEntries(attributes.map((attribute) => [attribute, 0])) as Record<Attribute, number>
  const domainXp = Object.fromEntries(growthDomains.map((domain) => [domain, 0])) as Record<GrowthDomain, number>
  let totalXp = 0
  let coins = 0
  for (const event of events) {
    totalXp += event.xpDelta
    coins += event.coinDelta
    if (event.attribute) attributeXp[event.attribute] += event.xpDelta
    if (event.domain) domainXp[event.domain] += event.xpDelta
  }
  return { totalXp, coins, attributeXp, domainXp }
}

export function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function gameDate(date = new Date()) {
  const shifted = new Date(date)
  shifted.setHours(shifted.getHours() - 4)
  return localDate(shifted)
}

export function effectiveGameDate(date = new Date(), activatedAt?: string) {
  if (!activatedAt || date.getTime() < new Date(activatedAt).getTime()) return localDate(date)
  return gameDate(date)
}

export function getGameDayActivation(date = new Date()) {
  if (date.getHours() >= 4) return date.toISOString()
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 4).toISOString()
}

export function nextGameDayBoundary(date = new Date()) {
  const boundary = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 4)
  if (date.getTime() >= boundary.getTime()) boundary.setDate(boundary.getDate() + 1)
  return boundary
}

export function startOfWeek(date = new Date()) {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = value.getDay() || 7
  value.setDate(value.getDate() - day + 1)
  return localDate(value)
}

export function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + amount)
  return localDate(value)
}

export interface RewardPriceSuggestions {
  near: number
  medium: number
  far: number
  dailyCoins?: number
  observedDays: number
}

export function getRewardPriceSuggestions(events: LedgerEvent[], today: string): RewardPriceSuggestions {
  const earningEvents = events
    .filter((event) => (event.kind === 'reward' || event.kind === 'correction') && event.coinDelta !== 0 && event.occurredOn <= today)
    .sort((left, right) => left.occurredOn.localeCompare(right.occurredOn))
  if (earningEvents.length === 0) return { near: 30, medium: 80, far: 200, observedDays: 0 }

  const firstDate = earningEvents[0].occurredOn
  const observedDays = Math.min(28, Math.floor((new Date(`${today}T12:00:00`).getTime() - new Date(`${firstDate}T12:00:00`).getTime()) / 86_400_000) + 1)
  const windowStart = addDays(today, -27)
  const earnedCoins = earningEvents
    .filter((event) => event.occurredOn >= windowStart)
    .reduce((total, event) => total + event.coinDelta, 0)
  if (observedDays < 14 || earnedCoins <= 0) return { near: 30, medium: 80, far: 200, observedDays }

  const dailyCoins = earnedCoins / observedDays
  const ceilToFive = (value: number) => Math.ceil(value / 5) * 5
  const near = Math.max(10, ceilToFive(dailyCoins * 7))
  const medium = Math.max(near + 5, ceilToFive(dailyCoins * 21))
  const far = Math.max(medium + 5, ceilToFive(dailyCoins * 56))
  return { near, medium, far, dailyCoins, observedDays }
}

export function identityMessage(domain: GrowthDomain) {
  return growthDomainDetails[domain].identity
}

export function isDurationGoal(activity: Activity): activity is Activity & { goal: LegacyGoal } {
  return activity.goal.kind !== 'tiered' && (activity.goal.kind === 'duration' || activity.goal.unit === '分钟')
}

export function isTieredGoal(activity: Activity): activity is Activity & { goal: TieredGoal } {
  return activity.goal.kind === 'tiered'
}

export type IncrementalTieredGoal =
  | (Extract<TieredGoal, { metric: 'count' }> & { progressMode: 'incremental' })
  | (Extract<TieredGoal, { metric: 'combined' }> & { progressMode: 'incremental' })

export function isIncrementalGoal(activity: Activity): activity is Activity & { goal: IncrementalTieredGoal; schedule: { kind: 'weekly'; times: number } } {
  return activity.goal.kind === 'tiered' && 'progressMode' in activity.goal && activity.goal.progressMode === 'incremental' && activity.schedule.kind === 'weekly'
}

export interface IncrementalProgressSummary {
  goal: IncrementalTieredGoal
  totalCount: number
  totalDurationSeconds: number
  highestTier?: TierLevel
  nextTier?: TierLevel
  qualifiedCounts: Partial<Record<TierLevel, number>>
  maxReached: boolean
}

export function calculateIncrementalProgress(goal: IncrementalTieredGoal, completions: Completion[]): IncrementalProgressSummary {
  const active = completions.filter((completion) => completion.status === 'active' && completion.progress)
  const totalCount = active.reduce((total, completion) => total + (completion.progress?.countDelta ?? 0), 0)
  const totalDurationSeconds = active.reduce((total, completion) => total + (completion.progress?.durationSeconds ?? 0), 0)
  const qualifiedCounts: Partial<Record<TierLevel, number>> = {}
  const reached = goal.metric === 'count'
    ? getTierLevels(goal).filter((tier) => {
      const threshold = goal.thresholds[tier - 1]
      qualifiedCounts[tier] = totalCount
      return totalCount >= threshold
    })
    : getTierLevels(goal).filter((tier) => {
    const threshold = goal.thresholds[tier - 1]
    if (goal.mode === 'total') {
      qualifiedCounts[tier] = totalCount
      return totalCount >= threshold.count && totalDurationSeconds >= threshold.durationSeconds
    }
    const qualified = active.reduce((total, completion) => {
      const duration = completion.progress?.perOccurrenceDurationSeconds ?? completion.progress?.durationSeconds ?? 0
      return total + (duration >= threshold.durationSeconds ? completion.progress?.countDelta ?? 0 : 0)
    }, 0)
    qualifiedCounts[tier] = qualified
    return qualified >= threshold.count
  })
  const highestTier = reached.at(-1)
  const levels = getTierLevels(goal)
  const nextTier = levels.find((tier) => !highestTier || tier > highestTier)
  return { goal, totalCount, totalDurationSeconds, highestTier, nextTier, qualifiedCounts, maxReached: highestTier === levels.at(-1) }
}

export function getIncrementalCycleGoal(activity: Activity, completions: Completion[], cycleStart: string): IncrementalTieredGoal | undefined {
  const snapshot = completions
    .filter((completion) => completion.activityId === activity.id && completion.progress?.cycleStart === cycleStart)
    .sort((left, right) => (left.progress?.sequence ?? 0) - (right.progress?.sequence ?? 0))[0]?.tierGoalSnapshot
  if (snapshot && 'progressMode' in snapshot && snapshot.progressMode === 'incremental') return snapshot as IncrementalTieredGoal
  return isIncrementalGoal(activity) ? activity.goal : undefined
}

export function getTierLevels(goal: TieredGoal): TierLevel[] {
  return tierLevels.slice(0, goal.thresholds.length)
}

export function getTierCount(goal: TieredGoal): 2 | 3 {
  return goal.thresholds.length
}

export function formatGoalValue(value: number, metric: TierMetric, unit: string) {
  if (metric !== 'duration') return `${value}${unit}`
  return formatDurationSeconds(unit === '分钟' ? value * 60 : value)
}

export function formatDurationSeconds(totalSeconds: number) {
  const value = Math.max(0, Math.floor(totalSeconds))
  if (value < 60) return `${value}秒`
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = value % 60
  const parts = [hours ? `${hours}小时` : '', minutes ? `${minutes}分钟` : '', seconds ? `${seconds}秒` : ''].filter(Boolean)
  return parts.join('')
}

export function getTierDurationSeconds(goal: Extract<TieredGoal, { metric: 'duration' }>, tier: TierLevel) {
  const value = goal.thresholds[tier - 1]
  return goal.unit === '分钟' ? value * 60 : value
}

export function formatTierGoalValue(goal: TieredGoal, tier: TierLevel) {
  if (goal.metric === 'count') return `${goal.thresholds[tier - 1]}${goal.unit}`
  if (goal.metric === 'duration') return formatDurationSeconds(getTierDurationSeconds(goal, tier))
  const threshold = goal.thresholds[tier - 1]
  const duration = formatDurationSeconds(threshold.durationSeconds)
  return goal.mode === 'per_occurrence'
    ? `${threshold.count}${goal.countUnit} × 每次${duration}`
    : `总计${threshold.count}${goal.countUnit} · 累计${duration}`
}

export function getTierAchievement(goal: TieredGoal, tier: TierLevel) {
  if (goal.metric === 'count') return { count: goal.thresholds[tier - 1], countUnit: goal.unit, durationSeconds: 0 }
  if (goal.metric === 'duration') return { count: 0, durationSeconds: getTierDurationSeconds(goal, tier) }
  const threshold = goal.thresholds[tier - 1]
  return {
    count: threshold.count,
    countUnit: goal.countUnit,
    durationSeconds: goal.mode === 'per_occurrence' ? threshold.count * threshold.durationSeconds : threshold.durationSeconds,
  }
}

export function getCompletionTierGoal(completion: Completion, activity?: Activity): TieredGoal | undefined {
  if (completion.tierGoalSnapshot) return completion.tierGoalSnapshot
  if (completion.tierMetric && completion.tierUnit && completion.tierThresholds) {
    const legacy = TieredGoalSchema.safeParse({
      kind: 'tiered',
      metric: completion.tierMetric,
      unit: completion.tierUnit,
      thresholds: completion.tierThresholds,
    })
    if (legacy.success) return legacy.data
  }
  return activity && isTieredGoal(activity) ? activity.goal : undefined
}
