import {
  ActivitySchema,
  MetaSchema,
  OnboardingStateSchema,
  type Activity,
  CompletionSchema,
  type Completion,
  type Difficulty,
  type GrowthDomain,
  isNewcomerDataFootprintEmpty,
  addDays,
  isIncrementalGoal,
  startOfWeek,
} from '../domain'
import {
  SeasonSchema,
  canCalibrateSeason,
  snapshotSeasonActivity,
  type Season,
  type SeasonDailySignal,
} from '../season'
import { db, currentGameDate, type LifeRpgDatabase } from './database'

export type NewActivity = Omit<Activity, 'id' | 'createdAt'>

export const stableLifeBlueprint: readonly NewActivity[] = [
  {
    title: '晨间唤醒',
    scheduledTime: '07:30',
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
    scheduledTime: '23:00',
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

function parseNewActivity(input: NewActivity, now = new Date()) {
  return ActivitySchema.parse({ ...input, id: crypto.randomUUID(), revision: 1, createdAt: now.toISOString() })
}

async function addActivityRecord(activity: Activity, database: LifeRpgDatabase) {
  if (activity.enabled && activity.isKey) {
    const keyCount = await countOpenKeyActivities(database)
    if (keyCount >= 3) throw new Error('关键行为最多只能启用 3 项')
  }
  await database.activities.add(activity)
}

export async function createActivity(input: NewActivity, database = db) {
  const activity = parseNewActivity(input)
  await database.transaction('rw', database.activities, database.completions, database.settings, async () => {
    await addActivityRecord(activity, database)
  })
  return activity
}

export interface FirstOnboardingActivityInput {
  title: string
  domain: GrowthDomain
}

export async function createFirstOnboardingConfiguredActivity(
  input: NewActivity,
  database = db,
  now = new Date(),
) {
  return database.transaction('rw', [
    database.activities,
    database.completions,
    database.ledgerEvents,
    database.rewards,
    database.rewardClaims,
    database.weeklyReviews,
    database.seasons,
    database.settings,
  ], async () => {
    const storedMeta = await database.settings.get('meta')
    const meta = storedMeta?.key === 'meta' ? storedMeta.value : {}
    if (meta.onboarding?.startedOn && meta.onboarding.primaryActivityId) {
      const existing = await database.activities.get(meta.onboarding.primaryActivityId)
      if (!existing) throw new Error('新手体验的首项行动不存在')
      return { activity: existing, onboarding: meta.onboarding, created: false }
    }
    const [activityCount, completionCount, ledgerEventCount, rewardCount, rewardClaimCount, weeklyReviewCount, seasonCount, settings] = await Promise.all([
      database.activities.count(),
      database.completions.count(),
      database.ledgerEvents.count(),
      database.rewards.count(),
      database.rewardClaims.count(),
      database.weeklyReviews.count(),
      database.seasons.count(),
      database.settings.toArray(),
    ])
    if (!isNewcomerDataFootprintEmpty({
      activityCount, completionCount, ledgerEventCount, rewardCount, rewardClaimCount, weeklyReviewCount, seasonCount, settings,
    })) throw new Error('快速创建仅适用于没有既有成长数据的新用户')

    const activity = parseNewActivity(input, now)
    await addActivityRecord(activity, database)

    const activatedAt = now.toISOString()
    const onboarding = OnboardingStateSchema.parse({
      ...meta.onboarding,
      startedOn: await currentGameDate(database, now),
      primaryActivityId: activity.id,
    })
    await database.settings.put({
      key: 'meta',
      value: MetaSchema.parse({
        ...meta,
        growthDomainSystem: meta.growthDomainSystem ?? { version: 1, activatedAt },
        onboarding,
      }),
    })
    return { activity, onboarding, created: true }
  })
}

export async function createFirstOnboardingActivity(
  input: FirstOnboardingActivityInput,
  database = db,
  now = new Date(),
) {
  return createFirstOnboardingConfiguredActivity({
    title: input.title,
    type: 'habit',
    domain: input.domain,
    difficulty: '简单',
    goal: { count: 1, unit: '次' },
    schedule: { kind: 'daily' },
    isKey: true,
    enabled: true,
  }, database, now)
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

export type HabitUpdate = Pick<Activity, 'title' | 'scheduledTime' | 'cue' | 'protocol' | 'domain' | 'difficulty' | 'schedule' | 'goal' | 'isKey'>

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
  return database.transaction('rw', database.activities, database.completions, database.weeklyReviews, database.settings, async () => {
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

    const storedMeta = await database.settings.get('meta')
    if (storedMeta?.key === 'meta' && storedMeta.value.onboarding?.primaryActivityId === activityId) {
      const { startedOn: _startedOn, primaryActivityId: _primaryActivityId, ...remainingOnboarding } = storedMeta.value.onboarding
      await database.settings.put({
        key: 'meta',
        value: MetaSchema.parse({
          ...storedMeta.value,
          onboarding: Object.keys(remainingOnboarding).length ? remainingOnboarding : undefined,
        }),
      })
    }

    await database.activities.delete(activityId)
    return true
  })
}
