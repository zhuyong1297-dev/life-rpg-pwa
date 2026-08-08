import { z } from 'zod'

import { addDays } from './dates'
import { ActivityGoalSchema, RatingGoalSchema, ScheduleSchema, TieredGoalSchema } from './goals'
import { dateString, scheduledTime, timestamp } from './shared'
import { difficulties, growthDomains } from './taxonomy'

export const coachBehaviorRoles = ['start', 'progress', 'maintain'] as const
export const coachBehaviorRoleLabels: Record<(typeof coachBehaviorRoles)[number], string> = {
  start: '启动',
  progress: '推进',
  maintain: '维护/收尾',
}

const CoachPlanExistingBehaviorSchema = z.object({
  id: z.string().min(1),
  role: z.enum(coachBehaviorRoles),
  source: z.literal('existing'),
  activityId: z.string().min(1),
  confirmed: z.boolean(),
})

export const CoachPlanNewBehaviorBaseSchema = z.object({
  id: z.string().min(1),
  role: z.enum(coachBehaviorRoles),
  source: z.literal('new'),
  title: z.string().trim().max(60),
  scheduledTime: scheduledTime.optional(),
  cue: z.string().trim().max(80),
  protocol: z.string().trim().max(280),
  domain: z.enum(growthDomains),
  difficulty: z.enum(difficulties),
  goal: z.union([TieredGoalSchema, RatingGoalSchema]),
  schedule: z.union([
    z.object({ kind: z.literal('daily') }),
    z.object({ kind: z.literal('weekly'), times: z.number().int().min(1).max(999) }),
  ]),
  confirmed: z.boolean(),
})

export const CoachPlanNewBehaviorSchema = CoachPlanNewBehaviorBaseSchema.superRefine((behavior, context) => {
  if (behavior.goal.kind === 'rating' && behavior.schedule.kind !== 'daily') {
    context.addIssue({ code: 'custom', path: ['schedule'], message: '评分体验只能设置为每日习惯' })
  }
})

export const CoachPlanBehaviorSchema = z.discriminatedUnion('source', [
  CoachPlanExistingBehaviorSchema,
  CoachPlanNewBehaviorSchema,
])

export const CoachPlanKnowledgeSourceV1Schema = z.object({
  packageType: z.literal('earth-online.obsidian-knowledge-action'),
  schemaVersion: z.literal(1),
  packageId: z.string().trim().min(1).max(120),
  knowledgeTitle: z.string().trim().min(1).max(120),
  knowledgeReference: z.string().trim().min(1).max(300),
  principle: z.string().trim().min(1).max(280),
  importedAt: timestamp,
}).strict()

export const ApplicationKnowledgeSchema = z.object({
  primary: z.object({
    kind: z.literal('principle'),
    title: z.string().trim().min(1).max(120),
    reference: z.string().trim().min(1).max(300),
    principle: z.string().trim().min(1).max(280),
  }).strict(),
  supporting: z.array(z.object({
    kind: z.enum(['principle', 'procedure', 'practice']),
    title: z.string().trim().min(1).max(120),
    reference: z.string().trim().min(1).max(300),
    contribution: z.string().trim().min(1).max(280),
  }).strict()).max(2),
}).strict()

export const CoachPlanKnowledgeSourceV2Schema = z.object({
  packageType: z.literal('earth-online.obsidian-knowledge-action'),
  schemaVersion: z.literal(2),
  packageId: z.string().trim().min(1).max(120),
  applicationId: z.string().trim().min(1).max(120),
  phase: z.enum(['trial', 'season']),
  derivedFromResultPackageId: z.string().trim().min(1).max(120).optional(),
  knowledge: ApplicationKnowledgeSchema,
  outcomeIndicator: z.string().trim().min(1).max(180),
  importedAt: timestamp,
}).strict().superRefine((source, context) => {
  if (source.phase === 'trial' && source.derivedFromResultPackageId) {
    context.addIssue({ code: 'custom', path: ['derivedFromResultPackageId'], message: '7 天试跑不能派生自阶段结果包' })
  }
  if (source.phase === 'season' && !source.derivedFromResultPackageId) {
    context.addIssue({ code: 'custom', path: ['derivedFromResultPackageId'], message: '28 天正式赛季必须引用试跑结果包' })
  }
})

export const CoachPlanKnowledgeSourceV3Schema = z.object({
  packageType: z.literal('earth-online.obsidian-knowledge-action'),
  schemaVersion: z.literal(3),
  packageId: z.string().trim().min(1).max(120),
  applicationId: z.string().trim().min(1).max(120),
  phase: z.enum(['trial', 'season']),
  derivedFromResultPackageId: z.string().trim().min(1).max(120).optional(),
  knowledge: ApplicationKnowledgeSchema,
  outcomeIndicator: z.string().trim().min(1).max(180),
  importedAt: timestamp,
}).strict().superRefine((source, context) => {
  if (source.phase === 'trial' && source.derivedFromResultPackageId) {
    context.addIssue({ code: 'custom', path: ['derivedFromResultPackageId'], message: '7 天试跑不能派生自阶段结果包' })
  }
  if (source.phase === 'season' && !source.derivedFromResultPackageId) {
    context.addIssue({ code: 'custom', path: ['derivedFromResultPackageId'], message: '28 天正式赛季必须引用试跑结果包' })
  }
})

export const CoachPlanKnowledgeSourceSchema = z.union([
  CoachPlanKnowledgeSourceV1Schema,
  CoachPlanKnowledgeSourceV2Schema,
  CoachPlanKnowledgeSourceV3Schema,
])

export const CoachPlanDraftSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().max(40),
    successCriterion: z.string().trim().max(180),
    baseline: z.string().trim().max(280),
    targetOutcome: z.string().trim().max(280),
    outcomeIndicator: z.string().trim().min(1).max(180).optional(),
    currentStep: z.number().int().min(1).max(4),
    status: z.enum(['editing', 'ready']),
    behaviors: z.array(CoachPlanBehaviorSchema).max(3),
    knowledgeSource: CoachPlanKnowledgeSourceSchema.optional(),
    badDayConfirmed: z.boolean(),
    evidenceConfirmed: z.boolean(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .superRefine((draft, context) => {
    const behaviorIds = draft.behaviors.map((behavior) => behavior.id)
    if (new Set(behaviorIds).size !== behaviorIds.length) {
      context.addIssue({ code: 'custom', path: ['behaviors'], message: '行为方案不能重复' })
    }
    const activityIds = draft.behaviors.flatMap((behavior) => behavior.source === 'existing' ? [behavior.activityId] : [])
    if (new Set(activityIds).size !== activityIds.length) {
      context.addIssue({ code: 'custom', path: ['behaviors'], message: '不能重复复用同一项活动' })
    }
    if (draft.status !== 'ready') return
    for (const [field, value, label] of [
      ['title', draft.title, '成长主题'],
      ['successCriterion', draft.successCriterion, '成功标准'],
      ['baseline', draft.baseline, '开始状态'],
      ['targetOutcome', draft.targetOutcome, '期望结果'],
    ] as const) {
      if (!value) context.addIssue({ code: 'custom', path: [field], message: `请填写${label}` })
    }
    if (draft.behaviors.length < 1) {
      context.addIssue({ code: 'custom', path: ['behaviors'], message: '请规划 1 至 3 项核心行为' })
    }
    draft.behaviors.forEach((behavior, index) => {
      if (behavior.source === 'existing' && !behavior.confirmed) {
        context.addIssue({ code: 'custom', path: ['behaviors', index], message: '请确认复用活动的当前标准' })
      }
      if (behavior.source === 'new' && (!behavior.title || !behavior.cue || !behavior.protocol || !behavior.confirmed)) {
        context.addIssue({ code: 'custom', path: ['behaviors', index], message: '请确认新行为的名称、触发条件、执行协议和最低标准' })
      }
    })
    if (!draft.badDayConfirmed || !draft.evidenceConfirmed) {
      context.addIssue({ code: 'custom', path: ['badDayConfirmed'], message: '请完成现实检查' })
    }
  })

export type CoachPlanBehavior = z.infer<typeof CoachPlanBehaviorSchema>
export type CoachPlanDraft = z.infer<typeof CoachPlanDraftSchema>
export type CoachBehaviorRole = (typeof coachBehaviorRoles)[number]
export type CoachPlanKnowledgeSource = z.infer<typeof CoachPlanKnowledgeSourceSchema>

export const applicationDecisions = ['continue', 'adjust', 'stop'] as const

export const ApplicationTrialActivitySchema = z.object({
  activityId: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  scheduledTime: scheduledTime.optional(),
  cue: z.string().trim().min(1).max(80).optional(),
  protocol: z.string().trim().min(1).max(280).optional(),
  domain: z.enum(growthDomains),
  difficulty: z.enum(difficulties),
  goal: ActivityGoalSchema,
  schedule: ScheduleSchema,
})

export const ApplicationTrialBehaviorResultSchema = z.object({
  activityId: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  planned: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  activeDays: z.number().int().nonnegative(),
  totalDurationMinutes: z.number().int().nonnegative().optional(),
  ratingSummary: z.object({
    recordedDays: z.number().int().nonnegative(),
    average: z.number().min(1).max(5).optional(),
    evidenceSufficient: z.boolean(),
  }).optional(),
})

export const ApplicationTrialSchema = z.object({
  id: z.string().min(1),
  version: z.literal(1),
  applicationId: z.string().trim().min(1).max(120),
  sourcePackageId: z.string().trim().min(1).max(120),
  sourcePlanId: z.string().min(1),
  restartOfTrialId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(40),
  successCriterion: z.string().trim().min(1).max(180),
  baseline: z.string().trim().min(1).max(280),
  targetOutcome: z.string().trim().min(1).max(280),
  outcomeIndicator: z.string().trim().min(1).max(180),
  knowledge: ApplicationKnowledgeSchema,
  startsOn: dateString,
  endsOn: dateString,
  focusActivities: z.array(ApplicationTrialActivitySchema).min(1).max(3),
  previousKeyActivityIds: z.array(z.string().min(1)).max(3),
  status: z.enum(['active', 'completed']),
  observedOutcome: z.string().trim().min(1).max(500).optional(),
  decision: z.enum(applicationDecisions).optional(),
  decisionReason: z.string().trim().min(1).max(500).optional(),
  behaviorResults: z.array(ApplicationTrialBehaviorResultSchema).max(3).optional(),
  completedAt: timestamp.optional(),
  createdAt: timestamp,
}).superRefine((trial, context) => {
  if (trial.endsOn !== addDays(trial.startsOn, 6)) {
    context.addIssue({ code: 'custom', path: ['endsOn'], message: '应用试跑必须连续 7 个游戏日' })
  }
  const focusIds = trial.focusActivities.map((activity) => activity.activityId)
  if (new Set(focusIds).size !== focusIds.length) {
    context.addIssue({ code: 'custom', path: ['focusActivities'], message: '试跑行为不能重复' })
  }
  const completionFields = [trial.observedOutcome, trial.decision, trial.decisionReason, trial.behaviorResults, trial.completedAt]
  if (trial.status === 'completed' && completionFields.some((value) => value === undefined)) {
    context.addIssue({ code: 'custom', path: ['observedOutcome'], message: '结束试跑必须记录现实结果、人工决定和聚合行为数据' })
  }
  if (trial.status === 'active' && completionFields.some((value) => value !== undefined)) {
    context.addIssue({ code: 'custom', path: ['observedOutcome'], message: '进行中的试跑不能保存结束结果' })
  }
})

export type ApplicationTrial = z.infer<typeof ApplicationTrialSchema>
export type ApplicationDecision = (typeof applicationDecisions)[number]

export function createCoachPlanDraft(now = new Date(), id: string = crypto.randomUUID()): CoachPlanDraft {
  const timestampValue = now.toISOString()
  return CoachPlanDraftSchema.parse({
    id,
    title: '',
    successCriterion: '',
    baseline: '',
    targetOutcome: '',
    currentStep: 1,
    status: 'editing',
    behaviors: [],
    badDayConfirmed: false,
    evidenceConfirmed: false,
    createdAt: timestampValue,
    updatedAt: timestampValue,
  })
}
