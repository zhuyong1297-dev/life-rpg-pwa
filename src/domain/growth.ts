import { type LedgerEvent } from './activities'
import { type LevelMilestone, type LevelSystem } from './settings'
import { attributes, growthDomains, type Attribute, type GrowthDomain } from './taxonomy'

export interface CharacterStats {
  totalXp: number
  coins: number
  attributeXp: Record<Attribute, number>
  domainXp: Record<GrowthDomain, number>
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

export function getTotalXpForLevel(level: number) {
  const safeLevel = Math.max(1, Math.floor(level))
  return 50 * safeLevel * (safeLevel - 1)
}

export function getCharacterStage(level: number) {
  if (level <= 2) return 1
  if (level <= 5) return 2
  if (level <= 9) return 3
  return 4
}

export function getCharacterStageName(level: number) {
  const names = ['启程者', '行动者', '践行者', '塑造者'] as const
  return names[getCharacterStage(level) - 1]
}

export function getMilestoneVoucherCost(level: number) {
  if (level === 3) return 30
  if (level === 6) return 80
  if (level === 10 || (level > 10 && level % 5 === 0)) return 200
  return undefined
}

export function getNextVoucherLevel(level: number) {
  if (level < 3) return 3
  if (level < 6) return 6
  if (level < 10) return 10
  return Math.ceil((level + 1) / 5) * 5
}

export function createLevelSystem(totalXp: number, activatedAt = new Date().toISOString()): LevelSystem {
  const level = getLevel(totalXp).level
  return { activatedAt, baselineLevel: level, highestLevelReached: level, milestones: [] }
}

export interface LevelReport {
  activeDays: number
  completionCount: number
  attributeXp: Record<Attribute, number>
  strongestAttribute?: Attribute
  domainXp: Record<GrowthDomain, number>
  strongestDomain?: GrowthDomain
  topActions: Array<{ title: string; xp: number }>
}

export function getLevelReport(events: LedgerEvent[], milestone: LevelMilestone, periodStart: string): LevelReport {
  const corrections = new Set(
    events
      .filter((event) => event.kind === 'correction' && event.createdAt <= milestone.reachedAt)
      .map((event) => event.sourceId),
  )
  const rewards = events.filter(
    (event) =>
      event.kind === 'reward' &&
      event.createdAt > periodStart &&
      event.createdAt <= milestone.reachedAt &&
      !corrections.has(event.id),
  )
  const attributeXp = Object.fromEntries(attributes.map((attribute) => [attribute, 0])) as Record<Attribute, number>
  const domainXp = Object.fromEntries(growthDomains.map((domain) => [domain, 0])) as Record<GrowthDomain, number>
  const completions = new Map<string, { title: string; xp: number; occurredOn: string }>()
  for (const event of rewards) {
    if (event.attribute) attributeXp[event.attribute] += event.xpDelta
    if (event.domain) domainXp[event.domain] += event.xpDelta
    const current = completions.get(event.sourceId)
    completions.set(event.sourceId, {
      title: current?.title ?? event.title,
      xp: (current?.xp ?? 0) + event.xpDelta,
      occurredOn: current?.occurredOn ?? event.occurredOn,
    })
  }
  const strongestAttribute = [...attributes]
    .sort((left, right) => attributeXp[right] - attributeXp[left])
    .find((attribute) => attributeXp[attribute] > 0)
  const strongestDomain = [...growthDomains]
    .sort((left, right) => domainXp[right] - domainXp[left])
    .find((domain) => domainXp[domain] > 0)
  return {
    activeDays: new Set([...completions.values()].map((completion) => completion.occurredOn)).size,
    completionCount: completions.size,
    attributeXp,
    strongestAttribute,
    domainXp,
    strongestDomain,
    topActions: [...completions.values()]
      .sort((left, right) => right.xp - left.xp)
      .slice(0, 3)
      .map(({ title, xp }) => ({ title, xp })),
  }
}
