import { describe, expect, it } from 'vitest'
import { attributes, calculateStats, getCharacterStage, getLevel, rewardTable, type LedgerEvent } from '../domain'

describe('领域规则', () => {
  it('使用固定的四档奖励', () => {
    expect(rewardTable).toEqual({
      简单: { xp: 5, coins: 2 },
      普通: { xp: 10, coins: 5 },
      困难: { xp: 20, coins: 10 },
      Boss: { xp: 50, coins: 25 },
    })
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
