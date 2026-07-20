import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from '../backup'
import {
  LifeRpgDatabase,
  acknowledgeLevelMilestone,
  archiveHabit,
  cancelTodayCompletion,
  completeActivity,
  createActivity,
  createReward,
  currentGameDate,
  getSnapshot,
  initializeDatabase,
  claimMilestoneReward,
  redeemReward,
  restoreHabit,
  setRewardEnabled,
  setTargetReward,
  syncLevelMilestones,
  undoCompletion,
  updateActivityGoal,
  updateHabit,
  updateReward,
  type NewActivity,
} from '../db'
import { calculateStats } from '../domain'

let database: LifeRpgDatabase

const dailyHabit: NewActivity = {
  title: '示例习惯',
  type: 'habit',
  attribute: '专注',
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

beforeEach(async () => {
  database = new LifeRpgDatabase(`test-${crypto.randomUUID()}`)
  await initializeDatabase(database)
})

afterEach(async () => {
  database.close()
  await database.delete()
})

describe('IndexedDB 事务', () => {
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
      attribute: '体魄',
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
      attributeSnapshot: '专注',
      difficultySnapshot: '普通',
    })

    const upgraded = await completeActivity(activity.id, '2026-01-05', { tier: 2 }, database)
    expect(upgraded).toMatchObject({ awarded: true, upgraded: true })
    expect((await database.ledgerEvents.get(`reward:${first.completion.id}:tier:2`))).toMatchObject({
      title: '层次升级：示例习惯（标准）',
      attribute: '专注',
      xpDelta: 2,
    })
    await expect(completeActivity(activity.id, '2026-01-06', undefined, database)).rejects.toThrow('必须填写实际成果')
  })

  it('每周奖励额度在编辑后按新版本重新计算', async () => {
    const activity = await createActivity({ ...dailyHabit, schedule: { kind: 'weekly', times: 1 } }, database)
    await completeActivity(activity.id, '2026-01-05', undefined, database)
    await updateHabit(activity.id, {
      title: activity.title,
      attribute: activity.attribute,
      difficulty: activity.difficulty,
      schedule: { kind: 'weekly', times: 1 },
      goal: activity.goal,
      isKey: activity.isKey,
    }, database)
    expect((await completeActivity(activity.id, '2026-01-06', undefined, database)).awarded).toBe(true)
  })

  it('归档保留历史并可恢复，已归档习惯不能继续完成', async () => {
    const activity = await createActivity(dailyHabit, database)
    await completeActivity(activity.id, '2026-01-05', undefined, database)
    expect(await archiveHabit(activity.id, database)).toBe(true)
    expect(await database.activities.get(activity.id)).toMatchObject({ enabled: false, isKey: false })
    expect((await database.activities.get(activity.id))?.archivedAt).toBeTruthy()
    expect(await database.completions.count()).toBe(1)
    expect(await database.ledgerEvents.count()).toBe(1)
    await expect(completeActivity(activity.id, '2026-01-06', undefined, database)).rejects.toThrow('不存在或已暂停')
    expect(await restoreHabit(activity.id, database)).toBe(true)
    expect(await database.activities.get(activity.id)).toMatchObject({ enabled: true, isKey: false })
    expect((await database.activities.get(activity.id))?.archivedAt).toBeUndefined()
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

  it('余额不足拒绝兑换，余额足够时追加负金币流水', async () => {
    const reward = (await database.rewards.toArray())[0]
    await expect(redeemReward(reward.id, database)).rejects.toThrow('金币余额不足')
    const activity = await createActivity({ ...dailyHabit, difficulty: 'Boss' }, database)
    await completeActivity(activity.id, '2026-01-05', '完成了可验证成果', database)
    await completeActivity(activity.id, '2026-01-06', '完成了第二次成果', database)
    await redeemReward(reward.id, database)
    expect(calculateStats(await database.ledgerEvents.toArray()).coins).toBe(20)
  })

  it('奖励商品支持新增、目标唯一、编辑、停用和恢复，历史兑换不重写', async () => {
    const reward = await createReward({ title: '短暂休息', cost: 30, target: true }, database)
    expect((await database.settings.get('meta'))?.value).toMatchObject({ targetRewardId: reward.id })

    const second = await createReward({ title: '一次体验', cost: 80, target: true }, database)
    expect((await database.settings.get('meta'))?.value).toMatchObject({ targetRewardId: second.id })
    await setTargetReward(reward.id, database)

    const activity = await createActivity({ ...dailyHabit, difficulty: 'Boss' }, database)
    await completeActivity(activity.id, '2026-01-05', '成果一', database)
    await completeActivity(activity.id, '2026-01-06', '成果二', database)
    const redemption = await redeemReward(reward.id, database)
    expect(redemption).toMatchObject({ title: '兑换：短暂休息', coinDelta: -30 })

    await updateReward(reward.id, { title: '更名后的休息', cost: 80, target: true }, database)
    expect(await database.ledgerEvents.get(redemption.id)).toMatchObject({ title: '兑换：短暂休息', coinDelta: -30 })
    expect(await database.rewards.get(reward.id)).toMatchObject({ title: '更名后的休息', cost: 80 })

    await setRewardEnabled(reward.id, false, database)
    const metaAfterDisable = await database.settings.get('meta')
    expect(metaAfterDisable?.key === 'meta' ? metaAfterDisable.value.targetRewardId : undefined).toBeUndefined()
    await expect(setTargetReward(reward.id, database)).rejects.toThrow('只能把启用中的商品设为当前目标')
    await setRewardEnabled(reward.id, true, database)
    expect(await database.rewards.get(reward.id)).toMatchObject({ enabled: true })
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
    await acknowledgeLevelMilestone(2, '体魄', database)
    const meta = await database.settings.get('meta')
    expect(meta?.key === 'meta' ? meta.value.levelSystem : undefined).toMatchObject({
      baselineLevel: 1,
      highestLevelReached: 2,
      focusAttribute: '体魄',
      milestones: [{ level: 2, focusAttribute: '体魄' }],
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
    const reward = await database.rewards.get('reward-entertainment')
    if (!reward) throw new Error('测试奖励不存在')
    const coins = calculateStats(await database.ledgerEvents.toArray()).coins
    await claimMilestoneReward(3, reward.id, database)
    expect(calculateStats(await database.ledgerEvents.toArray()).coins).toBe(coins)
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

  it('schema 5 备份完整保存等级系统', async () => {
    const current = await createBackup(database)
    expect(current).toMatchObject({ schemaVersion: 5, appVersion: '2.6.0' })
    await restoreBackup(current, database)
    const meta = await database.settings.get('meta')
    expect(meta?.key === 'meta' ? meta.value.levelSystem?.highestLevelReached : undefined).toBe(1)
  })
})
