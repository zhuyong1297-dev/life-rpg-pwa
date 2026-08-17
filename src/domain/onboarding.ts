import type { Completion } from './activities'
import { gameDate } from './dates'
import type { OnboardingState, Setting } from './settings'

export interface OnboardingSummary {
  currentDay: number
  activeDays: number
  primaryCompletionDays: number
}

export interface NewcomerDataFootprint {
  activityCount: number
  completionCount: number
  ledgerEventCount: number
  rewardCount: number
  rewardClaimCount: number
  weeklyReviewCount: number
  seasonCount: number
  settings: readonly Setting[]
}

function hasUserOwnedSetting(setting: Setting) {
  if (setting.key === 'coachPlanDraft' || setting.key === 'applicationTrial' || setting.key === 'applicationTrialRestart') return true
  if (setting.key === 'rewardSystem') return Boolean(setting.value.activeRewardId || setting.value.queueIds.length)
  if (setting.key !== 'meta') return false
  const meta = setting.value
  return Boolean(
    meta.migrationImportedAt
    || meta.targetRewardId
    || meta.todayActionPriority?.activityIds.length
    || meta.knowledgeActionImports?.length
    || meta.onboarding?.startedOn,
  )
}

export function isNewcomerDataFootprintEmpty(input: NewcomerDataFootprint) {
  const counts = [
    input.activityCount,
    input.completionCount,
    input.ledgerEventCount,
    input.rewardCount,
    input.rewardClaimCount,
    input.weeklyReviewCount,
    input.seasonCount,
  ]
  return counts.every((count) => count === 0) && !input.settings.some(hasUserOwnedSetting)
}

function calendarDayNumber(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

export function getOnboardingSummary(
  onboarding: OnboardingState | undefined,
  completions: readonly Completion[],
  nowOrGameDate: Date | string = new Date(),
): OnboardingSummary | undefined {
  if (!onboarding?.startedOn || !onboarding.primaryActivityId) return undefined

  const today = typeof nowOrGameDate === 'string' ? nowOrGameDate : gameDate(nowOrGameDate)
  const startedOn = onboarding.startedOn
  const primaryActivityId = onboarding.primaryActivityId
  const elapsedDays = Math.max(0, calendarDayNumber(today) - calendarDayNumber(startedOn))
  const currentDay = elapsedDays + 1
  const lastIncludedDay = Math.min(calendarDayNumber(today), calendarDayNumber(startedOn) + 6)
  const active = completions.filter((completion) => {
    if (completion.status !== 'active') return false
    const occurredOn = calendarDayNumber(completion.occurredOn)
    return occurredOn >= calendarDayNumber(startedOn) && occurredOn <= lastIncludedDay
  })

  return {
    currentDay,
    activeDays: new Set(active.map((completion) => completion.occurredOn)).size,
    primaryCompletionDays: new Set(
      active
        .filter((completion) => completion.activityId === primaryActivityId)
        .map((completion) => completion.occurredOn),
    ).size,
  }
}
