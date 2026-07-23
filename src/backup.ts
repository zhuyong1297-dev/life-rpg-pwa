import { z } from 'zod'
import {
  ActivitySchema,
  CompletionSchema,
  LedgerEventSchema,
  RewardClaimSchema,
  RewardSchema,
  RewardSystemSchema,
  SettingSchema,
  WeeklyReviewSchema,
  calculateStats,
  createLevelSystem,
  gameDate,
  getGameDayActivation,
} from './domain'
import { db, getSnapshot, type LifeRpgDatabase } from './db'
import { SeasonSchema } from './season'

const SummarySchema = z.object({ totalXp: z.number().int(), coins: z.number().int() })

export const BackupSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10), z.literal(11)]),
    appVersion: z.union([z.literal('2.0.0'), z.literal('2.1.0'), z.literal('2.2.0'), z.literal('2.3.0'), z.literal('2.4.0'), z.literal('2.5.0'), z.literal('2.6.0'), z.literal('2.7.0'), z.literal('3.2.0'), z.literal('3.2.1'), z.literal('4.0.0'), z.literal('4.0.1'), z.literal('4.0.2'), z.literal('4.1.0'), z.literal('4.2.0'), z.literal('4.3.0'), z.literal('4.4.0'), z.literal('4.5.0')]),
    exportedAt: z.string().datetime(),
    summary: SummarySchema,
    activities: z.array(ActivitySchema),
    completions: z.array(CompletionSchema),
    ledgerEvents: z.array(LedgerEventSchema),
    rewards: z.array(RewardSchema),
    rewardClaims: z.array(RewardClaimSchema).default([]),
    weeklyReviews: z.array(WeeklyReviewSchema),
    seasons: z.array(SeasonSchema).default([]),
    settings: z.array(SettingSchema),
  })
  .superRefine((backup, context) => {
    const compatibleAppVersions: Record<number, readonly string[]> = {
      1: ['2.0.0'],
      2: ['2.1.0'],
      3: ['2.2.0'],
      4: ['2.3.0', '2.4.0'],
      5: ['2.5.0', '2.6.0', '2.7.0'],
      6: ['3.2.0', '3.2.1'],
      7: ['4.0.0', '4.0.1', '4.0.2'],
      8: ['4.1.0'],
      9: ['4.2.0', '4.3.0'],
      10: ['4.4.0'],
      11: ['4.5.0'],
    }
    if (!compatibleAppVersions[backup.schemaVersion].includes(backup.appVersion)) {
      context.addIssue({ code: 'custom', path: ['schemaVersion'], message: '备份结构版本与应用版本不匹配' })
    }
    for (const [name, rows] of [
      ['activities', backup.activities],
      ['completions', backup.completions],
      ['ledgerEvents', backup.ledgerEvents],
      ['rewards', backup.rewards],
      ['rewardClaims', backup.rewardClaims],
      ['weeklyReviews', backup.weeklyReviews],
      ['seasons', backup.seasons],
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
    const rewardSystem = backup.settings.find((setting) => setting.key === 'rewardSystem')
    if (rewardSystem?.key === 'rewardSystem') {
      const rewardIds = [rewardSystem.value.activeRewardId, ...rewardSystem.value.queueIds].filter(Boolean)
      if (rewardIds.some((id) => !backup.rewards.some((reward) => reward.id === id && reward.enabled))) {
        context.addIssue({ code: 'custom', path: ['settings'], message: '奖励目标或候选队列包含不存在或已停用的愿望' })
      }
    }
    if (backup.seasons.filter((season) => season.status === 'active').length > 1) {
      context.addIssue({ code: 'custom', path: ['seasons'], message: '备份中只能存在一个进行中的成长赛季' })
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
    schemaVersion: 11,
    appVersion: '4.5.0',
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
  let settings = meta?.key === 'meta'
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
  if (!settings.some((setting) => setting.key === 'rewardSystem')) {
    const legacyTarget = meta?.key === 'meta' ? meta.value.targetRewardId : undefined
    settings = [
      ...settings,
      {
        key: 'rewardSystem' as const,
        value: RewardSystemSchema.parse({
          version: 1,
          activatedAt: new Date().toISOString(),
          activeRewardId: legacyTarget && backup.rewards.some((reward) => reward.id === legacyTarget && reward.enabled)
            ? legacyTarget
            : undefined,
          queueIds: [],
          monthlyAllowanceCents: 40_000,
          maxFundCents: 120_000,
          availableCents: 40_000,
          lastFundedMonth: gameDate().slice(0, 7),
        }),
      },
    ]
  }
  await database.transaction(
    'rw',
    [
      database.activities,
      database.completions,
      database.ledgerEvents,
      database.rewards,
      database.rewardClaims,
      database.weeklyReviews,
      database.seasons,
      database.settings,
    ],
    async () => {
      await Promise.all([
        database.activities.clear(),
        database.completions.clear(),
        database.ledgerEvents.clear(),
        database.rewards.clear(),
        database.rewardClaims.clear(),
        database.weeklyReviews.clear(),
        database.seasons.clear(),
        database.settings.clear(),
      ])
      await database.activities.bulkAdd(backup.activities)
      await database.completions.bulkAdd(backup.completions)
      await database.ledgerEvents.bulkAdd(backup.ledgerEvents)
      await database.rewards.bulkAdd(backup.rewards)
      await database.rewardClaims.bulkAdd(backup.rewardClaims)
      await database.weeklyReviews.bulkAdd(backup.weeklyReviews)
      await database.seasons.bulkAdd(backup.seasons)
      await database.settings.bulkAdd(settings)
    },
  )
  return backup
}

export async function createLedgerMarkdown(database: LifeRpgDatabase = db) {
  const { ledgerEvents, rewardClaims } = await getSnapshot(database)
  const stats = calculateStats(ledgerEvents)
  const rows = [...ledgerEvents]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(
      (event) =>
        `| ${event.occurredOn} | ${event.kind} | ${event.title.replaceAll('|', '\\|')} | ${event.domain ?? event.attribute ?? '-'} | ${event.xpDelta} | ${event.coinDelta} |`,
    )
  const claimRows = [...rewardClaims]
    .sort((a, b) => b.reservedAt.localeCompare(a.reservedAt))
    .map((claim) => `| ${claim.reservedOn} | ${claim.titleSnapshot.replaceAll('|', '\\|')} | ${claim.status} | ${claim.plannedFor} | ${claim.coinCostSnapshot} | ¥${(claim.cashCostCentsSnapshot / 100).toFixed(2)} |`)
  return [
    '# 地球 Online 账本导出',
    '',
    `- 导出时间：${new Date().toISOString()}`,
    `- 总经验：${stats.totalXp}`,
    `- 金币余额：${stats.coins}`,
    '',
    '| 日期 | 类型 | 标题 | 成长领域 | XP | 金币 |',
    '|---|---|---|---|---:|---:|',
    ...rows,
    '',
    '## 奖励券',
    '',
    '| 锁定日期 | 愿望 | 状态 | 计划兑现 | 金币 | 预留预算 |',
    '|---|---|---|---|---:|---:|',
    ...claimRows,
    '',
  ].join('\n')
}
