import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from '../backup'
import {
  LifeRpgDatabase,
  completeActivity,
  createActivity,
  getSnapshot,
  initializeDatabase,
  redeemReward,
  undoCompletion,
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
})
