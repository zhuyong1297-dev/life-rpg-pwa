import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import trialActionExample from '../../examples/obsidian-application-trial.action.example.json'
import seasonActionExample from '../../examples/obsidian-application-season.action.example.json'
import planningContextExample from '../../examples/planning-context.example.json'
import applicationResultExample from '../../examples/application-result.example.json'
import { createBackup, restoreBackup } from '../backup'
import {
  completeApplicationTrial,
  createActivity,
  createSeason,
  getApplicationTrial,
  getSnapshot,
  initializeDatabase,
  LifeRpgDatabase,
  activateCoachPlanDraft,
} from '../db'
import {
  ApplicationResultPackageSchema,
  PlanningContextPackageSchema,
  createPlanningContextPackage,
  createTrialResultPackage,
} from '../application-bridge'
import {
  importKnowledgeActionPackage,
  KnowledgeActionPackageV2Schema,
  KnowledgeActionPackageSchema,
  previewKnowledgeActionPackage,
  type KnowledgeActionPackageV2,
} from '../knowledge-action-package'

let database: LifeRpgDatabase

const trialPackage: KnowledgeActionPackageV2 = {
  packageType: 'earth-online.obsidian-knowledge-action',
  schemaVersion: 2,
  packageId: 'demo.application.trial.v1',
  applicationId: 'app-20260725-demo',
  phase: 'trial',
  knowledge: {
    primary: {
      kind: 'principle',
      title: '复利在可再投入的正反馈中累积',
      reference: '20 Knowledge/复利在可再投入的正反馈中累积.md',
      principle: '把可保留的微小成果持续投入下一轮。',
    },
    supporting: [{
      kind: 'procedure',
      title: '每周学习复盘',
      reference: '20 Knowledge/每周学习复盘.md',
      contribution: '用固定复盘判断成果能否进入下一轮。',
    }],
  },
  application: {
    goal: '让学习笔记进入下一次学习',
    successCriterion: '两次学习都复用了上一次形成的知识卡',
    baseline: '每次学习通常从重新搜索开始',
    targetOutcome: '新问题能先调用已有知识再补充来源',
    outcomeIndicator: '两次学习中复用已有知识卡的次数和实际帮助',
  },
  behaviors: [{
    role: 'progress',
    title: '学习前检索旧知识',
    cue: '准备搜索新资料前',
    protocol: '先在 Knowledge 搜索当前问题，记录一条可复用结论。',
    domain: 'learning',
    difficulty: '简单',
    goal: { kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '分钟', thresholds: [120, 300] },
    schedule: { kind: 'daily' },
  }],
}

beforeEach(async () => {
  database = new LifeRpgDatabase(`application-bridge-test-${crypto.randomUUID()}`)
  await initializeDatabase(database)
})

afterEach(async () => {
  database.close()
  await database.delete()
})

function readyDraft<T extends Awaited<ReturnType<typeof importKnowledgeActionPackage>>>(draft: T) {
  return {
    ...draft,
    currentStep: 4 as const,
    status: 'ready' as const,
    behaviors: draft.behaviors.map((behavior) => ({ ...behavior, confirmed: true })),
    badDayConfirmed: true,
    evidenceConfirmed: true,
  }
}

describe('Obsidian Application 双向桥接', () => {
  it('仓库中的四份虚构交换样例符合公开契约', () => {
    expect(KnowledgeActionPackageSchema.parse(trialActionExample).schemaVersion).toBe(2)
    expect(KnowledgeActionPackageSchema.parse(seasonActionExample).schemaVersion).toBe(2)
    expect(PlanningContextPackageSchema.parse(planningContextExample).schemaVersion).toBe(1)
    expect(ApplicationResultPackageSchema.parse(applicationResultExample).schemaVersion).toBe(1)
  })

  it('校验一主两辅并拒绝非 principle 主知识', () => {
    expect(KnowledgeActionPackageV2Schema.parse(trialPackage).knowledge.supporting).toHaveLength(1)
    expect(KnowledgeActionPackageV2Schema.parse({
      ...trialPackage,
      derivedFromResultPackageId: null,
    }).derivedFromResultPackageId).toBeNull()
    expect(() => KnowledgeActionPackageV2Schema.parse({
      ...trialPackage,
      knowledge: {
        ...trialPackage.knowledge,
        primary: { ...trialPackage.knowledge.primary, kind: 'concept' },
      },
    })).toThrow()
    expect(() => KnowledgeActionPackageV2Schema.parse({
      ...trialPackage,
      knowledge: {
        ...trialPackage.knowledge,
        supporting: [
          ...trialPackage.knowledge.supporting,
          { ...trialPackage.knowledge.supporting[0], title: '辅助二' },
          { ...trialPackage.knowledge.supporting[0], title: '辅助三' },
        ],
      },
    })).toThrow()
  })

  it('启动严格 7 天试跑，结束后恢复仍有效的旧关键行为', async () => {
    const previous = await createActivity({
      title: '原关键行为',
      type: 'habit',
      domain: 'life',
      difficulty: '简单',
      goal: { count: 1, unit: '次' },
      schedule: { kind: 'daily' },
      isKey: true,
      enabled: true,
    }, database)
    const imported = await importKnowledgeActionPackage(trialPackage, database)
    await database.settings.put({ key: 'coachPlanDraft', value: readyDraft(imported) })
    const trial = await activateCoachPlanDraft(imported.id, '2026-07-25', database)
    expect(trial).toMatchObject({
      applicationId: trialPackage.applicationId,
      startsOn: '2026-07-25',
      endsOn: '2026-07-31',
      status: 'active',
    })
    expect((await database.activities.get(previous.id))?.isKey).toBe(false)
    await expect(completeApplicationTrial(
      trialPackage.applicationId,
      '尚未到期',
      'continue',
      '测试',
      '2026-07-30',
      database,
    )).rejects.toThrow('2026-07-31')

    const completed = await completeApplicationTrial(
      trialPackage.applicationId,
      '两次学习都先调用了旧知识，其中一次直接避免了重复搜索',
      'continue',
      '现实帮助明确，值得扩展周期',
      '2026-07-31',
      database,
    )
    expect(completed.status).toBe('completed')
    expect((await database.activities.get(previous.id))?.isKey).toBe(true)
    expect(completed.behaviorResults?.[0]).toMatchObject({ planned: 7, completed: 0, activeDays: 0 })
  })

  it('试跑激活写入失败时事务回滚', async () => {
    const draft = await importKnowledgeActionPackage(trialPackage, database)
    await database.settings.put({ key: 'coachPlanDraft', value: readyDraft(draft) })
    const before = await getSnapshot(database)
    const put = vi.spyOn(database.settings, 'put').mockRejectedValueOnce(new Error('模拟试跑写入失败'))
    await expect(activateCoachPlanDraft(draft.id, '2026-07-25', database)).rejects.toThrow('模拟试跑写入失败')
    put.mockRestore()
    expect(await getSnapshot(database)).toEqual(before)
  })

  it('试跑继续进入既有备份 schema 11，恢复时不增加表', async () => {
    const draft = await importKnowledgeActionPackage(trialPackage, database)
    await database.settings.put({ key: 'coachPlanDraft', value: readyDraft(draft) })
    await activateCoachPlanDraft(draft.id, '2026-07-25', database)
    const backup = await createBackup(database)
    expect(backup).toMatchObject({ schemaVersion: 11, appVersion: '5.2.1' })
    expect(backup.settings.find((setting) => setting.key === 'applicationTrial')).toBeDefined()

    const restored = new LifeRpgDatabase(`application-bridge-restore-${crypto.randomUUID()}`)
    try {
      await initializeDatabase(restored)
      await restoreBackup(backup, restored)
      expect(await getApplicationTrial(restored)).toMatchObject({
        applicationId: trialPackage.applicationId,
        endsOn: '2026-07-31',
      })
      expect(restored.tables).toHaveLength(8)
    } finally {
      restored.close()
      await restored.delete()
    }
  })

  it('试跑进行中允许保存下一份草稿，但阻止启动其他试跑和手动赛季', async () => {
    const draft = await importKnowledgeActionPackage(trialPackage, database)
    await database.settings.put({ key: 'coachPlanDraft', value: readyDraft(draft) })
    await activateCoachPlanDraft(draft.id, '2026-07-25', database)
    await expect(createSeason({
      title: '并发赛季',
      successCriterion: '不应创建',
      baseline: '无',
      targetOutcome: '无',
      focusActivityIds: [(await getApplicationTrial(database))!.focusActivities[0].activityId],
    }, '2026-07-25', database)).rejects.toThrow('7 天试跑')
    const preview = await previewKnowledgeActionPackage({
      ...trialPackage,
      packageId: 'demo.application.other.v1',
      applicationId: 'app-20260725-other',
    }, database)
    expect(preview.blockingIssues).toEqual([])
    expect(preview.warnings).toContain('当前 7 天试跑仍在进行；可以先保存规划草稿，但本轮试跑结束前不能启动新阶段。')
    const pendingDraft = await importKnowledgeActionPackage({
      ...trialPackage,
      packageId: 'demo.application.other.v1',
      applicationId: 'app-20260725-other',
    }, database)
    await database.settings.put({ key: 'coachPlanDraft', value: readyDraft(pendingDraft) })
    await expect(activateCoachPlanDraft(pendingDraft.id, '2026-07-25', database)).rejects.toThrow('7 天试跑')
  })

  it('赛季进行中允许保存试跑草稿，但仍阻止启动试跑', async () => {
    const focus = await createActivity({
      title: '既有赛季行为',
      type: 'habit',
      domain: 'health',
      difficulty: '简单',
      goal: { count: 1, unit: '次' },
      schedule: { kind: 'daily' },
      isKey: true,
      enabled: true,
    }, database)
    await createSeason({
      title: '进行中的赛季',
      successCriterion: '保持当前节奏',
      baseline: '已有节奏',
      targetOutcome: '继续执行',
      focusActivityIds: [focus.id],
    }, '2026-07-25', database)

    const preview = await previewKnowledgeActionPackage(trialPackage, database)
    expect(preview.blockingIssues).toEqual([])
    expect(preview.warnings).toContain('当前 28 天赛季仍在进行；可以先保存规划草稿，但当前赛季结束前不能启动新阶段。')
    const pendingDraft = await importKnowledgeActionPackage(trialPackage, database)
    await database.settings.put({ key: 'coachPlanDraft', value: readyDraft(pendingDraft) })
    await expect(activateCoachPlanDraft(pendingDraft.id, '2026-07-25', database)).rejects.toThrow('同一时间只能进行一个试跑或赛季')
  })

  it('结果包和规划上下文只包含最小聚合数据', async () => {
    const draft = await importKnowledgeActionPackage(trialPackage, database)
    await database.settings.put({ key: 'coachPlanDraft', value: readyDraft(draft) })
    await activateCoachPlanDraft(draft.id, '2026-07-25', database)
    const active = (await getApplicationTrial(database))!
    const context = createPlanningContextPackage(active, undefined, (await getSnapshot(database)).activities, new Date('2026-07-25T08:00:00.000Z'))
    expect(context.activeCycle).toMatchObject({ phase: 'trial', startsOn: '2026-07-25', endsOn: '2026-07-31' })
    const contextJson = JSON.stringify(context)
    for (const forbidden of ['completions', 'occurredOn', '"xp"', 'coins', 'rewards', 'ledger']) {
      expect(contextJson.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }

    const completed = await completeApplicationTrial(
      trialPackage.applicationId,
      '完成两次复用',
      'adjust',
      '保留检索动作，但降低记录负担',
      '2026-07-31',
      database,
    )
    const result = createTrialResultPackage(completed, new Date('2026-07-31T08:00:00.000Z'))
    expect(ApplicationResultPackageSchema.parse(result).resultPackageId).toBe(
      `result:${trialPackage.applicationId}:trial:${trialPackage.packageId}`,
    )
    const resultJson = JSON.stringify(result)
    for (const forbidden of ['occurredOn', '"xp"', 'coins', 'rewards', 'ledgerEvents', 'wishes', '"knowledge"']) {
      expect(resultJson).not.toContain(forbidden)
    }
  })

  it('正式赛季必须引用同一 Application 的本机试跑结果', async () => {
    const draft = await importKnowledgeActionPackage(trialPackage, database)
    await database.settings.put({ key: 'coachPlanDraft', value: readyDraft(draft) })
    await activateCoachPlanDraft(draft.id, '2026-07-25', database)
    const completed = await completeApplicationTrial(
      trialPackage.applicationId,
      '试跑有效',
      'continue',
      '扩展验证',
      '2026-07-31',
      database,
    )
    const result = createTrialResultPackage(completed)
    const seasonPackage = {
      ...trialPackage,
      packageId: 'demo.application.season.v1',
      phase: 'season' as const,
      derivedFromResultPackageId: result.resultPackageId,
      application: {
        ...trialPackage.application,
        targetOutcome: '28 天内稳定复用知识并减少重复搜索',
      },
    }
    expect((await previewKnowledgeActionPackage(seasonPackage, database)).blockingIssues).toEqual([])
    const seasonDraft = await importKnowledgeActionPackage(seasonPackage, database)
    await database.settings.put({ key: 'coachPlanDraft', value: readyDraft(seasonDraft) })
    const season = await activateCoachPlanDraft(seasonDraft.id, '2026-08-01', database)
    expect(season).toMatchObject({
      startsOn: '2026-08-01',
      endsOn: '2026-08-28',
      applicationContext: {
        applicationId: trialPackage.applicationId,
        derivedFromResultPackageId: result.resultPackageId,
      },
    })

    const invalidPreview = await previewKnowledgeActionPackage({
      ...seasonPackage,
      packageId: 'demo.application.season.invalid',
      derivedFromResultPackageId: 'result:wrong',
    }, database)
    expect(invalidPreview.blockingIssues).toContain('正式赛季没有引用本机生成的试跑结果包')
    expect(invalidPreview.warnings).toContain('当前 28 天赛季仍在进行；可以先保存规划草稿，但当前赛季结束前不能启动新阶段。')
  })
})
