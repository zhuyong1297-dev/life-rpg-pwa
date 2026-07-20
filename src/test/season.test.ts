import { describe, expect, it } from 'vitest'
import type { Completion, WeeklyReview } from '../domain'
import { SeasonSchema, generateCoachSuggestions, getSeasonDay, getSeasonStrategy } from '../season'

const season = SeasonSchema.parse({
  id: 'season-1',
  title: '专注重建',
  successCriterion: '连续四周稳定完成核心行为',
  baseline: '目前容易被临时事项打断',
  targetOutcome: '每天能完成一段稳定专注工作',
  startsOn: '2026-01-05',
  endsOn: '2026-02-01',
  focusActivities: [{
    activityId: 'a1', title: '深度工作', attribute: '专注', difficulty: '普通',
    goal: { count: 1, unit: '次' }, schedule: { kind: 'daily' },
  }],
  status: 'active',
  createdAt: '2026-01-05T04:00:00.000Z',
})

function review(weekStart: string, adherence: number, impact: number, friction: number): WeeklyReview {
  return {
    id: `review:${weekStart}`,
    weekStart,
    createdAt: `${weekStart}T12:00:00.000Z`,
    items: [{ activityId: 'a1', adherence, completed: Math.round(adherence * 7), planned: 7, impact, friction, decision: '保留' }],
  }
}

describe('成长赛季', () => {
  it('固定为 28 个游戏日并正确计算进度', () => {
    expect(getSeasonDay(season, '2026-01-05')).toBe(1)
    expect(getSeasonDay(season, '2026-02-01')).toBe(28)
    expect(() => SeasonSchema.parse({ ...season, endsOn: '2026-02-02' })).toThrow('28 个游戏日')
    expect(() => SeasonSchema.parse({ ...season, dailyPlans: [{ date: '2026-02-02', activityIds: ['a1'] }] })).toThrow('赛季日期内')
  })

  it('高帮助高阻力生成调整建议，连续两周稳定生成保持建议', () => {
    expect(generateCoachSuggestions(season, review('2026-01-05', 0.5, 5, 4), [])[0]).toMatchObject({ kind: 'adjust', status: 'pending' })
    expect(generateCoachSuggestions(
      season,
      review('2026-01-12', 0.9, 5, 2),
      [review('2026-01-05', 0.9, 4, 1)],
    )[0]).toMatchObject({ kind: 'keep', status: 'pending' })
    expect(generateCoachSuggestions(season, review('2026-01-19', 0.8, 2, 2), [])[0]).toMatchObject({ kind: 'pause' })
  })

  it('策略统计只使用赛季内有效完成和复盘', () => {
    const completions: Completion[] = [
      { id: 'c1', activityId: 'a1', occurredOn: '2026-01-06', status: 'active', createdAt: '2026-01-06T08:00:00.000Z' },
      { id: 'c2', activityId: 'a1', occurredOn: '2026-01-07', status: 'undone', createdAt: '2026-01-07T08:00:00.000Z', undoneAt: '2026-01-07T09:00:00.000Z' },
      { id: 'c3', activityId: 'a1', occurredOn: '2026-02-02', status: 'active', createdAt: '2026-02-02T08:00:00.000Z' },
    ]
    expect(getSeasonStrategy(season, [review('2026-01-05', 0.8, 5, 2)], completions)).toMatchObject({
      activeDays: 1,
      completionCount: 1,
      averageAdherence: 0.8,
      effectiveBehaviors: [{ title: '深度工作', impact: 5, cadence: '每天', baseLayer: '1次' }],
      mainFriction: { title: '深度工作', friction: 2 },
      nextSuggestion: '优先复用「深度工作」的每天节奏，从基础层 1次 开始。',
    })
  })

  it('赛季周中开始时仍统计与赛季重叠的首周复盘', () => {
    const midweekSeason = SeasonSchema.parse({ ...season, startsOn: '2026-01-07', endsOn: '2026-02-03' })
    expect(getSeasonStrategy(midweekSeason, [review('2026-01-05', 0.8, 5, 2)], [])).toMatchObject({
      averageAdherence: 0.8,
      effectiveBehaviors: [{ title: '深度工作' }],
    })
  })
})
