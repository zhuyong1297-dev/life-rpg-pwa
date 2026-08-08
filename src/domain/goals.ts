import { z } from 'zod'

import { combinedModes, tierLevels, timeInputUnits, type Difficulty, type TierLevel, type TierMetric } from './taxonomy'

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

export const ScalarThresholdsSchema = z.union([
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

export const RatingGoalSchema = z.object({
  kind: z.literal('rating'),
  scale: z.literal(5),
  prompt: z.string().trim().min(1).max(60),
  anchors: z.object({
    low: z.string().trim().min(1).max(60),
    middle: z.string().trim().min(1).max(60),
    high: z.string().trim().min(1).max(60),
  }).strict(),
  notePrompt: z.string().trim().min(1).max(60).optional(),
}).strict()

export type RatingGoal = z.infer<typeof RatingGoalSchema>

export const ActivityGoalSchema = z.union([LegacyGoalSchema, TieredGoalSchema, RatingGoalSchema])

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
