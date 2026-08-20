import { addDays, gameDate } from './dates'
import { getEffectiveHabitAnchor, type Activity, type HabitAnchor } from './activities'

export interface HabitFormationReview {
  startedOn: string
  endedOn: string
  completedDays: number
  adherence: number
  anchor?: HabitAnchor
  anchorLabel: string
}

export function habitAnchorLabel(anchor?: HabitAnchor) {
  if (!anchor) return '暂未设置'
  if (anchor.kind === 'time') return `每天 ${anchor.time}`
  if (anchor.kind === 'event') return `${anchor.label}之后`
  return `${anchor.titleSnapshot}完成后`
}

export function getHabitFormationReview(
  activity: Activity,
  completions: Array<{ activityId: string; occurredOn: string; status: 'active' | 'undone' }>,
  today: string,
): HabitFormationReview | undefined {
  if (activity.type !== 'habit' || activity.schedule.kind !== 'daily' || !activity.habitFormation) return undefined
  const startedOn = gameDate(new Date(activity.habitFormation.configuredAt))
  const endedOn = addDays(startedOn, 6)
  if (today < endedOn) return undefined
  const completedDays = new Set(completions
    .filter((completion) => completion.activityId === activity.id
      && completion.status === 'active'
      && completion.occurredOn >= startedOn
      && completion.occurredOn <= endedOn)
    .map((completion) => completion.occurredOn)).size
  const adherence = completedDays / 7
  if (adherence >= 0.6) return undefined
  const anchor = getEffectiveHabitAnchor(activity)
  return {
    startedOn,
    endedOn,
    completedDays,
    adherence,
    anchor,
    anchorLabel: habitAnchorLabel(anchor),
  }
}
