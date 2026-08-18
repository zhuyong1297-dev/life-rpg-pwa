import {
  LedgerEventSchema,
  type LedgerEvent,
  type Reward,
  RewardSchema,
  RewardClaimSchema,
  type RewardHorizon,
  type RewardRepeatPolicy,
  type RewardSystem,
  type RewardBudgetInput,
  RewardBudgetInputSchema,
  RewardSystemSchema,
  getRewardCooldownUntil,
  isRewardConfigured,
  calculateStats,
  LevelSystemSchema,
} from '../domain'
import { db, currentGameDate, type LifeRpgDatabase } from './database'

export interface RewardInput {
  title: string
  cost: number
  target: boolean
  reason?: string
  cashCostCents?: number
  horizon?: RewardHorizon
  imageDataUrl?: string
  repeatPolicy?: RewardRepeatPolicy
}
export async function createReward(input: RewardInput, database = db) {
  return database.transaction('rw', database.rewards, database.settings, async () => {
    const reward = RewardSchema.parse({
      id: crypto.randomUUID(),
      title: input.title,
      cost: input.cost,
      reason: input.reason,
      cashCostCents: input.cashCostCents,
      horizon: input.horizon,
      imageDataUrl: input.imageDataUrl,
      repeatPolicy: input.repeatPolicy,
      enabled: true,
      createdAt: new Date().toISOString(),
    })
    await database.rewards.add(reward)
    if (input.target) {
      if (!isRewardConfigured(reward)) throw new Error('请先补全愿望信息')
      const storedSystem = await database.settings.get('rewardSystem')
      if (storedSystem?.key !== 'rewardSystem') throw new Error('奖励系统尚未初始化')
      await database.settings.put({
        ...storedSystem,
        value: RewardSystemSchema.parse({
          ...storedSystem.value,
          activeRewardId: reward.id,
          queueIds: [
            ...(storedSystem.value.activeRewardId ? [storedSystem.value.activeRewardId] : []),
            ...storedSystem.value.queueIds,
          ].filter((id, index, ids) => id !== reward.id && ids.indexOf(id) === index),
        }),
      })
    }
    return reward
  })
}

export async function updateReward(rewardId: string, input: RewardInput, database = db) {
  return database.transaction('rw', database.rewards, database.settings, async () => {
    const existing = await database.rewards.get(rewardId)
    if (!existing) throw new Error('找不到这个奖励')
    const reward = RewardSchema.parse({
      ...existing,
      title: input.title,
      cost: input.cost,
      reason: input.reason ?? existing.reason,
      cashCostCents: input.cashCostCents ?? existing.cashCostCents,
      horizon: input.horizon ?? existing.horizon,
      imageDataUrl: input.imageDataUrl ?? existing.imageDataUrl,
      repeatPolicy: input.repeatPolicy ?? existing.repeatPolicy,
    })
    await database.rewards.put(reward)
    const storedSystem = await database.settings.get('rewardSystem')
    if (storedSystem?.key === 'rewardSystem') {
      const currentTarget = storedSystem.value.activeRewardId
      if (input.target) {
        if (!isRewardConfigured(reward)) throw new Error('请先补全愿望信息')
        await database.settings.put({
          ...storedSystem,
          value: RewardSystemSchema.parse({
            ...storedSystem.value,
            activeRewardId: reward.id,
            queueIds: [
              ...(currentTarget ? [currentTarget] : []),
              ...storedSystem.value.queueIds,
            ].filter((id, index, ids) => id !== reward.id && ids.indexOf(id) === index),
          }),
        })
      } else if (currentTarget === reward.id) {
        const [next, ...rest] = storedSystem.value.queueIds
        await database.settings.put({
          ...storedSystem,
          value: RewardSystemSchema.parse({ ...storedSystem.value, activeRewardId: next, queueIds: rest }),
        })
      }
    }
    return reward
  })
}

export async function setRewardEnabled(rewardId: string, enabled: boolean, database = db) {
  return database.transaction('rw', database.rewards, database.settings, async () => {
    const reward = await database.rewards.get(rewardId)
    if (!reward) throw new Error('找不到这个奖励')
    await database.rewards.update(rewardId, { enabled })
    const storedSystem = await database.settings.get('rewardSystem')
    if (!enabled && storedSystem?.key === 'rewardSystem') {
      const queue = storedSystem.value.queueIds.filter((id) => id !== rewardId)
      const activeRewardId = storedSystem.value.activeRewardId === rewardId ? queue.shift() : storedSystem.value.activeRewardId
      await database.settings.put({
        ...storedSystem,
        value: RewardSystemSchema.parse({ ...storedSystem.value, activeRewardId, queueIds: queue }),
      })
    }
  })
}

export async function setTargetReward(rewardId: string | undefined, database = db) {
  const storedSystem = await database.settings.get('rewardSystem')
  if (storedSystem?.key !== 'rewardSystem') throw new Error('奖励系统尚未初始化')
  const queue = rewardId
    ? [
        ...(storedSystem.value.activeRewardId ? [storedSystem.value.activeRewardId] : []),
        ...storedSystem.value.queueIds,
      ].filter((id, index, ids) => id !== rewardId && ids.indexOf(id) === index)
    : storedSystem.value.queueIds
  return setRewardQueue(rewardId, queue, database)
}

function monthsBetween(from: string, to: string) {
  const [fromYear, fromMonth] = from.split('-').map(Number)
  const [toYear, toMonth] = to.split('-').map(Number)
  return (toYear - fromYear) * 12 + toMonth - fromMonth
}

async function rollRewardSystem(system: RewardSystem, today: string, database: LifeRpgDatabase) {
  const month = today.slice(0, 7)
  const elapsed = monthsBetween(system.lastFundedMonth, month)
  if (elapsed <= 0) return system
  const reservedCents = (await database.rewardClaims.where('status').equals('reserved').toArray())
    .reduce((total, claim) => total + claim.cashCostCentsSnapshot, 0)
  const totalFund = Math.min(
    system.maxFundCents,
    system.availableCents + reservedCents + elapsed * system.monthlyAllowanceCents,
  )
  return RewardSystemSchema.parse({
    ...system,
    availableCents: Math.max(0, totalFund - reservedCents),
    lastFundedMonth: month,
  })
}

export async function applyRewardBudgetRollover(database = db, now = new Date()) {
  return database.transaction('rw', database.settings, database.rewardClaims, async () => {
    const stored = await database.settings.get('rewardSystem')
    if (stored?.key !== 'rewardSystem') throw new Error('奖励系统尚未初始化')
    const next = await rollRewardSystem(stored.value, await currentGameDate(database, now), database)
    if (next !== stored.value) await database.settings.put({ ...stored, value: next })
    return next
  })
}

export async function updateRewardBudget(input: RewardBudgetInput, database = db, now = new Date()) {
  const budget = RewardBudgetInputSchema.parse(input)
  return database.transaction('rw', database.settings, database.rewardClaims, async () => {
    const stored = await database.settings.get('rewardSystem')
    if (stored?.key !== 'rewardSystem') throw new Error('奖励系统尚未初始化')
    const today = await currentGameDate(database, now)
    const rolled = await rollRewardSystem(stored.value, today, database)
    const reservedCents = (await database.rewardClaims.where('status').equals('reserved').toArray())
      .reduce((total, claim) => total + claim.cashCostCentsSnapshot, 0)
    if (budget.maxFundCents < rolled.availableCents + reservedCents) {
      throw new Error('奖励基金上限不能低于当前可用与已预留金额之和')
    }
    if (
      rolled === stored.value &&
      stored.value.monthlyAllowanceCents === budget.monthlyAllowanceCents &&
      stored.value.maxFundCents === budget.maxFundCents
    ) return stored.value
    const value = RewardSystemSchema.parse({
      ...rolled,
      ...budget,
    })
    await database.settings.put({ ...stored, value })
    return value
  })
}

export async function setRewardQueue(activeRewardId: string | undefined, queueIds: string[], database = db, now = new Date()) {
  return database.transaction('rw', database.rewards, database.rewardClaims, database.settings, async () => {
    const stored = await database.settings.get('rewardSystem')
    if (stored?.key !== 'rewardSystem') throw new Error('奖励系统尚未初始化')
    const ids = [...(activeRewardId ? [activeRewardId] : []), ...queueIds]
    if (new Set(ids).size !== ids.length) throw new Error('奖励目标和候选队列不能重复')
    const rewards = await database.rewards.bulkGet(ids)
    const claims = await database.rewardClaims.toArray()
    const today = await currentGameDate(database, now)
    rewards.forEach((reward, index) => {
      if (!reward?.enabled || !isRewardConfigured(reward)) throw new Error('候选队列只能包含已整理的启用愿望')
      if (claims.some((claim) => claim.rewardId === reward.id && claim.status === 'reserved')) throw new Error('待兑现奖励不能重复加入目标')
      const cooldownUntil = getRewardCooldownUntil(reward, claims)
      if (cooldownUntil && cooldownUntil > today) throw new Error(`这个奖励冷却至 ${cooldownUntil}`)
      if (reward.id !== ids[index]) throw new Error('找不到候选奖励')
    })
    const value = RewardSystemSchema.parse({ ...stored.value, activeRewardId, queueIds })
    await database.settings.put({ ...stored, value })
    return value
  })
}

export interface ReserveRewardInput {
  plannedFor: string
  requestId: string
  milestoneLevel?: number
}

export async function reserveRewardClaim(rewardId: string, input: ReserveRewardInput, database = db, now = new Date()) {
  return database.transaction(
    'rw',
    database.rewards,
    database.rewardClaims,
    database.ledgerEvents,
    database.settings,
    async () => {
      const claimId = `reward-claim:${input.requestId}`
      const existing = await database.rewardClaims.get(claimId)
      if (existing) {
        if (existing.rewardId !== rewardId) throw new Error('请求 ID 已用于其他奖励')
        return { claim: existing, event: await database.ledgerEvents.get(`redemption:${claimId}`) }
      }

      const reward = await database.rewards.get(rewardId)
      if (!reward?.enabled || !isRewardConfigured(reward)) throw new Error('奖励不存在、已停用或尚未整理')
      const today = await currentGameDate(database, now)
      if (input.plannedFor < today) throw new Error('兑现日期不能早于今天')
      const claims = await database.rewardClaims.toArray()
      if (claims.some((claim) => claim.rewardId === reward.id && claim.status === 'reserved')) throw new Error('这个奖励已经有待兑现奖励券')
      const cooldownUntil = getRewardCooldownUntil(reward, claims)

      const storedSystem = await database.settings.get('rewardSystem')
      if (storedSystem?.key !== 'rewardSystem') throw new Error('奖励系统尚未初始化')
      const system = await rollRewardSystem(storedSystem.value, today, database)
      if (system.availableCents < reward.cashCostCents) throw new Error('本月奖励基金不足')

      const storedMeta = await database.settings.get('meta')
      const meta = storedMeta?.key === 'meta' ? storedMeta : undefined
      const milestone = input.milestoneLevel
        ? meta?.value.levelSystem?.milestones.find((item) => item.level === input.milestoneLevel)
        : undefined
      if (input.milestoneLevel) {
        if (!milestone?.voucherMaxCost) throw new Error('这个等级没有阶段礼券')
        if (milestone.claimedRewardId || milestone.reservedClaimId) throw new Error('这张阶段礼券已经领取或预留')
        if (reward.cost > milestone.voucherMaxCost) throw new Error(`这张礼券最多可领取 ${milestone.voucherMaxCost} 金币档奖励`)
      } else if (calculateStats(await database.ledgerEvents.toArray()).coins < reward.cost) {
        throw new Error('金币余额不足')
      }
      if (cooldownUntil && cooldownUntil > today) throw new Error(`这个奖励冷却至 ${cooldownUntil}`)

      const createdAt = now.toISOString()
      const claim = RewardClaimSchema.parse({
        id: claimId,
        rewardId: reward.id,
        source: input.milestoneLevel ? 'milestone' : 'coins',
        milestoneLevel: input.milestoneLevel,
        status: 'reserved',
        plannedFor: input.plannedFor,
        reservedOn: today,
        reservedAt: createdAt,
        titleSnapshot: reward.title,
        coinCostSnapshot: reward.cost,
        cashCostCentsSnapshot: reward.cashCostCents,
        horizonSnapshot: reward.horizon,
        repeatPolicySnapshot: reward.repeatPolicy,
      })
      const event = input.milestoneLevel
        ? undefined
        : LedgerEventSchema.parse({
            id: `redemption:${claim.id}`,
            kind: 'redemption',
            sourceId: claim.id,
            occurredOn: today,
            title: `锁定奖励：${reward.title}`,
            xpDelta: 0,
            coinDelta: -reward.cost,
            createdAt,
          })

      const queue = system.queueIds.filter((id) => id !== reward.id)
      const activeRewardId = system.activeRewardId === reward.id ? queue.shift() : system.activeRewardId
      await database.rewardClaims.add(claim)
      if (event) await database.ledgerEvents.add(event)
      await database.settings.put({
        ...storedSystem,
        value: RewardSystemSchema.parse({
          ...system,
          availableCents: system.availableCents - reward.cashCostCents,
          activeRewardId,
          queueIds: queue,
        }),
      })
      if (milestone && meta?.value.levelSystem) {
        const levelSystem = LevelSystemSchema.parse({
          ...meta.value.levelSystem,
          milestones: meta.value.levelSystem.milestones.map((item) => item.level === milestone.level
            ? { ...item, reservedClaimId: claim.id }
            : item),
        })
        await database.settings.put({ ...meta, value: { ...meta.value, levelSystem } })
      }
      return { claim, event }
    },
  )
}

export async function redeemReward(rewardId: string, database = db) {
  const today = await currentGameDate(database)
  const result = await reserveRewardClaim(rewardId, { plannedFor: today, requestId: crypto.randomUUID() }, database)
  return result.event
}

export async function fulfillRewardClaim(
  claimId: string,
  satisfaction: number,
  repeatAgain: boolean,
  database = db,
  now = new Date(),
) {
  return database.transaction('rw', database.rewardClaims, database.rewards, database.settings, database.ledgerEvents, async () => {
    const existing = await database.rewardClaims.get(claimId)
    if (!existing) throw new Error('找不到这张奖励券')
    if (existing.status === 'fulfilled') return { claim: existing, suggestDisable: existing.satisfaction! < 3 || !existing.repeatAgain }
    if (existing.status === 'cancelled') throw new Error('已取消的奖励券不能兑现')
    const reward = await database.rewards.get(existing.rewardId)
    const fulfilledAt = now.toISOString()
    const fulfilledOn = await currentGameDate(database, now)
    const claim = RewardClaimSchema.parse({
      ...existing,
      status: 'fulfilled',
      fulfilledOn,
      fulfilledAt,
      satisfaction,
      repeatAgain,
    })
    await database.rewardClaims.put(claim)

    if (claim.repeatPolicySnapshot.kind === 'one_time' && reward) {
      await database.rewards.update(reward.id, { enabled: false })
    }

    let event: LedgerEvent | undefined
    if (claim.source === 'milestone') {
      const storedMeta = await database.settings.get('meta')
      const meta = storedMeta?.key === 'meta' ? storedMeta : undefined
      const system = meta?.value.levelSystem
      const milestone = system?.milestones.find((item) => item.level === claim.milestoneLevel)
      if (!meta || !system || !milestone || milestone.reservedClaimId !== claim.id) throw new Error('等级礼券预留状态不一致')
      event = LedgerEventSchema.parse({
        id: `milestone:level:${claim.milestoneLevel}`,
        kind: 'milestone',
        sourceId: `level:${claim.milestoneLevel}`,
        occurredOn: fulfilledOn,
        title: `阶段礼券：${claim.titleSnapshot}`,
        xpDelta: 0,
        coinDelta: 0,
        createdAt: fulfilledAt,
      })
      const levelSystem = LevelSystemSchema.parse({
        ...system,
        milestones: system.milestones.map((item) => item.level === claim.milestoneLevel
          ? { ...item, reservedClaimId: undefined, claimedRewardId: claim.rewardId, claimedAt: fulfilledAt }
          : item),
      })
      await database.ledgerEvents.add(event)
      await database.settings.put({ ...meta, value: { ...meta.value, levelSystem } })
    }

    const storedSystem = await database.settings.get('rewardSystem')
    if (storedSystem?.key === 'rewardSystem' && claim.repeatPolicySnapshot.kind === 'one_time') {
      const queueIds = storedSystem.value.queueIds.filter((id) => id !== claim.rewardId)
      const activeRewardId = storedSystem.value.activeRewardId === claim.rewardId ? queueIds.shift() : storedSystem.value.activeRewardId
      await database.settings.put({
        ...storedSystem,
        value: RewardSystemSchema.parse({ ...storedSystem.value, activeRewardId, queueIds }),
      })
    }
    return { claim, event, suggestDisable: satisfaction < 3 || !repeatAgain }
  })
}

export async function cancelRewardClaim(claimId: string, database = db, now = new Date()) {
  return database.transaction('rw', database.rewardClaims, database.settings, database.ledgerEvents, async () => {
    const existing = await database.rewardClaims.get(claimId)
    if (!existing) throw new Error('找不到这张奖励券')
    if (existing.status === 'cancelled') {
      return { claim: existing, event: await database.ledgerEvents.get(`redemption_refund:${existing.id}`) }
    }
    if (existing.status === 'fulfilled') throw new Error('已兑现的奖励券不能取消')
    const claim = RewardClaimSchema.parse({ ...existing, status: 'cancelled', cancelledAt: now.toISOString() })
    const storedSystem = await database.settings.get('rewardSystem')
    if (storedSystem?.key !== 'rewardSystem') throw new Error('奖励系统尚未初始化')
    const system = await rollRewardSystem(storedSystem.value, await currentGameDate(database, now), database)
    const event = claim.source === 'coins'
      ? LedgerEventSchema.parse({
          id: `redemption_refund:${claim.id}`,
          kind: 'redemption_refund',
          sourceId: claim.id,
          occurredOn: await currentGameDate(database, now),
          title: `取消奖励：${claim.titleSnapshot}`,
          xpDelta: 0,
          coinDelta: claim.coinCostSnapshot,
          createdAt: now.toISOString(),
        })
      : undefined
    await database.rewardClaims.put(claim)
    if (event) await database.ledgerEvents.add(event)
    await database.settings.put({
      ...storedSystem,
      value: RewardSystemSchema.parse({
        ...system,
        availableCents: Math.min(system.maxFundCents, system.availableCents + claim.cashCostCentsSnapshot),
      }),
    })

    if (claim.source === 'milestone') {
      const storedMeta = await database.settings.get('meta')
      const meta = storedMeta?.key === 'meta' ? storedMeta : undefined
      const levelSystem = meta?.value.levelSystem
      if (meta && levelSystem) {
        await database.settings.put({
          ...meta,
          value: {
            ...meta.value,
            levelSystem: LevelSystemSchema.parse({
              ...levelSystem,
              milestones: levelSystem.milestones.map((item) => item.reservedClaimId === claim.id
                ? { ...item, reservedClaimId: undefined }
                : item),
            }),
          },
        })
      }
    }
    return { claim, event }
  })
}
