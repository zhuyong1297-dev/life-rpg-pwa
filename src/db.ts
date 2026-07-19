import Dexie, { type EntityTable } from 'dexie'
import {
  ActivitySchema,
  type Activity,
  type Completion,
  type Difficulty,
  LedgerEventSchema,
  type LedgerEvent,
  type Preferences,
  type Reward,
  rewardTable,
  type Setting,
  type WeeklyReview,
  calculateStats,
  addDays,
  localDate,
  isDurationGoal,
  startOfWeek,
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

export const db = new LifeRpgDatabase()

const defaultRewards = [
  ['reward-entertainment', '无负担娱乐 1 小时', 30],
  ['reward-meal', '喜欢的一餐', 80],
  ['reward-half-day', '半日自由活动', 200],
] as const

export async function initializeDatabase(database = db) {
  await database.transaction('rw', database.rewards, database.settings, async () => {
    if ((await database.rewards.count()) === 0) {
      const createdAt = new Date().toISOString()
      await database.rewards.bulkAdd(
        defaultRewards.map(([id, title, cost]) => ({ id, title, cost, enabled: true, createdAt })),
      )
    }
    if (!(await database.settings.get('preferences'))) {
      await database.settings.add({
        key: 'preferences',
        value: { notifications: false, vibration: true, sound: false },
      })
    }
    if (!(await database.settings.get('meta'))) {
      await database.settings.add({ key: 'meta', value: {} })
    }
  })
}

export type NewActivity = Omit<Activity, 'id' | 'createdAt'>

export async function createActivity(input: NewActivity, database = db) {
  const activity = ActivitySchema.parse({ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() })
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
    if (enabled && activity.isKey && !activity.enabled) {
      const keyCount = await database.activities.filter((item) => item.isKey && item.enabled).count()
      if (keyCount >= 3) throw new Error('关键行为最多只能启用 3 项')
    }
    await database.activities.update(activityId, { enabled })
  })
}

export interface CompletionDetails {
  note?: string
  durationMinutes?: number
}

function validateCompletion(activity: Activity, details: CompletionDetails) {
  const cleaned = details.note?.trim()
  const difficulty: Difficulty = activity.difficulty
  if (difficulty === 'Boss' && !cleaned) throw new Error('Boss 行动必须填写实际成果')
  if (cleaned && cleaned.length > 140) throw new Error('实际成果最多 140 字')
  if (isDurationGoal(activity)) {
    if (!Number.isInteger(details.durationMinutes) || !details.durationMinutes || details.durationMinutes > 1440) {
      throw new Error('请填写 1 至 1440 分钟的实际时长')
    }
    if (details.durationMinutes < activity.goal.count) {
      throw new Error(`实际时长还未达到 ${activity.goal.count} 分钟目标`)
    }
  }
  return { note: cleaned || undefined, durationMinutes: isDurationGoal(activity) ? details.durationMinutes : undefined }
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
    const details = validateCompletion(activity, typeof noteOrDetails === 'string' ? { note: noteOrDetails } : (noteOrDetails ?? {}))
    const active = await database.completions
      .where('activityId')
      .equals(activityId)
      .and((completion) => completion.status === 'active' && (activity.type === 'task' || completion.occurredOn === occurredOn))
      .first()
    if (active) return { awarded: false as const, completion: active, activity }
    if (activity.schedule.kind === 'weekly') {
      const weekStart = startOfWeek(new Date(`${occurredOn}T12:00:00`))
      const weekEnd = addDays(weekStart, 6)
      const weeklyCount = await database.completions
        .where('activityId')
        .equals(activityId)
        .and(
          (completion) =>
            completion.status === 'active' && completion.occurredOn >= weekStart && completion.occurredOn <= weekEnd,
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
      createdAt,
    }
    const reward = rewardTable[activity.difficulty]
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
    return { awarded: true as const, completion, event, activity }
  })
}

export async function undoCompletion(completionId: string, database = db) {
  return database.transaction('rw', database.completions, database.ledgerEvents, async () => {
    const completion = await database.completions.get(completionId)
    if (!completion || completion.status !== 'active') return false
    const reward = await database.ledgerEvents.get(`reward:${completion.id}`)
    if (!reward) throw new Error('完成记录缺少对应奖励流水')
    const correctionId = `correction:${completion.id}`
    if (await database.ledgerEvents.get(correctionId)) return false
    const createdAt = new Date().toISOString()
    await database.completions.update(completion.id, { status: 'undone', undoneAt: createdAt })
    await database.ledgerEvents.add({
      id: correctionId,
      kind: 'correction',
      sourceId: reward.id,
      occurredOn: completion.occurredOn,
      title: `撤销：${reward.title}`,
      attribute: reward.attribute,
      xpDelta: -reward.xpDelta,
      coinDelta: -reward.coinDelta,
      createdAt,
    })
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

export async function updatePreferences(value: Preferences, database = db) {
  await database.settings.put({ key: 'preferences', value })
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
