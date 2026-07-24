import { describe, expect, it } from 'vitest'
import { gameDayMinute, orderDailyActions, orderFocusCandidates, parseCueMinute } from '../prototype/V5Experience'
import type { Activity } from '../domain'

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
