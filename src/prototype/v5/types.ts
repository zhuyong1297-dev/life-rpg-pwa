import { getLevel, type GrowthDomain, type JourneyEntry, type TierLevel } from '../../domain'

export type V5Page = 'today' | 'growth' | 'review' | 'rewards' | 'profile'

export interface V5FeedbackView {
  completionId: string
  activityId?: string
  title: string
  domain: GrowthDomain
  xp: number
  coins: number
  progressLabel?: string
  tier?: TierLevel
  ratingValue?: number
  ratingPrompt?: string
  level: ReturnType<typeof getLevel>
  leveledUp?: boolean
  followUp?: { kind: 'daily-signal'; seasonId: string } | { kind: 'rating-note'; activityId: string }
}

export interface V5ActionRewardPreview {
  label: string
  coinDelta: number
  state: 'available' | 'upgrade' | 'earned' | 'unlock'
}

export interface V5DailyRewardSummary {
  xp: number
  coins: number
  actionCount: number
}


export interface V5Stats {
  totalXp: number
  coins: number
  domainXp: Record<GrowthDomain, number>
}

export interface V5DomainGrowthDetail {
  domain: GrowthDomain
  level: ReturnType<typeof getLevel>
  totalXp: number
  recentXp: number
  actionCount: number
  activeDays: number
  topActions: Array<{ title: string; xp: number; count: number }>
  recentEntries: JourneyEntry[]
}
