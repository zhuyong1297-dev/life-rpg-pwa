import { describe, expect, it } from 'vitest'
import { ActivitySchema, CompletionSchema, TieredGoalSchema, attributes, calculateStats, formatDurationSeconds, formatTierGoalValue, getCharacterStage, getLevel, getTierAchievement, getTierReward, getTierUpgradeXp, rewardTable, type LedgerEvent } from '../domain'

describe('领域规则', () => {
  it('使用固定的四档奖励', () => {
    expect(rewardTable).toEqual({
      简单: { xp: 5, coins: 2 },
      普通: { xp: 10, coins: 5 },
      困难: { xp: 20, coins: 10 },
      Boss: { xp: 50, coins: 25 },
    })
  })

  it('三层习惯只分配原难度的固定奖励预算', () => {
    expect([
      [getTierReward('简单', 1), getTierReward('简单', 2), getTierReward('简单', 3)],
      [getTierReward('普通', 1), getTierReward('普通', 2), getTierReward('普通', 3)],
      [getTierReward('困难', 1), getTierReward('困难', 2), getTierReward('困难', 3)],
      [getTierReward('Boss', 1), getTierReward('Boss', 2), getTierReward('Boss', 3)],
    ]).toEqual([
      [{ xp: 3, coins: 2 }, { xp: 4, coins: 2 }, { xp: 5, coins: 2 }],
      [{ xp: 6, coins: 5 }, { xp: 8, coins: 5 }, { xp: 10, coins: 5 }],
      [{ xp: 12, coins: 10 }, { xp: 16, coins: 10 }, { xp: 20, coins: 10 }],
      [{ xp: 30, coins: 25 }, { xp: 40, coins: 25 }, { xp: 50, coins: 25 }],
    ])
    expect(getTierUpgradeXp('普通', 1, 3)).toBe(4)
  })

  it('三层时间或次数阈值必须严格递增', () => {
    expect(TieredGoalSchema.parse({ kind: 'tiered', metric: 'duration', unit: '分钟', thresholds: [5, 20, 45] })).toBeTruthy()
    expect(TieredGoalSchema.parse({ kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '秒', thresholds: [30, 60, 90] })).toBeTruthy()
    expect(TieredGoalSchema.parse({ kind: 'tiered', metric: 'count', unit: '页', thresholds: [5, 15, 30] })).toBeTruthy()
    expect(() => TieredGoalSchema.parse({ kind: 'tiered', metric: 'duration', unit: '分钟', thresholds: [20, 20, 45] })).toThrow('严格递增')
    expect(() => TieredGoalSchema.parse({ kind: 'tiered', metric: 'count', unit: '页', thresholds: [1, 3, 1000] })).toThrow('不能超过 999')
    expect(() => ActivitySchema.parse({
      id: 'task', title: '示例任务', type: 'task', attribute: '专注', difficulty: '简单',
      goal: { kind: 'tiered', metric: 'count', unit: '次', thresholds: [1, 2, 3] },
      schedule: { kind: 'once' }, plannedOn: '2026-01-05', isKey: false, enabled: true, createdAt: '2026-01-01T00:00:00.000Z',
    })).toThrow('只能用于习惯')
    expect(() => CompletionSchema.parse({
      id: 'completion', activityId: 'habit', occurredOn: '2026-01-05', status: 'active', tier: 2,
      tierMetric: 'count', tierUnit: '组', tierThresholds: [1, 3, 5], achievedValue: 5,
      createdAt: '2026-01-05T00:00:00.000Z',
    })).toThrow('快照与所选层次不一致')
  })

  it('组合目标允许单一维度增加并拒绝下降或超出一天', () => {
    const perOccurrence = TieredGoalSchema.parse({
      kind: 'tiered', metric: 'combined', mode: 'per_occurrence', countUnit: '次', inputUnit: '秒',
      thresholds: [
        { count: 3, durationSeconds: 30 },
        { count: 5, durationSeconds: 30 },
        { count: 5, durationSeconds: 45 },
      ],
    })
    expect(formatTierGoalValue(perOccurrence, 1)).toBe('3次 × 每次30秒')
    expect(getTierAchievement(perOccurrence, 3)).toEqual({ count: 5, countUnit: '次', durationSeconds: 225 })
    const total = TieredGoalSchema.parse({
      kind: 'tiered', metric: 'combined', mode: 'total', countUnit: '组', inputUnit: '分钟',
      thresholds: [
        { count: 2, durationSeconds: 120 },
        { count: 2, durationSeconds: 240 },
        { count: 4, durationSeconds: 240 },
      ],
    })
    expect(formatTierGoalValue(total, 2)).toBe('总计2组 · 累计4分钟')
    expect(getTierAchievement(total, 3)).toEqual({ count: 4, countUnit: '组', durationSeconds: 240 })
    expect(() => TieredGoalSchema.parse({ ...perOccurrence, thresholds: [
      { count: 3, durationSeconds: 30 }, { count: 2, durationSeconds: 40 }, { count: 5, durationSeconds: 45 },
    ] })).toThrow('不能下降')
    expect(() => TieredGoalSchema.parse({ ...perOccurrence, thresholds: [
      { count: 3, durationSeconds: 30 }, { count: 3, durationSeconds: 30 }, { count: 5, durationSeconds: 45 },
    ] })).toThrow('至少一项必须增加')
    expect(() => TieredGoalSchema.parse({ ...perOccurrence, thresholds: [
      { count: 999, durationSeconds: 100 }, { count: 999, durationSeconds: 101 }, { count: 999, durationSeconds: 102 },
    ] })).toThrow('不能超过 24 小时')
  })

  it('秒级时间使用智能格式且新完成保存完整目标快照', () => {
    expect(formatDurationSeconds(30)).toBe('30秒')
    expect(formatDurationSeconds(90)).toBe('1分钟30秒')
    expect(formatDurationSeconds(3661)).toBe('1小时1分钟1秒')
    expect(CompletionSchema.parse({
      id: 'completion', activityId: 'habit', occurredOn: '2026-01-05', status: 'active', tier: 1,
      tierGoalSnapshot: { kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '秒', thresholds: [30, 60, 90] },
      createdAt: '2026-01-05T00:00:00.000Z',
    })).toBeTruthy()
  })

  it('归档活动与完成版本快照必须保持完整', () => {
    const baseActivity = {
      id: 'habit', title: '示例习惯', type: 'habit', attribute: '专注', difficulty: '普通',
      goal: { count: 1, unit: '次' }, schedule: { kind: 'daily' }, revision: 2,
      isKey: false, enabled: false, archivedAt: '2026-01-05T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
    }
    expect(ActivitySchema.parse(baseActivity)).toBeTruthy()
    expect(() => ActivitySchema.parse({ ...baseActivity, enabled: true })).toThrow('已归档活动不能启用')
    expect(() => CompletionSchema.parse({
      id: 'completion', activityId: 'habit', occurredOn: '2026-01-05', status: 'active', activityRevision: 2,
      titleSnapshot: '示例习惯', createdAt: '2026-01-05T00:00:00.000Z',
    })).toThrow('完成时的活动配置快照不完整')
  })

  it('按当前等级乘以 100 计算升级经验', () => {
    expect(getLevel(99)).toMatchObject({ level: 1, current: 99, needed: 100 })
    expect(getLevel(100)).toMatchObject({ level: 2, current: 0, needed: 200 })
    expect(getLevel(300)).toMatchObject({ level: 3, current: 0, needed: 300 })
    expect(getCharacterStage(2)).toBe(1)
    expect(getCharacterStage(3)).toBe(2)
    expect(getCharacterStage(10)).toBe(4)
  })

  it('完全从追加式流水派生角色数值', () => {
    const events: LedgerEvent[] = [
      { id: 'a', kind: 'reward', sourceId: 'c1', occurredOn: '2026-01-01', title: '示例行动', attribute: '体魄', xpDelta: 10, coinDelta: 5, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', kind: 'correction', sourceId: 'a', occurredOn: '2026-01-01', title: '撤销', attribute: '体魄', xpDelta: -10, coinDelta: -5, createdAt: '2026-01-01T00:01:00.000Z' },
      { id: 'c', kind: 'redemption', sourceId: 'r1', occurredOn: '2026-01-02', title: '兑换', xpDelta: 0, coinDelta: -2, createdAt: '2026-01-02T00:00:00.000Z' },
    ]
    expect(calculateStats(events)).toEqual({
      totalXp: 0,
      coins: -2,
      attributeXp: Object.fromEntries(attributes.map((attribute) => [attribute, 0])),
    })
  })
})
