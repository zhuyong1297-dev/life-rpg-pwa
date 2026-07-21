import { z } from 'zod'
import {
  ActivityGoalSchema,
  ScheduleSchema,
  addDays,
  attributes,
  growthDomains,
  difficulties,
  formatTierGoalValue,
  type Activity,
  type Attribute,
  type GrowthDomain,
  type Completion,
  type WeeklyReview,
} from './domain'

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须使用 YYYY-MM-DD')
const timestamp = z.string().datetime()

export const seasonResults = ['达成', '部分达成', '未达成'] as const
export const suggestionKinds = ['adjust', 'pause', 'keep', 'observe'] as const
export const suggestionStatuses = ['pending', 'accepted', 'modified', 'ignored'] as const

export const SeasonActivitySnapshotSchema = z.object({
  activityId: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  cue: z.string().trim().min(1).max(80).optional(),
  protocol: z.string().trim().min(1).max(280).optional(),
  attribute: z.enum(attributes).optional(),
  domain: z.enum(growthDomains).optional(),
  difficulty: z.enum(difficulties),
  goal: ActivityGoalSchema,
  schedule: ScheduleSchema,
}).superRefine((activity, context) => {
  if ((activity.attribute === undefined) === (activity.domain === undefined)) {
    context.addIssue({ code: 'custom', path: ['domain'], message: '赛季活动必须且只能使用一个成长领域体系' })
  }
})

export const CoachSuggestionSchema = z.object({
  id: z.string().min(1),
  weekStart: dateString,
  activityId: z.string().min(1),
  kind: z.enum(suggestionKinds),
  title: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(240),
  expectedBenefit: z.string().trim().min(1).max(180),
  status: z.enum(suggestionStatuses),
  responseNote: z.string().trim().min(1).max(140).optional(),
  createdAt: timestamp,
  respondedAt: timestamp.optional(),
})

export const SeasonDailyPlanSchema = z.object({
  date: dateString,
  activityIds: z.array(z.string().min(1)).min(1).max(3),
})

export const SeasonDailySignalSchema = z.object({
  date: dateString,
  wakeWindowMet: z.boolean(),
  morningEnergy: z.number().int().min(1).max(5),
  control: z.number().int().min(1).max(5),
  recordedAt: timestamp,
})

const SeasonCalibrationSchema = z.object({
  blueprintId: z.literal('stable-life-v1'),
  calibratedOn: dateString,
  calibratedAt: timestamp,
  previous: z.object({
    title: z.string().trim().min(1).max(40),
    successCriterion: z.string().trim().min(1).max(180),
    baseline: z.string().trim().min(1).max(280),
    targetOutcome: z.string().trim().min(1).max(280),
    startsOn: dateString,
    endsOn: dateString,
    focusActivities: z.array(SeasonActivitySnapshotSchema).min(1).max(3),
    dailyPlans: z.array(SeasonDailyPlanSchema),
  }),
})

export const SeasonSchema = z
  .object({
    id: z.string().min(1),
    sourcePlanId: z.string().min(1).optional(),
    title: z.string().trim().min(1).max(40),
    successCriterion: z.string().trim().min(1).max(180),
    baseline: z.string().trim().min(1).max(280),
    targetOutcome: z.string().trim().min(1).max(280),
    startsOn: dateString,
    endsOn: dateString,
    focusActivities: z.array(SeasonActivitySnapshotSchema).min(1).max(3),
    dailyPlans: z.array(SeasonDailyPlanSchema).default([]),
    dailySignals: z.array(SeasonDailySignalSchema).default([]),
    calibration: SeasonCalibrationSchema.optional(),
    suggestions: z.array(CoachSuggestionSchema).default([]),
    status: z.enum(['active', 'completed']),
    finalResult: z.enum(seasonResults).optional(),
    finalEvidence: z.string().trim().min(1).max(500).optional(),
    completedAt: timestamp.optional(),
    createdAt: timestamp,
  })
  .superRefine((season, context) => {
    if (season.endsOn !== addDays(season.startsOn, 27)) {
      context.addIssue({ code: 'custom', path: ['endsOn'], message: '成长赛季必须连续 28 个游戏日' })
    }
    const focusIds = season.focusActivities.map((activity) => activity.activityId)
    if (new Set(focusIds).size !== focusIds.length) {
      context.addIssue({ code: 'custom', path: ['focusActivities'], message: '赛季核心行为不能重复' })
    }
    const planDates = season.dailyPlans.map((plan) => plan.date)
    if (new Set(planDates).size !== planDates.length) {
      context.addIssue({ code: 'custom', path: ['dailyPlans'], message: '同一游戏日只能保存一份今日重点' })
    }
    if (season.dailyPlans.some((plan) => new Set(plan.activityIds).size !== plan.activityIds.length)) {
      context.addIssue({ code: 'custom', path: ['dailyPlans'], message: '今日重点不能重复' })
    }
    if (season.dailyPlans.some((plan) => plan.date < season.startsOn || plan.date > season.endsOn)) {
      context.addIssue({ code: 'custom', path: ['dailyPlans'], message: '今日重点必须位于赛季日期内' })
    }
    const signalDates = season.dailySignals.map((signal) => signal.date)
    if (new Set(signalDates).size !== signalDates.length) {
      context.addIssue({ code: 'custom', path: ['dailySignals'], message: '同一游戏日只能保存一份状态记录' })
    }
    if (season.dailySignals.some((signal) => signal.date < season.startsOn || signal.date > season.endsOn)) {
      context.addIssue({ code: 'custom', path: ['dailySignals'], message: '每日状态必须位于赛季日期内' })
    }
    if (season.suggestions.some((suggestion) => !focusIds.includes(suggestion.activityId))) {
      context.addIssue({ code: 'custom', path: ['suggestions'], message: '成长建议必须对应赛季核心行为' })
    }
    season.suggestions.forEach((suggestion, index) => {
      if (suggestion.status === 'pending' && (suggestion.respondedAt || suggestion.responseNote)) {
        context.addIssue({ code: 'custom', path: ['suggestions', index], message: '待处理建议不能保存响应结果' })
      }
      if (suggestion.status !== 'pending' && !suggestion.respondedAt) {
        context.addIssue({ code: 'custom', path: ['suggestions', index, 'respondedAt'], message: '已处理建议必须保存响应时间' })
      }
      if (suggestion.status === 'modified' && !suggestion.responseNote) {
        context.addIssue({ code: 'custom', path: ['suggestions', index, 'responseNote'], message: '修改后接受必须说明调整' })
      }
    })
    const completionFields = [season.finalResult, season.finalEvidence, season.completedAt]
    if (season.status === 'completed' && completionFields.some((value) => value === undefined)) {
      context.addIssue({ code: 'custom', path: ['finalResult'], message: '结束赛季必须记录结果和现实证据' })
    }
    if (season.status === 'active' && completionFields.some((value) => value !== undefined)) {
      context.addIssue({ code: 'custom', path: ['finalResult'], message: '进行中的赛季不能保存结束结果' })
    }
  })

export type Season = z.infer<typeof SeasonSchema>
export type SeasonResult = (typeof seasonResults)[number]
export type CoachSuggestion = z.infer<typeof CoachSuggestionSchema>
export type SuggestionStatus = (typeof suggestionStatuses)[number]
export type SeasonDailySignal = z.infer<typeof SeasonDailySignalSchema>

function titleForSuggestion(kind: CoachSuggestion['kind'], title: string) {
  if (kind === 'adjust') return `降低「${title}」的执行阻力`
  if (kind === 'pause') return `重新评估「${title}」`
  if (kind === 'keep') return `保持「${title}」的有效节奏`
  return `继续观察「${title}」`
}

export function generateCoachSuggestions(
  season: Season,
  review: WeeklyReview,
  previousReviews: WeeklyReview[],
  createdAt = new Date().toISOString(),
) {
  const previous = [...previousReviews]
    .filter((item) => item.weekStart < review.weekStart)
    .sort((left, right) => right.weekStart.localeCompare(left.weekStart))[0]
  return season.focusActivities.flatMap((activity) => {
    const current = review.items.find((item) => item.activityId === activity.activityId)
    if (!current) return []
    const prior = previous?.items.find((item) => item.activityId === activity.activityId)
    let kind: CoachSuggestion['kind'] = 'observe'
    let reason = `本周坚持率 ${Math.round(current.adherence * 100)}%，现实帮助 ${current.impact}/5，执行阻力 ${current.friction}/5。`
    let expectedBenefit = '再积累一周数据，避免因为短期波动频繁调整。'
    if (current.impact <= 2) {
      kind = 'pause'
      expectedBenefit = '把注意力让给更可能产生现实帮助的行为。'
    } else if (current.impact >= 4 && (current.adherence < 0.6 || current.friction >= 4)) {
      kind = 'adjust'
      expectedBenefit = '保留行为价值，同时缩小基础层、减少频率或调整执行时机。'
    } else if (
      prior &&
      current.impact >= 4 && current.adherence >= 0.85 && current.friction <= 2 &&
      prior.impact >= 4 && prior.adherence >= 0.85 && prior.friction <= 2
    ) {
      kind = 'keep'
      reason += ' 这一状态已经连续保持两周。'
      expectedBenefit = '维持已经有效的节奏；想尝试更高层次时也不提高奖励倍率。'
    }
    return [CoachSuggestionSchema.parse({
      id: `suggestion:${season.id}:${review.weekStart}:${activity.activityId}`,
      weekStart: review.weekStart,
      activityId: activity.activityId,
      kind,
      title: titleForSuggestion(kind, activity.title),
      reason,
      expectedBenefit,
      status: 'pending',
      createdAt,
    })]
  }).slice(0, 3)
}

export function getSeasonDay(season: Season, today: string) {
  const start = new Date(`${season.startsOn}T12:00:00`)
  const current = new Date(`${today}T12:00:00`)
  const elapsed = Math.floor((current.getTime() - start.getTime()) / 86_400_000)
  return Math.min(28, Math.max(1, elapsed + 1))
}

export function getSeasonDailyActivityIds(season: Season, today: string) {
  return season.dailyPlans.find((plan) => plan.date === today)?.activityIds
    ?? season.focusActivities.map((activity) => activity.activityId)
}

export function canCalibrateSeason(season: Season, today: string) {
  return season.status === 'active'
    && !season.calibration
    && today >= season.startsOn
    && today <= addDays(season.startsOn, 2)
    && season.suggestions.length === 0
}

export function getSeasonEvidence(season: Season, completions: Completion[], throughDate: string) {
  const end = throughDate < season.endsOn ? throughDate : season.endsOn
  const recentStart = addDays(end, -6) < season.startsOn ? season.startsOn : addDays(end, -6)
  const recentSignals = season.dailySignals.filter((signal) => signal.date >= recentStart && signal.date <= end)
  const average = (key: 'morningEnergy' | 'control') => recentSignals.length === 0
    ? 0
    : recentSignals.reduce((sum, signal) => sum + signal[key], 0) / recentSignals.length
  const active = completions.filter((completion) => completion.status === 'active' && completion.occurredOn >= season.startsOn && completion.occurredOn <= end)
  return {
    recentSignalCount: recentSignals.length,
    wakeWindowDays: recentSignals.filter((signal) => signal.wakeWindowMet).length,
    morningEnergyAverage: average('morningEnergy'),
    controlAverage: average('control'),
    behaviorDays: season.focusActivities.map((activity) => ({
      activityId: activity.activityId,
      title: activity.title,
      completedDays: new Set(active.filter((completion) => completion.activityId === activity.activityId).map((completion) => completion.occurredOn)).size,
    })),
  }
}

export interface SeasonStrategy {
  season: Season
  activeDays: number
  completionCount: number
  averageAdherence: number
  effectiveBehaviors: Array<{ title: string; attribute?: Attribute; domain?: GrowthDomain; adherence: number; impact: number; friction: number; cadence: string; baseLayer: string }>
  mainFriction?: { title: string; friction: number }
  nextSuggestion: string
}

export function getSeasonStrategy(season: Season, reviews: WeeklyReview[], completions: Completion[]): SeasonStrategy {
  const seasonReviews = reviews.filter((review) => review.weekStart <= season.endsOn && addDays(review.weekStart, 6) >= season.startsOn)
  const focusIds = new Set(season.focusActivities.map((activity) => activity.activityId))
  const activeCompletions = completions.filter(
    (completion) => completion.status === 'active' && focusIds.has(completion.activityId) && completion.occurredOn >= season.startsOn && completion.occurredOn <= season.endsOn,
  )
  const metrics = season.focusActivities.map((activity) => {
    const items = seasonReviews.flatMap((review) => review.items.filter((item) => item.activityId === activity.activityId))
    const average = (field: 'adherence' | 'impact' | 'friction') => items.length > 0
      ? items.reduce((total, item) => total + item[field], 0) / items.length
      : 0
    return {
      title: activity.title,
      attribute: activity.attribute,
      domain: activity.domain,
      adherence: average('adherence'),
      impact: average('impact'),
      friction: average('friction'),
      cadence: activity.schedule.kind === 'daily' ? '每天' : activity.schedule.kind === 'weekly' ? `每周 ${activity.schedule.times} 次` : '单次',
      baseLayer: activity.goal.kind === 'tiered' ? formatTierGoalValue(activity.goal, 1) : `${activity.goal.count}${activity.goal.unit}`,
    }
  })
  const reviewed = metrics.filter((metric) => metric.impact > 0)
  const effectiveBehaviors = metrics.filter((metric) => metric.impact >= 4).sort((left, right) => right.impact - left.impact || right.adherence - left.adherence)
  const mainFriction = [...reviewed].sort((left, right) => right.friction - left.friction)[0]
  const nextSuggestion = effectiveBehaviors.length > 0
    ? `优先复用「${effectiveBehaviors[0].title}」的${effectiveBehaviors[0].cadence}节奏，从基础层 ${effectiveBehaviors[0].baseLayer} 开始。`
    : mainFriction?.friction && mainFriction.friction >= 4
      ? `先缩小「${mainFriction.title}」的基础层或调整执行时机，再进入下一赛季。`
      : '现有数据不足以形成稳定规律，下个赛季继续验证一个小而明确的行为。'
  return {
    season,
    activeDays: new Set(activeCompletions.map((completion) => completion.occurredOn)).size,
    completionCount: activeCompletions.length,
    averageAdherence: reviewed.length > 0 ? reviewed.reduce((total, item) => total + item.adherence, 0) / reviewed.length : 0,
    effectiveBehaviors,
    mainFriction,
    nextSuggestion,
  }
}

export function snapshotSeasonActivity(activity: Activity) {
  return SeasonActivitySnapshotSchema.parse({
    activityId: activity.id,
    title: activity.title,
    cue: activity.cue,
    protocol: activity.protocol,
    attribute: activity.attribute,
    domain: activity.domain,
    difficulty: activity.difficulty,
    goal: activity.goal,
    schedule: activity.schedule,
  })
}
