import {
  type Activity,
  CompletionSchema,
  type Completion,
  type Difficulty,
  type TierLevel,
  LedgerEventSchema,
  type Reward,
  rewardTable,
  calculateIncrementalProgress,
  addDays,
  getTierReward,
  getTierUpgradeXp,
  getCompletionTierGoal,
  getTierCount,
  getTierLevels,
  getIncrementalCycleGoal,
  isDurationGoal,
  isRatingGoal,
  isTieredGoal,
  isIncrementalGoal,
  startOfWeek,
} from '../domain'
import { db, currentGameDate, type LifeRpgDatabase } from './database'

export interface CompletionDetails {
  note?: string
  durationMinutes?: number
  tier?: TierLevel
  ratingValue?: number
}
function validateCompletion(activity: Activity, details: CompletionDetails) {
  const cleaned = details.note?.trim()
  const difficulty: Difficulty = activity.difficulty
  if (!isTieredGoal(activity) && difficulty === 'Boss' && !cleaned) throw new Error('Boss 行动必须填写实际成果')
  if (cleaned && cleaned.length > 140) throw new Error('实际成果最多 140 字')
  if (isRatingGoal(activity) && (!Number.isInteger(details.ratingValue) || !details.ratingValue || details.ratingValue < 1 || details.ratingValue > 5)) {
    throw new Error('请选择 1 至 5 分的体验')
  }
  if (!isRatingGoal(activity) && details.ratingValue !== undefined) throw new Error('这项行动不是评分体验')
  if (isTieredGoal(activity) && !details.tier) throw new Error('请选择本次完成的层次')
  if (isTieredGoal(activity) && details.tier && !getTierLevels(activity.goal).includes(details.tier)) throw new Error('所选层次不属于当前目标')
  if (isDurationGoal(activity)) {
    if (!Number.isInteger(details.durationMinutes) || !details.durationMinutes || details.durationMinutes > 1440) {
      throw new Error('请填写 1 至 1440 分钟的实际时长')
    }
    if (details.durationMinutes < activity.goal.count) {
      throw new Error(`实际时长还未达到 ${activity.goal.count} 分钟目标`)
    }
  }
  return {
    note: cleaned || undefined,
    durationMinutes: isDurationGoal(activity) ? details.durationMinutes : undefined,
    tier: isTieredGoal(activity) ? details.tier : undefined,
    ratingValue: isRatingGoal(activity) ? details.ratingValue : undefined,
  }
}

export async function completeActivity(
  activityId: string,
  occurredOn: string | undefined = undefined,
  noteOrDetails?: string | CompletionDetails,
  database = db,
) {
  return database.transaction('rw', database.activities, database.completions, database.ledgerEvents, database.settings, async () => {
    const eventDate = occurredOn ?? await currentGameDate(database)
    const activity = await database.activities.get(activityId)
    if (!activity || !activity.enabled) throw new Error('这项行动不存在或已暂停')
    if (!activity.domain) throw new Error('请先完成成长领域迁移')
    if (isIncrementalGoal(activity)) throw new Error('逐次累计目标请使用进度记录')
    const requestedDetails = typeof noteOrDetails === 'string' ? { note: noteOrDetails } : (noteOrDetails ?? {})
    const active = await database.completions
      .where('activityId')
      .equals(activityId)
      .and((completion) => completion.status === 'active' && (activity.type === 'task' || completion.occurredOn === eventDate))
      .first()
    if (active) {
      const tierGoal = getCompletionTierGoal(active, activity)
      if (!active.tier || !tierGoal || !requestedDetails.tier || requestedDetails.tier <= active.tier) {
        return { awarded: false as const, upgraded: false as const, completion: active, activity }
      }
      const createdAt = new Date().toISOString()
      const difficulty = active.difficultySnapshot ?? activity.difficulty
      const domain = active.domainSnapshot ?? activity.domain
      if (!domain) throw new Error('请先完成成长领域迁移')
      const title = active.titleSnapshot ?? activity.title
      if (!getTierLevels(tierGoal).includes(requestedDetails.tier)) throw new Error('所选层次不属于完成时的目标')
      const tierCount = getTierCount(tierGoal)
      const event = LedgerEventSchema.parse({
        id: `reward:${active.id}:tier:${requestedDetails.tier}`,
        kind: 'reward',
        sourceId: active.id,
        occurredOn: eventDate,
        title: `层次升级：${title}（${requestedDetails.tier === 2 ? '标准' : '突破'}）`,
        domain,
        xpDelta: getTierUpgradeXp(difficulty, active.tier, requestedDetails.tier, tierCount),
        coinDelta: 0,
        createdAt,
      })
      const completion: Completion = {
        ...active,
        tier: requestedDetails.tier,
        ...(!active.tierGoalSnapshot && tierGoal.metric !== 'combined'
          ? { achievedValue: tierGoal.thresholds[requestedDetails.tier - 1] }
          : {}),
      }
      await database.completions.put(completion)
      await database.ledgerEvents.add(event)
      return { awarded: true as const, upgraded: true as const, completion, event, activity }
    }
    const details = validateCompletion(activity, requestedDetails)
    if (activity.schedule.kind === 'weekly') {
      const weekStart = startOfWeek(new Date(`${eventDate}T12:00:00`))
      const weekEnd = addDays(weekStart, 6)
      const weeklyCount = await database.completions
        .where('activityId')
        .equals(activityId)
        .and(
          (completion) =>
            completion.status === 'active' &&
            completion.occurredOn >= weekStart &&
            completion.occurredOn <= weekEnd &&
            (completion.activityRevision ?? 1) === (activity.revision ?? 1),
        )
        .count()
      if (weeklyCount >= activity.schedule.times) return { awarded: false as const, activity }
    }

    const createdAt = new Date().toISOString()
    const completion: Completion = {
      id: crypto.randomUUID(),
      activityId,
      occurredOn: eventDate,
      status: 'active',
      note: details.note,
      durationMinutes: details.durationMinutes,
      tier: details.tier,
      tierGoalSnapshot: isTieredGoal(activity) ? activity.goal : undefined,
      ratingValue: details.ratingValue,
      ratingGoalSnapshot: isRatingGoal(activity) ? activity.goal : undefined,
      activityRevision: activity.revision ?? 1,
      titleSnapshot: activity.title,
      domainSnapshot: activity.domain,
      difficultySnapshot: activity.difficulty,
      createdAt,
    }
    const reward = isTieredGoal(activity) && details.tier
      ? getTierReward(activity.difficulty, details.tier, getTierCount(activity.goal))
      : rewardTable[activity.difficulty]
    const event = LedgerEventSchema.parse({
      id: `reward:${completion.id}`,
      kind: 'reward',
      sourceId: completion.id,
      occurredOn: eventDate,
      title: activity.title,
      domain: activity.domain,
      xpDelta: reward.xp,
      coinDelta: reward.coins,
      createdAt,
    })
    await database.completions.add(completion)
    await database.ledgerEvents.add(event)
    return { awarded: true as const, upgraded: false as const, completion, event, activity }
  })
}

export async function updateTodayRating(
  activityId: string,
  ratingValue: number,
  note: string | undefined = undefined,
  occurredOn: string | undefined = undefined,
  database = db,
  now = new Date(),
) {
  const currentDate = await currentGameDate(database, now)
  const eventDate = occurredOn ?? currentDate
  return database.transaction('rw', database.activities, database.completions, async () => {
    const activity = await database.activities.get(activityId)
    if (!activity || !isRatingGoal(activity)) throw new Error('这项行动不是评分体验')
    if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) throw new Error('请选择 1 至 5 分的体验')
    const cleaned = note?.trim()
    if (cleaned && cleaned.length > 140) throw new Error('影响因素最多 140 字')
    if (eventDate !== currentDate) throw new Error('只能修改当前游戏日的评分')
    const completion = await database.completions
      .where('activityId')
      .equals(activityId)
      .and((item) => item.status === 'active' && item.occurredOn === eventDate && item.ratingValue !== undefined)
      .first()
    if (!completion) throw new Error('找不到今天的评分记录')
    const updated = CompletionSchema.parse({
      ...completion,
      ratingValue,
      note: cleaned || undefined,
      ratingUpdatedAt: now.toISOString(),
    })
    await database.completions.put(updated)
    return updated
  })
}

export async function recordIncrementalProgress(
  activityId: string,
  durationSeconds: number | undefined = undefined,
  requestId: string = crypto.randomUUID(),
  occurredOn: string | undefined = undefined,
  database = db,
) {
  return database.transaction('rw', database.activities, database.completions, database.ledgerEvents, database.settings, async () => {
    const eventDate = occurredOn ?? await currentGameDate(database)
    const activity = await database.activities.get(activityId)
    if (!activity || !activity.enabled || activity.archivedAt) throw new Error('这项行动不存在或已暂停')
    if (!activity.domain) throw new Error('请先完成成长领域迁移')

    const duplicate = await database.completions
      .where('activityId')
      .equals(activityId)
      .and((completion) => completion.progress?.requestId === requestId)
      .first()
    if (duplicate) return { recorded: false as const, awarded: false as const, completion: duplicate, activity }

    const cycleStart = startOfWeek(new Date(`${eventDate}T12:00:00`))
    const cycleCompletions = await database.completions
      .where('activityId')
      .equals(activityId)
      .and((completion) => completion.progress?.cycleStart === cycleStart)
      .toArray()
    const goal = getIncrementalCycleGoal(activity, cycleCompletions, cycleStart)
    if (!goal) throw new Error('这项行动没有启用逐次累计')
    const before = calculateIncrementalProgress(goal, cycleCompletions)
    if (before.maxReached) throw new Error('本周已完成最高层')

    if (goal.metric === 'combined') {
      if (!Number.isInteger(durationSeconds) || !durationSeconds || !goal.durationOptionsSeconds?.includes(durationSeconds)) {
        throw new Error('请选择已配置的本次时长')
      }
    } else if (durationSeconds !== undefined) {
      throw new Error('纯次数目标不需要记录时长')
    }

    const createdAt = new Date().toISOString()
    const completionDraft = CompletionSchema.parse({
      id: `progress:${activityId}:${cycleStart}:${requestId}`,
      activityId,
      occurredOn: eventDate,
      status: 'active',
      tierGoalSnapshot: goal,
      activityRevision: cycleCompletions[0]?.activityRevision ?? activity.revision ?? 1,
      titleSnapshot: cycleCompletions[0]?.titleSnapshot ?? activity.title,
      domainSnapshot: cycleCompletions[0]?.domainSnapshot ?? activity.domain,
      difficultySnapshot: cycleCompletions[0]?.difficultySnapshot ?? activity.difficulty,
      progress: {
        mode: 'weekly_incremental',
        cycleStart,
        countDelta: 1,
        durationSeconds: goal.metric === 'combined' ? durationSeconds : undefined,
        perOccurrenceDurationSeconds: goal.metric === 'combined' && goal.mode === 'per_occurrence' ? durationSeconds : undefined,
        sequence: Math.max(0, ...cycleCompletions.map((item) => item.progress?.sequence ?? 0)) + 1,
        requestId,
      },
      createdAt,
    })
    const after = calculateIncrementalProgress(goal, [...cycleCompletions, completionDraft])
    const completion = CompletionSchema.parse({ ...completionDraft, tier: after.highestTier })
    const crossed = after.highestTier && after.highestTier !== before.highestTier
    const previousXp = before.highestTier ? getTierReward(completion.difficultySnapshot!, before.highestTier, getTierCount(goal)).xp : 0
    const reward = after.highestTier ? getTierReward(completion.difficultySnapshot!, after.highestTier, getTierCount(goal)) : undefined
    const event = crossed && reward ? LedgerEventSchema.parse({
      id: `reward:${completion.id}:tier:${after.highestTier}`,
      kind: 'reward',
      sourceId: completion.id,
      occurredOn: eventDate,
      title: `${completion.titleSnapshot}（${after.highestTier === 1 ? '基础' : after.highestTier === 2 ? '标准' : '突破'}）`,
      domain: completion.domainSnapshot,
      xpDelta: reward.xp - previousXp,
      coinDelta: before.highestTier ? 0 : reward.coins,
      createdAt,
    }) : undefined
    await database.completions.add(completion)
    if (event) await database.ledgerEvents.add(event)
    return { recorded: true as const, awarded: Boolean(event), upgraded: Boolean(event && before.highestTier), completion, event, activity, progress: after }
  })
}

export async function undoLatestIncrementalProgress(
  activityId: string,
  occurredOn: string | undefined = undefined,
  database = db,
) {
  const eventDate = occurredOn ?? await currentGameDate(database)
  const cycleStart = startOfWeek(new Date(`${eventDate}T12:00:00`))
  return database.transaction('rw', database.completions, database.ledgerEvents, async () => {
    const active = await database.completions
      .where('activityId')
      .equals(activityId)
      .and((completion) => completion.status === 'active' && completion.progress?.cycleStart === cycleStart)
      .toArray()
    const latest = active.sort((left, right) => (right.progress?.sequence ?? 0) - (left.progress?.sequence ?? 0))[0]
    if (!latest) return false
    const rewards = await database.ledgerEvents
      .where('sourceId')
      .equals(latest.id)
      .and((event) => event.kind === 'reward')
      .toArray()
    const createdAt = new Date().toISOString()
    await database.completions.update(latest.id, { status: 'undone', undoneAt: createdAt })
    if (rewards.length > 0) {
      await database.ledgerEvents.bulkAdd(rewards.map((reward) => LedgerEventSchema.parse({
        id: `correction:${reward.id}`,
        kind: 'correction',
        sourceId: reward.id,
        occurredOn: latest.occurredOn,
        title: `撤销：${reward.title}`,
        attribute: reward.attribute,
        domain: reward.domain,
        xpDelta: -reward.xpDelta,
        coinDelta: -reward.coinDelta,
        createdAt,
      })))
    }
    return true
  })
}
export async function undoCompletion(completionId: string, database = db) {
  return undoCompletionOn(completionId, undefined, database)
}

export async function cancelTodayCompletion(completionId: string, occurredOn: string | undefined = undefined, database = db) {
  return undoCompletionOn(completionId, occurredOn ?? await currentGameDate(database), database)
}

function undoCompletionOn(completionId: string, requiredOn: string | undefined, database: LifeRpgDatabase) {
  return database.transaction('rw', database.completions, database.ledgerEvents, async () => {
    const completion = await database.completions.get(completionId)
    if (!completion || completion.status !== 'active') return false
    if (requiredOn && completion.occurredOn !== requiredOn) throw new Error('只能取消今天的完成')
    const rewards = await database.ledgerEvents
      .where('sourceId')
      .equals(completion.id)
      .and((event) => event.kind === 'reward')
      .toArray()
    if (rewards.length === 0) throw new Error('完成记录缺少对应奖励流水')
    const createdAt = new Date().toISOString()
    await database.completions.update(completion.id, { status: 'undone', undoneAt: createdAt })
    await database.ledgerEvents.bulkAdd(
      rewards.map((reward) => ({
        id: `correction:${reward.id}`,
        kind: 'correction' as const,
        sourceId: reward.id,
        occurredOn: completion.occurredOn,
        title: `撤销：${reward.title}`,
        attribute: reward.attribute,
        domain: reward.domain,
        xpDelta: -reward.xpDelta,
        coinDelta: -reward.coinDelta,
        createdAt,
      })),
    )
    return true
  })
}
