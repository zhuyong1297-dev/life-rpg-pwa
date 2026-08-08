import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup, previewBackupRestore, restoreBackup } from '../backup'
import {
  LifeRpgDatabase,
  activateCoachPlanDraft,
  activateGrowthDomains,
  acknowledgeLevelMilestone,
  applyRewardBudgetRollover,
  archiveActivity,
  calibrateSeasonWithStableLife,
  cancelRewardClaim,
  cancelTodayCompletion,
  completeSeason,
  completeActivity,
  createActivity,
  createSeason,
  createReward,
  currentGameDate,
  fulfillRewardClaim,
  getCoachPlanDraft,
  getGrowthDomainMigrationCandidates,
  getSnapshot,
  getTodayActionPriority,
  initializeDatabase,
  permanentlyDeleteActivity,
  claimMilestoneReward,
  redeemReward,
  recordIncrementalProgress,
  reserveRewardClaim,
  respondToSeasonSuggestion,
  restoreActivity,
  saveWeeklyReview,
  saveSeasonDailySignal,
  saveCoachPlanDraft,
  setRewardEnabled,
  setRewardQueue,
  setSeasonDailyFocus,
  setTargetReward,
  setTodayActionPriority,
  syncLevelMilestones,
  stableLifeBlueprint,
  undoCompletion,
  undoLatestIncrementalProgress,
  updateActivityGoal,
  updateHabit,
  updateTodayRating,
  updateReward,
  type NewActivity,
} from '../db'
import { calculateStats, createCoachPlanDraft, getJourneyMonths, growthDomains, type CoachPlanDraft } from '../domain'
import { getSeasonEvidence } from '../season'

let database: LifeRpgDatabase

const dailyHabit: NewActivity = {
  title: '示例习惯',
  type: 'habit',
  domain: 'career',
  difficulty: '普通',
  goal: { count: 1, unit: '次' },
  schedule: { kind: 'daily' },
  isKey: true,
  enabled: true,
}

const tieredHabit: NewActivity = {
  ...dailyHabit,
  goal: { kind: 'tiered', metric: 'duration', unit: '分钟', thresholds: [5, 20, 45] },
}

const ratingHabit: NewActivity = {
  ...dailyHabit,
  title: '每日体验评分',
  goal: {
    kind: 'rating',
    scale: 5,
    prompt: '今天的恢复感如何？',
    anchors: { low: '很差', middle: '一般', high: '很好' },
    notePrompt: '主要影响因素',
  },
}

const configuredReward = {
  reason: '完成后会让我真正感到放松',
  cashCostCents: 0,
  horizon: 'near' as const,
  repeatPolicy: { kind: 'repeatable' as const, cooldownDays: 7 },
}

function readyCoachDraft(behaviors: CoachPlanDraft['behaviors']): CoachPlanDraft {
  return {
    ...createCoachPlanDraft(new Date('2026-01-05T00:00:00.000Z'), 'plan-1'),
    title: '稳定推进项目',
    successCriterion: '28 天内完成 20 天核心行为',
    baseline: '当前容易被临时想法打断',
    targetOutcome: '能够稳定启动并完成当日重点',
    currentStep: 4,
    status: 'ready',
    behaviors,
    badDayConfirmed: true,
    evidenceConfirmed: true,
  }
}

beforeEach(async () => {
  database = new LifeRpgDatabase(`test-${crypto.randomUUID()}`)
  await initializeDatabase(database)
})

afterEach(async () => {
  database.close()
  await database.delete()
})


describe('IndexedDB 核心事务', () => {
  it('评分 1 至 5 都只发固定奖励，当天改分和备注不改变账本', async () => {
    const activity = await createActivity(ratingHabit, database)
    const first = await completeActivity(activity.id, '2026-07-27', { ratingValue: 1 }, database)
    expect(first.awarded).toBe(true)
    expect(first.event).toMatchObject({ xpDelta: 10, coinDelta: 5 })
    if (!first.completion) throw new Error('评分完成记录缺失')
    expect(first.completion).toMatchObject({ ratingValue: 1, ratingGoalSnapshot: ratingHabit.goal })

    const duplicate = await completeActivity(activity.id, '2026-07-27', { ratingValue: 5 }, database)
    expect(duplicate.awarded).toBe(false)
    const ledgerBeforeEdit = await database.ledgerEvents.toArray()
    const updated = await updateTodayRating(
      activity.id,
      5,
      '昨晚较早停止使用屏幕',
      '2026-07-27',
      database,
      new Date(2026, 6, 27, 12, 0),
    )
    expect(updated).toMatchObject({ ratingValue: 5, note: '昨晚较早停止使用屏幕' })
    expect(await database.ledgerEvents.toArray()).toEqual(ledgerBeforeEdit)
    await expect(updateTodayRating(
      activity.id,
      3,
      undefined,
      '2026-07-27',
      database,
      new Date(2026, 6, 28, 12, 0),
    )).rejects.toThrow('当前游戏日')

    expect(await undoCompletion(first.completion.id, database)).toBe(true)
    const redone = await completeActivity(activity.id, '2026-07-27', { ratingValue: 2 }, database)
    expect(redone.awarded).toBe(true)
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 10, coins: 5 })
  })

  it('目标规划启用会原子切换关键行为并且重复提交幂等', async () => {
    const oldKey = await createActivity({ ...dailyHabit, title: '旧关键行为' }, database)
    const reusable = await createActivity({ ...dailyHabit, title: '继续复用', isKey: false }, database)
    const draft = readyCoachDraft([
      { id: 'reuse', role: 'progress', source: 'existing', activityId: reusable.id, confirmed: true },
      {
        id: 'new', role: 'maintain', source: 'new', title: '收尾行为', scheduledTime: '22:30', cue: '结束工作前', protocol: '记录下一步并停止工作',
        domain: 'life', difficulty: '简单', goal: { kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '分钟', thresholds: [180, 300] },
        schedule: { kind: 'daily' }, confirmed: true,
      },
    ])
    await saveCoachPlanDraft(draft, database)
    const first = await activateCoachPlanDraft(draft.id, '2026-01-05', database)
    const second = await activateCoachPlanDraft(draft.id, '2026-01-05', database)
    expect(second.id).toBe(first.id)
    expect(await database.seasons.count()).toBe(1)
    expect(await database.activities.count()).toBe(3)
    expect((await database.activities.get(oldKey.id))?.isKey).toBe(false)
    expect((await database.activities.get(reusable.id))?.isKey).toBe(true)
    expect(first.focusActivities.map((item) => item.title)).toEqual(['继续复用', '收尾行为'])
    expect((await database.activities.toArray()).find((item) => item.title === '收尾行为')?.scheduledTime).toBe('22:30')
    expect(await getCoachPlanDraft(database)).toBeUndefined()
  })

  it('今天优先最多保留五项并在第六项加入时替换最早项', async () => {
    const activities = []
    for (let index = 0; index < 6; index += 1) {
      activities.push(await createActivity({ ...dailyHabit, title: `随时行动 ${index + 1}`, isKey: false }, database))
    }
    for (const activity of activities.slice(0, 5)) {
      await setTodayActionPriority(activity.id, true, '2026-07-24', database)
    }
    const result = await setTodayActionPriority(activities[5].id, true, '2026-07-24', database)

    expect(result.replacedActivityId).toBe(activities[0].id)
    expect(await getTodayActionPriority('2026-07-24', database)).toEqual(activities.slice(1).map((activity) => activity.id))
    expect(await getTodayActionPriority('2026-07-25', database)).toEqual([])
  })

  it('今天优先拒绝固定时间、关键和非每日行动，并支持取消', async () => {
    const flexible = await createActivity({ ...dailyHabit, title: '随时行动', isKey: false }, database)
    const timed = await createActivity({ ...dailyHabit, title: '定时行动', scheduledTime: '08:00', isKey: false }, database)
    const legacyTimed = await createActivity({ ...dailyHabit, title: '旧定时行动', cue: '09:00 早餐后', isKey: false }, database)
    const weekly = await createActivity({ ...dailyHabit, title: '每周行动', schedule: { kind: 'weekly', times: 1 }, isKey: false }, database)
    const key = await createActivity({ ...dailyHabit, title: '关键行动' }, database)

    await expect(setTodayActionPriority(timed.id, true, '2026-07-24', database)).rejects.toThrow('无固定时间')
    await expect(setTodayActionPriority(legacyTimed.id, true, '2026-07-24', database)).rejects.toThrow('无固定时间')
    await expect(setTodayActionPriority(weekly.id, true, '2026-07-24', database)).rejects.toThrow('无固定时间')
    await expect(setTodayActionPriority(key.id, true, '2026-07-24', database)).rejects.toThrow('无固定时间')
    await setTodayActionPriority(flexible.id, true, '2026-07-24', database)
    await setTodayActionPriority(flexible.id, false, '2026-07-24', database)
    expect(await getTodayActionPriority('2026-07-24', database)).toEqual([])
  })

  it('存在当前赛季时启用草稿会拒绝且不修改赛季或活动', async () => {
    const activity = await createActivity(dailyHabit, database)
    const season = await createSeason({
      title: '当前赛季', successCriterion: '保持行动', baseline: '开始', targetOutcome: '稳定', focusActivityIds: [activity.id],
    }, '2026-01-05', database)
    const draft = readyCoachDraft([{
      id: 'new', role: 'start', source: 'new', title: '新启动', cue: '起床后', protocol: '先做最小动作',
      domain: 'health', difficulty: '简单', goal: { kind: 'tiered', metric: 'count', unit: '次', thresholds: [1, 2] },
      schedule: { kind: 'daily' }, confirmed: true,
    }])
    await saveCoachPlanDraft(draft, database)
    await expect(activateCoachPlanDraft(draft.id, '2026-01-05', database)).rejects.toThrow('只能先保存')
    expect(await database.activities.count()).toBe(1)
    expect(await database.seasons.get(season.id)).toEqual(season)
    expect(await getCoachPlanDraft(database)).toMatchObject({ id: draft.id, status: 'ready' })
  })

  it('复用活动失效时启用整笔回滚', async () => {
    const reusable = await createActivity({ ...dailyHabit, isKey: false }, database)
    await database.activities.update(reusable.id, { enabled: false })
    const draft = readyCoachDraft([{ id: 'reuse', role: 'progress', source: 'existing', activityId: reusable.id, confirmed: true }])
    await saveCoachPlanDraft(draft, database)
    await expect(activateCoachPlanDraft(draft.id, '2026-01-05', database)).rejects.toThrow('暂停、归档或删除')
    expect(await database.seasons.count()).toBe(0)
    expect(await database.activities.count()).toBe(1)
    expect(await getCoachPlanDraft(database)).toMatchObject({ id: draft.id })
  })

  it('限制最多三项关键行为', async () => {
    for (let index = 0; index < 3; index += 1) await createActivity({ ...dailyHabit, title: `示例 ${index}` }, database)
    await expect(createActivity({ ...dailyHabit, title: '第四项' }, database)).rejects.toThrow('最多只能启用 3 项')
  })

  it('双击只写入一份完成和奖励', async () => {
    const activity = await createActivity(dailyHabit, database)
    const results = await Promise.all([
      completeActivity(activity.id, '2026-01-05', undefined, database),
      completeActivity(activity.id, '2026-01-05', undefined, database),
    ])
    expect(results.filter((result) => result.awarded)).toHaveLength(1)
    expect(await database.completions.count()).toBe(1)
    expect(await database.ledgerEvents.count()).toBe(1)
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 10, coins: 5 })
  })

  it('撤销追加修正，重做后的净奖励最多一份', async () => {
    const activity = await createActivity(dailyHabit, database)
    const first = await completeActivity(activity.id, '2026-01-05', undefined, database)
    if (!first.awarded) throw new Error('测试前置完成失败')
    expect(await undoCompletion(first.completion.id, database)).toBe(true)
    const second = await completeActivity(activity.id, '2026-01-05', undefined, database)
    expect(second.awarded).toBe(true)
    expect(await database.completions.count()).toBe(2)
    expect(await database.ledgerEvents.count()).toBe(3)
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 10, coins: 5 })
  })

  it('每周习惯达到计划次数后不再发奖', async () => {
    const activity = await createActivity({ ...dailyHabit, schedule: { kind: 'weekly', times: 2 } }, database)
    expect((await completeActivity(activity.id, '2026-01-05', undefined, database)).awarded).toBe(true)
    expect((await completeActivity(activity.id, '2026-01-06', undefined, database)).awarded).toBe(true)
    expect((await completeActivity(activity.id, '2026-01-07', undefined, database)).awarded).toBe(false)
    expect(await database.ledgerEvents.count()).toBe(2)
  })

  it('Boss 缺少成果时拒绝完成且不产生部分写入', async () => {
    const activity = await createActivity({ ...dailyHabit, difficulty: 'Boss' }, database)
    await expect(completeActivity(activity.id, '2026-01-05', '', database)).rejects.toThrow('必须填写实际成果')
    expect(await database.completions.count()).toBe(0)
    expect(await database.ledgerEvents.count()).toBe(0)
  })

  it('时长习惯达到目标才发一份固定奖励并保存实际分钟', async () => {
    const activity = await createActivity(
      { ...dailyHabit, goal: { kind: 'duration', count: 30, unit: '分钟' }, difficulty: '简单' },
      database,
    )
    await expect(
      completeActivity(activity.id, '2026-01-05', { durationMinutes: 20 }, database),
    ).rejects.toThrow('还未达到 30 分钟目标')
    expect(await database.ledgerEvents.count()).toBe(0)

    const result = await completeActivity(activity.id, '2026-01-05', { durationMinutes: 45 }, database)
    expect(result.awarded).toBe(true)
    if (!result.awarded) throw new Error('测试前置完成失败')
    expect(result.completion.durationMinutes).toBe(45)
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 5, coins: 2 })
  })

  it('三层习惯同日升级只补 XP 差额且金币只发一次', async () => {
    const activity = await createActivity(tieredHabit, database)
    const base = await completeActivity(activity.id, '2026-01-05', { tier: 1 }, database)
    expect(base.awarded).toBe(true)
    const standard = await completeActivity(activity.id, '2026-01-05', { tier: 2 }, database)
    expect(standard).toMatchObject({ awarded: true, upgraded: true })
    const upgrades = await Promise.all([
      completeActivity(activity.id, '2026-01-05', { tier: 3 }, database),
      completeActivity(activity.id, '2026-01-05', { tier: 3 }, database),
    ])
    expect(upgrades.filter((result) => result.awarded)).toHaveLength(1)
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 10, coins: 5 })
    expect(await database.completions.count()).toBe(1)
    expect(await database.completions.toCollection().first()).toMatchObject({ tier: 3, tierGoalSnapshot: tieredHabit.goal })
  })

  it('两层习惯从基础升级到标准后恰好达到完整难度上限', async () => {
    const activity = await createActivity({
      ...tieredHabit,
      goal: { kind: 'tiered', metric: 'count', unit: '次', thresholds: [1, 3] },
    }, database)
    const base = await completeActivity(activity.id, '2026-01-05', { tier: 1 }, database)
    const standard = await completeActivity(activity.id, '2026-01-05', { tier: 2 }, database)
    expect(base.awarded && base.event).toMatchObject({ xpDelta: 6, coinDelta: 5 })
    expect(standard.awarded && standard.event).toMatchObject({ xpDelta: 4, coinDelta: 0 })
    await expect(completeActivity(activity.id, '2026-01-05', { tier: 3 }, database)).rejects.toThrow('不属于完成时的目标')
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 10, coins: 5 })
  })

  it('游戏日启用前使用自然日，启用后以凌晨四点为边界', async () => {
    const activation = new Date(2026, 6, 20, 4, 0, 0)
    const meta = await database.settings.get('meta')
    if (meta?.key !== 'meta') throw new Error('测试缺少 meta')
    await database.settings.put({ ...meta, value: { ...meta.value, gameDayBoundaryActivatedAt: activation.toISOString() } })
    expect(await currentGameDate(database, new Date(2026, 6, 20, 3, 59, 59))).toBe('2026-07-20')
    expect(await currentGameDate(database, activation)).toBe('2026-07-20')
    expect(await currentGameDate(database, new Date(2026, 6, 21, 3, 59, 59))).toBe('2026-07-20')
    expect(await currentGameDate(database, new Date(2026, 6, 21, 4, 0, 0))).toBe('2026-07-21')
  })

  it('领域迁移必须完整确认且原子同步当前赛季，不改写历史数值', async () => {
    const oldHabit = await createActivity({ ...dailyHabit, domain: undefined, attribute: '专注', title: '旧习惯' }, database)
    const currentTask = await createActivity({
      ...dailyHabit,
      domain: undefined,
      attribute: '体魄',
      title: '今日任务',
      type: 'task',
      schedule: { kind: 'once' },
      plannedOn: '2026-01-06',
      isKey: false,
    }, database)
    const settledTask = await createActivity({
      ...dailyHabit,
      domain: undefined,
      attribute: '智识',
      title: '历史任务',
      type: 'task',
      schedule: { kind: 'once' },
      plannedOn: '2026-01-05',
      isKey: false,
    }, database)
    await database.completions.add({ id: 'legacy-completion', activityId: settledTask.id, occurredOn: '2026-01-05', status: 'active', createdAt: '2026-01-05T08:00:00.000Z' })
    await database.ledgerEvents.add({ id: 'legacy-reward', kind: 'reward', sourceId: 'legacy-completion', occurredOn: '2026-01-05', title: '历史任务', attribute: '智识', xpDelta: 15, coinDelta: 7, createdAt: '2026-01-05T08:00:00.000Z' })
    const season = await createSeason({ title: '迁移赛季', successCriterion: '完成迁移', baseline: '旧体系', targetOutcome: '新体系', focusActivityIds: [oldHabit.id] }, '2026-01-05', database)
    const meta = await database.settings.get('meta')
    if (meta?.key !== 'meta') throw new Error('测试缺少 meta')
    await database.settings.put({ ...meta, value: { ...meta.value, levelSystem: { ...meta.value.levelSystem!, focusAttribute: '专注' } } })

    const now = new Date('2026-01-06T12:00:00.000Z')
    expect((await getGrowthDomainMigrationCandidates(database, now)).map((item) => item.id).sort()).toEqual([currentTask.id, oldHabit.id].sort())
    await expect(activateGrowthDomains({ [oldHabit.id]: 'career' }, database, now)).rejects.toThrow('逐项确认')
    expect(await database.activities.get(oldHabit.id)).toMatchObject({ attribute: '专注' })

    const before = calculateStats(await database.ledgerEvents.toArray())
    await activateGrowthDomains({ [oldHabit.id]: 'career', [currentTask.id]: 'health' }, database, now)
    expect(await database.activities.get(oldHabit.id)).toMatchObject({ domain: 'career' })
    expect((await database.activities.get(oldHabit.id))?.attribute).toBeUndefined()
    expect(await database.activities.get(settledTask.id)).toMatchObject({ attribute: '智识' })
    expect((await database.seasons.get(season.id))?.focusActivities[0]).toMatchObject({ domain: 'career' })
    expect((await database.seasons.get(season.id))?.focusActivities[0].attribute).toBeUndefined()
    const migratedMeta = await database.settings.get('meta')
    expect(migratedMeta?.key === 'meta' ? migratedMeta.value : undefined).toMatchObject({ growthDomainSystem: { version: 1 } })
    expect(migratedMeta?.key === 'meta' ? migratedMeta.value.levelSystem?.focusAttribute : undefined).toBeUndefined()
    expect(calculateStats(await database.ledgerEvents.toArray())).toEqual(before)
    expect(calculateStats(await database.ledgerEvents.toArray()).domainXp).toEqual(Object.fromEntries(growthDomains.map((domain) => [domain, 0])))
  })

})
