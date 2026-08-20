import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBackup, restoreBackup } from '../backup'
import {
  LifeRpgDatabase,
  createActivity,
  initializeDatabase,
  updateHabit,
  updateTravelerAppearance,
  type NewActivity,
} from '../db'
import {
  ActivitySchema,
  MetaSchema,
  getHabitFormationReview,
  type Activity,
  type Completion,
} from '../domain'

let database: LifeRpgDatabase

const dailyHabit: NewActivity = {
  title: '示例习惯',
  type: 'habit',
  domain: 'life',
  difficulty: '简单',
  goal: { count: 1, unit: '次' },
  schedule: { kind: 'daily' },
  isKey: false,
  enabled: true,
}

function updateInput(activity: Activity, habitFormation: Activity['habitFormation']) {
  return {
    title: activity.title,
    scheduledTime: activity.scheduledTime,
    cue: activity.cue,
    protocol: activity.protocol,
    habitFormation,
    domain: activity.domain,
    difficulty: activity.difficulty,
    schedule: activity.schedule,
    goal: activity.goal,
    isKey: activity.isKey,
  }
}

beforeEach(async () => {
  database = new LifeRpgDatabase(`habit-formation-${crypto.randomUUID()}`)
  await initializeDatabase(database)
})

afterEach(async () => {
  database.close()
  await database.delete()
})

describe('旅者外观兼容', () => {
  it('旧 Meta 不要求外观字段，选择后可随 schema 12 备份恢复', async () => {
    expect(MetaSchema.parse({}).travelerAppearance).toBeUndefined()
    await updateTravelerAppearance('feminine', database)
    const backup = await createBackup(database)
    expect(backup.settings.find((item) => item.key === 'meta')?.value).toMatchObject({ travelerAppearance: 'feminine' })

    const restored = new LifeRpgDatabase(`habit-formation-restore-${crypto.randomUUID()}`)
    await initializeDatabase(restored)
    await restoreBackup(backup, restored)
    expect((await restored.settings.get('meta'))?.value).toMatchObject({ travelerAppearance: 'feminine' })
    restored.close()
    await restored.delete()
  })
})

describe('习惯启动锚点', () => {
  it('只允许每日习惯保存启动锚点', () => {
    expect(() => ActivitySchema.parse({
      ...dailyHabit,
      id: 'weekly-anchor',
      createdAt: '2026-08-20T08:00:00.000Z',
      schedule: { kind: 'weekly', times: 3 },
      habitFormation: { configuredAt: '2026-08-20T08:00:00.000Z', anchor: { kind: 'event', label: '午饭后' } },
    })).toThrow('启动锚点只适用于每日习惯')
  })

  it('允许行动链，但原子拒绝自引用与多级循环', async () => {
    const first = await createActivity({ ...dailyHabit, title: '第一项' }, database)
    const second = await createActivity({
      ...dailyHabit,
      title: '第二项',
      habitFormation: {
        configuredAt: '2026-08-20T08:00:00.000Z',
        anchor: { kind: 'after_activity', activityId: first.id, titleSnapshot: first.title },
      },
    }, database)
    const third = await createActivity({
      ...dailyHabit,
      title: '第三项',
      habitFormation: {
        configuredAt: '2026-08-20T08:00:00.000Z',
        anchor: { kind: 'after_activity', activityId: second.id, titleSnapshot: second.title },
      },
    }, database)

    await expect(updateHabit(first.id, updateInput(first, {
      configuredAt: '2026-08-20T08:00:00.000Z',
      anchor: { kind: 'after_activity', activityId: first.id, titleSnapshot: first.title },
    }), database)).rejects.toThrow('不能形成循环')
    await expect(updateHabit(first.id, updateInput(first, {
      configuredAt: '2026-08-20T08:00:00.000Z',
      anchor: { kind: 'after_activity', activityId: third.id, titleSnapshot: third.title },
    }), database)).rejects.toThrow('不能形成循环')

    expect((await database.activities.get(first.id))?.habitFormation).toBeUndefined()
  })

  it('七个游戏日结束后仅在坚持率低于 60% 时给出建议', () => {
    const activity = ActivitySchema.parse({
      ...dailyHabit,
      id: 'review-anchor',
      createdAt: '2026-08-20T08:00:00.000Z',
      habitFormation: {
        configuredAt: '2026-08-20T08:00:00.000Z',
        anchor: { kind: 'time', time: '07:30' },
      },
    })
    const completions = (count: number): Completion[] => Array.from({ length: count }, (_, index) => ({
      id: `completion-${index}`,
      activityId: activity.id,
      occurredOn: `2026-08-${String(20 + index).padStart(2, '0')}`,
      status: 'active',
      createdAt: `2026-08-${String(20 + index).padStart(2, '0')}T08:00:00.000Z`,
    }))

    expect(getHabitFormationReview(activity, completions(4), '2026-08-25')).toBeUndefined()
    expect(getHabitFormationReview(activity, completions(4), '2026-08-26')).toMatchObject({
      completedDays: 4,
      adherence: 4 / 7,
      anchorLabel: '每天 07:30',
    })
    expect(getHabitFormationReview(activity, completions(5), '2026-08-26')).toBeUndefined()
  })
})
