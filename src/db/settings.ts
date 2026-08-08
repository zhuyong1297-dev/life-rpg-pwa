import {
  type GrowthDomain,
  type LedgerEvent,
  type Preferences,
  type Reward,
  type WeeklyReview,
  WeeklyReviewSchema,
  calculateStats,
  addDays,
  createLevelSystem,
  getLevel,
  getMilestoneVoucherCost,
  getTotalXpForLevel,
  LevelSystemSchema,
} from '../domain'
import { SeasonSchema, generateCoachSuggestions } from '../season'
import { db, currentGameDate } from './database'
import { reserveRewardClaim } from './rewards'

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

export async function acknowledgeLevelMilestone(level: number, focusDomain: GrowthDomain, database = db) {
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
      focusAttribute: undefined,
      focusDomain,
      milestones: system.milestones.map((item) => item.level === level ? { ...item, acknowledgedAt, focusAttribute: undefined, focusDomain } : item),
    })
    await database.settings.put({ ...meta, value: { ...meta.value, levelSystem } })
    return levelSystem
  })
}

export async function claimMilestoneReward(level: number, rewardId: string, database = db) {
  const plannedFor = await currentGameDate(database)
  return reserveRewardClaim(
    rewardId,
    {
      plannedFor,
      requestId: `legacy-milestone-${level}-${crypto.randomUUID()}`,
      milestoneLevel: level,
    },
    database,
  )
}

export async function saveWeeklyReview(review: WeeklyReview, database = db) {
  return database.transaction('rw', database.weeklyReviews, database.activities, database.seasons, async () => {
    const activities = await database.activities.bulkGet(review.items.map((item) => item.activityId))
    const savedReview = WeeklyReviewSchema.parse({
      ...review,
      items: review.items.map((item, index) => ({
        ...item,
        titleSnapshot: item.titleSnapshot ?? activities[index]?.title,
        attributeSnapshot: item.attributeSnapshot ?? activities[index]?.attribute,
        domainSnapshot: item.attributeSnapshot ? undefined : item.domainSnapshot ?? activities[index]?.domain,
      })),
    })
    await database.weeklyReviews.put(savedReview)
    for (const item of savedReview.items) {
      if (item.decision === '暂停') await database.activities.update(item.activityId, { enabled: false })
    }
    const activeSeason = await database.seasons.where('status').equals('active').first()
    if (!activeSeason || review.weekStart > activeSeason.endsOn || addDays(review.weekStart, 6) < activeSeason.startsOn) {
      return { review: savedReview, suggestions: [] }
    }
    const reviews = await database.weeklyReviews.toArray()
    const suggestions = generateCoachSuggestions(activeSeason, savedReview, reviews.filter(
      (item) => item.id !== savedReview.id && item.weekStart <= activeSeason.endsOn && addDays(item.weekStart, 6) >= activeSeason.startsOn,
    ))
    const suggestionIds = new Set(suggestions.map((suggestion) => suggestion.id))
    const nextSeason = SeasonSchema.parse({
      ...activeSeason,
      suggestions: [...activeSeason.suggestions.filter((suggestion) => !suggestionIds.has(suggestion.id)), ...suggestions],
    })
    await database.seasons.put(nextSeason)
    return { review: savedReview, suggestions }
  })
}
