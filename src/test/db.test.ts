import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from '../backup'
import {
  LifeRpgDatabase,
  archiveHabit,
  cancelTodayCompletion,
  completeActivity,
  createActivity,
  getSnapshot,
  initializeDatabase,
  redeemReward,
  restoreHabit,
  undoCompletion,
  updateActivityGoal,
  updateHabit,
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
})
