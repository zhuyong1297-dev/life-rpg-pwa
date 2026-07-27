import { z } from 'zod'
import {
  ActivityGoalSchema,
  ApplicationTrialSchema,
  ScheduleSchema,
  applicationDecisions,
  difficulties,
  growthDomains,
  type Activity,
  type ApplicationTrial,
  type Completion,
} from './domain'
import { SeasonSchema, getSeasonEffectiveEnd, type Season } from './season'

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const timestamp = z.string().datetime()
const stableId = z.string().trim().min(1).max(120)

export const PLANNING_CONTEXT_PACKAGE_TYPE = 'earth-online.obsidian-planning-context' as const
export const APPLICATION_RESULT_PACKAGE_TYPE = 'earth-online.obsidian-application-result' as const

export const PlanningContextBehaviorSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  cue: z.string().trim().min(1).max(80).optional(),
  protocol: z.string().trim().min(1).max(280).optional(),
  domain: z.enum(growthDomains),
  difficulty: z.enum(difficulties),
  goal: ActivityGoalSchema,
  schedule: ScheduleSchema,
}).strict()

export const PlanningContextPackageV1Schema = z.object({
  packageType: z.literal(PLANNING_CONTEXT_PACKAGE_TYPE),
  schemaVersion: z.literal(1),
  exportedAt: timestamp,
  activeCycle: z.object({
    phase: z.enum(['trial', 'season']),
    title: z.string().trim().min(1).max(40),
    startsOn: dateString,
    endsOn: dateString,
  }).strict().nullable(),
  keyBehaviors: z.array(PlanningContextBehaviorSchema).max(3),
}).strict()

export const PlanningContextPackageV2Schema = PlanningContextPackageV1Schema.extend({
  schemaVersion: z.literal(2),
})

export const PlanningContextPackageSchema = z.discriminatedUnion('schemaVersion', [
  PlanningContextPackageV1Schema,
  PlanningContextPackageV2Schema,
])

export const ApplicationResultBehaviorV1Schema = z.object({
  activityId: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  planned: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  activeDays: z.number().int().nonnegative(),
  totalDurationMinutes: z.number().int().nonnegative().optional(),
}).strict()

export const ApplicationResultBehaviorSchema = ApplicationResultBehaviorV1Schema.extend({
  ratingSummary: z.object({
    recordedDays: z.number().int().nonnegative(),
    average: z.number().min(1).max(5).optional(),
    evidenceSufficient: z.boolean(),
  }).strict().optional(),
})

export const ApplicationResultPackageV1Schema = z.object({
  packageType: z.literal(APPLICATION_RESULT_PACKAGE_TYPE),
  schemaVersion: z.literal(1),
  resultPackageId: stableId,
  applicationId: stableId,
  phase: z.enum(['trial', 'season']),
  sourcePackageId: stableId,
  period: z.object({
    startsOn: dateString,
    endsOn: dateString,
    plannedEndsOn: dateString.optional(),
    conclusionType: z.enum(['scheduled', 'early']).optional(),
  }).strict(),
  outcome: z.object({
    indicator: z.string().trim().min(1).max(180),
    baseline: z.string().trim().min(1).max(280),
    target: z.string().trim().min(1).max(280),
    observed: z.string().trim().min(1).max(500),
  }).strict(),
  decision: z.enum(applicationDecisions),
  decisionReason: z.string().trim().min(1).max(500),
  behaviors: z.array(ApplicationResultBehaviorV1Schema).min(1).max(3),
  exportedAt: timestamp,
}).strict()

export const ApplicationResultPackageV2Schema = ApplicationResultPackageV1Schema.extend({
  schemaVersion: z.literal(2),
  behaviors: z.array(ApplicationResultBehaviorSchema).min(1).max(3),
})

export const ApplicationResultPackageSchema = z.discriminatedUnion('schemaVersion', [
  ApplicationResultPackageV1Schema,
  ApplicationResultPackageV2Schema,
])

export type PlanningContextPackage = z.infer<typeof PlanningContextPackageSchema>
export type ApplicationResultPackage = z.infer<typeof ApplicationResultPackageSchema>

function planningBehavior(activity: Activity) {
  return PlanningContextBehaviorSchema.parse({
    id: activity.id,
    title: activity.title,
    cue: activity.cue,
    protocol: activity.protocol,
    domain: activity.domain,
    difficulty: activity.difficulty,
    goal: activity.goal,
    schedule: activity.schedule,
  })
}

export function createPlanningContextPackage(
  trial: ApplicationTrial | undefined,
  season: Season | undefined,
  activities: Activity[],
  now = new Date(),
): PlanningContextPackage {
  const activeTrial = trial?.status === 'active' ? ApplicationTrialSchema.parse(trial) : undefined
  const activeSeason = season?.status === 'active' ? SeasonSchema.parse(season) : undefined
  const activeCycle = activeTrial
    ? { phase: 'trial' as const, title: activeTrial.title, startsOn: activeTrial.startsOn, endsOn: activeTrial.endsOn }
    : activeSeason
      ? { phase: 'season' as const, title: activeSeason.title, startsOn: activeSeason.startsOn, endsOn: activeSeason.endsOn }
      : null
  return PlanningContextPackageSchema.parse({
    packageType: PLANNING_CONTEXT_PACKAGE_TYPE,
    schemaVersion: 2,
    exportedAt: now.toISOString(),
    activeCycle,
    keyBehaviors: activities
      .filter((activity) => activity.isKey && activity.enabled && !activity.archivedAt)
      .slice(0, 3)
      .map(planningBehavior),
  })
}

function plannedOccurrences(schedule: Activity['schedule'], days: number) {
  if (schedule.kind === 'daily') return days
  if (schedule.kind === 'weekly') return schedule.times * Math.ceil(days / 7)
  return 1
}

export function aggregateApplicationBehaviors(
  activities: Array<Pick<Activity, 'id' | 'title' | 'schedule' | 'goal'>>,
  completions: Completion[],
  startsOn: string,
  endsOn: string,
) {
  const days = Math.round((Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / 86_400_000) + 1
  return activities.map((activity) => {
    const matching = completions.filter((completion) =>
      completion.activityId === activity.id
      && completion.status === 'active'
      && completion.occurredOn >= startsOn
      && completion.occurredOn <= endsOn)
    const durationSeconds = matching.reduce((total, completion) =>
      total
      + (completion.durationMinutes ?? 0) * 60
      + (completion.progress?.durationSeconds ?? 0), 0)
    const ratingValues = matching.flatMap((completion) => completion.ratingValue === undefined ? [] : [completion.ratingValue])
    const ratingRecordedDays = new Set(
      matching.filter((completion) => completion.ratingValue !== undefined).map((completion) => completion.occurredOn),
    ).size
    return ApplicationResultBehaviorSchema.parse({
      activityId: activity.id,
      title: activity.title,
      planned: plannedOccurrences(activity.schedule, days),
      completed: matching.length,
      activeDays: new Set(matching.map((completion) => completion.occurredOn)).size,
      totalDurationMinutes: durationSeconds > 0 ? Math.round(durationSeconds / 60) : undefined,
      ratingSummary: activity.goal.kind === 'rating'
        ? {
            recordedDays: ratingRecordedDays,
            average: ratingValues.length ? ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length : undefined,
            evidenceSufficient: ratingRecordedDays >= 5,
          }
        : undefined,
    })
  })
}

export function createTrialResultPackage(trial: ApplicationTrial, now = new Date()): ApplicationResultPackage {
  const completedTrial = ApplicationTrialSchema.parse(trial)
  if (completedTrial.status !== 'completed') throw new Error('7 天试跑尚未完成人工复盘')
  return ApplicationResultPackageSchema.parse({
    packageType: APPLICATION_RESULT_PACKAGE_TYPE,
    schemaVersion: 2,
    resultPackageId: `result:${completedTrial.applicationId}:trial:${completedTrial.sourcePackageId}`,
    applicationId: completedTrial.applicationId,
    phase: 'trial',
    sourcePackageId: completedTrial.sourcePackageId,
    period: { startsOn: completedTrial.startsOn, endsOn: completedTrial.endsOn },
    outcome: {
      indicator: completedTrial.outcomeIndicator,
      baseline: completedTrial.baseline,
      target: completedTrial.targetOutcome,
      observed: completedTrial.observedOutcome,
    },
    decision: completedTrial.decision,
    decisionReason: completedTrial.decisionReason,
    behaviors: completedTrial.behaviorResults,
    exportedAt: now.toISOString(),
  })
}

export function createSeasonResultPackage(
  season: Season,
  completions: Completion[],
  now = new Date(),
): ApplicationResultPackage {
  const completedSeason = SeasonSchema.parse(season)
  const context = completedSeason.applicationContext
  if (completedSeason.status !== 'completed' || !context) throw new Error('这不是已完成的知识应用赛季')
  const effectiveEnd = getSeasonEffectiveEnd(completedSeason)
  return ApplicationResultPackageSchema.parse({
    packageType: APPLICATION_RESULT_PACKAGE_TYPE,
    schemaVersion: 2,
    resultPackageId: `result:${context.applicationId}:season:${context.packageId}`,
    applicationId: context.applicationId,
    phase: 'season',
    sourcePackageId: context.packageId,
    period: {
      startsOn: completedSeason.startsOn,
      endsOn: effectiveEnd,
      plannedEndsOn: completedSeason.endsOn,
      conclusionType: completedSeason.conclusionType ?? 'scheduled',
    },
    outcome: {
      indicator: context.outcomeIndicator,
      baseline: completedSeason.baseline,
      target: completedSeason.targetOutcome,
      observed: completedSeason.observedOutcome,
    },
    decision: completedSeason.applicationDecision,
    decisionReason: completedSeason.decisionReason,
    behaviors: aggregateApplicationBehaviors(
      completedSeason.focusActivities.map((activity) => ({
        id: activity.activityId,
        title: activity.title,
        schedule: activity.schedule,
        goal: activity.goal,
      })),
      completions,
      completedSeason.startsOn,
      effectiveEnd,
    ),
    exportedAt: now.toISOString(),
  })
}

export function planningContextFilename() {
  return 'planning-context.json'
}

export function applicationResultFilename(result: ApplicationResultPackage) {
  return `${result.applicationId}.${result.phase}.result.json`
}
