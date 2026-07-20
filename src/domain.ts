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
    thresholds: z.union([
      z.tuple([CombinedThresholdSchema, CombinedThresholdSchema]),
      z.tuple([CombinedThresholdSchema, CombinedThresholdSchema, CombinedThresholdSchema]),
    ]),
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
      context.addIssue({ code: 'custom', path: ['goal'], message: '分层目标只能用于习惯' })
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
    tierThresholds: ScalarThresholdsSchema.optional(),
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
      context.addIssue({ code: 'custom', path: ['tier'], message: '分层完成快照字段不完整' })
      return
    }
    if (completion.tier && !completion.tierGoalSnapshot && legacyValues.every((value) => value === undefined)) {
      context.addIssue({ code: 'custom', path: ['tier'], message: '分层完成必须保存目标快照' })
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
  kind: z.enum(['reward', 'correction', 'redemption', 'milestone']),
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
  titleSnapshot: z.string().trim().min(1).max(60).optional(),
  attributeSnapshot: z.enum(attributes).optional(),
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
    voucherMaxCost: z.number().int().positive().optional(),
    claimedRewardId: z.string().min(1).optional(),
    claimedAt: timestamp.optional(),
  })
  .superRefine((milestone, context) => {
    if ((milestone.acknowledgedAt === undefined) !== (milestone.focusAttribute === undefined)) {
      context.addIssue({ code: 'custom', path: ['focusAttribute'], message: '查看升级报告时必须选择下一等级方向' })
    }
    if ((milestone.claimedRewardId === undefined) !== (milestone.claimedAt === undefined)) {
      context.addIssue({ code: 'custom', path: ['claimedRewardId'], message: '阶段礼券领取信息不完整' })
    }
    if (milestone.claimedRewardId && !milestone.voucherMaxCost) {
      context.addIssue({ code: 'custom', path: ['voucherMaxCost'], message: '没有礼券额度的等级不能领取奖励' })
    }
  })

export type LevelMilestone = z.infer<typeof LevelMilestoneSchema>

export const LevelSystemSchema = z
  .object({
    activatedAt: timestamp,
    baselineLevel: z.number().int().positive(),
    highestLevelReached: z.number().int().positive(),
    focusAttribute: z.enum(attributes).optional(),
    milestones: z.array(LevelMilestoneSchema),
  })
  .superRefine((system, context) => {
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
})

export const SettingSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('preferences'), value: PreferencesSchema }),
  z.object({ key: z.literal('meta'), value: MetaSchema }),
])

export type Setting = z.infer<typeof SettingSchema>
export type Preferences = z.infer<typeof PreferencesSchema>
export type FeedbackIntensity = Preferences['feedbackIntensity']

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
  const completions = new Map<string, { title: string; xp: number; occurredOn: string }>()
  for (const event of rewards) {
    if (event.attribute) attributeXp[event.attribute] += event.xpDelta
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
  return {
    activeDays: new Set([...completions.values()].map((completion) => completion.occurredOn)).size,
    completionCount: completions.size,
    attributeXp,
    strongestAttribute,
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
  xp: number
  coins: number
  tier?: TierLevel
  note?: string
  durationMinutes?: number
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
  days: JourneyDay[]
}

export function getJourneyMonths(completions: Completion[], events: LedgerEvent[], levelSystem?: LevelSystem): JourneyMonth[] {
  const correctedRewards = new Set(events.filter((event) => event.kind === 'correction').map((event) => event.sourceId))
  const rewardsByCompletion = new Map<string, LedgerEvent[]>()
  events
    .filter((event) => event.kind === 'reward' && !correctedRewards.has(event.id))
    .forEach((event) => rewardsByCompletion.set(event.sourceId, [...(rewardsByCompletion.get(event.sourceId) ?? []), event]))

  const entries: JourneyEntry[] = completions
    .filter((completion) => completion.status === 'active')
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
        xp: rewards.reduce((total, event) => total + event.xpDelta, 0),
        coins: rewards.reduce((total, event) => total + event.coinDelta, 0),
        tier: completion.tier,
        note: completion.note,
        durationMinutes: completion.durationMinutes,
        tierGoalSnapshot: completion.tierGoalSnapshot,
      }]
    })

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
      actions.forEach((entry) => { if (entry.attribute) attributeXp[entry.attribute] += entry.xp })
      const strongestAttribute = [...attributes].sort((left, right) => attributeXp[right] - attributeXp[left]).find((attribute) => attributeXp[attribute] > 0)
      const [year, monthNumber] = month.split('-')
      return {
        month,
        label: `${year} 年 ${Number(monthNumber)} 月`,
        activeDays: new Set(actions.map((entry) => entry.occurredOn)).size,
        actionCount: actions.length,
        xp: actions.reduce((total, entry) => total + entry.xp, 0),
        coins: actions.reduce((total, entry) => total + entry.coins, 0),
        strongestAttribute,
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

export function identityMessage(attribute: Attribute) {
  return `你正在强化${attribute}`
}

export function isDurationGoal(activity: Activity): activity is Activity & { goal: LegacyGoal } {
  return activity.goal.kind !== 'tiered' && (activity.goal.kind === 'duration' || activity.goal.unit === '分钟')
}

export function isTieredGoal(activity: Activity): activity is Activity & { goal: TieredGoal } {
  return activity.goal.kind === 'tiered'
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
