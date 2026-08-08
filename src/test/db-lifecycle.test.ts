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


describe('IndexedDB 活动与赛季事务', () => {
  it('归档保留历史并可恢复，已归档习惯不能继续完成', async () => {
    const activity = await createActivity(dailyHabit, database)
    await completeActivity(activity.id, '2026-01-05', undefined, database)
    expect(await archiveActivity(activity.id, database)).toBe(true)
    expect(await database.activities.get(activity.id)).toMatchObject({ enabled: false, isKey: false })
    expect((await database.activities.get(activity.id))?.archivedAt).toBeTruthy()
    expect(await database.completions.count()).toBe(1)
    expect(await database.ledgerEvents.count()).toBe(1)
    await expect(completeActivity(activity.id, '2026-01-06', undefined, database)).rejects.toThrow('不存在或已暂停')
    expect(await restoreActivity(activity.id, database)).toBe(true)
    expect(await database.activities.get(activity.id)).toMatchObject({ enabled: true, isKey: false })
    expect((await database.activities.get(activity.id))?.archivedAt).toBeUndefined()
  })

  it('未完成的一次性任务可以归档和恢复', async () => {
    const task = await createActivity({
      ...dailyHabit,
      type: 'task',
      schedule: { kind: 'once' },
      plannedOn: '2026-01-05',
    }, database)
    expect(await archiveActivity(task.id, database)).toBe(true)
    expect(await database.activities.get(task.id)).toMatchObject({ enabled: false, isKey: false })
    expect(await restoreActivity(task.id, database)).toBe(true)
    expect(await database.activities.get(task.id)).toMatchObject({ enabled: true, isKey: false })
  })

  it('永久删除只移除活动定义并补齐历史快照', async () => {
    const activity = await createActivity(dailyHabit, database)
    const completed = await completeActivity(activity.id, '2026-01-05', undefined, database)
    if (!completed.awarded) throw new Error('测试前置完成失败')
    const {
      activityRevision: _activityRevision,
      titleSnapshot: _titleSnapshot,
      attributeSnapshot: _attributeSnapshot,
      domainSnapshot: _domainSnapshot,
      difficultySnapshot: _difficultySnapshot,
      ...legacyCompletion
    } = completed.completion
    await database.completions.put(legacyCompletion)
    await database.weeklyReviews.put({
      id: 'review-legacy',
      weekStart: '2026-01-05',
      createdAt: new Date().toISOString(),
      items: [{
        activityId: activity.id,
        adherence: 1,
        completed: 1,
        planned: 1,
        impact: 4,
        friction: 2,
        decision: '保留',
      }],
    })
    const ledgerBefore = await database.ledgerEvents.toArray()
    const statsBefore = calculateStats(ledgerBefore)

    await archiveActivity(activity.id, database)
    expect(await permanentlyDeleteActivity(activity.id, '2026-01-06', database)).toBe(true)
    expect(await database.activities.get(activity.id)).toBeUndefined()
    expect(await database.completions.get(completed.completion.id)).toMatchObject({
      titleSnapshot: activity.title,
      domainSnapshot: activity.domain,
      difficultySnapshot: activity.difficulty,
      activityRevision: 1,
    })
    expect((await database.weeklyReviews.get('review-legacy'))?.items[0]).toMatchObject({
      titleSnapshot: activity.title,
      domainSnapshot: activity.domain,
    })
    expect(await database.ledgerEvents.toArray()).toEqual(ledgerBefore)
    expect(calculateStats(await database.ledgerEvents.toArray())).toEqual(statsBefore)
    expect(await permanentlyDeleteActivity(activity.id, '2026-01-06', database)).toBe(false)
  })

  it('本游戏日完成会阻止永久删除，次日完成任务可直接删除', async () => {
    const habit = await createActivity(dailyHabit, database)
    await completeActivity(habit.id, '2026-01-05', undefined, database)
    await archiveActivity(habit.id, database)
    await expect(permanentlyDeleteActivity(habit.id, '2026-01-05', database)).rejects.toThrow('本日结算后可永久删除')
    expect(await database.activities.get(habit.id)).toBeTruthy()

    const task = await createActivity({
      ...dailyHabit,
      title: '一次性任务',
      type: 'task',
      schedule: { kind: 'once' },
      plannedOn: '2026-01-05',
      isKey: false,
    }, database)
    await completeActivity(task.id, '2026-01-05', undefined, database)
    await expect(permanentlyDeleteActivity(task.id, '2026-01-05', database)).rejects.toThrow('本日结算后可永久删除')
    expect(await permanentlyDeleteActivity(task.id, '2026-01-06', database)).toBe(true)
    expect(await database.activities.get(task.id)).toBeUndefined()
    expect(await database.completions.where('activityId').equals(task.id).count()).toBe(1)
  })

  it('赛季只能有一个且删除活动定义不会破坏赛季快照', async () => {
    const activity = await createActivity(dailyHabit, database)
    const season = await createSeason({
      title: '专注重建',
      successCriterion: '完成四周稳定练习',
      baseline: '目前不够稳定',
      targetOutcome: '形成稳定节奏',
      focusActivityIds: [activity.id],
    }, '2026-01-05', database)
    expect(season).toMatchObject({ startsOn: '2026-01-05', endsOn: '2026-02-01', status: 'active' })
    await expect(createSeason({
      title: '第二赛季', successCriterion: '不能创建', baseline: '已有赛季', targetOutcome: '无', focusActivityIds: [activity.id],
    }, '2026-01-05', database)).rejects.toThrow('只能进行一个')

    await archiveActivity(activity.id, database)
    await permanentlyDeleteActivity(activity.id, '2026-01-06', database)
    expect(await database.activities.get(activity.id)).toBeUndefined()
    expect((await database.seasons.get(season.id))?.focusActivities[0]).toMatchObject({ title: activity.title, domain: activity.domain })
  })

  it('稳定生活蓝图原子重整前 3 天赛季且重复提交幂等', async () => {
    const oldKey = await createActivity(dailyHabit, database)
    const completed = await completeActivity(oldKey.id, '2026-01-05', undefined, database)
    if (!completed.awarded) throw new Error('测试前置完成失败')
    const season = await createSeason({
      title: '旧赛季', successCriterion: '旧标准', baseline: '旧起点', targetOutcome: '旧目标', focusActivityIds: [oldKey.id],
    }, '2026-01-05', database)
    const ledgerBefore = await database.ledgerEvents.toArray()
    const completionsBefore = await database.completions.toArray()

    const calibrated = await calibrateSeasonWithStableLife(season.id, '2026-01-06', database)
    expect(calibrated.activities).toHaveLength(3)
    expect(calibrated.activities.map((activity) => ({
      title: activity.title, cue: activity.cue, domain: activity.domain, difficulty: activity.difficulty, goal: activity.goal,
    }))).toEqual(stableLifeBlueprint.map((activity) => ({
      title: activity.title, cue: activity.cue, domain: activity.domain, difficulty: activity.difficulty, goal: activity.goal,
    })))
    expect(await database.activities.get(oldKey.id)).toMatchObject({ isKey: false, enabled: true })
    expect(calibrated.season).toMatchObject({
      startsOn: '2026-01-06', endsOn: '2026-02-02', dailyPlans: [], dailySignals: [], suggestions: [],
      calibration: { blueprintId: 'stable-life-v1', previous: { title: '旧赛季', startsOn: '2026-01-05' } },
    })
    expect(calibrated.season.focusActivities).toHaveLength(3)
    expect(await database.ledgerEvents.toArray()).toEqual(ledgerBefore)
    expect(await database.completions.toArray()).toEqual(completionsBefore)

    await calibrateSeasonWithStableLife(season.id, '2026-01-06', database)
    expect(await database.activities.count()).toBe(4)
  })

  it('稳定生活校准在第 4 天拒绝，写入失败时完整回滚', async () => {
    const oldKey = await createActivity(dailyHabit, database)
    const season = await createSeason({
      title: '旧赛季', successCriterion: '旧标准', baseline: '旧起点', targetOutcome: '旧目标', focusActivityIds: [oldKey.id],
    }, '2026-01-05', database)
    await expect(calibrateSeasonWithStableLife(season.id, '2026-01-08', database)).rejects.toThrow('第 1～3 天')
    expect(await database.activities.toArray()).toEqual([oldKey])

    const duplicateId = '00000000-0000-4000-8000-000000000000'
    const random = vi.spyOn(crypto, 'randomUUID').mockReturnValue(duplicateId)
    await expect(calibrateSeasonWithStableLife(season.id, '2026-01-06', database)).rejects.toBeTruthy()
    random.mockRestore()
    expect(await database.activities.toArray()).toEqual([oldKey])
    expect(await database.seasons.get(season.id)).toMatchObject({ title: '旧赛季', startsOn: '2026-01-05' })
  })

  it('每日状态同日覆盖并派生最近 7 天现实证据', async () => {
    const activity = await createActivity({ ...dailyHabit, isKey: false }, database)
    const season = await createSeason({
      title: '状态赛季', successCriterion: '观察现实变化', baseline: '低能量', targetOutcome: '稳定', focusActivityIds: [activity.id],
    }, '2026-01-05', database)
    await completeActivity(activity.id, '2026-01-05', undefined, database)
    await saveSeasonDailySignal(season.id, { wakeWindowMet: false, morningEnergy: 2, control: 2 }, '2026-01-05', database)
    await saveSeasonDailySignal(season.id, { wakeWindowMet: true, morningEnergy: 4, control: 3 }, '2026-01-05', database)
    await saveSeasonDailySignal(season.id, { wakeWindowMet: true, morningEnergy: 3, control: 4 }, '2026-01-06', database)
    const saved = await database.seasons.get(season.id)
    expect(saved?.dailySignals).toHaveLength(2)
    expect(getSeasonEvidence(saved!, await database.completions.toArray(), '2026-01-06')).toMatchObject({
      recentSignalCount: 2,
      wakeWindowDays: 2,
      morningEnergyAverage: 3.5,
      controlAverage: 3.5,
      behaviorDays: [{ activityId: activity.id, completedDays: 1 }],
    })
    await expect(saveSeasonDailySignal(season.id, { wakeWindowMet: true, morningEnergy: 3, control: 3 }, '2026-02-03', database)).rejects.toThrow('当前赛季内')
  })

  it('schema 7 旧赛季缺少每日状态字段时仍能启动和记录', async () => {
    const activity = await createActivity({ ...dailyHabit, isKey: false }, database)
    const season = await createSeason({
      title: '旧版赛季', successCriterion: '完成现实目标', baseline: '尚未开始', targetOutcome: '形成稳定行动', focusActivityIds: [activity.id],
    }, '2026-01-05', database)
    const { dailySignals: _dailySignals, ...schema7Season } = season
    await database.seasons.put(schema7Season as typeof season)

    expect((await getSnapshot(database)).seasons[0].dailySignals).toEqual([])
    await saveSeasonDailySignal(season.id, { wakeWindowMet: true, morningEnergy: 3, control: 4 }, '2026-01-05', database)
    expect((await database.seasons.get(season.id))?.dailySignals).toMatchObject([
      { date: '2026-01-05', wakeWindowMet: true, morningEnergy: 3, control: 4 },
    ])
  })

  it('从 V4.0.2 升级只补齐读取视图，不修改赛季、关键行为或成长历史', async () => {
    const activity = await createActivity({ ...dailyHabit, title: '升级保护行为' }, database)
    await completeActivity(activity.id, '2026-01-05', undefined, database)
    const season = await createSeason({
      title: '升级保护赛季', successCriterion: '保持原有定义', baseline: '已有运行数据', targetOutcome: '升级后完全一致', focusActivityIds: [activity.id],
    }, '2026-01-05', database)
    const { dailySignals: _dailySignals, ...schema7Season } = season
    await database.seasons.put(schema7Season as typeof season)
    const before = {
      activities: await database.activities.toArray(),
      completions: await database.completions.toArray(),
      ledgerEvents: await database.ledgerEvents.toArray(),
      rewards: await database.rewards.toArray(),
      seasons: await database.seasons.toArray(),
    }

    await initializeDatabase(database)
    const snapshot = await getSnapshot(database)

    expect(snapshot.seasons[0].dailySignals).toEqual([])
    expect(await database.activities.toArray()).toEqual(before.activities)
    expect(await database.completions.toArray()).toEqual(before.completions)
    expect(await database.ledgerEvents.toArray()).toEqual(before.ledgerEvents)
    expect(await database.rewards.toArray()).toEqual(before.rewards)
    expect(await database.seasons.toArray()).toEqual(before.seasons)
    expect(snapshot.activities.filter((item) => stableLifeBlueprint.some((blueprint) => blueprint.title === item.title))).toEqual([])
  })

  it('周复盘生成本地建议，响应建议不会自动修改活动', async () => {
    const activity = await createActivity(dailyHabit, database)
    const season = await createSeason({
      title: '专注重建', successCriterion: '完成四周稳定练习', baseline: '目前不够稳定', targetOutcome: '形成稳定节奏', focusActivityIds: [activity.id],
    }, '2026-01-05', database)
    const result = await saveWeeklyReview({
      id: 'review:2026-01-05', weekStart: '2026-01-05', createdAt: '2026-01-11T12:00:00.000Z',
      items: [{ activityId: activity.id, adherence: 0.4, completed: 3, planned: 7, impact: 5, friction: 4, decision: '调整' }],
    }, database)
    expect(result.suggestions).toMatchObject([{ kind: 'adjust', status: 'pending' }])
    const before = await database.activities.get(activity.id)
    await respondToSeasonSuggestion(season.id, result.suggestions[0].id, 'accepted', undefined, database)
    expect(await database.activities.get(activity.id)).toEqual(before)
    expect((await database.seasons.get(season.id))?.suggestions[0]).toMatchObject({ status: 'accepted' })
  })

  it('今日重点可替换，赛季结项要求现实证据并处理已有建议', async () => {
    const first = await createActivity({ ...dailyHabit, title: '行动一', isKey: false }, database)
    const second = await createActivity({ ...dailyHabit, title: '行动二', isKey: false }, database)
    const season = await createSeason({
      title: '行动赛季', successCriterion: '完成现实目标', baseline: '开始状态', targetOutcome: '目标状态', focusActivityIds: [first.id],
    }, '2026-01-05', database)
    await setSeasonDailyFocus(season.id, [second.id], '2026-01-06', database)
    expect((await database.seasons.get(season.id))?.dailyPlans).toEqual([{ date: '2026-01-06', activityIds: [second.id] }])

    const reviewResult = await saveWeeklyReview({
      id: 'review:2026-01-05', weekStart: '2026-01-05', createdAt: '2026-01-11T12:00:00.000Z',
      items: [{ activityId: first.id, adherence: 0.8, completed: 6, planned: 7, impact: 4, friction: 2, decision: '保留' }],
    }, database)
    await expect(completeSeason(season.id, '达成', '现实证据', { occurredOn: '2026-02-01' }, database)).rejects.toThrow('至少一条')
    await expect(respondToSeasonSuggestion(season.id, reviewResult.suggestions[0].id, 'modified', '', database)).rejects.toThrow('说明你的调整')
    await respondToSeasonSuggestion(season.id, reviewResult.suggestions[0].id, 'ignored', undefined, database)
    expect(await completeSeason(
      season.id,
      '部分达成',
      '坚持率提升，并形成了更稳定的开始时间',
      { occurredOn: '2026-02-01' },
      database,
    )).toMatchObject({
      status: 'completed',
      finalResult: '部分达成',
      concludedOn: '2026-02-01',
      conclusionType: 'scheduled',
    })
  })

  it('赛季可以提前结项，保存实际天数且重复提交幂等', async () => {
    const activity = await createActivity({ ...dailyHabit, title: '提前结项行为', isKey: false }, database)
    const season = await createSeason({
      title: '短期验证', successCriterion: '验证现实方向', baseline: '开始状态', targetOutcome: '目标状态', focusActivityIds: [activity.id],
    }, '2026-01-05', database)
    await expect(completeSeason(
      season.id,
      '未达成',
      '已经获得足够证据',
      { occurredOn: '2026-01-05' },
      database,
    )).rejects.toThrow('提前结项')
    const options = { occurredOn: '2026-01-05', earlyConclusionReason: '方向不再适合，立即停止比继续打卡更有价值' }
    const first = await completeSeason(season.id, '未达成', '已经获得足够证据', options, database)
    const repeated = await completeSeason(season.id, '未达成', '已经获得足够证据', options, database)
    expect(first).toMatchObject({
      status: 'completed',
      concludedOn: '2026-01-05',
      conclusionType: 'early',
      earlyConclusionReason: options.earlyConclusionReason,
    })
    expect(repeated).toEqual(first)
    await expect(createSeason({
      title: '下一赛季', successCriterion: '继续验证', baseline: '新起点', targetOutcome: '新结果', focusActivityIds: [activity.id],
    }, '2026-01-06', database)).resolves.toMatchObject({ status: 'active' })
  })

  it.each([
    ['第 1 天', '2026-01-05', '2026-01-05', 'early', 1],
    ['第 7 天', '2026-02-02', '2026-02-08', 'early', 7],
    ['第 27 天', '2026-03-02', '2026-03-28', 'early', 27],
    ['第 28 天', '2026-04-06', '2026-05-03', 'scheduled', 28],
  ] as const)('%s均可结项并保留正确的实际运行天数', async (_label, startsOn, occurredOn, conclusionType, durationDays) => {
    const activity = await createActivity({ ...dailyHabit, title: `结项边界 ${startsOn}`, isKey: false }, database)
    const season = await createSeason({
      title: `边界赛季 ${startsOn}`,
      successCriterion: '验证结项边界',
      baseline: '开始状态',
      targetOutcome: '获得现实结论',
      focusActivityIds: [activity.id],
    }, startsOn, database)
    const completed = await completeSeason(
      season.id,
      '部分达成',
      '已经形成足以支持结项的现实证据',
      conclusionType === 'early'
        ? { occurredOn, earlyConclusionReason: '实验已经提供结论，继续运行不会增加决策价值' }
        : { occurredOn },
      database,
    )
    expect(completed).toMatchObject({ concludedOn: occurredOn, conclusionType })
    const actualDays = Math.round(
      (new Date(`${completed.concludedOn}T12:00:00`).getTime() - new Date(`${completed.startsOn}T12:00:00`).getTime()) / 86_400_000,
    ) + 1
    expect(actualDays).toBe(durationDays)
  })

  it('只能持久取消今天的完成，重复取消幂等且之后可重做', async () => {
    const activity = await createActivity(tieredHabit, database)
    const first = await completeActivity(activity.id, '2026-01-05', { tier: 1 }, database)
    if (!first.awarded) throw new Error('测试前置完成失败')
    await completeActivity(activity.id, '2026-01-05', { tier: 3 }, database)
    await expect(cancelTodayCompletion(first.completion.id, '2026-01-06', database)).rejects.toThrow('只能取消今天')
    expect(await cancelTodayCompletion(first.completion.id, '2026-01-05', database)).toBe(true)
    expect(await cancelTodayCompletion(first.completion.id, '2026-01-05', database)).toBe(false)
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 0, coins: 0 })
    expect((await completeActivity(activity.id, '2026-01-05', { tier: 2 }, database)).awarded).toBe(true)
    expect(calculateStats(await database.ledgerEvents.toArray())).toMatchObject({ totalXp: 8, coins: 5 })
  })

})
