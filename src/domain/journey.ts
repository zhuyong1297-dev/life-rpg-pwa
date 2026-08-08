import { calculateIncrementalProgress, type Completion, type IncrementalTieredGoal, type LedgerEvent } from './activities'
import { formatDurationSeconds, type RatingGoal, type TieredGoal } from './goals'
import { getCharacterStageName, type CharacterStats } from './growth'
import { type LevelSystem } from './settings'
import { attributes, growthDomains, type Attribute, type GrowthDomain, type TierLevel } from './taxonomy'

export interface JourneyEntry {
  id: string
  kind: 'action' | 'level' | 'voucher'
  occurredOn: string
  createdAt: string
  title: string
  attribute?: Attribute
  domain?: GrowthDomain
  xp: number
  coins: number
  tier?: TierLevel
  note?: string
  durationMinutes?: number
  durationSeconds?: number
  count?: number
  progressLabel?: string
  tierGoalSnapshot?: TieredGoal
  ratingValue?: number
  ratingGoalSnapshot?: RatingGoal
  level?: number
}

export interface JourneyDay {
  date: string
  entries: JourneyEntry[]
  actionCount: number
  hasMilestone: boolean
}

export interface JourneyMonth {
  month: string
  label: string
  activeDays: number
  actionCount: number
  xp: number
  coins: number
  strongestAttribute?: Attribute
  strongestDomain?: GrowthDomain
  days: JourneyDay[]
}

export function getJourneyMonths(completions: Completion[], events: LedgerEvent[], levelSystem?: LevelSystem): JourneyMonth[] {
  const correctedRewards = new Set(events.filter((event) => event.kind === 'correction').map((event) => event.sourceId))
  const rewardsByCompletion = new Map<string, LedgerEvent[]>()
  events
    .filter((event) => event.kind === 'reward' && !correctedRewards.has(event.id))
    .forEach((event) => rewardsByCompletion.set(event.sourceId, [...(rewardsByCompletion.get(event.sourceId) ?? []), event]))

  const activeCompletions = completions.filter((completion) => completion.status === 'active')
  const entries: JourneyEntry[] = activeCompletions
    .filter((completion) => !completion.progress)
    .flatMap((completion) => {
      const rewards = rewardsByCompletion.get(completion.id) ?? []
      if (rewards.length === 0) return []
      const first = [...rewards].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]
      return [{
        id: `action:${completion.id}`,
        kind: 'action' as const,
        occurredOn: completion.occurredOn,
        createdAt: first.createdAt,
        title: completion.titleSnapshot ?? first.title.replace(/^层次升级：/, '').replace(/（(?:标准|突破)）$/, ''),
        attribute: completion.attributeSnapshot ?? first.attribute,
        domain: completion.domainSnapshot ?? first.domain,
        xp: rewards.reduce((total, event) => total + event.xpDelta, 0),
        coins: rewards.reduce((total, event) => total + event.coinDelta, 0),
        tier: completion.tier,
        note: completion.note,
        durationMinutes: completion.durationMinutes,
        tierGoalSnapshot: completion.tierGoalSnapshot,
        ratingValue: completion.ratingValue,
        ratingGoalSnapshot: completion.ratingGoalSnapshot,
      }]
    })

  const progressGroups = new Map<string, Completion[]>()
  activeCompletions.filter((completion) => completion.progress).forEach((completion) => {
    const key = `${completion.activityId}:${completion.occurredOn}:${completion.progress!.cycleStart}`
    progressGroups.set(key, [...(progressGroups.get(key) ?? []), completion])
  })
  for (const [key, group] of progressGroups) {
    const first = [...group].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]
    const goal = first.tierGoalSnapshot
    if (!goal || !('progressMode' in goal) || goal.progressMode !== 'incremental') continue
    const progress = calculateIncrementalProgress(goal as IncrementalTieredGoal, group)
    const cumulative = calculateIncrementalProgress(
      goal as IncrementalTieredGoal,
      activeCompletions.filter((completion) => completion.activityId === first.activityId && completion.progress?.cycleStart === first.progress?.cycleStart && completion.occurredOn <= first.occurredOn),
    )
    const cumulativeLabel = cumulative.goal.metric === 'count'
      ? `${cumulative.totalCount}/${cumulative.goal.thresholds[1]}${cumulative.goal.unit}`
      : (() => {
        const standard = cumulative.goal.thresholds[1]
        return `${cumulative.totalCount}/${standard.count} 次${cumulative.goal.mode === 'total' ? ` · ${formatDurationSeconds(cumulative.totalDurationSeconds)}/${formatDurationSeconds(standard.durationSeconds)}` : ''}`
      })()
    const rewards = group.flatMap((completion) => rewardsByCompletion.get(completion.id) ?? [])
    entries.push({
      id: `action:${key}`,
      kind: 'action',
      occurredOn: first.occurredOn,
      createdAt: [...group].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0].createdAt,
      title: first.titleSnapshot ?? rewards[0]?.title ?? '累计行动',
      attribute: first.attributeSnapshot ?? rewards[0]?.attribute,
      domain: first.domainSnapshot ?? rewards[0]?.domain,
      xp: rewards.reduce((total, event) => total + event.xpDelta, 0),
      coins: rewards.reduce((total, event) => total + event.coinDelta, 0),
      tier: progress.highestTier,
      durationSeconds: progress.totalDurationSeconds || undefined,
      count: progress.totalCount,
      progressLabel: `完成 ${progress.totalCount} 次${progress.totalDurationSeconds ? ` · ${formatDurationSeconds(progress.totalDurationSeconds)}` : ''} · 本周累计 ${cumulativeLabel}`,
      tierGoalSnapshot: goal,
    })
  }

  const eventById = new Map(events.map((event) => [event.id, event]))
  for (const milestone of levelSystem?.milestones ?? []) {
    const source = eventById.get(milestone.sourceEventId)
    if (source) {
      entries.push({
        id: `level:${milestone.level}`,
        kind: 'level',
        occurredOn: source.occurredOn,
        createdAt: milestone.reachedAt,
        title: `达到 Lv.${milestone.level} · ${getCharacterStageName(milestone.level)}`,
        xp: 0,
        coins: 0,
        level: milestone.level,
      })
    }
  }
  events.filter((event) => event.kind === 'milestone').forEach((event) => entries.push({
    id: event.id,
    kind: 'voucher',
    occurredOn: event.occurredOn,
    createdAt: event.createdAt,
    title: event.title,
    xp: 0,
    coins: 0,
  }))

  const months = new Map<string, JourneyEntry[]>()
  entries.forEach((entry) => {
    const month = entry.occurredOn.slice(0, 7)
    months.set(month, [...(months.get(month) ?? []), entry])
  })
  return [...months.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([month, monthEntries]) => {
      const dayMap = new Map<string, JourneyEntry[]>()
      monthEntries.forEach((entry) => dayMap.set(entry.occurredOn, [...(dayMap.get(entry.occurredOn) ?? []), entry]))
      const actions = monthEntries.filter((entry) => entry.kind === 'action')
      const attributeXp = Object.fromEntries(attributes.map((attribute) => [attribute, 0])) as Record<Attribute, number>
      const domainXp = Object.fromEntries(growthDomains.map((domain) => [domain, 0])) as Record<GrowthDomain, number>
      actions.forEach((entry) => { if (entry.attribute) attributeXp[entry.attribute] += entry.xp })
      actions.forEach((entry) => { if (entry.domain) domainXp[entry.domain] += entry.xp })
      const strongestAttribute = [...attributes].sort((left, right) => attributeXp[right] - attributeXp[left]).find((attribute) => attributeXp[attribute] > 0)
      const strongestDomain = [...growthDomains].sort((left, right) => domainXp[right] - domainXp[left]).find((domain) => domainXp[domain] > 0)
      const [year, monthNumber] = month.split('-')
      return {
        month,
        label: `${year} 年 ${Number(monthNumber)} 月`,
        activeDays: new Set(actions.map((entry) => entry.occurredOn)).size,
        actionCount: actions.length,
        xp: actions.reduce((total, entry) => total + entry.xp, 0),
        coins: actions.reduce((total, entry) => total + entry.coins, 0),
        strongestAttribute,
        strongestDomain,
        days: [...dayMap.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([date, dayEntries]) => ({
          date,
          entries: dayEntries.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
          actionCount: dayEntries.filter((entry) => entry.kind === 'action').length,
          hasMilestone: dayEntries.some((entry) => entry.kind !== 'action'),
        })),
      }
    })
}

export function calculateStats(events: LedgerEvent[]): CharacterStats {
  const attributeXp = Object.fromEntries(attributes.map((attribute) => [attribute, 0])) as Record<Attribute, number>
  const domainXp = Object.fromEntries(growthDomains.map((domain) => [domain, 0])) as Record<GrowthDomain, number>
  let totalXp = 0
  let coins = 0
  for (const event of events) {
    totalXp += event.xpDelta
    coins += event.coinDelta
    if (event.attribute) attributeXp[event.attribute] += event.xpDelta
    if (event.domain) domainXp[event.domain] += event.xpDelta
  }
  return { totalXp, coins, attributeXp, domainXp }
}
