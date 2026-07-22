import Dexie, { type EntityTable } from 'dexie'
import {
  ActivitySchema,
  type Activity,
  CompletionSchema,
  CoachPlanDraftSchema,
  type CoachPlanDraft,
  type GrowthDomain,
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
  WeeklyReviewSchema,
  calculateStats,
  calculateIncrementalProgress,
  addDays,
  createLevelSystem,
  getLevel,
  getMilestoneVoucherCost,
  getTotalXpForLevel,
  getTierReward,
  getTierUpgradeXp,
  getCompletionTierGoal,
  effectiveGameDate,
  getGameDayActivation,
  getTierCount,
  getTierLevels,
  getIncrementalCycleGoal,
  isDurationGoal,
  isTieredGoal,
  isIncrementalGoal,
  startOfWeek,
  type IncrementalTieredGoal,
  LevelSystemSchema,
} from './domain'
import {
  SeasonSchema,
  canCalibrateSeason,
  generateCoachSuggestions,
  snapshotSeasonActivity,
  type Season,
  type SeasonResult,
  type SeasonDailySignal,
  type SuggestionStatus,
} from './season'

export class LifeRpgDatabase extends Dexie {
  activities!: EntityTable<Activity, 'id'>
  completions!: EntityTable<Completion, 'id'>
  ledgerEvents!: EntityTable<LedgerEvent, 'id'>
  rewards!: EntityTable<Reward, 'id'>
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
  })
}

export async function currentGameDate(database = db, now = new Date()) {
  const storedMeta = await database.settings.get('meta')
  const activatedAt = storedMeta?.key === 'meta' ? storedMeta.value.gameDayBoundaryActivatedAt : undefined
  return effectiveGameDate(now, activatedAt)
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

export interface CreateSeasonInput {
  title: string
  successCriterion: string
  baseline: string
  targetOutcome: string
  focusActivityIds: string[]
}

export async function getCoachPlanDraft(database = db) {
  const setting = await database.settings.get('coachPlanDraft')
  return setting?.key === 'coachPlanDraft' ? CoachPlanDraftSchema.parse(setting.value) : undefined
}

export async function saveCoachPlanDraft(draft: CoachPlanDraft, database = db, now = new Date()) {
  const next = CoachPlanDraftSchema.parse({ ...draft, updatedAt: now.toISOString() })
  await database.settings.put({ key: 'coachPlanDraft', value: next })
  return next
}

export async function deleteCoachPlanDraft(draftId: string, database = db) {
  const stored = await database.settings.get('coachPlanDraft')
  if (stored?.key !== 'coachPlanDraft' || stored.value.id !== draftId) return false
  await database.settings.delete('coachPlanDraft')
  return true
}

export async function activateCoachPlanDraft(
  draftId: string,
  startsOn: string | undefined = undefined,
  database = db,
) {
  const eventDate = startsOn ?? await currentGameDate(database)
  return database.transaction('rw', database.settings, database.seasons, database.activities, async () => {
    const alreadyCreated = await database.seasons.filter((season) => season.sourcePlanId === draftId).first()
    if (alreadyCreated) return alreadyCreated

    const setting = await database.settings.get('coachPlanDraft')
    if (setting?.key !== 'coachPlanDraft' || setting.value.id !== draftId) throw new Error('找不到这份目标规划草稿')
    const draft = CoachPlanDraftSchema.parse(setting.value)
    if (draft.status !== 'ready') throw new Error('请先完成四步规划和现实检查')
    if (await database.seasons.where('status').equals('active').count()) throw new Error('当前赛季尚未结束，只能先保存为下个赛季')

    const existingPlans = draft.behaviors.filter((behavior) => behavior.source === 'existing')
    const existingActivities = await database.activities.bulkGet(existingPlans.map((behavior) => behavior.activityId))
    if (existingActivities.some((activity) => !activity || activity.type !== 'habit' || !activity.enabled || activity.archivedAt)) {
      throw new Error('复用的活动已暂停、归档或删除，请返回草稿替换')
    }

    const createdAt = new Date().toISOString()
    const createdActivities = draft.behaviors.flatMap((behavior) => behavior.source === 'new'
      ? [ActivitySchema.parse({
          id: `coach-activity:${draft.id}:${behavior.id}`,
          title: behavior.title,
          cue: behavior.cue,
          protocol: behavior.protocol,
          type: 'habit',
          domain: behavior.domain,
          difficulty: behavior.difficulty,
          goal: behavior.goal,
          schedule: behavior.schedule,
          isKey: true,
          enabled: true,
          revision: 1,
          createdAt,
        })]
      : [])

    const allActivities = await database.activities.toArray()
    const selectedExistingIds = new Set(existingPlans.map((behavior) => behavior.activityId))
    await database.activities.bulkPut(allActivities
      .filter((activity) => activity.isKey || selectedExistingIds.has(activity.id))
      .map((activity) => ActivitySchema.parse({ ...activity, isKey: selectedExistingIds.has(activity.id) })))
    if (createdActivities.length) await database.activities.bulkAdd(createdActivities)

    const selectedActivities = draft.behaviors.map((behavior) => behavior.source === 'existing'
      ? existingActivities[existingPlans.findIndex((plan) => plan.id === behavior.id)]!
      : createdActivities.find((activity) => activity.id === `coach-activity:${draft.id}:${behavior.id}`)!)
    const season = SeasonSchema.parse({
      id: `season:${draft.id}`,
      sourcePlanId: draft.id,
      title: draft.title,
      successCriterion: draft.successCriterion,
      baseline: draft.baseline,
      targetOutcome: draft.targetOutcome,
      startsOn: eventDate,
      endsOn: addDays(eventDate, 27),
      focusActivities: selectedActivities.map(snapshotSeasonActivity),
      dailyPlans: [],
      dailySignals: [],
      suggestions: [],
      status: 'active',
      createdAt,
    })
    await database.seasons.add(season)
    await database.settings.delete('coachPlanDraft')
    return season
  })
}

export async function createSeason(input: CreateSeasonInput, startsOn: string | undefined = undefined, database = db) {
  const eventDate = startsOn ?? await currentGameDate(database)
  return database.transaction('rw', database.seasons, database.activities, async () => {
    if (await database.seasons.where('status').equals('active').count()) throw new Error('同一时间只能进行一个成长赛季')
    const uniqueIds = [...new Set(input.focusActivityIds)]
    if (uniqueIds.length < 1 || uniqueIds.length > 3) throw new Error('成长赛季需要选择 1 至 3 项核心行为')
    const activities = await database.activities.bulkGet(uniqueIds)
    if (activities.some((activity) => !activity || !activity.enabled || activity.archivedAt)) throw new Error('核心行为必须存在且处于启用状态')
    const createdAt = new Date().toISOString()
    const season = SeasonSchema.parse({
      id: crypto.randomUUID(),
      title: input.title,
      successCriterion: input.successCriterion,
      baseline: input.baseline,
      targetOutcome: input.targetOutcome,
      startsOn: eventDate,
      endsOn: addDays(eventDate, 27),
      focusActivities: activities.map((activity) => snapshotSeasonActivity(activity!)),
      dailyPlans: [],
      suggestions: [],
      status: 'active',
      createdAt,
    })
    await database.seasons.add(season)
    return season
  })
}

export async function setSeasonDailyFocus(seasonId: string, activityIds: string[], occurredOn: string | undefined = undefined, database = db) {
  const eventDate = occurredOn ?? await currentGameDate(database)
  return database.transaction('rw', database.seasons, database.activities, async () => {
    const season = await database.seasons.get(seasonId)
    if (!season || season.status !== 'active') throw new Error('找不到进行中的成长赛季')
    if (eventDate < season.startsOn || eventDate > season.endsOn) throw new Error('今日重点必须位于当前赛季内')
    const uniqueIds = [...new Set(activityIds)]
    if (uniqueIds.length < 1 || uniqueIds.length > 3) throw new Error('今日重点需要选择 1 至 3 项行动')
    const activities = await database.activities.bulkGet(uniqueIds)
    if (activities.some((activity) => !activity || !activity.enabled || activity.archivedAt)) throw new Error('今日重点必须存在且处于启用状态')
    const next = SeasonSchema.parse({
      ...season,
      dailyPlans: [...season.dailyPlans.filter((plan) => plan.date !== eventDate), { date: eventDate, activityIds: uniqueIds }],
    })
    await database.seasons.put(next)
    return next
  })
}

export async function respondToSeasonSuggestion(
  seasonId: string,
  suggestionId: string,
  status: Exclude<SuggestionStatus, 'pending'>,
  responseNote?: string,
  database = db,
) {
  return database.transaction('rw', database.seasons, async () => {
    const season = await database.seasons.get(seasonId)
    if (!season) throw new Error('找不到这个成长赛季')
    const suggestion = season.suggestions.find((item) => item.id === suggestionId)
    if (!suggestion) throw new Error('找不到这条成长建议')
    if (suggestion.status !== 'pending') return season
    if (status === 'modified' && !responseNote?.trim()) throw new Error('修改后接受时请说明你的调整')
    const respondedAt = new Date().toISOString()
    const next = SeasonSchema.parse({
      ...season,
      suggestions: season.suggestions.map((item) => item.id === suggestionId
        ? { ...item, status, responseNote: responseNote?.trim() || undefined, respondedAt }
        : item),
    })
    await database.seasons.put(next)
    return next
  })
}

export async function completeSeason(
  seasonId: string,
  result: SeasonResult,
  evidence: string,
  occurredOn: string | undefined = undefined,
  database = db,
) {
  const eventDate = occurredOn ?? await currentGameDate(database)
  return database.transaction('rw', database.seasons, async () => {
    const storedSeason = await database.seasons.get(seasonId)
    if (!storedSeason || storedSeason.status !== 'active') throw new Error('找不到进行中的成长赛季')
    const season = SeasonSchema.parse(storedSeason)
    if (eventDate < season.endsOn) throw new Error(`赛季将在 ${season.endsOn} 游戏日结束`)
    if (!season.suggestions.some((suggestion) => suggestion.status === 'accepted' || suggestion.status === 'modified')) {
      throw new Error('结束赛季前至少接受或调整一条成长建议')
    }
    const next = SeasonSchema.parse({
      ...season,
      status: 'completed',
      finalResult: result,
      finalEvidence: evidence,
      completedAt: new Date().toISOString(),
    })
    await database.seasons.put(next)
    return next
  })
}

export type NewActivity = Omit<Activity, 'id' | 'createdAt'>

export const stableLifeBlueprint: readonly NewActivity[] = [
  {
    title: '晨间唤醒',
    cue: '07:30 起床后、查看信息前',
    protocol: '基础：离床、接触自然光并喝水。标准：增加阳台或户外光照和轻微活动。',
    type: 'habit',
    domain: 'health',
    difficulty: '简单',
    goal: { kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '分钟', thresholds: [120, 300] },
    schedule: { kind: 'daily' },
    isKey: true,
    enabled: true,
  },
  {
    title: '单点开工',
    cue: '第一段正式工作开始前',
    protocol: '写下一个当前结果和一个立即动作。其他想法只记到纸上，不分析、不搜索，工作段结束后再处理。',
    type: 'habit',
    domain: 'career',
    difficulty: '普通',
    goal: { kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '分钟', thresholds: [600, 1500] },
    schedule: { kind: 'daily' },
    isKey: true,
    enabled: true,
  },
  {
    title: '夜间收尾',
    cue: '23:00',
    protocol: '基础：写下未完成事项和明天第一个动作。标准：停止工作、手机离开床边，准备 23:30 入睡。',
    type: 'habit',
    domain: 'life',
    difficulty: '简单',
    goal: { kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '分钟', thresholds: [180, 300] },
    schedule: { kind: 'daily' },
    isKey: true,
    enabled: true,
  },
]

async function countOpenKeyActivities(database: LifeRpgDatabase, excludeId?: string) {
  const today = await currentGameDate(database)
  const completedTaskIds = new Set(
    (await database.completions.where('status').equals('active').and((completion) => completion.occurredOn < today).toArray()).map((completion) => completion.activityId),
  )
  return database.activities
    .filter((item) => item.id !== excludeId && item.isKey && item.enabled && !item.archivedAt && (item.type === 'habit' || !completedTaskIds.has(item.id)))
    .count()
}

export async function createActivity(input: NewActivity, database = db) {
  const activity = ActivitySchema.parse({ ...input, id: crypto.randomUUID(), revision: 1, createdAt: new Date().toISOString() })
  await database.transaction('rw', database.activities, database.completions, database.settings, async () => {
    if (activity.enabled && activity.isKey) {
      const keyCount = await countOpenKeyActivities(database)
      if (keyCount >= 3) throw new Error('关键行为最多只能启用 3 项')
    }
    await database.activities.add(activity)
  })
  return activity
}

export async function calibrateSeasonWithStableLife(
  seasonId: string,
  occurredOn: string | undefined = undefined,
  database = db,
) {
  const eventDate = occurredOn ?? await currentGameDate(database)
  return database.transaction('rw', database.seasons, database.activities, async () => {
    const season = await database.seasons.get(seasonId)
    if (!season || season.status !== 'active') throw new Error('找不到进行中的成长赛季')
    if (season.calibration?.blueprintId === 'stable-life-v1') {
      const activities = await database.activities.bulkGet(season.focusActivities.map((activity) => activity.activityId))
      return { season, activities: activities.filter((activity): activity is Activity => Boolean(activity)) }
    }
    if (!canCalibrateSeason(season, eventDate)) throw new Error('赛季只能在第 1～3 天校准一次')

    const calibratedAt = new Date().toISOString()
    const existing = await database.activities.toArray()
    const created = stableLifeBlueprint.map((input) => ActivitySchema.parse({
      ...input,
      id: crypto.randomUUID(),
      revision: 1,
      createdAt: calibratedAt,
    }))
    await database.activities.bulkPut(existing.filter((activity) => activity.isKey).map((activity) => ({ ...activity, isKey: false })))
    await database.activities.bulkAdd(created)

    const next = SeasonSchema.parse({
      ...season,
      title: '稳定生活状态',
      successCriterion: '三项核心行为各完成基础层至少 20 天；最后 7 天至少 5 天在 07:00–08:00 起床，晨间精力平均不低于 3/5，生活掌控感平均不低于 3.5/5。',
      baseline: '早晨起床没精神；工作时容易被其他想法带走并陷进去，随后时间追赶、焦躁发呆，只想尽快熬过当天。',
      targetOutcome: '早晨能够启动；工作时把岔开的想法先停放并回到当前动作；晚上能够收尾，生活主要感受是平静和可掌控。',
      startsOn: eventDate,
      endsOn: addDays(eventDate, 27),
      focusActivities: created.map(snapshotSeasonActivity),
      dailyPlans: [],
      dailySignals: [],
      suggestions: [],
      calibration: {
        blueprintId: 'stable-life-v1',
        calibratedOn: eventDate,
        calibratedAt,
        previous: {
          title: season.title,
          successCriterion: season.successCriterion,
          baseline: season.baseline,
          targetOutcome: season.targetOutcome,
          startsOn: season.startsOn,
          endsOn: season.endsOn,
          focusActivities: season.focusActivities,
          dailyPlans: season.dailyPlans,
        },
      },
    })
    await database.seasons.put(next)
    return { season: next, activities: created }
  })
}

export async function saveSeasonDailySignal(
  seasonId: string,
  input: Pick<SeasonDailySignal, 'wakeWindowMet' | 'morningEnergy' | 'control'>,
  occurredOn: string | undefined = undefined,
  database = db,
) {
  const eventDate = occurredOn ?? await currentGameDate(database)
  return database.transaction('rw', database.seasons, async () => {
    const storedSeason = await database.seasons.get(seasonId)
    if (!storedSeason || storedSeason.status !== 'active') throw new Error('找不到进行中的成长赛季')
    const season = SeasonSchema.parse(storedSeason)
    if (eventDate < season.startsOn || eventDate > season.endsOn) throw new Error('今日状态必须位于当前赛季内')
    const signal = {
      date: eventDate,
      ...input,
      recordedAt: new Date().toISOString(),
    }
    const next = SeasonSchema.parse({
      ...season,
      dailySignals: [...season.dailySignals.filter((item) => item.date !== eventDate), signal],
    })
    await database.seasons.put(next)
    return signal
  })
}

export async function setActivityKey(activityId: string, isKey: boolean, database = db) {
  await database.transaction('rw', database.activities, database.completions, database.settings, async () => {
    const activity = await database.activities.get(activityId)
    if (!activity) throw new Error('找不到这项行动')
    if (activity.archivedAt) throw new Error('已归档活动不能设为关键行为')
    if (isKey && activity.enabled && !activity.isKey) {
      const keyCount = await countOpenKeyActivities(database, activity.id)
      if (keyCount >= 3) throw new Error('关键行为最多只能启用 3 项')
    }
    await database.activities.update(activityId, { isKey })
  })
}

export async function setActivityEnabled(activityId: string, enabled: boolean, database = db) {
  await database.transaction('rw', database.activities, database.completions, database.settings, async () => {
    const activity = await database.activities.get(activityId)
    if (!activity) throw new Error('找不到这项行动')
    if (activity.archivedAt) throw new Error('请先恢复已归档活动')
    if (enabled && activity.isKey && !activity.enabled) {
      const keyCount = await countOpenKeyActivities(database, activity.id)
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
    domain: activity.domain,
    difficulty: activity.difficulty,
    schedule: activity.schedule,
    goal,
    isKey: activity.isKey,
  }, database)
}

export type HabitUpdate = Pick<Activity, 'title' | 'cue' | 'protocol' | 'domain' | 'difficulty' | 'schedule' | 'goal' | 'isKey'>

export async function updateHabit(activityId: string, input: HabitUpdate, database = db, occurredOn?: string) {
  return database.transaction('rw', database.activities, database.completions, database.settings, async () => {
    const activity = await database.activities.get(activityId)
    if (!activity || activity.type !== 'habit' || activity.archivedAt) throw new Error('找不到可编辑的习惯')
    if (input.isKey && activity.enabled && !activity.isKey) {
      const keyCount = await countOpenKeyActivities(database, activity.id)
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
        domainSnapshot: activity.attribute ? undefined : activity.domain,
        difficultySnapshot: activity.difficulty,
      })))
    }
    const updated = ActivitySchema.parse({ ...activity, ...input, revision: (activity.revision ?? 1) + 1 })
    if (!isIncrementalGoal(activity) && isIncrementalGoal(updated)) {
      const eventDate = occurredOn ?? await currentGameDate(database)
      const cycleStart = startOfWeek(new Date(`${eventDate}T12:00:00`))
      const oldCompletions = await database.completions
        .where('activityId')
        .equals(activityId)
        .and((completion) => completion.status === 'active' && completion.occurredOn >= cycleStart && Boolean(completion.tier) && !completion.progress)
        .toArray()
      if (oldCompletions.length > 1) throw new Error('本周已有多条旧完成，请下周一 04:00 后启用逐次累计')
      if (oldCompletions.length === 1) {
        const completion = oldCompletions[0]
        const tier = completion.tier!
        const threshold = updated.goal.thresholds[tier - 1]
        const countDelta = typeof threshold === 'number' ? threshold : threshold.count
        const durationSeconds = typeof threshold === 'number'
          ? undefined
          : updated.goal.metric === 'combined' && updated.goal.mode === 'per_occurrence' ? threshold.count * threshold.durationSeconds : threshold.durationSeconds
        await database.completions.put(CompletionSchema.parse({
          ...completion,
          tierGoalSnapshot: updated.goal,
          progress: {
            mode: 'weekly_incremental',
            cycleStart,
            countDelta,
            durationSeconds,
            perOccurrenceDurationSeconds: typeof threshold === 'number' || updated.goal.metric !== 'combined' || updated.goal.mode === 'total' ? undefined : threshold.durationSeconds,
            sequence: 1,
            requestId: `import:${completion.id}`,
            imported: true,
          },
        }))
      }
    }
    await database.activities.put(updated)
    return updated
  })
}

export async function archiveActivity(activityId: string, database = db) {
  return database.transaction('rw', database.activities, database.completions, async () => {
    const activity = await database.activities.get(activityId)
    if (!activity || activity.archivedAt) return false
    if (activity.type === 'task') {
      const completed = await database.completions.where('activityId').equals(activityId).and((completion) => completion.status === 'active').count()
      if (completed > 0) throw new Error('已完成任务无需归档')
    }
    await database.activities.put(ActivitySchema.parse({ ...activity, enabled: false, isKey: false, archivedAt: new Date().toISOString() }))
    return true
  })
}

export async function restoreActivity(activityId: string, database = db) {
  return database.transaction('rw', database.activities, async () => {
    const activity = await database.activities.get(activityId)
    if (!activity || !activity.archivedAt) return false
    const { archivedAt: _archivedAt, ...rest } = activity
    await database.activities.put(ActivitySchema.parse({ ...rest, enabled: true, isKey: false }))
    return true
  })
}

export async function permanentlyDeleteActivity(
  activityId: string,
  occurredOn: string | undefined = undefined,
  database = db,
) {
  const today = occurredOn ?? await currentGameDate(database)
  return database.transaction('rw', database.activities, database.completions, database.weeklyReviews, async () => {
    const activity = await database.activities.get(activityId)
    if (!activity) return false

    const completions = await database.completions.where('activityId').equals(activityId).toArray()
    const activeCompletions = completions.filter((completion) => completion.status === 'active')
    if (activeCompletions.some((completion) => completion.occurredOn === today)) {
      throw new Error('本日结算后可永久删除')
    }
    if (!activity.archivedAt && !(activity.type === 'task' && activeCompletions.some((completion) => completion.occurredOn < today))) {
      throw new Error('请先归档活动')
    }

    if (completions.length > 0) {
      await database.completions.bulkPut(completions.map((completion) => ({
        ...completion,
        activityRevision: completion.activityRevision ?? activity.revision ?? 1,
        titleSnapshot: completion.titleSnapshot ?? activity.title,
        attributeSnapshot: completion.attributeSnapshot ?? activity.attribute,
        domainSnapshot: completion.attributeSnapshot ? undefined : completion.domainSnapshot ?? activity.domain,
        difficultySnapshot: completion.difficultySnapshot ?? activity.difficulty,
      })))
    }

    const reviews = await database.weeklyReviews.toArray()
    const updatedReviews = reviews
      .filter((review) => review.items.some((item) => item.activityId === activityId && (!item.titleSnapshot || (!item.attributeSnapshot && !item.domainSnapshot))))
      .map((review) => ({
        ...review,
        items: review.items.map((item) => item.activityId === activityId
          ? { ...item, titleSnapshot: item.titleSnapshot ?? activity.title, attributeSnapshot: item.attributeSnapshot ?? activity.attribute, domainSnapshot: item.attributeSnapshot ? undefined : item.domainSnapshot ?? activity.domain }
          : item),
      }))
    if (updatedReviews.length > 0) await database.weeklyReviews.bulkPut(updatedReviews)

    await database.activities.delete(activityId)
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

export async function redeemReward(rewardId: string, database = db) {
  return database.transaction('rw', database.rewards, database.ledgerEvents, database.settings, async () => {
    const reward = await database.rewards.get(rewardId)
    if (!reward || !reward.enabled) throw new Error('奖励不存在或已停用')
    const events = await database.ledgerEvents.toArray()
    if (calculateStats(events).coins < reward.cost) throw new Error('金币余额不足')
    const event: LedgerEvent = {
      id: `redemption:${crypto.randomUUID()}`,
      kind: 'redemption',
      sourceId: reward.id,
      occurredOn: await currentGameDate(database),
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
      occurredOn: await currentGameDate(database),
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

export async function getSnapshot(database = db) {
  const [activities, completions, ledgerEvents, rewards, weeklyReviews, seasons, settings] = await Promise.all([
    database.activities.toArray(),
    database.completions.toArray(),
    database.ledgerEvents.toArray(),
    database.rewards.toArray(),
    database.weeklyReviews.toArray(),
    database.seasons.toArray(),
    database.settings.toArray(),
  ])
  return {
    activities,
    completions,
    ledgerEvents,
    rewards,
    weeklyReviews,
    seasons: seasons.map((season) => SeasonSchema.parse(season)),
    settings,
  }
}
