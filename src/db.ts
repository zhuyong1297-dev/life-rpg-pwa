import Dexie, { type EntityTable } from 'dexie'
import {
  ActivitySchema,
  type Activity,
  type Attribute,
  type Completion,
  type Difficulty,
  type TierLevel,
  LedgerEventSchema,
  type LedgerEvent,
  type Preferences,
  type Reward,
  RewardSchema,
  rewardTable,
  type Setting,
  type WeeklyReview,
  calculateStats,
  addDays,
  createLevelSystem,
  getLevel,
  getMilestoneVoucherCost,
  getTotalXpForLevel,
  getTierReward,
  getTierUpgradeXp,
  getCompletionTierGoal,
  localDate,
  isDurationGoal,
  isTieredGoal,
  startOfWeek,
  LevelSystemSchema,
} from './domain'

export class LifeRpgDatabase extends Dexie {
  activities!: EntityTable<Activity, 'id'>
  completions!: EntityTable<Completion, 'id'>
  ledgerEvents!: EntityTable<LedgerEvent, 'id'>
  rewards!: EntityTable<Reward, 'id'>
  weeklyReviews!: EntityTable<WeeklyReview, 'id'>
  settings!: EntityTable<Setting, 'key'>

  constructor(name = 'earth-online-v2') {
    super(name)
    this.version(1).stores({
      activities: 'id, type, plannedOn',
      completions: 'id, activityId, occurredOn, status, [activityId+occurredOn]',
      ledgerEvents: 'id, kind, sourceId, occurredOn',
      rewards: 'id',
      weeklyReviews: 'id, weekStart',
      settings: 'key',
    })
  }
}

export const db = new LifeRpgDatabase(import.meta.env.MODE === 'preview' ? 'earth-online-preview-v2' : 'earth-online-v2')

const defaultRewards = [
  ['reward-entertainment', '无负担娱乐 1 小时', 30],
  ['reward-meal', '喜欢的一餐', 80],
  ['reward-half-day', '半日自由活动', 200],
] as const

export async function initializeDatabase(database = db) {
  await database.transaction('rw', database.rewards, database.settings, database.ledgerEvents, async () => {
    if ((await database.rewards.count()) === 0) {
      const createdAt = new Date().toISOString()
      await database.rewards.bulkAdd(
        defaultRewards.map(([id, title, cost]) => ({ id, title, cost, enabled: true, createdAt })),
      )
    }
    const storedPreferences = await database.settings.get('preferences')
    if (!storedPreferences) {
      await database.settings.add({
        key: 'preferences',
        value: { notifications: false, vibration: true, sound: false, feedbackIntensity: 'clear' },
      })
    } else if (!('feedbackIntensity' in storedPreferences.value)) {
      await database.settings.put({ key: 'preferences', value: { ...storedPreferences.value, feedbackIntensity: 'clear' } })
    }
    const storedMeta = await database.settings.get('meta')
    const meta = storedMeta?.key === 'meta' ? storedMeta : undefined
    if (!meta) {
      const stats = calculateStats(await database.ledgerEvents.toArray())
      await database.settings.add({ key: 'meta', value: { levelSystem: createLevelSystem(stats.totalXp) } })
    } else if (!meta.value.levelSystem) {
      const stats = calculateStats(await database.ledgerEvents.toArray())
      await database.settings.put({ ...meta, value: { ...meta.value, levelSystem: createLevelSystem(stats.totalXp) } })
    }
  })
}

export type NewActivity = Omit<Activity, 'id' | 'createdAt'>

export async function createActivity(input: NewActivity, database = db) {
  const activity = ActivitySchema.parse({ ...input, id: crypto.randomUUID(), revision: 1, createdAt: new Date().toISOString() })
  await database.transaction('rw', database.activities, async () => {
    if (activity.enabled && activity.isKey) {
      const keyCount = await database.activities.filter((item) => item.isKey && item.enabled).count()
      if (keyCount >= 3) throw new Error('关键行为最多只能启用 3 项')
    }
    await database.activities.add(activity)
  })
  return activity
}

export async function setActivityKey(activityId: string, isKey: boolean, database = db) {
  await database.transaction('rw', database.activities, async () => {
    const activity = await database.activities.get(activityId)
    if (!activity) throw new Error('找不到这项行动')
    if (activity.archivedAt) throw new Error('已归档活动不能设为关键行为')
    if (isKey && activity.enabled && !activity.isKey) {
      const keyCount = await database.activities.filter((item) => item.isKey && item.enabled).count()
      if (keyCount >= 3) throw new Error('关键行为最多只能启用 3 项')
    }
    await database.activities.update(activityId, { isKey })
  })
}

export async function setActivityEnabled(activityId: string, enabled: boolean, database = db) {
  await database.transaction('rw', database.activities, async () => {
    const activity = await database.activities.get(activityId)
    if (!activity) throw new Error('找不到这项行动')
    if (activity.archivedAt) throw new Error('请先恢复已归档活动')
    if (enabled && activity.isKey && !activity.enabled) {
      const keyCount = await database.activities.filter((item) => item.isKey && item.enabled).count()
      if (keyCount >= 3) throw new Error('关键行为最多只能启用 3 项')
    }
    await database.activities.update(activityId, { enabled })
  })
}

export async function updateActivityGoal(activityId: string, goal: Activity['goal'], database = db) {
  const activity = await database.activities.get(activityId)
  if (!activity || activity.type !== 'habit') throw new Error('找不到这项习惯')
  await updateHabit(activityId, {
    title: activity.title,
    attribute: activity.attribute,
    difficulty: activity.difficulty,
    schedule: activity.schedule,
    goal,
    isKey: activity.isKey,
  }, database)
}

export type HabitUpdate = Pick<Activity, 'title' | 'attribute' | 'difficulty' | 'schedule' | 'goal' | 'isKey'>

export async function updateHabit(activityId: string, input: HabitUpdate, database = db) {
  return database.transaction('rw', database.activities, database.completions, async () => {
    const activity = await database.activities.get(activityId)
    if (!activity || activity.type !== 'habit' || activity.archivedAt) throw new Error('找不到可编辑的习惯')
    if (input.isKey && activity.enabled && !activity.isKey) {
      const keyCount = await database.activities.filter((item) => item.isKey && item.enabled && !item.archivedAt).count()
      if (keyCount >= 3) throw new Error('关键行为最多只能启用 3 项')
    }
    const legacyCompletions = await database.completions
      .where('activityId')
      .equals(activityId)
      .and((completion) => completion.activityRevision === undefined)
      .toArray()
    if (legacyCompletions.length > 0) {
      await database.completions.bulkPut(legacyCompletions.map((completion) => ({
        ...completion,
        activityRevision: activity.revision ?? 1,
        titleSnapshot: activity.title,
        attributeSnapshot: activity.attribute,
        difficultySnapshot: activity.difficulty,
      })))
    }
    const updated = ActivitySchema.parse({ ...activity, ...input, revision: (activity.revision ?? 1) + 1 })
    await database.activities.put(updated)
    return updated
  })
}

export async function archiveHabit(activityId: string, database = db) {
  return database.transaction('rw', database.activities, async () => {
    const activity = await database.activities.get(activityId)
    if (!activity || activity.type !== 'habit' || activity.archivedAt) return false
    await database.activities.put(ActivitySchema.parse({ ...activity, enabled: false, isKey: false, archivedAt: new Date().toISOString() }))
    return true
  })
}

export async function restoreHabit(activityId: string, database = db) {
  return database.transaction('rw', database.activities, async () => {
    const activity = await database.activities.get(activityId)
    if (!activity || activity.type !== 'habit' || !activity.archivedAt) return false
    const { archivedAt: _archivedAt, ...rest } = activity
    await database.activities.put(ActivitySchema.parse({ ...rest, enabled: true, isKey: false }))
    return true
  })
}

export interface CompletionDetails {
  note?: string
  durationMinutes?: number
  tier?: TierLevel
}

function validateCompletion(activity: Activity, details: CompletionDetails) {
  const cleaned = details.note?.trim()
  const difficulty: Difficulty = activity.difficulty
  if (!isTieredGoal(activity) && difficulty === 'Boss' && !cleaned) throw new Error('Boss 行动必须填写实际成果')
  if (cleaned && cleaned.length > 140) throw new Error('实际成果最多 140 字')
  if (isTieredGoal(activity) && !details.tier) throw new Error('请选择本次完成的层次')
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
  }
}

export async function completeActivity(
  activityId: string,
  occurredOn = localDate(),
  noteOrDetails?: string | CompletionDetails,
  database = db,
) {
  return database.transaction('rw', database.activities, database.completions, database.ledgerEvents, async () => {
    const activity = await database.activities.get(activityId)
    if (!activity || !activity.enabled) throw new Error('这项行动不存在或已暂停')
    const requestedDetails = typeof noteOrDetails === 'string' ? { note: noteOrDetails } : (noteOrDetails ?? {})
    const active = await database.completions
      .where('activityId')
      .equals(activityId)
      .and((completion) => completion.status === 'active' && (activity.type === 'task' || completion.occurredOn === occurredOn))
      .first()
    if (active) {
      const tierGoal = getCompletionTierGoal(active, activity)
      if (!active.tier || !tierGoal || !requestedDetails.tier || requestedDetails.tier <= active.tier) {
        return { awarded: false as const, upgraded: false as const, completion: active, activity }
      }
      const createdAt = new Date().toISOString()
      const difficulty = active.difficultySnapshot ?? activity.difficulty
      const attribute = active.attributeSnapshot ?? activity.attribute
      const title = active.titleSnapshot ?? activity.title
      const event = LedgerEventSchema.parse({
        id: `reward:${active.id}:tier:${requestedDetails.tier}`,
        kind: 'reward',
        sourceId: active.id,
        occurredOn,
        title: `层次升级：${title}（${requestedDetails.tier === 2 ? '标准' : '突破'}）`,
        attribute,
        xpDelta: getTierUpgradeXp(difficulty, active.tier, requestedDetails.tier),
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
      const weekStart = startOfWeek(new Date(`${occurredOn}T12:00:00`))
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
      occurredOn,
      status: 'active',
      note: details.note,
      durationMinutes: details.durationMinutes,
      tier: details.tier,
      tierGoalSnapshot: isTieredGoal(activity) ? activity.goal : undefined,
      activityRevision: activity.revision ?? 1,
      titleSnapshot: activity.title,
      attributeSnapshot: activity.attribute,
      difficultySnapshot: activity.difficulty,
      createdAt,
    }
    const reward = isTieredGoal(activity) && details.tier
      ? getTierReward(activity.difficulty, details.tier)
      : rewardTable[activity.difficulty]
    const event = LedgerEventSchema.parse({
      id: `reward:${completion.id}`,
      kind: 'reward',
      sourceId: completion.id,
      occurredOn,
      title: activity.title,
      attribute: activity.attribute,
      xpDelta: reward.xp,
      coinDelta: reward.coins,
      createdAt,
    })
    await database.completions.add(completion)
    await database.ledgerEvents.add(event)
    return { awarded: true as const, upgraded: false as const, completion, event, activity }
  })
}

export async function undoCompletion(completionId: string, database = db) {
  return undoCompletionOn(completionId, undefined, database)
}

export async function cancelTodayCompletion(completionId: string, occurredOn = localDate(), database = db) {
  return undoCompletionOn(completionId, occurredOn, database)
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
        xpDelta: -reward.xpDelta,
        coinDelta: -reward.coinDelta,
        createdAt,
      })),
    )
    return true
  })
}

export async function redeemReward(rewardId: string, database = db) {
  return database.transaction('rw', database.rewards, database.ledgerEvents, async () => {
    const reward = await database.rewards.get(rewardId)
    if (!reward || !reward.enabled) throw new Error('奖励不存在或已停用')
    const events = await database.ledgerEvents.toArray()
    if (calculateStats(events).coins < reward.cost) throw new Error('金币余额不足')
    const event: LedgerEvent = {
      id: `redemption:${crypto.randomUUID()}`,
      kind: 'redemption',
      sourceId: reward.id,
      occurredOn: localDate(),
      title: `兑换：${reward.title}`,
      xpDelta: 0,
      coinDelta: -reward.cost,
      createdAt: new Date().toISOString(),
    }
    await database.ledgerEvents.add(event)
    return event
  })
}

export interface RewardInput {
  title: string
  cost: number
  target: boolean
}

export async function createReward(input: RewardInput, database = db) {
  return database.transaction('rw', database.rewards, database.settings, async () => {
    const reward = RewardSchema.parse({
      id: crypto.randomUUID(),
      title: input.title,
      cost: input.cost,
      enabled: true,
      createdAt: new Date().toISOString(),
    })
    await database.rewards.add(reward)
    if (input.target) await writeTargetReward(reward.id, database)
    return reward
  })
}

export async function updateReward(rewardId: string, input: RewardInput, database = db) {
  return database.transaction('rw', database.rewards, database.settings, async () => {
    const existing = await database.rewards.get(rewardId)
    if (!existing) throw new Error('找不到这个奖励')
    const reward = RewardSchema.parse({ ...existing, title: input.title, cost: input.cost })
    await database.rewards.put(reward)
    const storedMeta = await database.settings.get('meta')
    const currentTarget = storedMeta?.key === 'meta' ? storedMeta.value.targetRewardId : undefined
    if (input.target) await writeTargetReward(reward.id, database)
    else if (currentTarget === reward.id) await writeTargetReward(undefined, database)
    return reward
  })
}

export async function setRewardEnabled(rewardId: string, enabled: boolean, database = db) {
  return database.transaction('rw', database.rewards, database.settings, async () => {
    const reward = await database.rewards.get(rewardId)
    if (!reward) throw new Error('找不到这个奖励')
    await database.rewards.update(rewardId, { enabled })
    const storedMeta = await database.settings.get('meta')
    if (!enabled && storedMeta?.key === 'meta' && storedMeta.value.targetRewardId === rewardId) {
      await writeTargetReward(undefined, database)
    }
  })
}

export async function setTargetReward(rewardId: string | undefined, database = db) {
  return database.transaction('rw', database.rewards, database.settings, async () => {
    if (rewardId) {
      const reward = await database.rewards.get(rewardId)
      if (!reward?.enabled) throw new Error('只能把启用中的商品设为当前目标')
    }
    await writeTargetReward(rewardId, database)
  })
}

async function writeTargetReward(rewardId: string | undefined, database: LifeRpgDatabase) {
  const storedMeta = await database.settings.get('meta')
  const value = storedMeta?.key === 'meta' ? storedMeta.value : {}
  await database.settings.put({
    key: 'meta',
    value: { ...value, targetRewardId: rewardId },
  })
}

export async function updatePreferences(value: Preferences, database = db) {
  await database.settings.put({ key: 'preferences', value })
}

export async function syncLevelMilestones(database = db, now = new Date()) {
  return database.transaction('rw', database.settings, database.ledgerEvents, async () => {
    const events = await database.ledgerEvents.toArray()
    const storedMeta = await database.settings.get('meta')
    const meta = storedMeta?.key === 'meta' ? storedMeta : undefined
    const currentLevel = getLevel(calculateStats(events).totalXp).level
    if (!meta?.value.levelSystem) {
      const levelSystem = createLevelSystem(calculateStats(events).totalXp, now.toISOString())
      await database.settings.put({ key: 'meta', value: { ...(meta?.value ?? {}), levelSystem } })
      return []
    }

    const cutoff = new Date(now.getTime() - 10_000).toISOString()
    const stableEvents = events.filter((event) => event.createdAt <= cutoff)
    const stableLevel = Math.min(currentLevel, getLevel(calculateStats(stableEvents).totalXp).level)
    const system = meta.value.levelSystem
    if (stableLevel <= system.highestLevelReached) return []

    const sortedEvents = [...stableEvents].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    const crossings = new Map<number, LedgerEvent>()
    let runningXp = 0
    for (const event of sortedEvents) {
      runningXp += event.xpDelta
      if (event.xpDelta <= 0 || event.createdAt < system.activatedAt) continue
      for (let level = system.highestLevelReached + 1; level <= stableLevel; level += 1) {
        if (!crossings.has(level) && runningXp >= getTotalXpForLevel(level)) crossings.set(level, event)
      }
    }
    const fallback = [...sortedEvents].reverse().find((event) => event.kind === 'reward' && event.xpDelta > 0)
    if (!fallback) return []
    const created = Array.from({ length: stableLevel - system.highestLevelReached }, (_, index) => {
      const level = system.highestLevelReached + index + 1
      const source = crossings.get(level) ?? fallback
      return {
        level,
        reachedAt: source.createdAt,
        sourceEventId: source.id,
        voucherMaxCost: getMilestoneVoucherCost(level),
      }
    })
    const levelSystem = LevelSystemSchema.parse({
      ...system,
      highestLevelReached: stableLevel,
      milestones: [...system.milestones, ...created],
    })
    await database.settings.put({ ...meta, value: { ...meta.value, levelSystem } })
    return created
  })
}

export async function acknowledgeLevelMilestone(level: number, focusAttribute: Attribute, database = db) {
  return database.transaction('rw', database.settings, async () => {
    const storedMeta = await database.settings.get('meta')
    const meta = storedMeta?.key === 'meta' ? storedMeta : undefined
    const system = meta?.value.levelSystem
    if (!meta || !system) throw new Error('等级系统尚未初始化')
    const milestone = system.milestones.find((item) => item.level === level)
    if (!milestone) throw new Error('找不到这次升级记录')
    const acknowledgedAt = milestone.acknowledgedAt ?? new Date().toISOString()
    const levelSystem = LevelSystemSchema.parse({
      ...system,
      focusAttribute,
      milestones: system.milestones.map((item) => item.level === level ? { ...item, acknowledgedAt, focusAttribute } : item),
    })
    await database.settings.put({ ...meta, value: { ...meta.value, levelSystem } })
    return levelSystem
  })
}

export async function claimMilestoneReward(level: number, rewardId: string, database = db) {
  return database.transaction('rw', database.settings, database.rewards, database.ledgerEvents, async () => {
    const storedMeta = await database.settings.get('meta')
    const meta = storedMeta?.key === 'meta' ? storedMeta : undefined
    const system = meta?.value.levelSystem
    if (!meta || !system) throw new Error('等级系统尚未初始化')
    const milestone = system.milestones.find((item) => item.level === level)
    if (!milestone?.voucherMaxCost) throw new Error('这个等级没有阶段礼券')
    if (milestone.claimedRewardId) throw new Error('这张阶段礼券已经领取')
    const reward = await database.rewards.get(rewardId)
    if (!reward?.enabled) throw new Error('奖励不存在或已停用')
    if (reward.cost > milestone.voucherMaxCost) throw new Error(`这张礼券最多可领取 ${milestone.voucherMaxCost} 金币档奖励`)
    const createdAt = new Date().toISOString()
    const event = LedgerEventSchema.parse({
      id: `milestone:level:${level}`,
      kind: 'milestone',
      sourceId: `level:${level}`,
      occurredOn: localDate(),
      title: `阶段礼券：${reward.title}`,
      xpDelta: 0,
      coinDelta: 0,
      createdAt,
    })
    const levelSystem = LevelSystemSchema.parse({
      ...system,
      milestones: system.milestones.map((item) => item.level === level
        ? { ...item, claimedRewardId: reward.id, claimedAt: createdAt }
        : item),
    })
    await database.ledgerEvents.add(event)
    await database.settings.put({ ...meta, value: { ...meta.value, levelSystem } })
    return { event, reward, levelSystem }
  })
}

export async function saveWeeklyReview(review: WeeklyReview, database = db) {
  await database.transaction('rw', database.weeklyReviews, database.activities, async () => {
    await database.weeklyReviews.put(review)
    for (const item of review.items) {
      if (item.decision === '暂停') await database.activities.update(item.activityId, { enabled: false })
    }
  })
}

export async function getSnapshot(database = db) {
  const [activities, completions, ledgerEvents, rewards, weeklyReviews, settings] = await Promise.all([
    database.activities.toArray(),
    database.completions.toArray(),
    database.ledgerEvents.toArray(),
    database.rewards.toArray(),
    database.weeklyReviews.toArray(),
    database.settings.toArray(),
  ])
  return { activities, completions, ledgerEvents, rewards, weeklyReviews, settings }
}
