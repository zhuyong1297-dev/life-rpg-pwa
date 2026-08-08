import { z } from 'zod'

import { type LedgerEvent } from './activities'
import { addDays } from './dates'
import { dateString, timestamp } from './shared'

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
