import { z } from 'zod'

import { ApplicationTrialSchema, CoachPlanDraftSchema } from './coach'
import { ActivityGoalSchema, ScheduleSchema } from './goals'
import { RewardSystemSchema } from './rewards'
import { dateString, scheduledTime, timestamp } from './shared'
import { attributes, difficulties, growthDomains, reviewDecisions } from './taxonomy'

export const ReviewItemSchema = z.object({
  activityId: z.string().min(1),
  titleSnapshot: z.string().trim().min(1).max(60).optional(),
  attributeSnapshot: z.enum(attributes).optional(),
  domainSnapshot: z.enum(growthDomains).optional(),
  adherence: z.number().min(0).max(1),
  completed: z.number().int().nonnegative(),
  planned: z.number().int().positive(),
  impact: z.number().int().min(1).max(5),
  friction: z.number().int().min(1).max(5),
  decision: z.enum(reviewDecisions),
  note: z.string().max(280).optional(),
  actualDurationMinutes: z.number().int().nonnegative().optional(),
  plannedDurationMinutes: z.number().int().positive().optional(),
  tierCounts: z.union([
    z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
    z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative()]),
  ]).optional(),
  achievedTotal: z.number().int().nonnegative().optional(),
  achievedUnit: z.string().trim().min(1).max(12).optional(),
  achievedCountTotal: z.number().int().nonnegative().optional(),
  achievedDurationSeconds: z.number().int().nonnegative().optional(),
  achievedCountUnit: z.string().trim().min(1).max(12).optional(),
})

export const WeeklyReviewSchema = z.object({
  id: z.string().min(1),
  weekStart: dateString,
  items: z.array(ReviewItemSchema).max(3),
  createdAt: timestamp,
})

export type WeeklyReview = z.infer<typeof WeeklyReviewSchema>

export const feedbackIntensities = ['gentle', 'clear', 'strong'] as const

export const PreferencesSchema = z.object({
  notifications: z.boolean(),
  vibration: z.boolean(),
  sound: z.boolean(),
  feedbackIntensity: z.enum(feedbackIntensities).default('clear'),
})

export const LevelMilestoneSchema = z
  .object({
    level: z.number().int().min(2),
    reachedAt: timestamp,
    sourceEventId: z.string().min(1),
    acknowledgedAt: timestamp.optional(),
    focusAttribute: z.enum(attributes).optional(),
    focusDomain: z.enum(growthDomains).optional(),
    voucherMaxCost: z.number().int().positive().optional(),
    claimedRewardId: z.string().min(1).optional(),
    claimedAt: timestamp.optional(),
    reservedClaimId: z.string().min(1).optional(),
  })
  .superRefine((milestone, context) => {
    const focus = milestone.focusDomain ?? milestone.focusAttribute
    if ((milestone.acknowledgedAt === undefined) !== (focus === undefined)) {
      context.addIssue({ code: 'custom', path: ['focusDomain'], message: '查看升级报告时必须选择下一等级方向' })
    }
    if (milestone.focusDomain && milestone.focusAttribute) {
      context.addIssue({ code: 'custom', path: ['focusDomain'], message: '等级方向不能同时使用旧属性和成长领域' })
    }
    if ((milestone.claimedRewardId === undefined) !== (milestone.claimedAt === undefined)) {
      context.addIssue({ code: 'custom', path: ['claimedRewardId'], message: '阶段礼券领取信息不完整' })
    }
    if (milestone.claimedRewardId && !milestone.voucherMaxCost) {
      context.addIssue({ code: 'custom', path: ['voucherMaxCost'], message: '没有礼券额度的等级不能领取奖励' })
    }
    if (milestone.claimedAt && milestone.reservedClaimId) {
      context.addIssue({ code: 'custom', path: ['reservedClaimId'], message: '已领取礼券不能继续保留预留奖励' })
    }
  })

export type LevelMilestone = z.infer<typeof LevelMilestoneSchema>

export const LevelSystemSchema = z
  .object({
    activatedAt: timestamp,
    baselineLevel: z.number().int().positive(),
    highestLevelReached: z.number().int().positive(),
    focusAttribute: z.enum(attributes).optional(),
    focusDomain: z.enum(growthDomains).optional(),
    milestones: z.array(LevelMilestoneSchema),
  })
  .superRefine((system, context) => {
    if (system.focusDomain && system.focusAttribute) {
      context.addIssue({ code: 'custom', path: ['focusDomain'], message: '当前方向不能同时使用旧属性和成长领域' })
    }
    if (system.highestLevelReached < system.baselineLevel) {
      context.addIssue({ code: 'custom', path: ['highestLevelReached'], message: '历史最高等级不能低于启用基线' })
    }
    const levels = system.milestones.map((milestone) => milestone.level)
    if (new Set(levels).size !== levels.length) {
      context.addIssue({ code: 'custom', path: ['milestones'], message: '等级里程碑不能重复' })
    }
    if (levels.some((level) => level <= system.baselineLevel || level > system.highestLevelReached)) {
      context.addIssue({ code: 'custom', path: ['milestones'], message: '等级里程碑超出启用基线或历史最高等级' })
    }
  })

export type LevelSystem = z.infer<typeof LevelSystemSchema>

export const OnboardingStateSchema = z.object({
  startedOn: dateString.optional(),
  primaryActivityId: z.string().min(1).optional(),
  installHintDismissedAt: timestamp.optional(),
  feedbackPromptedAt: timestamp.optional(),
  feedbackCompletedAt: timestamp.optional(),
}).strict().superRefine((onboarding, context) => {
  if ((onboarding.startedOn === undefined) !== (onboarding.primaryActivityId === undefined)) {
    context.addIssue({ code: 'custom', path: ['primaryActivityId'], message: '新手体验开始日期和首项行动必须同时保存' })
  }
})

export type OnboardingState = z.infer<typeof OnboardingStateSchema>

export const ReleaseNotesStateSchema = z.object({
  lastSeenVersion: z.string().regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    '版本号必须使用 SemVer',
  ),
  acknowledgedAt: timestamp,
}).strict()

export type ReleaseNotesState = z.infer<typeof ReleaseNotesStateSchema>

export const MetaSchema = z.object({
  lastBackupAt: timestamp.optional(),
  migrationImportedAt: timestamp.optional(),
  levelSystem: LevelSystemSchema.optional(),
  targetRewardId: z.string().min(1).optional(),
  gameDayBoundaryActivatedAt: timestamp.optional(),
  growthDomainSystem: z.object({ version: z.literal(1), activatedAt: timestamp }).optional(),
  onboarding: OnboardingStateSchema.optional(),
  releaseNotes: ReleaseNotesStateSchema.optional(),
  todayActionPriority: z.object({
    gameDate: dateString,
    activityIds: z.array(z.string().min(1)).max(5).refine((ids) => new Set(ids).size === ids.length, '今日优先行动不能重复'),
  }).optional(),
  knowledgeActionImports: z.array(z.object({
    packageId: z.string().trim().min(1).max(120),
    knowledgeTitle: z.string().trim().min(1).max(120),
    knowledgeReference: z.string().trim().min(1).max(300),
    draftId: z.string().min(1),
    seasonId: z.string().min(1),
    activatedAt: timestamp,
  }).strict()).max(200).optional(),
})

export const ApplicationTrialRestartSchema = z.object({
  version: z.literal(1),
  sourceTrialId: z.string().min(1),
  notBefore: dateString,
  preparedAt: timestamp,
  replacements: z.array(z.object({
    sourceActivityId: z.string().min(1),
    title: z.string().trim().min(1).max(60),
    scheduledTime: scheduledTime.optional(),
    cue: z.string().trim().min(1).max(80).optional(),
    protocol: z.string().trim().min(1).max(280).optional(),
    domain: z.enum(growthDomains),
    difficulty: z.enum(difficulties),
    goal: ActivityGoalSchema,
    schedule: ScheduleSchema,
  }).superRefine((replacement, context) => {
    if (replacement.goal.kind === 'rating' && replacement.schedule.kind !== 'daily') {
      context.addIssue({ code: 'custom', path: ['schedule'], message: '评分体验只能设置为每日习惯' })
    }
  })).min(1).max(3),
}).strict().superRefine((restart, context) => {
  const sourceIds = restart.replacements.map((replacement) => replacement.sourceActivityId)
  if (new Set(sourceIds).size !== sourceIds.length) {
    context.addIssue({ code: 'custom', path: ['replacements'], message: '每项原试跑行为只能对应一个替换行为' })
  }
})

export type ApplicationTrialRestart = z.infer<typeof ApplicationTrialRestartSchema>

export const SettingSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('preferences'), value: PreferencesSchema }),
  z.object({ key: z.literal('meta'), value: MetaSchema }),
  z.object({ key: z.literal('coachPlanDraft'), value: CoachPlanDraftSchema }),
  z.object({ key: z.literal('applicationTrial'), value: ApplicationTrialSchema }),
  z.object({ key: z.literal('applicationTrialRestart'), value: ApplicationTrialRestartSchema }),
  z.object({ key: z.literal('rewardSystem'), value: RewardSystemSchema }),
])

export type Setting = z.infer<typeof SettingSchema>
export type Preferences = z.infer<typeof PreferencesSchema>
export type FeedbackIntensity = Preferences['feedbackIntensity']
