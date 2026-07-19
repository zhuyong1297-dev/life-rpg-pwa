import { z } from 'zod'

export const attributes = ['体魄', '智识', '专注', '创造', '关系', '心境'] as const
export const difficulties = ['简单', '普通', '困难', 'Boss'] as const
export const reviewDecisions = ['保留', '调整', '暂停'] as const
export const tierLevels = [1, 2, 3] as const
export const tierLabels = { 1: '基础', 2: '标准', 3: '突破' } as const
export const timeInputUnits = ['秒', '分钟'] as const
export const combinedModes = ['per_occurrence', 'total'] as const

export type Attribute = (typeof attributes)[number]
export type Difficulty = (typeof difficulties)[number]
export type ReviewDecision = (typeof reviewDecisions)[number]
export type TierLevel = (typeof tierLevels)[number]
export type TierMetric = 'duration' | 'count'
export type TimeInputUnit = (typeof timeInputUnits)[number]
export type CombinedMode = (typeof combinedModes)[number]

export const rewardTable: Record<Difficulty, { xp: number; coins: number }> = {
  简单: { xp: 5, coins: 2 },
  普通: { xp: 10, coins: 5 },
  困难: { xp: 20, coins: 10 },
  Boss: { xp: 50, coins: 25 },
}

const tierXpRates: Record<TierLevel, number> = { 1: 0.6, 2: 0.8, 3: 1 }

export function getTierReward(difficulty: Difficulty, tier: TierLevel) {
  const reward = rewardTable[difficulty]
  return { xp: Math.round(reward.xp * tierXpRates[tier]), coins: reward.coins }
}

export function getTierUpgradeXp(difficulty: Difficulty, from: TierLevel, to: TierLevel) {
  return Math.max(0, getTierReward(difficulty, to).xp - getTierReward(difficulty, from).xp)
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const dateString = z.string().regex(datePattern, '日期必须使用 YYYY-MM-DD')
const timestamp = z.string().datetime()

export const ScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily') }),
  z.object({ kind: z.literal('weekly'), times: z.number().int().min(1).max(7) }),
  z.object({ kind: z.literal('once') }),
])

const LegacyGoalSchema = z.object({
  kind: z.enum(['count', 'duration']).optional(),
  count: z.number().positive().max(1440),
  unit: z.string().trim().min(1).max(12),
})

export type LegacyGoal = z.infer<typeof LegacyGoalSchema>

const ScalarThresholdsSchema = z.tuple([
  z.number().int().positive(),
  z.number().int().positive(),
  z.number().int().positive(),
])

function validateScalarThresholds(thresholds: [number, number, number], maximum: number, context: z.RefinementCtx) {
  thresholds.forEach((value, index) => {
    if (value > maximum) context.addIssue({ code: 'custom', path: ['thresholds', index], message: `目标不能超过 ${maximum}` })
  })
  if (!(thresholds[0] < thresholds[1] && thresholds[1] < thresholds[2])) {
    context.addIssue({ code: 'custom', path: ['thresholds'], message: '三层目标必须按基础、标准、突破严格递增' })
  }
}

const CountTieredGoalSchema = z
  .object({
    kind: z.literal('tiered'),
    metric: z.literal('count'),
    unit: z.string().trim().min(1).max(12),
    thresholds: ScalarThresholdsSchema,
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
    thresholds: z.tuple([CombinedThresholdSchema, CombinedThresholdSchema, CombinedThresholdSchema]),
  })
  .superRefine((goal, context) => {
    if (goal.inputUnit === '分钟' && goal.thresholds.some((value) => value.durationSeconds % 60 !== 0)) {
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

export const ActivitySchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(60),
    type: z.enum(['habit', 'task']),
    attribute: z.enum(attributes),
    difficulty: z.enum(difficulties),
    goal: z.union([LegacyGoalSchema, TieredGoalSchema]),
    schedule: ScheduleSchema,
    plannedOn: dateString.optional(),
    isKey: z.boolean(),
    enabled: z.boolean(),
    revision: z.number().int().positive().optional(),
    archivedAt: timestamp.optional(),
    createdAt: timestamp,
  })
  .superRefine((activity, context) => {
    if (activity.type === 'habit' && activity.schedule.kind === 'once') {
      context.addIssue({ code: 'custom', path: ['schedule'], message: '习惯必须设置每天或每周计划' })
    }
    if (activity.type === 'task' && activity.schedule.kind !== 'once') {
      context.addIssue({ code: 'custom', path: ['schedule'], message: '一次性任务必须使用单次计划' })
    }
    if (activity.type === 'task' && activity.goal.kind === 'tiered') {
      context.addIssue({ code: 'custom', path: ['goal'], message: '三层目标只能用于习惯' })
    }
    if (activity.archivedAt && (activity.enabled || activity.isKey)) {
      context.addIssue({ code: 'custom', path: ['archivedAt'], message: '已归档活动不能启用或设为关键行为' })
    }
    if (activity.goal.kind !== 'tiered' && (activity.goal.kind === 'duration' || activity.goal.unit === '分钟') && (!Number.isInteger(activity.goal.count) || activity.goal.count > 1440)) {
      context.addIssue({ code: 'custom', path: ['goal', 'count'], message: '时长目标必须是 1 至 1440 分钟的整数' })
    }
  })

export type Activity = z.infer<typeof ActivitySchema>

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
    tierThresholds: z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]).optional(),
    achievedValue: z.number().int().positive().optional(),
    tierGoalSnapshot: TieredGoalSchema.optional(),
    activityRevision: z.number().int().positive().optional(),
    titleSnapshot: z.string().trim().min(1).max(60).optional(),
    attributeSnapshot: z.enum(attributes).optional(),
    difficultySnapshot: z.enum(difficulties).optional(),
    createdAt: timestamp,
    undoneAt: timestamp.optional(),
  })
  .superRefine((completion, context) => {
    const legacyValues = [completion.tierMetric, completion.tierUnit, completion.tierThresholds, completion.achievedValue]
    if (legacyValues.some((value) => value !== undefined) && legacyValues.some((value) => value === undefined)) {
      context.addIssue({ code: 'custom', path: ['tier'], message: '三层完成快照字段不完整' })
      return
    }
    if (completion.tier && !completion.tierGoalSnapshot && legacyValues.every((value) => value === undefined)) {
      context.addIssue({ code: 'custom', path: ['tier'], message: '三层完成必须保存目标快照' })
    }
    if (!completion.tier && (completion.tierGoalSnapshot || legacyValues.some((value) => value !== undefined))) {
      context.addIssue({ code: 'custom', path: ['tier'], message: '目标快照缺少完成层次' })
    }
    if (completion.tier && completion.tierMetric && completion.tierUnit && completion.tierThresholds && completion.achievedValue) {
      const goal = TieredGoalSchema.safeParse({ kind: 'tiered', metric: completion.tierMetric, unit: completion.tierUnit, thresholds: completion.tierThresholds })
      if (!goal.success || completion.achievedValue !== completion.tierThresholds[completion.tier - 1]) {
        context.addIssue({ code: 'custom', path: ['achievedValue'], message: '三层完成快照与所选层次不一致' })
      }
    }
    const activitySnapshot = [completion.activityRevision, completion.titleSnapshot, completion.attributeSnapshot, completion.difficultySnapshot]
    if (activitySnapshot.some((value) => value !== undefined) && activitySnapshot.some((value) => value === undefined)) {
      context.addIssue({ code: 'custom', path: ['activityRevision'], message: '完成时的活动配置快照不完整' })
    }
  })

export type Completion = z.infer<typeof CompletionSchema>

export const LedgerEventSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['reward', 'correction', 'redemption']),
  sourceId: z.string().min(1),
  occurredOn: dateString,
  title: z.string().min(1).max(80),
  attribute: z.enum(attributes).optional(),
  xpDelta: z.number().int(),
  coinDelta: z.number().int(),
  createdAt: timestamp,
})

export type LedgerEvent = z.infer<typeof LedgerEventSchema>

export const RewardSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  cost: z.number().int().positive(),
  enabled: z.boolean(),
  createdAt: timestamp,
})

export type Reward = z.infer<typeof RewardSchema>

export const ReviewItemSchema = z.object({
  activityId: z.string().min(1),
  adherence: z.number().min(0).max(1),
  completed: z.number().int().nonnegative(),
  planned: z.number().int().positive(),
  impact: z.number().int().min(1).max(5),
  friction: z.number().int().min(1).max(5),
  decision: z.enum(reviewDecisions),
  note: z.string().max(280).optional(),
  actualDurationMinutes: z.number().int().nonnegative().optional(),
  plannedDurationMinutes: z.number().int().positive().optional(),
  tierCounts: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative()]).optional(),
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

export const PreferencesSchema = z.object({
  notifications: z.boolean(),
  vibration: z.boolean(),
  sound: z.boolean(),
})

export const MetaSchema = z.object({
  lastBackupAt: timestamp.optional(),
  migrationImportedAt: timestamp.optional(),
})

export const SettingSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('preferences'), value: PreferencesSchema }),
  z.object({ key: z.literal('meta'), value: MetaSchema }),
])

export type Setting = z.infer<typeof SettingSchema>
export type Preferences = z.infer<typeof PreferencesSchema>

export interface CharacterStats {
  totalXp: number
  coins: number
  attributeXp: Record<Attribute, number>
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

export function getCharacterStage(level: number) {
  if (level <= 2) return 1
  if (level <= 5) return 2
  if (level <= 9) return 3
  return 4
}

export function calculateStats(events: LedgerEvent[]): CharacterStats {
  const attributeXp = Object.fromEntries(attributes.map((attribute) => [attribute, 0])) as Record<Attribute, number>
  let totalXp = 0
  let coins = 0
  for (const event of events) {
    totalXp += event.xpDelta
    coins += event.coinDelta
    if (event.attribute) attributeXp[event.attribute] += event.xpDelta
  }
  return { totalXp, coins, attributeXp }
}

export function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

export function identityMessage(attribute: Attribute) {
  return `你正在强化${attribute}`
}

export function isDurationGoal(activity: Activity): activity is Activity & { goal: LegacyGoal } {
  return activity.goal.kind !== 'tiered' && (activity.goal.kind === 'duration' || activity.goal.unit === '分钟')
}

export function isTieredGoal(activity: Activity): activity is Activity & { goal: TieredGoal } {
  return activity.goal.kind === 'tiered'
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
