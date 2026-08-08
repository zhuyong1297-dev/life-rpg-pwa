import Dexie, { type EntityTable } from 'dexie'
import {
  type Activity,
  type Completion,
  type LedgerEvent,
  type Preferences,
  type Reward,
  type RewardClaim,
  type RewardSystem,
  RewardSystemSchema,
  type Setting,
  type WeeklyReview,
  calculateStats,
  createLevelSystem,
  effectiveGameDate,
  getGameDayActivation,
} from '../domain'
import type { Season } from '../season'

export class LifeRpgDatabase extends Dexie {
  activities!: EntityTable<Activity, 'id'>
  completions!: EntityTable<Completion, 'id'>
  ledgerEvents!: EntityTable<LedgerEvent, 'id'>
  rewards!: EntityTable<Reward, 'id'>
  rewardClaims!: EntityTable<RewardClaim, 'id'>
  weeklyReviews!: EntityTable<WeeklyReview, 'id'>
  seasons!: EntityTable<Season, 'id'>
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
    this.version(2).stores({
      activities: 'id, type, plannedOn',
      completions: 'id, activityId, occurredOn, status, [activityId+occurredOn]',
      ledgerEvents: 'id, kind, sourceId, occurredOn',
      rewards: 'id',
      weeklyReviews: 'id, weekStart',
      seasons: 'id, status, startsOn, endsOn',
      settings: 'key',
    })
    this.version(3).stores({
      activities: 'id, type, plannedOn',
      completions: 'id, activityId, occurredOn, status, [activityId+occurredOn]',
      ledgerEvents: 'id, kind, sourceId, occurredOn',
      rewards: 'id',
      weeklyReviews: 'id, weekStart',
      seasons: 'id, status, startsOn, endsOn',
      settings: 'key',
    })
    this.version(4).stores({
      activities: 'id, type, plannedOn',
      completions: 'id, activityId, occurredOn, status, [activityId+occurredOn]',
      ledgerEvents: 'id, kind, sourceId, occurredOn',
      rewards: 'id',
      rewardClaims: 'id, rewardId, status, plannedFor, reservedOn',
      weeklyReviews: 'id, weekStart',
      seasons: 'id, status, startsOn, endsOn',
      settings: 'key',
    })
  }
}
export const db = new LifeRpgDatabase(import.meta.env.MODE === 'preview' ? 'earth-online-preview-v2' : 'earth-online-v2')

export async function initializeDatabase(database = db) {
  await database.transaction('rw', database.rewards, database.settings, database.ledgerEvents, async () => {
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
      await database.settings.add({ key: 'meta', value: { levelSystem: createLevelSystem(stats.totalXp), gameDayBoundaryActivatedAt: getGameDayActivation() } })
    } else if (!meta.value.levelSystem || !meta.value.gameDayBoundaryActivatedAt) {
      const stats = calculateStats(await database.ledgerEvents.toArray())
      await database.settings.put({
        ...meta,
        value: {
          ...meta.value,
          levelSystem: meta.value.levelSystem ?? createLevelSystem(stats.totalXp),
          gameDayBoundaryActivatedAt: meta.value.gameDayBoundaryActivatedAt ?? getGameDayActivation(),
        },
      })
    }
    const storedRewardSystem = await database.settings.get('rewardSystem')
    if (!storedRewardSystem) {
      const now = new Date()
      const activatedAt = now.toISOString()
      const activatedGameDate = effectiveGameDate(now, meta?.value.gameDayBoundaryActivatedAt ?? getGameDayActivation(now))
      const legacyTarget = meta?.value.targetRewardId
      const target = legacyTarget ? await database.rewards.get(legacyTarget) : undefined
      await database.settings.add({
        key: 'rewardSystem',
        value: RewardSystemSchema.parse({
          version: 1,
          activatedAt,
          activeRewardId: target?.enabled ? target.id : undefined,
          queueIds: [],
          monthlyAllowanceCents: 40_000,
          maxFundCents: 120_000,
          availableCents: 40_000,
          lastFundedMonth: activatedGameDate.slice(0, 7),
        }),
      })
    }
  })
}

export async function currentGameDate(database = db, now = new Date()) {
  const storedMeta = await database.settings.get('meta')
  const activatedAt = storedMeta?.key === 'meta' ? storedMeta.value.gameDayBoundaryActivatedAt : undefined
  return effectiveGameDate(now, activatedAt)
}
