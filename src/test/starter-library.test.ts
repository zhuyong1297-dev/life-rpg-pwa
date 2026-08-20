import { describe, expect, it } from 'vitest'

import { ActivitySchema, CoachPlanDraftSchema, growthDomains } from '../domain'
import {
  buildStarterActivity,
  buildStarterPlanDraft,
  getStarterHabitsForDomain,
  starterHabitTemplates,
  starterPlanTemplates,
} from '../features/starter-library'

describe('新手习惯与计划库', () => {
  it('六个成长领域各提供两项合法的每日两层习惯', () => {
    expect(starterHabitTemplates).toHaveLength(12)
    expect(new Set(starterHabitTemplates.map((item) => item.id)).size).toBe(12)

    for (const domain of growthDomains) {
      const templates = getStarterHabitsForDomain(domain)
      expect(templates).toHaveLength(2)
      for (const template of templates) {
        expect(template.domain).toBe(domain)
        expect(template.type).toBe('habit')
        expect(template.schedule).toEqual({ kind: 'daily' })
        expect(template.goal.kind).toBe('tiered')
        if (template.goal.kind === 'tiered') expect(template.goal.thresholds).toHaveLength(2)
        expect(() => ActivitySchema.parse({
          ...buildStarterActivity(template, false),
          id: `activity:${template.id}`,
          createdAt: '2026-08-20T08:00:00.000Z',
        })).not.toThrow()
      }
    }
  })

  it('只在确认时构造新行动，关键状态由调用方明确决定', () => {
    const template = starterHabitTemplates[0]
    expect(buildStarterActivity(template, true)).toMatchObject({ title: template.title, isKey: true, enabled: true })
    expect(buildStarterActivity(template, false)).toMatchObject({ title: template.title, isKey: false, enabled: true })
    expect(buildStarterActivity(template, false)).not.toHaveProperty('id')
    expect(buildStarterActivity(template, false)).not.toHaveProperty('summary')
  })

  it('四套计划生成可自动保存但尚未确认的现有规划草稿', () => {
    expect(starterPlanTemplates).toHaveLength(4)
    expect(new Set(starterPlanTemplates.map((item) => item.id)).size).toBe(4)

    for (const [index, template] of starterPlanTemplates.entries()) {
      const draft = buildStarterPlanDraft(template, new Date('2026-08-20T08:00:00.000Z'), `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)
      expect(() => CoachPlanDraftSchema.parse(draft)).not.toThrow()
      expect(draft.status).toBe('editing')
      expect(draft.currentStep).toBe(1)
      expect(draft.baseline).toBe('')
      expect(draft.behaviors).toHaveLength(3)
      expect(draft.behaviors.every((behavior) => behavior.source === 'new' && !behavior.confirmed)).toBe(true)
      expect(draft.badDayConfirmed).toBe(false)
      expect(draft.evidenceConfirmed).toBe(false)
    }
  })
})
