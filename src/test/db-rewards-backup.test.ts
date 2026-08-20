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
  updateRewardBudget,
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


describe('IndexedDB 奖励与备份事务', () => {
  it('余额不足拒绝兑换，余额足够时追加负金币流水', async () => {
    const reward = await createReward({ title: '一次真实体验', cost: 30, target: true, ...configuredReward }, database)
    await expect(redeemReward(reward.id, database)).rejects.toThrow('金币余额不足')
    const activity = await createActivity({ ...dailyHabit, difficulty: 'Boss' }, database)
    await completeActivity(activity.id, '2026-01-05', '完成了可验证成果', database)
    await completeActivity(activity.id, '2026-01-06', '完成了第二次成果', database)
    await redeemReward(reward.id, database)
    expect(calculateStats(await database.ledgerEvents.toArray()).coins).toBe(20)
  })

  it('奖励商品支持新增、目标唯一、编辑、停用和恢复，历史兑换不重写', async () => {
    const reward = await createReward({ title: '短暂休息', cost: 30, target: true, ...configuredReward }, database)
    expect(await database.settings.get('rewardSystem')).toMatchObject({ value: { activeRewardId: reward.id } })

    const second = await createReward({ title: '一次体验', cost: 80, target: true, ...configuredReward }, database)
    expect(await database.settings.get('rewardSystem')).toMatchObject({ value: { activeRewardId: second.id } })
    await setTargetReward(reward.id, database)

    const activity = await createActivity({ ...dailyHabit, difficulty: 'Boss' }, database)
    await completeActivity(activity.id, '2026-01-05', '成果一', database)
    await completeActivity(activity.id, '2026-01-06', '成果二', database)
    const redemption = await redeemReward(reward.id, database)
    if (!redemption) throw new Error('测试锁定奖励失败')
    expect(redemption).toMatchObject({ title: '锁定奖励：短暂休息', coinDelta: -30 })

    await updateReward(reward.id, { title: '更名后的休息', cost: 80, target: true, ...configuredReward }, database)
    expect(await database.ledgerEvents.get(redemption.id)).toMatchObject({ title: '锁定奖励：短暂休息', coinDelta: -30 })
    expect(await database.rewards.get(reward.id)).toMatchObject({ title: '更名后的休息', cost: 80 })

    await setRewardEnabled(reward.id, false, database)
    expect(await database.settings.get('rewardSystem')).not.toMatchObject({ value: { activeRewardId: reward.id } })
    await expect(setTargetReward(reward.id, database)).rejects.toThrow('候选队列只能包含')
    await setRewardEnabled(reward.id, true, database)
    expect(await database.rewards.get(reward.id)).toMatchObject({ enabled: true })
  })

  it('奖励锁定与取消幂等，并原子扣还金币和奖励基金', async () => {
    const activity = await createActivity({ ...dailyHabit, difficulty: 'Boss' }, database)
    await completeActivity(activity.id, '2026-01-05', '完成真实成果', database)
    await completeActivity(activity.id, '2026-01-06', '完成第二份成果', database)
    const reward = await createReward({
      title: '去看一场展览',
      cost: 30,
      target: true,
      ...configuredReward,
      cashCostCents: 10_000,
    }, database)
    await setRewardQueue(reward.id, [], database)
    const input = { plannedFor: '2026-07-25', requestId: 'same-request' }
    const first = await reserveRewardClaim(reward.id, input, database, new Date('2026-07-23T08:00:00.000Z'))
    const second = await reserveRewardClaim(reward.id, input, database, new Date('2026-07-23T08:00:01.000Z'))
    expect(second.claim.id).toBe(first.claim.id)
    expect(await database.rewardClaims.count()).toBe(1)
    expect(await database.ledgerEvents.where('kind').equals('redemption').count()).toBe(1)
    expect(calculateStats(await database.ledgerEvents.toArray()).coins).toBe(20)
    expect(await database.settings.get('rewardSystem')).toMatchObject({ value: { availableCents: 30_000 } })

    await cancelRewardClaim(first.claim.id, database, new Date('2026-07-24T08:00:00.000Z'))
    await cancelRewardClaim(first.claim.id, database, new Date('2026-07-24T08:00:01.000Z'))
    expect(await database.ledgerEvents.where('kind').equals('redemption_refund').count()).toBe(1)
    expect(calculateStats(await database.ledgerEvents.toArray()).coins).toBe(50)
    expect(await database.settings.get('rewardSystem')).toMatchObject({ value: { availableCents: 40_000 } })
  })

  it('奖励基金按游戏月补充且累计不超过 1200 元', async () => {
    const stored = await database.settings.get('rewardSystem')
    if (stored?.key !== 'rewardSystem') throw new Error('奖励系统未初始化')
    await database.settings.put({ ...stored, value: { ...stored.value, lastFundedMonth: '2026-01', availableCents: 100_000 } })
    const rolled = await applyRewardBudgetRollover(database, new Date('2026-04-10T08:00:00.000Z'))
    expect(rolled).toMatchObject({ lastFundedMonth: '2026-04', availableCents: 120_000 })
    expect(await applyRewardBudgetRollover(database, new Date('2026-04-20T08:00:00.000Z'))).toEqual(rolled)
  })

  it('自定义奖励基金先按旧额度结转至本月，新额度从下月生效', async () => {
    const stored = await database.settings.get('rewardSystem')
    if (stored?.key !== 'rewardSystem') throw new Error('奖励系统未初始化')
    await database.settings.put({
      ...stored,
      value: { ...stored.value, lastFundedMonth: '2026-01', availableCents: 35_000, maxFundCents: 300_000 },
    })

    const updated = await updateRewardBudget(
      { monthlyAllowanceCents: 50_000, maxFundCents: 300_000 },
      database,
      new Date('2026-04-10T08:00:00.000Z'),
    )
    expect(updated).toMatchObject({
      monthlyAllowanceCents: 50_000,
      maxFundCents: 300_000,
      availableCents: 155_000,
      lastFundedMonth: '2026-04',
    })
    expect(await updateRewardBudget(
      { monthlyAllowanceCents: 50_000, maxFundCents: 300_000 },
      database,
      new Date('2026-04-10T08:00:00.000Z'),
    )).toEqual(updated)
    expect(await applyRewardBudgetRollover(database, new Date('2026-04-20T08:00:00.000Z'))).toEqual(updated)
    expect(await updateRewardBudget(
      { monthlyAllowanceCents: 50_000, maxFundCents: 300_000 },
      database,
      new Date('2026-05-10T08:00:00.000Z'),
    )).toMatchObject({
      availableCents: 205_000,
      lastFundedMonth: '2026-05',
    })
    const backup = await createBackup(database)
    await updateRewardBudget({ monthlyAllowanceCents: 60_000, maxFundCents: 300_000 }, database)
    await restoreBackup(backup, database)
    expect(await database.settings.get('rewardSystem')).toMatchObject({
      value: { monthlyAllowanceCents: 50_000, maxFundCents: 300_000, availableCents: 205_000 },
    })
  })

  it('自定义奖励基金拒绝越界金额及低于已承诺基金的上限', async () => {
    await expect(updateRewardBudget(
      { monthlyAllowanceCents: 99, maxFundCents: 120_000 },
      database,
    )).rejects.toThrow()
    await expect(updateRewardBudget(
      { monthlyAllowanceCents: 40_000, maxFundCents: 3_000_001 },
      database,
    )).rejects.toThrow()

    await database.rewardClaims.add({
      id: 'reward-claim:budget-limit',
      rewardId: 'reward-budget-limit',
      source: 'coins',
      status: 'reserved',
      plannedFor: '2026-07-25',
      reservedOn: '2026-07-23',
      reservedAt: '2026-07-23T08:00:00.000Z',
      titleSnapshot: '虚构奖励',
      coinCostSnapshot: 0,
      cashCostCentsSnapshot: 10_000,
      horizonSnapshot: 'near',
      repeatPolicySnapshot: { kind: 'one_time' },
    })
    await expect(updateRewardBudget(
      { monthlyAllowanceCents: 30_000, maxFundCents: 49_999 },
      database,
    )).rejects.toThrow('当前可用与已预留金额之和')
    expect(await database.settings.get('rewardSystem')).toMatchObject({
      value: { monthlyAllowanceCents: 40_000, maxFundCents: 120_000, availableCents: 40_000 },
    })
  })

  it('存在已预留奖励券时按旧额度跨月结转后再保存新额度', async () => {
    const stored = await database.settings.get('rewardSystem')
    if (stored?.key !== 'rewardSystem') throw new Error('奖励系统未初始化')
    await database.settings.put({
      ...stored,
      value: { ...stored.value, lastFundedMonth: '2026-01', availableCents: 20_000, maxFundCents: 120_000 },
    })
    await database.rewardClaims.add({
      id: 'reward-claim:budget-rollover',
      rewardId: 'reward-budget-rollover',
      source: 'coins',
      status: 'reserved',
      plannedFor: '2026-04-20',
      reservedOn: '2026-04-01',
      reservedAt: '2026-04-01T08:00:00.000Z',
      titleSnapshot: '虚构跨月奖励',
      coinCostSnapshot: 0,
      cashCostCentsSnapshot: 10_000,
      horizonSnapshot: 'near',
      repeatPolicySnapshot: { kind: 'one_time' },
    })

    expect(await updateRewardBudget(
      { monthlyAllowanceCents: 50_000, maxFundCents: 150_000 },
      database,
      new Date('2026-04-10T08:00:00.000Z'),
    )).toMatchObject({
      monthlyAllowanceCents: 50_000,
      maxFundCents: 150_000,
      availableCents: 110_000,
      lastFundedMonth: '2026-04',
    })
  })

  it('旧 schema 5 偏好缺少反馈强度时恢复为清晰档', async () => {
    const backup = await createBackup(database)
    const input = structuredClone(backup) as unknown as { settings: Array<{ key: string; value: Record<string, unknown> }> }
    const preferences = input.settings.find((setting) => setting.key === 'preferences')
    if (!preferences) throw new Error('测试备份缺少偏好')
    delete preferences.value.feedbackIntensity
    await restoreBackup(input, database)
    expect(await database.settings.get('preferences')).toMatchObject({ value: { feedbackIntensity: 'clear' } })
  })

  it('撤销窗口结束后只生成一次历史新等级里程碑', async () => {
    const activity = await createActivity({ ...dailyHabit, difficulty: 'Boss' }, database)
    await completeActivity(activity.id, '2026-01-05', '成果一', database)
    await completeActivity(activity.id, '2026-01-06', '成果二', database)
    const created = await syncLevelMilestones(database, new Date(Date.now() + 11_000))
    expect(created).toMatchObject([{ level: 2 }])
    expect(await syncLevelMilestones(database, new Date(Date.now() + 12_000))).toEqual([])
    await acknowledgeLevelMilestone(2, 'health', database)
    const meta = await database.settings.get('meta')
    expect(meta?.key === 'meta' ? meta.value.levelSystem : undefined).toMatchObject({
      baselineLevel: 1,
      highestLevelReached: 2,
      focusDomain: 'health',
      milestones: [{ level: 2, focusDomain: 'health' }],
    })
  })

  it('撤销后净经验不足不会固化升级里程碑', async () => {
    const activity = await createActivity({ ...dailyHabit, difficulty: 'Boss' }, database)
    await completeActivity(activity.id, '2026-01-05', '成果一', database)
    const second = await completeActivity(activity.id, '2026-01-06', '成果二', database)
    if (!second.awarded) throw new Error('测试前置完成失败')
    await undoCompletion(second.completion.id, database)
    expect(await syncLevelMilestones(database, new Date(Date.now() + 11_000))).toEqual([])
  })

  it('阶段礼券领取不扣金币且不能重复领取', async () => {
    const activity = await createActivity({ ...dailyHabit, difficulty: 'Boss' }, database)
    for (let index = 0; index < 6; index += 1) {
      await completeActivity(activity.id, `2026-01-${String(index + 5).padStart(2, '0')}`, `成果${index}`, database)
    }
    const created = await syncLevelMilestones(database, new Date(Date.now() + 11_000))
    expect(created).toMatchObject([{ level: 2 }, { level: 3, voucherMaxCost: 30 }])
    const reward = await createReward({ title: '阶段体验', cost: 30, target: false, ...configuredReward }, database)
    const coins = calculateStats(await database.ledgerEvents.toArray()).coins
    const reserved = await claimMilestoneReward(3, reward.id, database)
    expect(calculateStats(await database.ledgerEvents.toArray()).coins).toBe(coins)
    await fulfillRewardClaim(reserved.claim.id, 5, true, database)
    expect(await database.ledgerEvents.get('milestone:level:3')).toMatchObject({
      kind: 'milestone',
      coinDelta: 0,
      xpDelta: 0,
      title: `阶段礼券：${reward.title}`,
    })
    await expect(claimMilestoneReward(3, reward.id, database)).rejects.toThrow('已经领取')
  })

  it('损坏备份在整体替换前被拒绝并保留原数据', async () => {
    const activity = await createActivity(dailyHabit, database)
    await completeActivity(activity.id, '2026-01-05', undefined, database)
    const before = await getSnapshot(database)
    const backup = await createBackup(database)
    const damaged = { ...backup, summary: { ...backup.summary, coins: 999 } }
    await expect(restoreBackup(damaged, database)).rejects.toThrow('备份汇总与账本不一致')
    expect(await getSnapshot(database)).toEqual(before)
  })

  it('恢复预览只计算差异，关闭或校验失败都不会写入数据库', async () => {
    const activity = await createActivity(dailyHabit, database)
    await completeActivity(activity.id, '2026-01-05', undefined, database)
    const before = await getSnapshot(database)

    const source = new LifeRpgDatabase(`restore-preview-source-${crypto.randomUUID()}`)
    try {
      await initializeDatabase(source)
      const incoming = await createBackup(source)
      const preview = previewBackupRestore(incoming, before)
      expect(preview.metrics.find((metric) => metric.key === 'activities')).toMatchObject({ current: 1, incoming: 0 })
      expect(preview.metrics.find((metric) => metric.key === 'completions')).toMatchObject({ current: 1, incoming: 0 })
      expect(await getSnapshot(database)).toEqual(before)
      expect(() => previewBackupRestore({ ...incoming, summary: { totalXp: 999, coins: 999 } }, before)).toThrow()
      expect(await getSnapshot(database)).toEqual(before)
    } finally {
      source.close()
      await source.delete()
    }
  })

  it('可以恢复 V2.0.0 的 schema 1 备份', async () => {
    await createActivity(dailyHabit, database)
    const current = await createBackup(database)
    await restoreBackup({ ...current, schemaVersion: 1, appVersion: '2.0.0' }, database)
    expect(await database.activities.count()).toBe(1)
  })

  it('可以恢复 V2.1.0 的 schema 2 备份', async () => {
    await createActivity(dailyHabit, database)
    const current = await createBackup(database)
    await restoreBackup({ ...current, schemaVersion: 2, appVersion: '2.1.0' }, database)
    expect(await database.activities.count()).toBe(1)
  })

  it('可以恢复 V2.2.0 的 schema 3 备份', async () => {
    await createActivity(dailyHabit, database)
    const current = await createBackup(database)
    await restoreBackup({ ...current, schemaVersion: 3, appVersion: '2.2.0' }, database)
    expect(await database.activities.count()).toBe(1)
  })

  it('可以恢复 V2.3.0 的 schema 4 备份', async () => {
    await createActivity(dailyHabit, database)
    const current = await createBackup(database)
    const legacySettings = current.settings.map((setting) => setting.key === 'meta'
      ? { ...setting, value: { lastBackupAt: setting.value.lastBackupAt, migrationImportedAt: setting.value.migrationImportedAt } }
      : setting)
    await restoreBackup({ ...current, schemaVersion: 4, appVersion: '2.3.0', settings: legacySettings }, database)
    expect(await database.activities.count()).toBe(1)
    const meta = await database.settings.get('meta')
    expect(meta?.key === 'meta' ? meta.value.levelSystem?.baselineLevel : undefined).toBe(1)
  })

  it('schema 12 备份保存评分数据并兼容 schema 1 至 schema 11', async () => {
    const activity = await createActivity(dailyHabit, database)
    const priorityActivity = await createActivity({ ...dailyHabit, title: '今日优先行动', isKey: false }, database)
    const timedActivity = await createActivity({ ...dailyHabit, title: '定时行动', scheduledTime: '21:30', isKey: false }, database)
    await setTodayActionPriority(priorityActivity.id, true, '2026-01-05', database)
    const season = await createSeason({
      title: '备份赛季', successCriterion: '验证完整恢复', baseline: '开始状态', targetOutcome: '目标状态', focusActivityIds: [activity.id],
    }, '2026-01-05', database)
    const draft = { ...createCoachPlanDraft(new Date('2026-01-05T00:00:00.000Z'), 'backup-plan'), title: '下一赛季' }
    await saveCoachPlanDraft(draft, database)
    const current = await createBackup(database)
    expect(current).toMatchObject({ schemaVersion: 12, appVersion: '5.8.0', rewardClaims: [], seasons: [{ id: season.id }] })
    expect(current.activities.find((item) => item.id === timedActivity.id)?.scheduledTime).toBe('21:30')
    expect(current.settings.find((setting) => setting.key === 'meta')).toMatchObject({ value: { todayActionPriority: { gameDate: '2026-01-05', activityIds: [priorityActivity.id] } } })
    expect(current.settings.find((setting) => setting.key === 'coachPlanDraft')).toMatchObject({ key: 'coachPlanDraft', value: { id: 'backup-plan' } })
    await restoreBackup({ ...current, schemaVersion: 9, appVersion: '4.3.0' }, database)
    await restoreBackup({ ...current, schemaVersion: 10, appVersion: '4.4.0' }, database)
    await restoreBackup({ ...current, schemaVersion: 9, appVersion: '4.2.0' }, database)
    await restoreBackup({ ...current, schemaVersion: 8, appVersion: '4.1.0' }, database)
    await restoreBackup({ ...current, schemaVersion: 7, appVersion: '4.0.1' }, database)
    await restoreBackup({ ...current, schemaVersion: 7, appVersion: '4.0.0' }, database)
    await expect(restoreBackup({ ...current, seasons: [...current.seasons, { ...season, id: 'duplicate-active-season' }] }, database)).rejects.toThrow('只能存在一个')
    await restoreBackup({ ...current, schemaVersion: 6, appVersion: '3.2.0' }, database)
    const { seasons: _seasons, ...legacy } = current
    await restoreBackup({ ...legacy, schemaVersion: 5, appVersion: '2.6.0' }, database)
    await restoreBackup({ ...current, schemaVersion: 11, appVersion: '5.0.0' }, database)
    await restoreBackup({ ...current, schemaVersion: 11, appVersion: '5.0.1' }, database)
    await restoreBackup(current, database)
    const meta = await database.settings.get('meta')
    expect(meta?.key === 'meta' ? meta.value.levelSystem?.highestLevelReached : undefined).toBe(1)
    expect(await getTodayActionPriority('2026-01-05', database)).toEqual([priorityActivity.id])
  })
})
