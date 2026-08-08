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


describe('IndexedDB 累计与编辑事务', () => {
  it('组合三层目标仍只按难度和层次发奖', async () => {
    const activity = await createActivity({
      ...dailyHabit,
      difficulty: '困难',
      goal: {
        kind: 'tiered', metric: 'combined', mode: 'per_occurrence', countUnit: '次', inputUnit: '秒',
        thresholds: [
          { count: 3, durationSeconds: 30 },
          { count: 5, durationSeconds: 30 },
          { count: 5, durationSeconds: 45 },
        ],
      },
    }, database)
    const base = await completeActivity(activity.id, '2026-01-05', { tier: 1 }, database)
    expect(base.awarded).toBe(true)
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 12, coins: 10 })
    await completeActivity(activity.id, '2026-01-05', { tier: 3 }, database)
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 20, coins: 10 })
    expect(await database.completions.toCollection().first()).toMatchObject({ tier: 3, tierGoalSnapshot: activity.goal })
  })

  it('每周纯次数逐次记录并只在跨层时发奖', async () => {
    const activity = await createActivity({
      ...dailyHabit,
      schedule: { kind: 'weekly', times: 3 },
      goal: { kind: 'tiered', metric: 'count', unit: '次', thresholds: [1, 3, 5], progressMode: 'incremental' },
    }, database)
    const first = await recordIncrementalProgress(activity.id, undefined, 'request-1', '2026-01-05', database)
    const second = await recordIncrementalProgress(activity.id, undefined, 'request-2', '2026-01-05', database)
    const third = await recordIncrementalProgress(activity.id, undefined, 'request-3', '2026-01-05', database)
    expect(first).toMatchObject({ recorded: true, awarded: true, progress: { totalCount: 1, highestTier: 1 } })
    expect(second).toMatchObject({ recorded: true, awarded: false, progress: { totalCount: 2, highestTier: 1 } })
    expect(third).toMatchObject({ recorded: true, awarded: true, upgraded: true, progress: { totalCount: 3, highestTier: 2 } })
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 8, coins: 5 })

    const duplicate = await recordIncrementalProgress(activity.id, undefined, 'request-3', '2026-01-05', database)
    expect(duplicate.recorded).toBe(false)
    expect(await database.completions.count()).toBe(3)
    const journey = getJourneyMonths(await database.completions.toArray(), await database.ledgerEvents.toArray())
    expect(journey[0]).toMatchObject({ actionCount: 1, xp: 8, coins: 5 })
    expect(journey[0].days[0].entries[0]).toMatchObject({ count: 3, progressLabel: '完成 3 次 · 本周累计 3/3次' })
  })

  it('每次固定时长按各层门槛分别统计合格次数', async () => {
    const activity = await createActivity({
      ...dailyHabit,
      schedule: { kind: 'weekly', times: 3 },
      goal: {
        kind: 'tiered', metric: 'combined', mode: 'per_occurrence', countUnit: '次', inputUnit: '分钟', progressMode: 'incremental',
        defaultDurationSeconds: 1200, durationOptionsSeconds: [1200, 600, 1800],
        thresholds: [
          { count: 1, durationSeconds: 600 },
          { count: 3, durationSeconds: 1200 },
          { count: 5, durationSeconds: 1800 },
        ],
      },
    }, database)
    await recordIncrementalProgress(activity.id, 600, 'fixed-1', '2026-01-05', database)
    await recordIncrementalProgress(activity.id, 1200, 'fixed-2', '2026-01-05', database)
    const third = await recordIncrementalProgress(activity.id, 1200, 'fixed-3', '2026-01-06', database)
    const fourth = await recordIncrementalProgress(activity.id, 1200, 'fixed-4', '2026-01-06', database)
    expect(third.awarded).toBe(false)
    expect(fourth).toMatchObject({ awarded: true, progress: { totalCount: 4, highestTier: 2, qualifiedCounts: { 1: 4, 2: 3, 3: 0 } } })
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 8, coins: 5 })
  })

  it('累计总量同时满足次数和总时长后才跨层', async () => {
    const activity = await createActivity({
      ...dailyHabit,
      schedule: { kind: 'weekly', times: 3 },
      goal: {
        kind: 'tiered', metric: 'combined', mode: 'total', countUnit: '次', inputUnit: '分钟', progressMode: 'incremental',
        defaultDurationSeconds: 1800, durationOptionsSeconds: [1800, 600, 3600],
        thresholds: [
          { count: 1, durationSeconds: 1800 },
          { count: 3, durationSeconds: 7200 },
          { count: 5, durationSeconds: 10_800 },
        ],
      },
    }, database)
    expect((await recordIncrementalProgress(activity.id, 600, 'total-1', '2026-01-05', database)).awarded).toBe(false)
    expect((await recordIncrementalProgress(activity.id, 1800, 'total-2', '2026-01-05', database))).toMatchObject({ awarded: true, progress: { highestTier: 1, totalDurationSeconds: 2400 } })
    expect((await recordIncrementalProgress(activity.id, 3600, 'total-3', '2026-01-06', database)).awarded).toBe(false)
    expect((await recordIncrementalProgress(activity.id, 1800, 'total-4', '2026-01-06', database))).toMatchObject({ awarded: true, progress: { highestTier: 2, totalDurationSeconds: 7800 } })
  })

  it('撤销最近一次会回退进度和跨层奖励，随后可以重做', async () => {
    const activity = await createActivity({
      ...dailyHabit,
      schedule: { kind: 'weekly', times: 3 },
      goal: { kind: 'tiered', metric: 'count', unit: '次', thresholds: [1, 3, 5], progressMode: 'incremental' },
    }, database)
    await recordIncrementalProgress(activity.id, undefined, 'undo-1', '2026-01-05', database)
    await recordIncrementalProgress(activity.id, undefined, 'undo-2', '2026-01-05', database)
    await recordIncrementalProgress(activity.id, undefined, 'undo-3', '2026-01-05', database)
    expect(await undoLatestIncrementalProgress(activity.id, '2026-01-05', database)).toBe(true)
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 6, coins: 5 })
    const active = await database.completions.where('status').equals('active').toArray()
    expect(active.reduce((total, completion) => total + (completion.progress?.countDelta ?? 0), 0)).toBe(2)
    await recordIncrementalProgress(activity.id, undefined, 'undo-4', '2026-01-05', database)
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 8, coins: 5 })
  })

  it('启用逐次累计会把本周唯一旧层次折算为导入进度', async () => {
    const activity = await createActivity({
        ...dailyHabit,
        schedule: { kind: 'weekly', times: 5 },
        goal: { kind: 'tiered', metric: 'count', unit: '次', thresholds: [1, 3, 5] },
      }, database)
    const old = await completeActivity(activity.id, '2026-01-05', { tier: 1 }, database)
    if (!old.awarded) throw new Error('测试前置完成失败')
    const ledgerBefore = await database.ledgerEvents.toArray()
    const updated = await updateHabit(activity.id, {
      title: activity.title, cue: activity.cue, protocol: activity.protocol, domain: activity.domain,
      difficulty: activity.difficulty, schedule: { kind: 'weekly', times: 3 },
      goal: { kind: 'tiered', metric: 'count', unit: '次', thresholds: [1, 3, 5], progressMode: 'incremental' },
      isKey: activity.isKey,
    }, database, '2026-01-07')
    expect(await database.completions.get(old.completion.id)).toMatchObject({ progress: { countDelta: 1, imported: true, cycleStart: '2026-01-05' } })
    expect(await database.ledgerEvents.toArray()).toEqual(ledgerBefore)
    expect(updated.schedule).toEqual({ kind: 'weekly', times: 3 })
  })

  it('周一 04:00 后的游戏日会开始新的累计周期', async () => {
    const activity = await createActivity({
      ...dailyHabit,
      schedule: { kind: 'weekly', times: 3 },
      goal: { kind: 'tiered', metric: 'count', unit: '次', thresholds: [1, 3, 5], progressMode: 'incremental' },
    }, database)
    await recordIncrementalProgress(activity.id, undefined, 'week-1', '2026-01-11', database)
    const next = await recordIncrementalProgress(activity.id, undefined, 'week-2', '2026-01-12', database)
    expect(next.progress).toMatchObject({ totalCount: 1, highestTier: 1 })
    expect((await database.completions.toArray()).map((item) => item.progress?.cycleStart)).toEqual(['2026-01-05', '2026-01-12'])
  })

  it('一次记录跨过多个层次时只发最高层净奖励并在最高层封顶', async () => {
    const activity = await createActivity({
      ...dailyHabit,
      schedule: { kind: 'weekly', times: 1 },
      goal: {
        kind: 'tiered', metric: 'combined', mode: 'total', countUnit: '次', inputUnit: '分钟', progressMode: 'incremental',
        defaultDurationSeconds: 1800, durationOptionsSeconds: [1800],
        thresholds: [
          { count: 1, durationSeconds: 600 },
          { count: 1, durationSeconds: 1200 },
          { count: 1, durationSeconds: 1800 },
        ],
      },
    }, database)
    const result = await recordIncrementalProgress(activity.id, 1800, 'multi-tier', '2026-01-05', database)
    expect(result).toMatchObject({ awarded: true, progress: { highestTier: 3, maxReached: true }, event: { xpDelta: 10, coinDelta: 5 } })
    await expect(recordIncrementalProgress(activity.id, 1800, 'after-max', '2026-01-05', database)).rejects.toThrow('本周已完成')
    expect(await database.ledgerEvents.count()).toBe(1)
  })

  it('本周首次记录后冻结目标和难度，编辑只在下周生效', async () => {
    const activity = await createActivity({
      ...dailyHabit,
      schedule: { kind: 'weekly', times: 3 },
      goal: { kind: 'tiered', metric: 'count', unit: '次', thresholds: [1, 3, 5], progressMode: 'incremental' },
    }, database)
    await recordIncrementalProgress(activity.id, undefined, 'frozen-1', '2026-01-05', database)
    await updateHabit(activity.id, {
      title: '新版本习惯', cue: undefined, protocol: undefined, domain: 'health', difficulty: 'Boss',
      schedule: { kind: 'weekly', times: 2 },
      goal: { kind: 'tiered', metric: 'count', unit: '次', thresholds: [1, 2, 3], progressMode: 'incremental' },
      isKey: false,
    }, database, '2026-01-05')
    expect((await recordIncrementalProgress(activity.id, undefined, 'frozen-2', '2026-01-06', database)).awarded).toBe(false)
    expect((await recordIncrementalProgress(activity.id, undefined, 'frozen-3', '2026-01-07', database))).toMatchObject({ event: { xpDelta: 2, coinDelta: 0 } })
    expect((await recordIncrementalProgress(activity.id, undefined, 'next-week', '2026-01-12', database))).toMatchObject({ event: { xpDelta: 30, coinDelta: 25 }, progress: { totalCount: 1 } })
  })

  it('撤销三层完成会抵消首次和全部升级奖励', async () => {
    const activity = await createActivity(tieredHabit, database)
    const first = await completeActivity(activity.id, '2026-01-05', { tier: 1 }, database)
    if (!first.awarded) throw new Error('测试前置完成失败')
    await completeActivity(activity.id, '2026-01-05', { tier: 2 }, database)
    await completeActivity(activity.id, '2026-01-05', { tier: 3 }, database)
    expect(await undoCompletion(first.completion.id, database)).toBe(true)
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 0, coins: 0 })
    const redone = await completeActivity(activity.id, '2026-01-05', { tier: 3 }, database)
    expect(redone.awarded).toBe(true)
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 10, coins: 5 })
  })

  it('旧时长习惯只在手动设置后转换为三层目标', async () => {
    const activity = await createActivity({ ...dailyHabit, goal: { kind: 'duration', count: 30, unit: '分钟' } }, database)
    expect(activity.goal).toMatchObject({ kind: 'duration', count: 30 })
    await updateActivityGoal(activity.id, { kind: 'tiered', metric: 'duration', unit: '分钟', thresholds: [10, 30, 60] }, database)
    expect((await database.activities.get(activity.id))?.goal).toMatchObject({ kind: 'tiered', thresholds: [10, 30, 60] })
  })

  it('完整编辑习惯只影响下一次完成，旧完成仍按快照升级', async () => {
    const activity = await createActivity(tieredHabit, database)
    const first = await completeActivity(activity.id, '2026-01-05', { tier: 1 }, database)
    if (!first.awarded) throw new Error('测试前置完成失败')
    const originalLedger = await database.ledgerEvents.toArray()
    const {
      activityRevision: _activityRevision,
      titleSnapshot: _titleSnapshot,
      attributeSnapshot: _attributeSnapshot,
      domainSnapshot: _domainSnapshot,
      difficultySnapshot: _difficultySnapshot,
      tierGoalSnapshot: _tierGoalSnapshot,
      ...legacyCompletion
    } = first.completion
    await database.completions.put({
      ...legacyCompletion,
      tierMetric: 'duration',
      tierUnit: '分钟',
      tierThresholds: [5, 20, 45],
      achievedValue: 5,
    })

    const updated = await updateHabit(activity.id, {
      title: '修改后的习惯',
      domain: 'health',
      difficulty: 'Boss',
      schedule: { kind: 'weekly', times: 2 },
      goal: { count: 1, unit: '次' },
      isKey: false,
    }, database)
    expect(updated.revision).toBe(2)
    expect(await database.ledgerEvents.toArray()).toEqual(originalLedger)
    expect(await database.completions.get(first.completion.id)).toMatchObject({
      activityRevision: 1,
      titleSnapshot: '示例习惯',
      domainSnapshot: 'career',
      difficultySnapshot: '普通',
    })

    const upgraded = await completeActivity(activity.id, '2026-01-05', { tier: 2 }, database)
    expect(upgraded).toMatchObject({ awarded: true, upgraded: true })
    expect((await database.ledgerEvents.get(`reward:${first.completion.id}:tier:2`))).toMatchObject({
      title: '层次升级：示例习惯（标准）',
      domain: 'career',
      xpDelta: 2,
    })
    await expect(completeActivity(activity.id, '2026-01-06', undefined, database)).rejects.toThrow('必须填写实际成果')
  })

  it('每周奖励额度在编辑后按新版本重新计算', async () => {
    const activity = await createActivity({ ...dailyHabit, schedule: { kind: 'weekly', times: 1 } }, database)
    await completeActivity(activity.id, '2026-01-05', undefined, database)
    await updateHabit(activity.id, {
      title: activity.title,
      domain: activity.domain,
      difficulty: activity.difficulty,
      schedule: { kind: 'weekly', times: 1 },
      goal: activity.goal,
      isKey: activity.isKey,
    }, database)
    expect((await completeActivity(activity.id, '2026-01-06', undefined, database)).awarded).toBe(true)
  })

})
