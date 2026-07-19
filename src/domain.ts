import { z } from 'zod'

export const attributes = ['体魄', '智识', '专注', '创造', '关系', '心境'] as const
export const difficulties = ['简单', '普通', '困难', 'Boss'] as const
export const reviewDecisions = ['保留', '调整', '暂停'] as const
export const tierLevels = [1, 2, 3] as const
export const tierLabels = { 1: '基础', 2: '标准', 3: '突破' } as const

export type Attribute = (typeof attributes)[number]
export type Difficulty = (typeof difficulties)[number]
export type ReviewDecision = (typeof reviewDecisions)[number]
export type TierLevel = (typeof tierLevels)[number]
export type TierMetric = 'duration' | 'count'

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

export const TieredGoalSchema = z
  .object({
    kind: z.literal('tiered'),
    metric: z.enum(['duration', 'count']),
    unit: z.string().trim().min(1).max(12),
    thresholds: z.tuple([
      z.number().int().positive(),
      z.number().int().positive(),
      z.number().int().positive(),
    ]),
  })
  .superRefine((goal, context) => {
    const maximum = goal.metric === 'duration' ? 1440 : 999
    if (goal.metric === 'duration' && goal.unit !== '分钟') {
      context.addIssue({ code: 'custom', path: ['unit'], message: '时间目标的单位必须是分钟' })
    }
    goal.thresholds.forEach((value, index) => {
      if (value > maximum) context.addIssue({ code: 'custom', path: ['thresholds', index], message: `目标不能超过 ${maximum}` })
    })
    if (!(goal.thresholds[0] < goal.thresholds[1] && goal.thresholds[1] < goal.thresholds[2])) {
      context.addIssue({ code: 'custom', path: ['thresholds'], message: '三层目标必须按基础、标准、突破严格递增' })
    }
  })

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
    createdAt: timestamp,
    undoneAt: timestamp.optional(),
  })
  .superRefine((completion, context) => {
    const values = [completion.tier, completion.tierMetric, completion.tierUnit, completion.tierThresholds, completion.achievedValue]
    if (values.some((value) => value !== undefined) && values.some((value) => value === undefined)) {
      context.addIssue({ code: 'custom', path: ['tier'], message: '三层完成快照字段不完整' })
      return
    }
    if (completion.tier && completion.tierMetric && completion.tierUnit && completion.tierThresholds && completion.achievedValue) {
      const goal = TieredGoalSchema.safeParse({ kind: 'tiered', metric: completion.tierMetric, unit: completion.tierUnit, thresholds: completion.tierThresholds })
      if (!goal.success || completion.achievedValue !== completion.tierThresholds[completion.tier - 1]) {
        context.addIssue({ code: 'custom', path: ['achievedValue'], message: '三层完成快照与所选层次不一致' })
      }
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
  if (value < 60) return `${value} 分钟`
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
}
