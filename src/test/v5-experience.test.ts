import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { gameDayMinute, getV5DomainGrowthDetail, orderDailyActions, orderFocusCandidates, parseCueMinute, V5GrowthPage } from '../prototype/V5Experience'
import { getLevel, type Activity, type JourneyEntry, type JourneyMonth } from '../domain'

const baseActivity: Activity = {
  id: 'base',
  title: '示例行动',
  type: 'habit',
  domain: 'career',
  difficulty: '普通',
  goal: { count: 1, unit: '次' },
  schedule: { kind: 'daily' },
  isKey: true,
  enabled: true,
  createdAt: '2026-07-24T00:00:00.000Z',
}

function activity(id: string, cue?: string): Activity {
  return { ...baseActivity, id, title: id, cue }
}

describe('V5 当前行动推荐', () => {
  it('只解析合法的 HH:mm 时间锚点', () => {
    expect(parseCueMinute('07:30 起床后')).toBe(450)
    expect(parseCueMinute('23:00')).toBe(1380)
    expect(parseCueMinute('第一段正式工作前')).toBeUndefined()
    expect(parseCueMinute('25:10')).toBeUndefined()
  })

  it('优先最近已经到点的行动，再给出无固定时间行动和较晚计划', () => {
    const ordered = orderFocusCandidates([
      activity('morning', '07:00'),
      activity('noon', '12:00 工作前'),
      activity('night', '23:00'),
      activity('flexible', '看到书时'),
    ], 14 * 60)

    expect(ordered.map((item) => item.id)).toEqual(['morning', 'noon', 'flexible', 'night'])
  })

  it('临近的下一时间锚点优先于无固定时间行动', () => {
    const ordered = orderFocusCandidates([
      activity('night', '23:00'),
      activity('morning', '07:00'),
      activity('flexible'),
    ], 6 * 60)

    expect(ordered.map((item) => item.id)).toEqual(['morning', 'flexible', 'night'])
  })
})

describe('V5 每日行动工作台排序', () => {
  it('按已到点、无固定时间和稍后分组，时间组从早到晚', () => {
    const ordered = orderDailyActions([
      activity('night', '23:00'),
      activity('noon', '12:00'),
      activity('flexible'),
      activity('morning', '07:00'),
    ], 14 * 60, [])

    expect(ordered.map((item) => item.id)).toEqual(['morning', 'noon', 'flexible', 'night'])
  })

  it('独立执行时间优先于旧触发文本时间', () => {
    const overridden = { ...activity('override', '07:00'), scheduledTime: '22:00' }
    const ordered = orderDailyActions([
      overridden,
      activity('flexible'),
      activity('morning', '09:00'),
    ], 10 * 60, [])

    expect(ordered.map((item) => item.id)).toEqual(['morning', 'flexible', 'override'])
  })

  it('按凌晨四点边界排列跨午夜行动', () => {
    expect(gameDayMinute(4 * 60)).toBe(0)
    expect(gameDayMinute(60)).toBe(21 * 60)
    const ordered = orderDailyActions([
      activity('three-thirty', '03:30'),
      activity('one', '01:00'),
      activity('flexible'),
      activity('night', '23:00'),
    ], 3 * 60, [])

    expect(ordered.map((item) => item.id)).toEqual(['night', 'one', 'flexible', 'three-thirty'])
  })

  it('今日优先只调整无固定时间行动', () => {
    const ordered = orderDailyActions([
      activity('first-flexible'),
      activity('timed', '22:00'),
      activity('second-flexible'),
    ], 14 * 60, ['first-flexible', 'second-flexible'])

    expect(ordered.map((item) => item.id)).toEqual(['second-flexible', 'first-flexible', 'timed'])
  })
})

function journeyEntry(id: string, occurredOn: string, title: string, xp: number, domain: JourneyEntry['domain'] = 'health'): JourneyEntry {
  return {
    id,
    kind: 'action',
    occurredOn,
    createdAt: `${occurredOn}T08:00:00.000Z`,
    title,
    domain,
    xp,
    coins: xp > 0 ? 2 : 0,
  }
}

function journeyMonth(month: string, entries: JourneyEntry[]): JourneyMonth {
  return {
    month,
    label: month,
    activeDays: new Set(entries.map((entry) => entry.occurredOn)).size,
    actionCount: entries.length,
    xp: entries.reduce((total, entry) => total + entry.xp, 0),
    coins: entries.reduce((total, entry) => total + entry.coins, 0),
    days: entries.map((entry) => ({
      date: entry.occurredOn,
      entries: [entry],
      actionCount: entry.kind === 'action' ? 1 : 0,
      hasMilestone: entry.kind !== 'action',
    })),
  }
}

describe('V5 成长领域详情', () => {
  it('成长主卡承载总数值且页面不再渲染旧总成长信息行', () => {
    const markup = renderToStaticMarkup(createElement(V5GrowthPage, {
      stats: {
        totalXp: 75,
        coins: 41,
        domainXp: { health: 11, learning: 0, creation: 50, career: 6, life: 3, mindset: 0 },
      },
      level: getLevel(75),
      journeyMonths: [],
      today: '2026-07-24',
      onCreate: () => undefined,
      onOpenRewards: () => undefined,
    }))

    expect(markup).toContain('累计成长')
    expect(markup).toContain('持有金币')
    expect(markup).not.toContain('总成长')
    expect(markup).not.toContain('当前持有')
  })

  it('只汇总最近 28 个游戏日内同领域的有效行动', () => {
    const details = getV5DomainGrowthDetail('health', 75, [
      journeyMonth('2026-07', [
        journeyEntry('today', '2026-07-24', '跑步', 20),
        journeyEntry('yesterday', '2026-07-23', '拉伸', 5),
        journeyEntry('other-domain', '2026-07-22', '阅读', 50, 'learning'),
      ]),
      journeyMonth('2026-06', [
        journeyEntry('cutoff', '2026-06-27', '跑步', 10),
        journeyEntry('expired', '2026-06-26', '旧训练', 40),
      ]),
    ], '2026-07-24')

    expect(details).toMatchObject({
      totalXp: 75,
      recentXp: 35,
      actionCount: 3,
      activeDays: 3,
    })
    expect(details.topActions).toEqual([
      { title: '跑步', xp: 30, count: 2 },
      { title: '拉伸', xp: 5, count: 1 },
    ])
    expect(details.recentEntries.map((entry) => entry.id)).toEqual(['today', 'yesterday', 'cutoff'])
  })

  it('没有领域记录时返回稳定的空状态', () => {
    const details = getV5DomainGrowthDetail('creation', 0, [], '2026-07-24')
    expect(details.level.level).toBe(1)
    expect(details).toMatchObject({ recentXp: 0, actionCount: 0, activeDays: 0, topActions: [], recentEntries: [] })
  })
})
