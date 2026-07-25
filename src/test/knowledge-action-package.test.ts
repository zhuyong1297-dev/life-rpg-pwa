import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup, restoreBackup } from '../backup'
import { activateCoachPlanDraft, createActivity, getCoachPlanDraft, getSnapshot, initializeDatabase, LifeRpgDatabase } from '../db'
import {
  importKnowledgeActionPackage,
  KnowledgeActionPackageSchema,
  previewKnowledgeActionPackage,
  type KnowledgeActionPackage,
} from '../knowledge-action-package'

let database: LifeRpgDatabase

const examplePackage: KnowledgeActionPackage = {
  packageType: 'earth-online.obsidian-knowledge-action',
  schemaVersion: 1,
  packageId: 'demo.compound-interest.v1',
  knowledge: {
    title: '复利法则',
    reference: 'Knowledge/思维模型/复利法则.md',
    principle: '把足够小且可以持续的投入放进正向反馈循环。',
  },
  application: {
    goal: '建立稳定学习节奏',
    successCriterion: '28 天内至少 20 天完成基础学习，并产出 4 份学习笔记',
    baseline: '学习容易依赖临时动力，连续性不足',
    targetOutcome: '形成每天可启动、每周有产出的学习节奏',
  },
  behaviors: [
    {
      role: 'start',
      title: '打开当天学习材料',
      scheduledTime: '08:30',
      cue: '早餐结束后',
      protocol: '打开材料并写下一句今天要理解的问题。',
      domain: 'learning',
      difficulty: '简单',
      goal: { kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '分钟', thresholds: [120, 300] },
      schedule: { kind: 'daily' },
    },
    {
      role: 'progress',
      title: '完成一次深度学习',
      cue: '第一段完整空闲时间开始时',
      protocol: '只处理一个学习问题，结束后写三句摘要。',
      domain: 'learning',
      difficulty: '普通',
      goal: { kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '分钟', thresholds: [600, 1500] },
      schedule: { kind: 'weekly', times: 4 },
    },
  ],
}

beforeEach(async () => {
  database = new LifeRpgDatabase(`knowledge-package-test-${crypto.randomUUID()}`)
  await initializeDatabase(database)
})

afterEach(async () => {
  database.close()
  await database.delete()
})

describe('Obsidian 知识行动包', () => {
  it('完整校验合法行动包并原子生成未确认的规划草稿', async () => {
    const preview = await previewKnowledgeActionPackage(examplePackage, database, new Date('2026-07-25T08:00:00.000Z'))
    expect(preview.blockingIssues).toEqual([])
    expect(preview.resultingKeyCount).toBe(2)
    expect(preview.unchanged).toContain('完成记录、XP 和金币')

    const draft = await importKnowledgeActionPackage(examplePackage, database, new Date('2026-07-25T08:00:00.000Z'))
    expect(draft).toMatchObject({
      title: '建立稳定学习节奏',
      currentStep: 1,
      status: 'editing',
      knowledgeSource: {
        packageId: examplePackage.packageId,
        knowledgeTitle: '复利法则',
        knowledgeReference: 'Knowledge/思维模型/复利法则.md',
      },
    })
    expect(draft.behaviors).toHaveLength(2)
    expect(draft.behaviors.every((behavior) => !behavior.confirmed)).toBe(true)
    expect(await database.activities.count()).toBe(0)
    expect(await database.seasons.count()).toBe(0)
  })

  it('拒绝非法 schema 且数据库完全不变', async () => {
    const before = await getSnapshot(database)
    const invalid = { ...examplePackage, packageType: 'earth-online-backup', behaviors: [] }
    expect(() => KnowledgeActionPackageSchema.parse(invalid)).toThrow()
    await expect(importKnowledgeActionPackage(invalid, database)).rejects.toThrow()
    expect(await getSnapshot(database)).toEqual(before)
  })

  it('识别当前草稿和已经激活过的重复行动包', async () => {
    const firstDraft = await importKnowledgeActionPackage(examplePackage, database)
    const pendingPreview = await previewKnowledgeActionPackage(examplePackage, database)
    expect(pendingPreview.blockingIssues).toContain('这份知识行动包已经生成了当前规划草稿')

    const readyDraft = {
      ...firstDraft,
      currentStep: 4 as const,
      status: 'ready' as const,
      behaviors: firstDraft.behaviors.map((behavior) => ({ ...behavior, confirmed: true })),
      badDayConfirmed: true,
      evidenceConfirmed: true,
    }
    await database.settings.put({ key: 'coachPlanDraft', value: readyDraft })
    await activateCoachPlanDraft(readyDraft.id, '2026-07-25', database)

    const activatedPreview = await previewKnowledgeActionPackage(examplePackage, database)
    expect(activatedPreview.blockingIssues).toContain('这份知识行动包已经激活过，不能重复导入')
    const meta = await database.settings.get('meta')
    expect(meta?.key === 'meta' && meta.value.knowledgeActionImports?.[0]).toMatchObject({
      packageId: examplePackage.packageId,
      knowledgeReference: 'Knowledge/思维模型/复利法则.md',
    })
  })

  it('预览同名活动但不会修改活动或账本', async () => {
    const activity = await createActivity({
      title: '打开当天学习材料',
      type: 'habit',
      domain: 'learning',
      difficulty: '简单',
      goal: { count: 1, unit: '次' },
      schedule: { kind: 'daily' },
      isKey: false,
      enabled: true,
    }, database)
    const before = await getSnapshot(database)
    const preview = await previewKnowledgeActionPackage(examplePackage, database)
    expect(preview.duplicateActivities).toEqual([
      expect.objectContaining({ behaviorIndex: 0, activityId: activity.id, state: '进行中' }),
    ])
    expect(preview.warnings[0]).toContain('复用现有活动')
    expect(await getSnapshot(database)).toEqual(before)
  })

  it('拒绝超过三项行为的包且不占用关键行为名额', async () => {
    const tooMany = {
      ...examplePackage,
      behaviors: [
        ...examplePackage.behaviors,
        { ...examplePackage.behaviors[0], title: '第三项' },
        { ...examplePackage.behaviors[0], title: '第四项' },
      ],
    }
    await expect(importKnowledgeActionPackage(tooMany, database)).rejects.toThrow()
    expect(await getCoachPlanDraft(database)).toBeUndefined()
    expect(await database.activities.count()).toBe(0)
  })

  it('当前数据已超过关键行为上限时只报告问题且不写草稿', async () => {
    const first = await createActivity({
      title: '异常关键行为 1',
      type: 'habit',
      domain: 'life',
      difficulty: '简单',
      goal: { count: 1, unit: '次' },
      schedule: { kind: 'daily' },
      isKey: true,
      enabled: true,
    }, database)
    await database.activities.bulkAdd([2, 3, 4].map((index) => ({
      ...first,
      id: `corrupt-key-${index}`,
      title: `异常关键行为 ${index}`,
    })))

    const preview = await previewKnowledgeActionPackage(examplePackage, database)
    expect(preview.currentKeyCount).toBe(4)
    expect(preview.blockingIssues).toContain('当前关键行为已经超过 3 项，请先修正活动状态')
    await expect(importKnowledgeActionPackage(examplePackage, database)).rejects.toThrow('超过 3 项')
    expect(await getCoachPlanDraft(database)).toBeUndefined()
  })

  it('草稿写入失败时事务回滚且原有完整备份恢复仍可用', async () => {
    const backup = await createBackup(database)
    const put = vi.spyOn(database.settings, 'put').mockRejectedValueOnce(new Error('模拟写入失败'))
    await expect(importKnowledgeActionPackage(examplePackage, database)).rejects.toThrow('模拟写入失败')
    put.mockRestore()
    expect(await getCoachPlanDraft(database)).toBeUndefined()
    expect(await database.activities.count()).toBe(0)

    await restoreBackup(backup, database)
    const restored = await createBackup(database)
    expect({ ...restored, exportedAt: backup.exportedAt }).toEqual(backup)
  })
})
