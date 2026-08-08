import {
  ActivitySchema,
  type Activity,
  type Completion,
  type GrowthDomain,
  getActivityScheduledTime,
} from '../domain'
import { SeasonSchema } from '../season'
import { db, currentGameDate } from './database'

export async function getTodayActionPriority(occurredOn?: string, database = db) {
  const gameDate = occurredOn ?? await currentGameDate(database)
  const storedMeta = await database.settings.get('meta')
  const storedPriority = storedMeta?.key === 'meta' ? storedMeta.value.todayActionPriority : undefined
  if (!storedPriority || storedPriority.gameDate !== gameDate) return []
  const activities = await database.activities.bulkGet(storedPriority.activityIds)
  return storedPriority.activityIds.filter((_, index) => {
    const activity = activities[index]
    return Boolean(
      activity
      && activity.enabled
      && !activity.archivedAt
      && activity.type === 'habit'
      && activity.schedule.kind === 'daily'
      && !activity.isKey
      && !getActivityScheduledTime(activity),
    )
  })
}
export async function setTodayActionPriority(
  activityId: string,
  prioritized: boolean,
  occurredOn?: string,
  database = db,
) {
  const gameDate = occurredOn ?? await currentGameDate(database)
  return database.transaction('rw', database.activities, database.settings, async () => {
    const storedMeta = await database.settings.get('meta')
    const meta = storedMeta?.key === 'meta' ? storedMeta.value : {}
    const currentIds = meta.todayActionPriority?.gameDate === gameDate
      ? await getTodayActionPriority(gameDate, database)
      : []
    const existingIndex = currentIds.indexOf(activityId)
    let nextIds = currentIds.filter((id) => id !== activityId)
    let replacedActivityId: string | undefined

    if (prioritized) {
      const activity = await database.activities.get(activityId)
      if (
        !activity
        || !activity.enabled
        || activity.archivedAt
        || activity.type !== 'habit'
        || activity.schedule.kind !== 'daily'
        || activity.isKey
        || getActivityScheduledTime(activity)
      ) {
        throw new Error('只有启用中的无固定时间普通每日习惯可以设为今天优先')
      }
      if (existingIndex >= 0) return { activityIds: currentIds, replacedActivityId }
      nextIds = [...nextIds, activityId]
      if (nextIds.length > 5) replacedActivityId = nextIds.shift()
    }

    await database.settings.put({
      key: 'meta',
      value: {
        ...meta,
        todayActionPriority: {
          gameDate,
          activityIds: nextIds,
        },
      },
    })
    return { activityIds: nextIds, replacedActivityId }
  })
}

export async function getGrowthDomainMigrationCandidates(database = db, now = new Date()) {
  const today = await currentGameDate(database, now)
  const [activities, completions] = await Promise.all([database.activities.toArray(), database.completions.toArray()])
  const settledTaskIds = new Set(
    completions
      .filter((completion) => completion.status === 'active' && completion.occurredOn < today)
      .map((completion) => completion.activityId),
  )
  return activities.filter((activity) => !activity.domain && (activity.type === 'habit' || !settledTaskIds.has(activity.id)))
}

export async function activateGrowthDomains(assignments: Record<string, GrowthDomain>, database = db, now = new Date()) {
  return database.transaction('rw', database.activities, database.seasons, database.settings, database.completions, async () => {
    const candidates = await getGrowthDomainMigrationCandidates(database, now)
    const candidateIds = new Set(candidates.map((activity) => activity.id))
    if (candidates.some((activity) => !assignments[activity.id]) || Object.keys(assignments).some((id) => !candidateIds.has(id))) {
      throw new Error('请逐项确认所有活动的成长领域')
    }

    const activeSeason = await database.seasons.where('status').equals('active').first()
    if (activeSeason?.focusActivities.some((snapshot) => !snapshot.domain && !assignments[snapshot.activityId])) {
      throw new Error('当前赛季存在尚未确认成长领域的核心行为')
    }

    await database.activities.bulkPut(candidates.map((activity) => {
      const { attribute: _attribute, ...rest } = activity
      return ActivitySchema.parse({ ...rest, domain: assignments[activity.id] })
    }))

    if (activeSeason) {
      await database.seasons.put(SeasonSchema.parse({
        ...activeSeason,
        focusActivities: activeSeason.focusActivities.map((snapshot) => {
          if (snapshot.domain) return snapshot
          const { attribute: _attribute, ...rest } = snapshot
          return { ...rest, domain: assignments[snapshot.activityId] }
        }),
      }))
    }

    const storedMeta = await database.settings.get('meta')
    const meta = storedMeta?.key === 'meta' ? storedMeta.value : {}
    const levelSystem = meta.levelSystem
      ? (() => {
          const { focusAttribute: _focusAttribute, focusDomain: _focusDomain, ...rest } = meta.levelSystem
          return rest
        })()
      : undefined
    const activatedAt = now.toISOString()
    await database.settings.put({
      key: 'meta',
      value: { ...meta, levelSystem, growthDomainSystem: { version: 1, activatedAt } },
    })
    return { migrated: candidates.length, activatedAt }
  })
}
