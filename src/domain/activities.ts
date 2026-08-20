import { z } from 'zod'

import {
  ActivityGoalSchema,
  RatingGoalSchema,
  ScalarThresholdsSchema,
  ScheduleSchema,
  TieredGoalSchema,
  getTierLevels,
  type LegacyGoal,
  type RatingGoal,
  type TieredGoal,
} from './goals'
import { dateString, scheduledTime, timestamp } from './shared'
import { attributes, difficulties, growthDomains, type TierLevel } from './taxonomy'

export const HabitAnchorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('time'), time: scheduledTime }).strict(),
  z.object({ kind: z.literal('event'), label: z.string().trim().min(1).max(80) }).strict(),
  z.object({
    kind: z.literal('after_activity'),
    activityId: z.string().min(1),
    titleSnapshot: z.string().trim().min(1).max(60),
  }).strict(),
])

export const HabitFormationSchema = z.object({
  configuredAt: timestamp,
  anchor: HabitAnchorSchema.optional(),
}).strict()

export type HabitAnchor = z.infer<typeof HabitAnchorSchema>
export type HabitFormation = z.infer<typeof HabitFormationSchema>

export const ActivitySchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(60),
    scheduledTime: scheduledTime.optional(),
    cue: z.string().trim().min(1).max(80).optional(),
    protocol: z.string().trim().min(1).max(280).optional(),
    habitFormation: HabitFormationSchema.optional(),
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
    if (activity.type === 'task' && activity.goal.kind === 'rating') {
      context.addIssue({ code: 'custom', path: ['goal'], message: '评分体验只能用于习惯' })
    }
    if (activity.goal.kind === 'rating' && (activity.type !== 'habit' || activity.schedule.kind !== 'daily')) {
      context.addIssue({ code: 'custom', path: ['goal'], message: '评分体验只能用于每日习惯' })
    }
    if (activity.habitFormation && (activity.type !== 'habit' || activity.schedule.kind !== 'daily')) {
      context.addIssue({ code: 'custom', path: ['habitFormation'], message: '启动锚点只适用于每日习惯' })
    }
    if (activity.archivedAt && (activity.enabled || activity.isKey)) {
      context.addIssue({ code: 'custom', path: ['archivedAt'], message: '已归档活动不能启用或设为关键行为' })
    }
    if (activity.goal.kind !== 'tiered' && activity.goal.kind !== 'rating' && (activity.goal.kind === 'duration' || activity.goal.unit === '分钟') && (!Number.isInteger(activity.goal.count) || activity.goal.count > 1440)) {
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

export function getActivityScheduledTime(activity: Pick<Activity, 'scheduledTime' | 'cue' | 'habitFormation'>) {
  return (activity.habitFormation?.anchor?.kind === 'time'
    ? activity.habitFormation.anchor.time
    : activity.scheduledTime) ?? parseScheduledTime(activity.cue)
}

export function getEffectiveHabitAnchor(activity: Pick<Activity, 'scheduledTime' | 'cue' | 'habitFormation'>): HabitAnchor | undefined {
  if (activity.habitFormation?.anchor) return activity.habitFormation.anchor
  if (activity.scheduledTime) return { kind: 'time', time: activity.scheduledTime }
  const legacyTime = parseScheduledTime(activity.cue)
  if (legacyTime) return { kind: 'time', time: legacyTime }
  if (activity.cue) return { kind: 'event', label: activity.cue }
  return undefined
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
    ratingValue: z.number().int().min(1).max(5).optional(),
    ratingGoalSnapshot: RatingGoalSchema.optional(),
    ratingUpdatedAt: timestamp.optional(),
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
    const ratingValues = [completion.ratingValue, completion.ratingGoalSnapshot]
    if (ratingValues.some((value) => value !== undefined) && ratingValues.some((value) => value === undefined)) {
      context.addIssue({ code: 'custom', path: ['ratingValue'], message: '评分完成必须同时保存分数和评分目标快照' })
    }
    if (completion.ratingUpdatedAt && completion.ratingValue === undefined) {
      context.addIssue({ code: 'custom', path: ['ratingUpdatedAt'], message: '评分修订时间只能用于评分完成' })
    }
    if (completion.ratingValue !== undefined && (completion.tier !== undefined || completion.progress !== undefined)) {
      context.addIssue({ code: 'custom', path: ['ratingValue'], message: '评分完成不能同时保存分层或累计进度' })
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

export function isDurationGoal(activity: Activity): activity is Activity & { goal: LegacyGoal } {
  return activity.goal.kind !== 'tiered' && activity.goal.kind !== 'rating' && (activity.goal.kind === 'duration' || activity.goal.unit === '分钟')
}

export function isTieredGoal(activity: Activity): activity is Activity & { goal: TieredGoal } {
  return activity.goal.kind === 'tiered'
}

export function isRatingGoal(activity: Activity): activity is Activity & { goal: RatingGoal; schedule: { kind: 'daily' } } {
  return activity.goal.kind === 'rating' && activity.schedule.kind === 'daily'
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
