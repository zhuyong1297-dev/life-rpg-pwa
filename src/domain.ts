import { z } from 'zod'

export const attributes = ['体魄', '智识', '专注', '创造', '关系', '心境'] as const
export const difficulties = ['简单', '普通', '困难', 'Boss'] as const
export const reviewDecisions = ['保留', '调整', '暂停'] as const

export type Attribute = (typeof attributes)[number]
export type Difficulty = (typeof difficulties)[number]
export type ReviewDecision = (typeof reviewDecisions)[number]

export const rewardTable: Record<Difficulty, { xp: number; coins: number }> = {
  简单: { xp: 5, coins: 2 },
  普通: { xp: 10, coins: 5 },
  困难: { xp: 20, coins: 10 },
  Boss: { xp: 50, coins: 25 },
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const dateString = z.string().regex(datePattern, '日期必须使用 YYYY-MM-DD')
const timestamp = z.string().datetime()

export const ScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily') }),
  z.object({ kind: z.literal('weekly'), times: z.number().int().min(1).max(7) }),
  z.object({ kind: z.literal('once') }),
])

export const ActivitySchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(60),
    type: z.enum(['habit', 'task']),
    attribute: z.enum(attributes),
    difficulty: z.enum(difficulties),
    goal: z.object({ count: z.number().positive().max(999), unit: z.string().trim().min(1).max(12) }),
    schedule: ScheduleSchema,
    plannedOn: dateString.optional(),
    isKey: z.boolean(),
    enabled: z.boolean(),
    createdAt: timestamp,
  })
  .superRefine((activity, context) => {
    if (activity.type === 'habit' && activity.schedule.kind === 'once') {
      context.addIssue({ code: 'custom', path: ['schedule'], message: '习惯必须设置每天或每周计划' })
    }
    if (activity.type === 'task' && activity.schedule.kind !== 'once') {
      context.addIssue({ code: 'custom', path: ['schedule'], message: '一次性任务必须使用单次计划' })
    }
  })

export type Activity = z.infer<typeof ActivitySchema>

export const CompletionSchema = z.object({
  id: z.string().min(1),
  activityId: z.string().min(1),
  occurredOn: dateString,
  status: z.enum(['active', 'undone']),
  note: z.string().max(140).optional(),
  createdAt: timestamp,
  undoneAt: timestamp.optional(),
})

export type Completion = z.infer<typeof CompletionSchema>

export const LedgerEventSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['reward', 'correction', 'redemption']),
  sourceId: z.string().min(1),
  occurredOn: dateString,
  title: z.string().min(1).max(80),
  attribute: z.enum(attributes).optional(),
  xpDelta: z.number().int(),
  coinDelta: z.number().int(),
  createdAt: timestamp,
})

export type LedgerEvent = z.infer<typeof LedgerEventSchema>

export const RewardSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  cost: z.number().int().positive(),
  enabled: z.boolean(),
  createdAt: timestamp,
})

export type Reward = z.infer<typeof RewardSchema>

export const ReviewItemSchema = z.object({
  activityId: z.string().min(1),
  adherence: z.number().min(0).max(1),
  completed: z.number().int().nonnegative(),
  planned: z.number().int().positive(),
  impact: z.number().int().min(1).max(5),
  friction: z.number().int().min(1).max(5),
  decision: z.enum(reviewDecisions),
  note: z.string().max(280).optional(),
})

export const WeeklyReviewSchema = z.object({
  id: z.string().min(1),
  weekStart: dateString,
  items: z.array(ReviewItemSchema).max(3),
  createdAt: timestamp,
})

export type WeeklyReview = z.infer<typeof WeeklyReviewSchema>

export const PreferencesSchema = z.object({
  notifications: z.boolean(),
  vibration: z.boolean(),
  sound: z.boolean(),
})

export const MetaSchema = z.object({
  lastBackupAt: timestamp.optional(),
  migrationImportedAt: timestamp.optional(),
})

export const SettingSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('preferences'), value: PreferencesSchema }),
  z.object({ key: z.literal('meta'), value: MetaSchema }),
])

export type Setting = z.infer<typeof SettingSchema>
export type Preferences = z.infer<typeof PreferencesSchema>

export interface CharacterStats {
  totalXp: number
  coins: number
  attributeXp: Record<Attribute, number>
}

export function getLevel(totalXp: number) {
  let level = 1
  let current = Math.max(0, Math.floor(totalXp))
  while (current >= level * 100) {
    current -= level * 100
    level += 1
  }
  const needed = level * 100
  return { level, current, needed, progress: needed === 0 ? 0 : current / needed }
}

export function getCharacterStage(level: number) {
  if (level <= 2) return 1
  if (level <= 5) return 2
  if (level <= 9) return 3
  return 4
}

export function calculateStats(events: LedgerEvent[]): CharacterStats {
  const attributeXp = Object.fromEntries(attributes.map((attribute) => [attribute, 0])) as Record<Attribute, number>
  let totalXp = 0
  let coins = 0
  for (const event of events) {
    totalXp += event.xpDelta
    coins += event.coinDelta
    if (event.attribute) attributeXp[event.attribute] += event.xpDelta
  }
  return { totalXp, coins, attributeXp }
}

export function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function startOfWeek(date = new Date()) {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = value.getDay() || 7
  value.setDate(value.getDate() - day + 1)
  return localDate(value)
}

export function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + amount)
  return localDate(value)
}

export function identityMessage(attribute: Attribute) {
  return `你正在强化${attribute}`
}
