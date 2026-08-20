import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { gameDayMinute, getV5ActionRewardPreview, getV5DailyRewardSummary, getV5DomainGrowthDetail, getV5FeedbackDisplay, getV5NextTier, getV5WeeklyRewardPreview, orderDailyActions, orderFocusCandidates, parseCueMinute, V5GrowthPage, V5TodayPage, type V5FeedbackView } from '../prototype/V5Experience'
import { getLevel, type Activity, type Completion, type JourneyEntry, type JourneyMonth } from '../domain'

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

  it('无固定时间行动排在尚未到点的时间锚点之前', () => {
    const ordered = orderFocusCandidates([
      activity('night', '23:00'),
      activity('morning', '07:00'),
      activity('flexible'),
    ], 6 * 60)

    expect(ordered.map((item) => item.id)).toEqual(['flexible', 'morning', 'night'])
  })

  it('按已到点、已触发行动链、事件或无锚点、尚未到点排序，并在同组优先关键行动', () => {
    const predecessor = { ...activity('predecessor'), isKey: false }
    const ready = {
      ...activity('ready'),
      isKey: false,
      habitFormation: {
        configuredAt: '2026-08-20T08:00:00.000Z',
        anchor: { kind: 'after_activity' as const, activityId: predecessor.id, titleSnapshot: predecessor.title },
      },
    }
    const event = {
      ...activity('event'),
      isKey: false,
      habitFormation: {
        configuredAt: '2026-08-20T08:00:00.000Z',
        anchor: { kind: 'event' as const, label: '午饭后' },
      },
    }
    const keyFlexible = { ...activity('key-flexible'), cue: undefined }
    const overdue = { ...activity('overdue'), habitFormation: { configuredAt: '2026-08-20T08:00:00.000Z', anchor: { kind: 'time' as const, time: '07:30' } } }
    const future = { ...activity('future'), habitFormation: { configuredAt: '2026-08-20T08:00:00.000Z', anchor: { kind: 'time' as const, time: '23:00' } } }
    const candidates = [future, event, ready, keyFlexible, overdue]

    expect(orderFocusCandidates(candidates, 14 * 60, [predecessor, ...candidates], new Set([predecessor.id])).map((item) => item.id))
      .toEqual(['overdue', 'ready', 'key-flexible', 'event', 'future'])
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

describe('V5 分层行动状态', () => {
  const tieredGoal: Extract<Activity['goal'], { kind: 'tiered'; metric: 'count' }> = {
    kind: 'tiered',
    metric: 'count',
    unit: '次',
    thresholds: [1, 2, 3],
  }
  const tieredActivity: Activity = {
    ...baseActivity,
    goal: tieredGoal,
  }
  const completion: Completion = {
    id: 'completion-tiered',
    activityId: tieredActivity.id,
    occurredOn: '2026-07-24',
    status: 'active',
    tier: 1,
    tierGoalSnapshot: tieredGoal,
    createdAt: '2026-07-24T08:00:00.000Z',
  }

  it('达到基础层后仍返回下一层，达到最高层后才结束', () => {
    expect(getV5NextTier(tieredActivity, completion)).toBe(2)
    expect(getV5NextTier(tieredActivity, { ...completion, tier: 2 })).toBe(3)
    expect(getV5NextTier(tieredActivity, { ...completion, tier: 3 })).toBeUndefined()
  })

  it('使用完成时的目标快照，不受之后编辑活动层数影响', () => {
    const editedActivity: Activity = {
      ...tieredActivity,
      goal: { kind: 'tiered', metric: 'count', unit: '次', thresholds: [1, 2] },
    }
    expect(getV5NextTier(editedActivity, completion)).toBe(2)
    expect(getV5NextTier(editedActivity, { ...completion, tier: 2 })).toBe(3)
  })
})

describe('V5 行动奖励预告', () => {
  const tieredGoal: Extract<Activity['goal'], { kind: 'tiered'; metric: 'count' }> = {
    kind: 'tiered',
    metric: 'count',
    unit: '次',
    thresholds: [1, 2, 3],
  }
  const tieredActivity: Activity = {
    ...baseActivity,
    goal: tieredGoal,
  }

  it('固定行动与未选择层次的行动显示真实奖励或奖励范围', () => {
    expect(getV5ActionRewardPreview(baseActivity)).toEqual({
      label: '本次 +10 XP · +5 金币',
      coinDelta: 5,
      state: 'available',
    })
    expect(getV5ActionRewardPreview(tieredActivity)).toEqual({
      label: '可得 +6～10 XP · +5 金币',
      coinDelta: 5,
      state: 'available',
    })
  })

  it('已达基础层显示剩余 XP 范围，最高层显示本日实际所得', () => {
    const completion: Completion = {
      id: 'reward-tiered',
      activityId: tieredActivity.id,
      occurredOn: '2026-07-27',
      status: 'active',
      tier: 1,
      tierGoalSnapshot: tieredGoal,
      difficultySnapshot: '普通',
      createdAt: '2026-07-27T08:00:00.000Z',
    }
    expect(getV5ActionRewardPreview(tieredActivity, completion)).toEqual({
      label: '升级可再得 +2～4 XP · 金币已领取',
      coinDelta: 0,
      state: 'upgrade',
    })
    expect(getV5ActionRewardPreview(tieredActivity, { ...completion, tier: 3 })).toEqual({
      label: '今日已获 +10 XP · +5 金币',
      coinDelta: 0,
      state: 'earned',
    })
  })

  it('每周逐次累计显示下一奖励条件和本周封顶奖励', () => {
    const goal: Extract<Activity['goal'], { kind: 'tiered'; metric: 'count' }> = {
      kind: 'tiered',
      metric: 'count',
      unit: '次',
      thresholds: [1, 3, 5],
      progressMode: 'incremental',
    }
    const weekly: Activity = {
      ...baseActivity,
      id: 'weekly-progress',
      goal,
      schedule: { kind: 'weekly', times: 3 },
    }
    const progressCompletion: Completion = {
      id: 'weekly-progress-1',
      activityId: weekly.id,
      occurredOn: '2026-07-27',
      status: 'active',
      tierGoalSnapshot: goal,
      difficultySnapshot: '普通',
      progress: {
        mode: 'weekly_incremental',
        cycleStart: '2026-07-27',
        countDelta: 1,
        sequence: 1,
        requestId: 'weekly-progress-request-1',
      },
      createdAt: '2026-07-27T08:00:00.000Z',
    }

    expect(getV5WeeklyRewardPreview(weekly, [], '2026-07-27')).toEqual({
      label: '本次可解锁 +6 XP · +5 金币',
      coinDelta: 5,
      state: 'unlock',
    })
    expect(getV5WeeklyRewardPreview(weekly, [progressCompletion], '2026-07-27')).toEqual({
      label: '再记录 2次可解锁 +2 XP · 金币已领取',
      coinDelta: 0,
      state: 'unlock',
    })
    expect(getV5WeeklyRewardPreview(weekly, [{
      ...progressCompletion,
      id: 'weekly-progress-max',
      progress: { ...progressCompletion.progress!, countDelta: 5 },
    }], '2026-07-27')).toEqual({
      label: '本周已获 +10 XP · +5 金币',
      coinDelta: 0,
      state: 'earned',
    })
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

describe('V5 今日收获', () => {
  it('只汇总当日仍有效且实际发奖的行动', () => {
    const summary = getV5DailyRewardSummary([
      journeyMonth('2026-07', [
        journeyEntry('first', '2026-07-27', '晨间行动', 5),
        { ...journeyEntry('upgrade', '2026-07-27', '分层升级', 4), coins: 0 },
        journeyEntry('other-day', '2026-07-26', '昨日行动', 10),
        {
          id: 'milestone',
          kind: 'level',
          occurredOn: '2026-07-27',
          createdAt: '2026-07-27T09:00:00.000Z',
          title: '达到 Lv.2',
          xp: 0,
          coins: 0,
          level: 2,
        },
      ]),
    ], '2026-07-27')

    expect(summary).toEqual({ xp: 9, coins: 2, actionCount: 2 })
  })

  it('顶部展示今日净奖励，重点行动连接主愿望推进', () => {
    const markup = renderToStaticMarkup(createElement(V5TodayPage, {
      today: '2026-07-27',
      stats: {
        totalXp: 0,
        coins: 0,
        domainXp: { health: 0, learning: 0, creation: 0, career: 0, life: 0, mindset: 0 },
      },
      level: getLevel(0),
      keyActivities: [baseActivity],
      dailyHabits: [],
      weeklyHabits: [],
      tasks: [],
      completions: [],
      todayPriorityIds: [],
      dailyRewardSummary: { xp: 5, coins: 2, actionCount: 1 },
      activeRewardGoal: { title: '一次真实愿望', cost: 30 },
      feedback: null,
      activeCompletion: () => undefined,
      coachPlanLabel: '规划一个 28 天目标',
      onComplete: () => undefined,
      onCompleteTier: () => undefined,
      onCompleted: () => undefined,
      onWeeklyDetails: () => undefined,
      onCreate: () => undefined,
      onUndo: () => undefined,
      onOpenSeason: () => undefined,
      onRecordDailySignal: () => undefined,
      onEditRating: () => undefined,
      onOpenCoach: () => undefined,
      onSetTodayPriority: async () => undefined,
    }))

    expect(markup).toContain('今日 +5 XP · +2 金币')
    expect(markup).toContain('已达标 1 项')
    expect(markup).toContain('完成后「一次真实愿望」5/30 金币')
  })
})

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
    expect(markup).toContain('完成下一份成长报告后选择')
    expect(markup.indexOf('下一奖励')).toBeLessThan(markup.indexOf('六个成长领域'))
    expect(markup).not.toContain('总成长')
    expect(markup).not.toContain('当前持有')
    expect(markup).not.toContain('当前阶段')
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

describe('V5 两阶段完成反馈', () => {
  const feedback: V5FeedbackView = {
    completionId: 'completion-1',
    activityId: 'night-close',
    title: '夜间收尾',
    domain: 'life',
    xp: 5,
    coins: 2,
    level: getLevel(75),
  }

  it('先展示奖励，再收缩为可撤销的记录确认', () => {
    expect(getV5FeedbackDisplay(feedback, false)).toMatchObject({
      showFollowUp: false,
      title: '夜间收尾',
      detail: '生活',
    })
    expect(getV5FeedbackDisplay(feedback, true)).toMatchObject({
      showFollowUp: false,
      title: '本次行动已记录',
      detail: '可在 10 秒内撤销',
    })
  })

  it('夜间收尾存在后续动作时收缩为今日状态入口', () => {
    expect(getV5FeedbackDisplay({
      ...feedback,
      followUp: { kind: 'daily-signal', seasonId: 'season-1' },
    }, true)).toEqual({
      showFollowUp: true,
      title: '今日闭环还差一步',
      detail: '约 15 秒记录今日状态',
    })
  })
})
