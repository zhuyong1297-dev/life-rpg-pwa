import { describe, expect, it } from 'vitest'
import { ActivitySchema, CompletionSchema, TieredGoalSchema, attributes, calculateStats, effectiveGameDate, formatDurationSeconds, formatTierGoalValue, gameDate, getCharacterStage, getCharacterStageName, getJourneyMonths, getLevel, getLevelReport, getMilestoneVoucherCost, getNextVoucherLevel, getTierAchievement, getTierReward, getTierUpgradeXp, getTotalXpForLevel, rewardTable, type Completion, type LedgerEvent, type LevelMilestone } from '../domain'

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

  it('两层习惯使用 60% 和 100% XP，金币仍只是一份完整预算', () => {
    expect(getTierReward('普通', 1, 2)).toEqual({ xp: 6, coins: 5 })
    expect(getTierReward('普通', 2, 2)).toEqual({ xp: 10, coins: 5 })
    expect(getTierUpgradeXp('普通', 1, 2, 2)).toBe(4)
  })

  it('四种分层目标都接受两层阈值', () => {
    expect(TieredGoalSchema.parse({ kind: 'tiered', metric: 'count', unit: '次', thresholds: [1, 3] }).thresholds).toHaveLength(2)
    expect(TieredGoalSchema.parse({ kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '秒', thresholds: [30, 90] }).thresholds).toHaveLength(2)
    expect(TieredGoalSchema.parse({ kind: 'tiered', metric: 'combined', mode: 'per_occurrence', countUnit: '次', inputUnit: '秒', thresholds: [{ count: 1, durationSeconds: 30 }, { count: 3, durationSeconds: 30 }] }).thresholds).toHaveLength(2)
    expect(TieredGoalSchema.parse({ kind: 'tiered', metric: 'combined', mode: 'total', countUnit: '次', inputUnit: '分钟', thresholds: [{ count: 1, durationSeconds: 60 }, { count: 2, durationSeconds: 180 }] }).thresholds).toHaveLength(2)
  })

  it('凌晨四点切换游戏日且启用前继续使用自然日', () => {
    const before = new Date(2026, 6, 20, 3, 59, 59)
    const boundary = new Date(2026, 6, 20, 4, 0, 0)
    expect(gameDate(before)).toBe('2026-07-19')
    expect(gameDate(boundary)).toBe('2026-07-20')
    expect(effectiveGameDate(before, boundary.toISOString())).toBe('2026-07-20')
    expect(effectiveGameDate(boundary, boundary.toISOString())).toBe('2026-07-20')
  })

  it('游戏日在跨月、跨年和闰日凌晨仍归属前一天', () => {
    expect(gameDate(new Date(2027, 0, 1, 3, 0))).toBe('2026-12-31')
    expect(gameDate(new Date(2028, 2, 1, 3, 0))).toBe('2028-02-29')
    expect(gameDate(new Date(2028, 2, 1, 4, 0))).toBe('2028-03-01')
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
    expect(getCharacterStageName(1)).toBe('启程者')
    expect(getCharacterStageName(3)).toBe('行动者')
    expect(getCharacterStageName(6)).toBe('践行者')
    expect(getCharacterStageName(10)).toBe('塑造者')
    expect(getTotalXpForLevel(3)).toBe(300)
    expect(getTotalXpForLevel(6)).toBe(1500)
    expect(getTotalXpForLevel(10)).toBe(4500)
    expect(getTotalXpForLevel(15)).toBe(10_500)
    expect(getMilestoneVoucherCost(3)).toBe(30)
    expect(getMilestoneVoucherCost(6)).toBe(80)
    expect(getMilestoneVoucherCost(10)).toBe(200)
    expect(getMilestoneVoucherCost(15)).toBe(200)
    expect(getMilestoneVoucherCost(11)).toBeUndefined()
    expect(getNextVoucherLevel(1)).toBe(3)
    expect(getNextVoucherLevel(10)).toBe(15)
  })

  it('成长报告按完成来源合并层次升级并排除已修正奖励', () => {
    const milestone: LevelMilestone = {
      level: 2,
      reachedAt: '2026-01-03T00:00:00.000Z',
      sourceEventId: 'upgrade',
    }
    const events: LedgerEvent[] = [
      { id: 'base', kind: 'reward', sourceId: 'c1', occurredOn: '2026-01-01', title: '阅读', attribute: '智识', xpDelta: 6, coinDelta: 5, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'upgrade', kind: 'reward', sourceId: 'c1', occurredOn: '2026-01-01', title: '层次升级：阅读', attribute: '智识', xpDelta: 4, coinDelta: 0, createdAt: '2026-01-01T01:00:00.000Z' },
      { id: 'exercise', kind: 'reward', sourceId: 'c2', occurredOn: '2026-01-02', title: '训练', attribute: '体魄', xpDelta: 20, coinDelta: 10, createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'correction:exercise', kind: 'correction', sourceId: 'exercise', occurredOn: '2026-01-02', title: '撤销：训练', attribute: '体魄', xpDelta: -20, coinDelta: -10, createdAt: '2026-01-02T01:00:00.000Z' },
    ]
    expect(getLevelReport(events, milestone, '2025-12-31T00:00:00.000Z')).toEqual({
      activeDays: 1,
      completionCount: 1,
      attributeXp: { 体魄: 0, 智识: 10, 专注: 0, 创造: 0, 关系: 0, 心境: 0 },
      strongestAttribute: '智识',
      topActions: [{ title: '阅读', xp: 10 }],
    })
  })

  it('有效行动日志合并层次升级并完全隐藏撤销与修正', () => {
    const completions: Completion[] = [
      { id: 'c1', activityId: 'a1', occurredOn: '2026-01-05', status: 'active', tier: 2, tierGoalSnapshot: { kind: 'tiered', metric: 'count', unit: '次', thresholds: [1, 3] }, titleSnapshot: '有效行动', attributeSnapshot: '专注', difficultySnapshot: '普通', activityRevision: 1, createdAt: '2026-01-05T08:00:00.000Z' },
      { id: 'c2', activityId: 'a2', occurredOn: '2026-01-06', status: 'undone', titleSnapshot: '已撤销行动', attributeSnapshot: '体魄', difficultySnapshot: '简单', activityRevision: 1, createdAt: '2026-01-06T08:00:00.000Z', undoneAt: '2026-01-06T09:00:00.000Z' },
    ]
    const events: LedgerEvent[] = [
      { id: 'r1', kind: 'reward', sourceId: 'c1', occurredOn: '2026-01-05', title: '有效行动', attribute: '专注', xpDelta: 6, coinDelta: 5, createdAt: '2026-01-05T08:00:00.000Z' },
      { id: 'r2', kind: 'reward', sourceId: 'c1', occurredOn: '2026-01-05', title: '层次升级：有效行动（标准）', attribute: '专注', xpDelta: 4, coinDelta: 0, createdAt: '2026-01-05T08:10:00.000Z' },
      { id: 'r3', kind: 'reward', sourceId: 'c2', occurredOn: '2026-01-06', title: '已撤销行动', attribute: '体魄', xpDelta: 5, coinDelta: 2, createdAt: '2026-01-06T08:00:00.000Z' },
      { id: 'x3', kind: 'correction', sourceId: 'r3', occurredOn: '2026-01-06', title: '撤销：已撤销行动', attribute: '体魄', xpDelta: -5, coinDelta: -2, createdAt: '2026-01-06T09:00:00.000Z' },
    ]
    const months = getJourneyMonths(completions, events)
    expect(months).toHaveLength(1)
    expect(months[0]).toMatchObject({ activeDays: 1, actionCount: 1, xp: 10, coins: 5, strongestAttribute: '专注' })
    expect(months[0].days[0].entries).toHaveLength(1)
    expect(months[0].days[0].entries[0]).toMatchObject({ title: '有效行动', tier: 2, xp: 10, coins: 5 })
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
