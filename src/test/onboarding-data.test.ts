import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBackup, restoreBackup } from '../backup'
import {
  LifeRpgDatabase,
  archiveActivity,
  createActivity,
  createFirstOnboardingActivity,
  createFirstOnboardingConfiguredActivity,
  ensureGrowthDomainsForEmptyDatabase,
  initializeDatabase,
  permanentlyDeleteActivity,
  updateOnboardingMarkers,
} from '../db'
import { OnboardingStateSchema, getOnboardingSummary, type Completion } from '../domain'

let database: LifeRpgDatabase

beforeEach(async () => {
  database = new LifeRpgDatabase(`onboarding-data-${crypto.randomUUID()}`)
  await initializeDatabase(database)
})

afterEach(async () => {
  database.close()
  await database.delete()
})

describe('新手体验数据层', () => {
  it('支持安装提示先于首项行动保存，并要求开始字段成对出现', () => {
    expect(OnboardingStateSchema.parse({ installHintDismissedAt: '2026-08-17T08:00:00.000Z' })).toBeTruthy()
    expect(() => OnboardingStateSchema.parse({ startedOn: '2026-08-17' })).toThrow('必须同时保存')
  })

  it('只为空库启用成长领域', async () => {
    expect(await ensureGrowthDomainsForEmptyDatabase(database, new Date('2026-08-17T08:00:00.000Z'), '5.7.0')).toBe(true)
    expect(await ensureGrowthDomainsForEmptyDatabase(database)).toBe(false)
    const meta = await database.settings.get('meta')
    expect(meta?.key === 'meta' ? meta.value.growthDomainSystem : undefined).toEqual({
      version: 1,
      activatedAt: '2026-08-17T08:00:00.000Z',
    })
    expect(meta?.key === 'meta' ? meta.value.releaseNotes : undefined).toEqual({
      lastSeenVersion: '5.7.0',
      acknowledgedAt: '2026-08-17T08:00:00.000Z',
    })
  })

  it('已有系统初始化但仍为空库时补齐当前版本基线', async () => {
    await ensureGrowthDomainsForEmptyDatabase(database, new Date('2026-08-17T08:00:00.000Z'))
    expect(await ensureGrowthDomainsForEmptyDatabase(database, new Date('2026-08-18T08:00:00.000Z'), '5.7.0')).toBe(false)
    const meta = await database.settings.get('meta')
    expect(meta?.key === 'meta' ? meta.value.releaseNotes : undefined).toEqual({
      lastSeenVersion: '5.7.0',
      acknowledgedAt: '2026-08-18T08:00:00.000Z',
    })
  })

  it('存在历史记录但活动定义为空时不按全新数据库处理', async () => {
    await database.completions.add({
      id: 'history-only',
      activityId: 'removed-activity',
      occurredOn: '2026-08-16',
      status: 'active',
      createdAt: '2026-08-16T08:00:00.000Z',
    })
    expect(await ensureGrowthDomainsForEmptyDatabase(database)).toBe(false)
    const meta = await database.settings.get('meta')
    expect(meta?.key === 'meta' ? meta.value.growthDomainSystem : undefined).toBeUndefined()
    await expect(createFirstOnboardingActivity({ title: '不应创建', domain: 'health' }, database))
      .rejects.toThrow('没有既有成长数据')
    expect(await database.activities.count()).toBe(0)
  })

  it('只保留愿望的旧库也不会进入新手流程', async () => {
    await database.rewards.add({
      id: 'existing-reward',
      title: '一次现实奖励',
      cost: 30,
      enabled: true,
      createdAt: '2026-08-16T08:00:00.000Z',
    })
    expect(await ensureGrowthDomainsForEmptyDatabase(database)).toBe(false)
    await expect(createFirstOnboardingActivity({ title: '不应创建', domain: 'health' }, database))
      .rejects.toThrow('没有既有成长数据')
  })

  it('快速创建固定首项行动并保持重复请求幂等', async () => {
    await updateOnboardingMarkers({ installHintDismissedAt: '2026-08-17T07:00:00.000Z' }, database)
    const first = await createFirstOnboardingActivity(
      { title: '每天整理桌面', domain: 'life' },
      database,
      new Date(2026, 7, 17, 8, 0),
    )
    expect(first).toMatchObject({
      created: true,
      activity: {
        title: '每天整理桌面',
        domain: 'life',
        type: 'habit',
        difficulty: '简单',
        goal: { count: 1, unit: '次' },
        schedule: { kind: 'daily' },
        isKey: true,
      },
      onboarding: { startedOn: '2026-08-17', installHintDismissedAt: '2026-08-17T07:00:00.000Z' },
    })
    const duplicate = await createFirstOnboardingActivity({ title: '不会重复创建', domain: 'health' }, database)
    expect(duplicate).toMatchObject({ created: false, activity: { id: first.activity.id } })
    expect(await database.activities.count()).toBe(1)
  })

  it('完整设置创建与体验启动属于同一事务', async () => {
    const result = await createFirstOnboardingConfiguredActivity({
      title: '晚间复盘',
      scheduledTime: '22:30',
      cue: '准备休息前',
      protocol: '写下今天最有效的一项行动。',
      type: 'habit',
      domain: 'mindset',
      difficulty: '普通',
      goal: { kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '分钟', thresholds: [180, 600] },
      schedule: { kind: 'daily' },
      isKey: true,
      enabled: true,
    }, database, new Date(2026, 7, 17, 22, 30))
    expect(result).toMatchObject({
      created: true,
      activity: { title: '晚间复盘', scheduledTime: '22:30', domain: 'mindset', difficulty: '普通' },
      onboarding: { startedOn: '2026-08-17' },
    })
    expect(result.onboarding.primaryActivityId).toBe(result.activity.id)

    const brokenDatabase = new LifeRpgDatabase(`onboarding-existing-${crypto.randomUUID()}`)
    try {
      await initializeDatabase(brokenDatabase)
      const existing = await createActivity({
        title: '已有行动', type: 'habit', domain: 'health', difficulty: '简单', goal: { count: 1, unit: '次' },
        schedule: { kind: 'daily' }, isKey: false, enabled: true,
      }, brokenDatabase)
      await expect(createFirstOnboardingConfiguredActivity({
        title: '不应创建', type: 'habit', domain: 'learning', difficulty: '简单', goal: { count: 1, unit: '次' },
        schedule: { kind: 'daily' }, isKey: true, enabled: true,
      }, brokenDatabase)).rejects.toThrow('没有既有成长数据')
      expect(await brokenDatabase.activities.toArray()).toEqual([existing])
      const meta = await brokenDatabase.settings.get('meta')
      expect(meta?.key === 'meta' ? meta.value.onboarding : undefined).toBeUndefined()
    } finally {
      brokenDatabase.close()
      await brokenDatabase.delete()
    }
  })

  it('永久删除首项行动会解除失效引用并保留安装标记', async () => {
    const created = await createFirstOnboardingActivity(
      { title: '整理桌面', domain: 'life' },
      database,
      new Date(2026, 7, 17, 8),
    )
    await updateOnboardingMarkers({ installHintDismissedAt: '2026-08-17T08:10:00.000Z' }, database)
    await archiveActivity(created.activity.id, database)
    expect(await permanentlyDeleteActivity(created.activity.id, '2026-08-17', database)).toBe(true)
    const meta = await database.settings.get('meta')
    expect(meta?.key === 'meta' ? meta.value.onboarding : undefined).toEqual({
      installHintDismissedAt: '2026-08-17T08:10:00.000Z',
    })
    expect(await createActivity({
      title: '重新开始', type: 'habit', domain: 'health', difficulty: '简单', goal: { count: 1, unit: '次' },
      schedule: { kind: 'daily' }, isKey: true, enabled: true,
    }, database)).toMatchObject({ title: '重新开始' })
  })

  it('按凌晨四点游戏日统计七日窗口内的有效完成', () => {
    const completion = (id: string, activityId: string, occurredOn: string, status: Completion['status'] = 'active'): Completion => ({
      id, activityId, occurredOn, status, createdAt: `${occurredOn}T08:00:00.000Z`,
    })
    const onboarding = { startedOn: '2026-07-20', primaryActivityId: 'primary' }
    const completions = [
      completion('c1', 'primary', '2026-07-20'),
      completion('c2', 'primary', '2026-07-20'),
      completion('c3', 'other', '2026-07-21'),
      completion('c4', 'primary', '2026-07-22', 'undone'),
      completion('c5', 'primary', '2026-07-27'),
    ]
    expect(getOnboardingSummary(onboarding, completions, new Date(2026, 6, 23, 3, 59))).toEqual({
      currentDay: 3,
      activeDays: 2,
      primaryCompletionDays: 1,
    })
    expect(getOnboardingSummary(onboarding, completions, new Date(2026, 6, 27, 12))).toEqual({
      currentDay: 8,
      activeDays: 2,
      primaryCompletionDays: 1,
    })
    expect(getOnboardingSummary(onboarding, completions, '2026-07-20')).toEqual({
      currentDay: 1,
      activeDays: 1,
      primaryCompletionDays: 1,
    })
  })

  it('schema 12 完整备份会往返保留新手体验状态', async () => {
    const created = await createFirstOnboardingActivity(
      { title: '阅读十分钟', domain: 'learning' },
      database,
      new Date(2026, 7, 17, 8),
    )
    await updateOnboardingMarkers({
      installHintDismissedAt: '2026-08-17T08:10:00.000Z',
      feedbackPromptedAt: '2026-08-23T08:00:00.000Z',
    }, database)
    const backup = await createBackup(database)
    const restored = new LifeRpgDatabase(`onboarding-restore-${crypto.randomUUID()}`)
    try {
      await initializeDatabase(restored)
      await restoreBackup(backup, restored)
      const meta = await restored.settings.get('meta')
      expect(meta?.key === 'meta' ? meta.value.onboarding : undefined).toEqual({
        startedOn: '2026-08-17',
        primaryActivityId: created.activity.id,
        installHintDismissedAt: '2026-08-17T08:10:00.000Z',
        feedbackPromptedAt: '2026-08-23T08:00:00.000Z',
      })
    } finally {
      restored.close()
      await restored.delete()
    }
  })
})
