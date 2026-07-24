import { describe, expect, it } from 'vitest'
import { orderFocusCandidates, parseCueMinute } from '../prototype/V5Experience'
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

    expect(ordered.map((item) => item.id)).toEqual(['noon', 'morning', 'flexible', 'night'])
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
