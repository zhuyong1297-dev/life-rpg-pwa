import { z } from 'zod'
import { db, type LifeRpgDatabase } from './db'
import {
  ApplicationKnowledgeSchema,
  CoachPlanDraftSchema,
  CoachPlanNewBehaviorSchema,
  type Activity,
  type ApplicationTrial,
  type CoachPlanDraft,
} from './domain'

export const KNOWLEDGE_ACTION_PACKAGE_TYPE = 'earth-online.obsidian-knowledge-action' as const
export const KNOWLEDGE_ACTION_PACKAGE_SCHEMA_VERSION = 2 as const

const stableId = z.string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, '标识只能包含字母、数字、点、下划线、冒号和连字符')

export const KnowledgeActionBehaviorSchema = CoachPlanNewBehaviorSchema
  .omit({ id: true, source: true, confirmed: true })
  .extend({
    title: z.string().trim().min(1).max(60),
    cue: z.string().trim().min(1).max(80),
    protocol: z.string().trim().min(1).max(280),
  })
  .strict()

const behaviorList = z.array(KnowledgeActionBehaviorSchema).min(1).max(3)
  .superRefine((behaviors, context) => {
    const titles = behaviors.map((behavior) => normalizeTitle(behavior.title))
    if (new Set(titles).size !== titles.length) {
      context.addIssue({ code: 'custom', message: '同一行动包中的行为标题不能重复' })
    }
  })

export const KnowledgeActionPackageV1Schema = z.object({
  packageType: z.literal(KNOWLEDGE_ACTION_PACKAGE_TYPE),
  schemaVersion: z.literal(1),
  packageId: stableId,
  knowledge: z.object({
    title: z.string().trim().min(1).max(120),
    reference: z.string().trim().min(1).max(300),
    principle: z.string().trim().min(1).max(280),
  }).strict(),
  application: z.object({
    goal: z.string().trim().min(1).max(40),
    successCriterion: z.string().trim().min(1).max(180),
    baseline: z.string().trim().min(1).max(280),
    targetOutcome: z.string().trim().min(1).max(280),
  }).strict(),
  behaviors: behaviorList,
}).strict()

export const KnowledgeActionPackageV2Schema = z.object({
  packageType: z.literal(KNOWLEDGE_ACTION_PACKAGE_TYPE),
  schemaVersion: z.literal(2),
  packageId: stableId,
  applicationId: stableId,
  phase: z.enum(['trial', 'season']),
  derivedFromResultPackageId: stableId.nullable().optional(),
  knowledge: ApplicationKnowledgeSchema,
  application: z.object({
    goal: z.string().trim().min(1).max(40),
    successCriterion: z.string().trim().min(1).max(180),
    baseline: z.string().trim().min(1).max(280),
    targetOutcome: z.string().trim().min(1).max(280),
    outcomeIndicator: z.string().trim().min(1).max(180),
  }).strict(),
  behaviors: behaviorList,
}).strict().superRefine((actionPackage, context) => {
  if (actionPackage.phase === 'trial' && actionPackage.derivedFromResultPackageId) {
    context.addIssue({ code: 'custom', path: ['derivedFromResultPackageId'], message: '7 天试跑不能引用阶段结果包' })
  }
  if (actionPackage.phase === 'season' && !actionPackage.derivedFromResultPackageId) {
    context.addIssue({ code: 'custom', path: ['derivedFromResultPackageId'], message: '28 天正式赛季必须引用试跑结果包' })
  }
})

export const KnowledgeActionPackageSchema = z.discriminatedUnion('schemaVersion', [
  KnowledgeActionPackageV1Schema,
  KnowledgeActionPackageV2Schema,
])

export type KnowledgeActionPackage = z.infer<typeof KnowledgeActionPackageSchema>
export type KnowledgeActionPackageV2 = z.infer<typeof KnowledgeActionPackageV2Schema>

export interface DuplicateActivityMatch {
  behaviorIndex: number
  behaviorTitle: string
  activityId: string
  activityTitle: string
  state: '进行中' | '已暂停' | '已归档'
}

export interface KnowledgeActionPackagePreview {
  actionPackage: KnowledgeActionPackage
  draft: CoachPlanDraft
  duplicateActivities: DuplicateActivityMatch[]
  blockingIssues: string[]
  warnings: string[]
  activeSeason: boolean
  activeTrial: boolean
  currentKeyCount: number
  resultingKeyCount: number
  replacesCurrentDraft: boolean
  unchanged: string[]
}

export function normalizeTitle(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN')
}

function activityState(activity: Activity): DuplicateActivityMatch['state'] {
  if (activity.archivedAt) return '已归档'
  return activity.enabled ? '进行中' : '已暂停'
}

export function packagePrimaryKnowledge(actionPackage: KnowledgeActionPackage) {
  return actionPackage.schemaVersion === 1
    ? actionPackage.knowledge
    : actionPackage.knowledge.primary
}

export function knowledgeActionPackageToDraft(
  actionPackage: KnowledgeActionPackage,
  now = new Date(),
): CoachPlanDraft {
  const timestamp = now.toISOString()
  const v2 = actionPackage.schemaVersion === 2 ? actionPackage : undefined
  const primary = packagePrimaryKnowledge(actionPackage)
  return CoachPlanDraftSchema.parse({
    id: v2
      ? `application-plan:${v2.applicationId}:${v2.phase}`
      : `knowledge-plan:${actionPackage.packageId}`,
    title: actionPackage.application.goal,
    successCriterion: actionPackage.application.successCriterion,
    baseline: actionPackage.application.baseline,
    targetOutcome: actionPackage.application.targetOutcome,
    outcomeIndicator: v2?.application.outcomeIndicator,
    currentStep: 1,
    status: 'editing',
    behaviors: actionPackage.behaviors.map((behavior, index) => ({
      ...behavior,
      id: `knowledge-behavior:${actionPackage.packageId}:${index + 1}`,
      source: 'new',
      confirmed: false,
    })),
    knowledgeSource: v2
      ? {
          packageType: v2.packageType,
          schemaVersion: 2,
          packageId: v2.packageId,
          applicationId: v2.applicationId,
          phase: v2.phase,
          derivedFromResultPackageId: v2.derivedFromResultPackageId ?? undefined,
          knowledge: v2.knowledge,
          outcomeIndicator: v2.application.outcomeIndicator,
          importedAt: timestamp,
        }
      : {
          packageType: actionPackage.packageType,
          schemaVersion: 1,
          packageId: actionPackage.packageId,
          knowledgeTitle: primary.title,
          knowledgeReference: primary.reference,
          principle: primary.principle,
          importedAt: timestamp,
        },
    badDayConfirmed: false,
    evidenceConfirmed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

async function buildPreview(
  actionPackage: KnowledgeActionPackage,
  database: LifeRpgDatabase,
  now: Date,
): Promise<KnowledgeActionPackagePreview> {
  const [activities, settings, seasons] = await Promise.all([
    database.activities.toArray(),
    database.settings.toArray(),
    database.seasons.toArray(),
  ])
  const activeSeason = seasons.find((season) => season.status === 'active')
  const currentDraftSetting = settings.find((setting) => setting.key === 'coachPlanDraft')
  const currentDraft = currentDraftSetting?.key === 'coachPlanDraft' ? currentDraftSetting.value : undefined
  const trialSetting = settings.find((setting) => setting.key === 'applicationTrial')
  const trial = trialSetting?.key === 'applicationTrial' ? trialSetting.value : undefined
  const activeTrial = trial?.status === 'active' ? trial : undefined
  const metaSetting = settings.find((setting) => setting.key === 'meta')
  const imports = metaSetting?.key === 'meta' ? metaSetting.value.knowledgeActionImports ?? [] : []
  const blockingIssues: string[] = []
  const replacesCurrentDraft = Boolean(currentDraft && currentDraft.knowledgeSource?.packageId !== actionPackage.packageId)

  if (currentDraft?.knowledgeSource?.packageId === actionPackage.packageId) {
    blockingIssues.push('这份知识行动包已经生成了当前规划草稿')
  } else if (imports.some((record) => record.packageId === actionPackage.packageId)) {
    blockingIssues.push('这份知识行动包已经激活过，不能重复导入')
  } else if (trial?.sourcePackageId === actionPackage.packageId) {
    blockingIssues.push('这份知识行动包已经启动过试跑，不能重复导入')
  }

  if (actionPackage.schemaVersion === 2) {
    if (actionPackage.phase === 'season') {
      const sourceTrial: ApplicationTrial | undefined = trial?.applicationId === actionPackage.applicationId ? trial : undefined
      if (!sourceTrial || sourceTrial.status !== 'completed') {
        blockingIssues.push('找不到同一 Application 已完成的 7 天试跑')
      } else if (!['continue', 'adjust'].includes(sourceTrial.decision!)) {
        blockingIssues.push('试跑决定为停止，不能启动正式赛季')
      } else {
        const expectedResultId = `result:${sourceTrial.applicationId}:trial:${sourceTrial.sourcePackageId}`
        if (actionPackage.derivedFromResultPackageId !== expectedResultId) {
          blockingIssues.push('正式赛季没有引用本机生成的试跑结果包')
        }
      }
    } else if (trial && trial.applicationId !== actionPackage.applicationId) {
      const completedSeason = seasons.some((season) =>
        season.status === 'completed'
        && season.applicationContext?.applicationId === trial.applicationId)
      const pendingSeason = trial.status === 'completed'
        && ['continue', 'adjust'].includes(trial.decision!)
        && !completedSeason
      if (pendingSeason) blockingIssues.push('上一个 Application 已通过试跑但尚未完成 28 天赛季')
    }
  }

  const duplicateActivities = actionPackage.behaviors.flatMap((behavior, behaviorIndex) =>
    activities
      .filter((activity) => normalizeTitle(activity.title) === normalizeTitle(behavior.title))
      .map((activity) => ({
        behaviorIndex,
        behaviorTitle: behavior.title,
        activityId: activity.id,
        activityTitle: activity.title,
        state: activityState(activity),
      })))

  const currentKeyCount = activities.filter((activity) => activity.isKey && activity.enabled && !activity.archivedAt).length
  const resultingKeyCount = actionPackage.behaviors.length
  if (currentKeyCount > 3) blockingIssues.push('当前关键行为已经超过 3 项，请先修正活动状态')

  const warnings: string[] = []
  if (duplicateActivities.length) {
    warnings.push('发现同名活动。进入规划器后请复用现有活动，或修改候选行为名称和标准，避免创建重复活动。')
  }
  if (replacesCurrentDraft) {
    warnings.push('当前目标规划草稿会被这份行动包替换；原草稿尚未启动的内容不会进入历史。')
  }
  if (actionPackage.schemaVersion === 2 && activeTrial) {
    warnings.push('当前 7 天试跑仍在进行；可以先保存规划草稿，但本轮试跑结束前不能启动新阶段。')
  }
  if (actionPackage.schemaVersion === 2 && activeSeason) {
    warnings.push('当前 28 天赛季仍在进行；可以先保存规划草稿，但当前赛季结束前不能启动新阶段。')
  }
  if (actionPackage.schemaVersion === 1 && activeSeason) {
    warnings.push('当前赛季仍在进行；v1 行动包只会保存为下个赛季草稿，不会修改当前关键行为。')
  } else if (currentKeyCount > 0) {
    warnings.push(`启动阶段时，现有 ${currentKeyCount} 项关键行为会暂时由确认后的行为方案替换。`)
  }

  return {
    actionPackage,
    draft: knowledgeActionPackageToDraft(actionPackage, now),
    duplicateActivities,
    blockingIssues,
    warnings,
    activeSeason: Boolean(activeSeason),
    activeTrial: Boolean(activeTrial),
    currentKeyCount,
    resultingKeyCount,
    replacesCurrentDraft,
    unchanged: [
      '完成记录、XP 和金币',
      '奖励、奖励券和奖励基金',
      '复盘、账本与历史记录',
      '每日完成流水与全量备份',
    ],
  }
}

export async function previewKnowledgeActionPackage(
  input: unknown,
  database: LifeRpgDatabase = db,
  now = new Date(),
) {
  const actionPackage = KnowledgeActionPackageSchema.parse(input)
  return buildPreview(actionPackage, database, now)
}

export async function importKnowledgeActionPackage(
  input: unknown,
  database: LifeRpgDatabase = db,
  now = new Date(),
) {
  const actionPackage = KnowledgeActionPackageSchema.parse(input)
  return database.transaction('rw', database.settings, database.activities, database.seasons, async () => {
    const preview = await buildPreview(actionPackage, database, now)
    if (preview.blockingIssues.length) throw new Error(preview.blockingIssues.join('；'))
    await database.settings.put({ key: 'coachPlanDraft', value: preview.draft })
    return preview.draft
  })
}
