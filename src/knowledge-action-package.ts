import { z } from 'zod'
import { db, type LifeRpgDatabase } from './db'
import {
  CoachPlanDraftSchema,
  CoachPlanNewBehaviorSchema,
  type Activity,
  type CoachPlanDraft,
} from './domain'

export const KNOWLEDGE_ACTION_PACKAGE_TYPE = 'earth-online.obsidian-knowledge-action' as const
export const KNOWLEDGE_ACTION_PACKAGE_SCHEMA_VERSION = 1 as const

export const KnowledgeActionBehaviorSchema = CoachPlanNewBehaviorSchema
  .omit({ id: true, source: true, confirmed: true })
  .extend({
    title: z.string().trim().min(1).max(60),
    cue: z.string().trim().min(1).max(80),
    protocol: z.string().trim().min(1).max(280),
  })
  .strict()

export const KnowledgeActionPackageSchema = z.object({
  packageType: z.literal(KNOWLEDGE_ACTION_PACKAGE_TYPE),
  schemaVersion: z.literal(KNOWLEDGE_ACTION_PACKAGE_SCHEMA_VERSION),
  packageId: z.string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'packageId 只能包含字母、数字、点、下划线、冒号和连字符'),
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
  behaviors: z.array(KnowledgeActionBehaviorSchema).min(1).max(3),
}).strict().superRefine((actionPackage, context) => {
  const titles = actionPackage.behaviors.map((behavior) => normalizeTitle(behavior.title))
  if (new Set(titles).size !== titles.length) {
    context.addIssue({ code: 'custom', path: ['behaviors'], message: '同一行动包中的行为标题不能重复' })
  }
})

export type KnowledgeActionPackage = z.infer<typeof KnowledgeActionPackageSchema>

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
  currentKeyCount: number
  resultingKeyCount: number
  unchanged: string[]
}

function normalizeTitle(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN')
}

function activityState(activity: Activity): DuplicateActivityMatch['state'] {
  if (activity.archivedAt) return '已归档'
  return activity.enabled ? '进行中' : '已暂停'
}

export function knowledgeActionPackageToDraft(
  actionPackage: KnowledgeActionPackage,
  now = new Date(),
): CoachPlanDraft {
  const timestamp = now.toISOString()
  return CoachPlanDraftSchema.parse({
    id: `knowledge-plan:${actionPackage.packageId}`,
    title: actionPackage.application.goal,
    successCriterion: actionPackage.application.successCriterion,
    baseline: actionPackage.application.baseline,
    targetOutcome: actionPackage.application.targetOutcome,
    currentStep: 1,
    status: 'editing',
    behaviors: actionPackage.behaviors.map((behavior, index) => ({
      ...behavior,
      id: `knowledge-behavior:${actionPackage.packageId}:${index + 1}`,
      source: 'new',
      confirmed: false,
    })),
    knowledgeSource: {
      packageType: actionPackage.packageType,
      schemaVersion: actionPackage.schemaVersion,
      packageId: actionPackage.packageId,
      knowledgeTitle: actionPackage.knowledge.title,
      knowledgeReference: actionPackage.knowledge.reference,
      principle: actionPackage.knowledge.principle,
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
  const [activities, settings, activeSeason] = await Promise.all([
    database.activities.toArray(),
    database.settings.toArray(),
    database.seasons.where('status').equals('active').first(),
  ])
  const currentDraftSetting = settings.find((setting) => setting.key === 'coachPlanDraft')
  const currentDraft = currentDraftSetting?.key === 'coachPlanDraft' ? currentDraftSetting.value : undefined
  const metaSetting = settings.find((setting) => setting.key === 'meta')
  const imports = metaSetting?.key === 'meta' ? metaSetting.value.knowledgeActionImports ?? [] : []
  const blockingIssues: string[] = []

  if (currentDraft?.knowledgeSource?.packageId === actionPackage.packageId) {
    blockingIssues.push('这份知识行动包已经生成了当前规划草稿')
  } else if (imports.some((record) => record.packageId === actionPackage.packageId)) {
    blockingIssues.push('这份知识行动包已经激活过，不能重复导入')
  } else if (currentDraft) {
    blockingIssues.push('当前已有一份目标规划草稿，请先完成或重新规划后再导入')
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
  if (resultingKeyCount > 3) blockingIssues.push('启用后的关键行为不能超过 3 项')

  const warnings: string[] = []
  if (duplicateActivities.length) {
    warnings.push('发现同名活动。进入规划器后请复用现有活动，或修改候选行为名称和标准，避免创建重复活动。')
  }
  if (activeSeason) {
    warnings.push('当前赛季仍在进行；导入只会保存为下个赛季草稿，不会修改当前关键行为。')
  } else if (currentKeyCount > 0) {
    warnings.push(`正式启动新赛季时，现有 ${currentKeyCount} 项关键行为会由确认后的行为方案替换。`)
  }

  return {
    actionPackage,
    draft: knowledgeActionPackageToDraft(actionPackage, now),
    duplicateActivities,
    blockingIssues,
    warnings,
    activeSeason: Boolean(activeSeason),
    currentKeyCount,
    resultingKeyCount,
    unchanged: [
      '现有活动与关键行为',
      '完成记录、XP 和金币',
      '当前赛季与赛季证据',
      '奖励、奖励券和奖励基金',
      '复盘、账本与历史记录',
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
