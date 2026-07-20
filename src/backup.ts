import { z } from 'zod'
import { ActivitySchema, CompletionSchema, LedgerEventSchema, RewardSchema, SettingSchema, WeeklyReviewSchema, calculateStats, createLevelSystem, getGameDayActivation } from './domain'
import { db, getSnapshot, type LifeRpgDatabase } from './db'

const SummarySchema = z.object({ totalXp: z.number().int(), coins: z.number().int() })

export const BackupSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    appVersion: z.union([z.literal('2.0.0'), z.literal('2.1.0'), z.literal('2.2.0'), z.literal('2.3.0'), z.literal('2.4.0'), z.literal('2.5.0'), z.literal('2.6.0'), z.literal('2.7.0')]),
    exportedAt: z.string().datetime(),
    summary: SummarySchema,
    activities: z.array(ActivitySchema),
    completions: z.array(CompletionSchema),
    ledgerEvents: z.array(LedgerEventSchema),
    rewards: z.array(RewardSchema),
    weeklyReviews: z.array(WeeklyReviewSchema),
    settings: z.array(SettingSchema),
  })
  .superRefine((backup, context) => {
    const compatibleAppVersions: Record<number, readonly string[]> = {
      1: ['2.0.0'],
      2: ['2.1.0'],
      3: ['2.2.0'],
      4: ['2.3.0', '2.4.0'],
      5: ['2.5.0', '2.6.0', '2.7.0'],
    }
    if (!compatibleAppVersions[backup.schemaVersion].includes(backup.appVersion)) {
      context.addIssue({ code: 'custom', path: ['schemaVersion'], message: '备份结构版本与应用版本不匹配' })
    }
    for (const [name, rows] of [
      ['activities', backup.activities],
      ['completions', backup.completions],
      ['ledgerEvents', backup.ledgerEvents],
      ['rewards', backup.rewards],
      ['weeklyReviews', backup.weeklyReviews],
      ['settings', backup.settings],
    ] as const) {
      const keys = rows.map((row) => ('id' in row ? row.id : row.key))
      if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', path: [name], message: `${name} 存在重复主键` })
    }
    const completedTaskIds = new Set(backup.completions.filter((completion) => completion.status === 'active').map((completion) => completion.activityId))
    const keyCount = backup.activities.filter((activity) => activity.enabled && activity.isKey && (activity.type === 'habit' || !completedTaskIds.has(activity.id))).length
    if (keyCount > 3) context.addIssue({ code: 'custom', path: ['activities'], message: '活动关键行为超过 3 项' })
    const meta = backup.settings.find((setting) => setting.key === 'meta')
    const targetRewardId = meta?.key === 'meta' ? meta.value.targetRewardId : undefined
    if (targetRewardId && !backup.rewards.some((reward) => reward.id === targetRewardId && reward.enabled)) {
      context.addIssue({ code: 'custom', path: ['settings'], message: '当前奖励目标不存在或已停用' })
    }
    const stats = calculateStats(backup.ledgerEvents)
    if (stats.totalXp !== backup.summary.totalXp || stats.coins !== backup.summary.coins) {
      context.addIssue({ code: 'custom', path: ['summary'], message: '备份汇总与账本不一致' })
    }
  })

export type Backup = z.infer<typeof BackupSchema>

export async function createBackup(database: LifeRpgDatabase = db): Promise<Backup> {
  const snapshot = await getSnapshot(database)
  const stats = calculateStats(snapshot.ledgerEvents)
  return BackupSchema.parse({
    schemaVersion: 5,
    appVersion: '2.7.0',
    exportedAt: new Date().toISOString(),
    summary: { totalXp: stats.totalXp, coins: stats.coins },
    ...snapshot,
  })
}

export async function restoreBackup(input: unknown, database: LifeRpgDatabase = db) {
  const backup = BackupSchema.parse(input)
  const currentMeta = await database.settings.get('meta')
  const deviceGameDayActivation = currentMeta?.key === 'meta' ? currentMeta.value.gameDayBoundaryActivatedAt : undefined
  const meta = backup.settings.find((setting) => setting.key === 'meta')
  const settings = meta?.key === 'meta'
    ? backup.settings.map((setting) => setting.key === 'meta'
      ? {
          ...setting,
          value: {
            ...setting.value,
            levelSystem: setting.value.levelSystem ?? createLevelSystem(backup.summary.totalXp),
            gameDayBoundaryActivatedAt: deviceGameDayActivation ?? setting.value.gameDayBoundaryActivatedAt ?? getGameDayActivation(),
          },
        }
      : setting)
    : [...backup.settings, { key: 'meta' as const, value: { levelSystem: createLevelSystem(backup.summary.totalXp), gameDayBoundaryActivatedAt: deviceGameDayActivation ?? getGameDayActivation() } }]
  await database.transaction(
    'rw',
    [
      database.activities,
      database.completions,
      database.ledgerEvents,
      database.rewards,
      database.weeklyReviews,
      database.settings,
    ],
    async () => {
      await Promise.all([
        database.activities.clear(),
        database.completions.clear(),
        database.ledgerEvents.clear(),
        database.rewards.clear(),
        database.weeklyReviews.clear(),
        database.settings.clear(),
      ])
      await database.activities.bulkAdd(backup.activities)
      await database.completions.bulkAdd(backup.completions)
      await database.ledgerEvents.bulkAdd(backup.ledgerEvents)
      await database.rewards.bulkAdd(backup.rewards)
      await database.weeklyReviews.bulkAdd(backup.weeklyReviews)
      await database.settings.bulkAdd(settings)
    },
  )
  return backup
}

export async function createLedgerMarkdown(database: LifeRpgDatabase = db) {
  const { ledgerEvents } = await getSnapshot(database)
  const stats = calculateStats(ledgerEvents)
  const rows = [...ledgerEvents]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(
      (event) =>
        `| ${event.occurredOn} | ${event.kind} | ${event.title.replaceAll('|', '\\|')} | ${event.attribute ?? '-'} | ${event.xpDelta} | ${event.coinDelta} |`,
    )
  return [
    '# 地球 Online 账本导出',
    '',
    `- 导出时间：${new Date().toISOString()}`,
    `- 总经验：${stats.totalXp}`,
    `- 金币余额：${stats.coins}`,
    '',
    '| 日期 | 类型 | 标题 | 属性 | XP | 金币 |',
    '|---|---|---|---|---:|---:|',
    ...rows,
    '',
  ].join('\n')
}
