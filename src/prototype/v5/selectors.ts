import {
  addDays,
  calculateIncrementalProgress,
  domainLabel,
  formatDurationSeconds,
  getActivityScheduledTime,
  getEffectiveHabitAnchor,
  getCompletionTierGoal,
  getIncrementalCycleGoal,
  getLevel,
  getTierCount,
  getTierLevels,
  getTierReward,
  isTieredGoal,
  rewardTable,
  startOfWeek,
  tierLabels,
  type Activity,
  type Completion,
  type GrowthDomain,
  type JourneyMonth,
  type TierLevel,
} from '../../domain'
import type {
  V5ActionRewardPreview,
  V5DailyRewardSummary,
  V5DomainGrowthDetail,
  V5FeedbackView,
} from './types'

export function getV5NextTier(activity: Activity, completion?: Completion): TierLevel | undefined {
  if (!completion?.tier) return undefined
  const goal = getCompletionTierGoal(completion, activity)
  if (!goal) return undefined
  return getTierLevels(goal).find((tier) => tier > completion.tier!)
}


function formatXpRange(minimum: number, maximum: number) {
  return minimum === maximum ? `+${minimum} XP` : `+${minimum}～${maximum} XP`
}

function completionReward(activity: Activity, completion: Completion) {
  const difficulty = completion.difficultySnapshot ?? activity.difficulty
  const goal = completion.tier ? getCompletionTierGoal(completion, activity) : undefined
  return completion.tier && goal
    ? getTierReward(difficulty, completion.tier, getTierCount(goal))
    : rewardTable[difficulty]
}

export function getV5ActionRewardPreview(activity: Activity, completion?: Completion): V5ActionRewardPreview {
  if (!completion) {
    if (isTieredGoal(activity)) {
      const levels = getTierLevels(activity.goal)
      const first = getTierReward(activity.difficulty, levels[0], getTierCount(activity.goal))
      const last = getTierReward(activity.difficulty, levels.at(-1)!, getTierCount(activity.goal))
      return {
        label: `可得 ${formatXpRange(first.xp, last.xp)} · +${first.coins} 金币`,
        coinDelta: first.coins,
        state: 'available',
      }
    }
    const reward = rewardTable[activity.difficulty]
    return {
      label: `本次 +${reward.xp} XP · +${reward.coins} 金币`,
      coinDelta: reward.coins,
      state: 'available',
    }
  }

  const earned = completionReward(activity, completion)
  const goal = completion.tier ? getCompletionTierGoal(completion, activity) : undefined
  if (completion.tier && goal) {
    const remaining = getTierLevels(goal).filter((tier) => tier > completion.tier!)
    if (remaining.length > 0) {
      const deltas = remaining.map((tier) => getTierReward(
        completion.difficultySnapshot ?? activity.difficulty,
        tier,
        getTierCount(goal),
      ).xp - earned.xp)
      return {
        label: `升级可再得 ${formatXpRange(Math.min(...deltas), Math.max(...deltas))} · 金币已领取`,
        coinDelta: 0,
        state: 'upgrade',
      }
    }
  }

  return {
    label: `今日已获 +${earned.xp} XP · +${earned.coins} 金币`,
    coinDelta: 0,
    state: 'earned',
  }
}

export function getV5DailyRewardSummary(journeyMonths: JourneyMonth[], today: string): V5DailyRewardSummary {
  const entries = journeyMonths
    .flatMap((month) => month.days.filter((day) => day.date === today).flatMap((day) => day.entries))
    .filter((entry) => entry.kind === 'action' && (entry.xp > 0 || entry.coins > 0)) ?? []

  return {
    xp: entries.reduce((total, entry) => total + entry.xp, 0),
    coins: entries.reduce((total, entry) => total + entry.coins, 0),
    actionCount: entries.length,
  }
}

export function v5TierProgressLabel(activity: Activity, completion: Completion) {
  if (completion.ratingValue !== undefined) return `${completion.ratingValue}/5 已记录 · 可修改`
  const nextTier = getV5NextTier(activity, completion)
  return nextTier
    ? `${tierLabels[completion.tier!]}已达标 · 可升级${tierLabels[nextTier]}`
    : `${tierLabel(completion)}已完成`
}

export function getV5FeedbackDisplay(feedback: V5FeedbackView, condensed: boolean) {
  const showFollowUp = condensed && Boolean(feedback.followUp)
  return {
    showFollowUp,
    title: showFollowUp
      ? feedback.followUp?.kind === 'rating-note' ? '体验已记录' : '今日闭环还差一步'
      : condensed
        ? '本次行动已记录'
        : feedback.leveledUp
          ? `升级到 Lv.${feedback.level.level}`
          : feedback.title,
    detail: showFollowUp
      ? feedback.followUp?.kind === 'rating-note' ? '可以补充影响因素，也可以稍后修改评分' : '约 15 秒记录今日状态'
      : condensed
        ? '可在 10 秒内撤销'
        : feedback.ratingValue
          ? `${feedback.ratingPrompt ?? feedback.title} ${feedback.ratingValue}/5`
          : feedback.progressLabel ?? domainLabel(feedback.domain),
  }
}


export function getV5DomainGrowthDetail(
  domain: GrowthDomain,
  totalXp: number,
  journeyMonths: JourneyMonth[],
  today: string,
): V5DomainGrowthDetail {
  const cutoff = addDays(today, -27)
  const recentEntries = journeyMonths
    .flatMap((month) => month.days)
    .flatMap((day) => day.entries)
    .filter((entry) => entry.kind === 'action' && entry.domain === domain && entry.occurredOn >= cutoff && entry.occurredOn <= today)
    .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn) || right.createdAt.localeCompare(left.createdAt))
  const actionTotals = new Map<string, { title: string; xp: number; count: number }>()
  recentEntries.forEach((entry) => {
    const current = actionTotals.get(entry.title) ?? { title: entry.title, xp: 0, count: 0 }
    current.xp += entry.xp
    current.count += 1
    actionTotals.set(entry.title, current)
  })
  return {
    domain,
    level: getLevel(totalXp),
    totalXp,
    recentXp: recentEntries.reduce((total, entry) => total + entry.xp, 0),
    actionCount: recentEntries.length,
    activeDays: new Set(recentEntries.map((entry) => entry.occurredOn)).size,
    topActions: [...actionTotals.values()]
      .sort((left, right) => right.xp - left.xp || right.count - left.count || left.title.localeCompare(right.title, 'zh-CN'))
      .slice(0, 3),
    recentEntries: recentEntries.slice(0, 8),
  }
}

export function weeklyViewState(activity: Activity, completions: Completion[], today: string) {
  const cycleStart = startOfWeek(new Date(`${today}T12:00:00`))
  const cycle = weeklyCycle(activity, completions, today)
  const goal = getIncrementalCycleGoal(activity, cycle, cycleStart)
  const progress = goal ? calculateIncrementalProgress(goal, cycle) : undefined
  const activeDirect = cycle.filter((completion) => completion.status === 'active' && !completion.progress)
  const target = activity.schedule.kind === 'weekly' ? activity.schedule.times : 1
  const highestTier = isTieredGoal(activity) ? getTierLevels(activity.goal).at(-1) : undefined
  const directHighestReached = highestTier
    ? activeDirect.some((completion) => completion.tier === highestTier)
    : activeDirect.length >= target
  const complete = progress?.maxReached ?? directHighestReached
  const summary = progress
    ? incrementalSummary(progress)
    : `本周 ${activeDirect.length}/${target} 次`
  const next = progress
    ? incrementalNext(progress)
    : complete ? '本周最高层已经完成' : `还差 ${Math.max(0, target - activeDirect.length)} 次`
  return { complete, summary, next, progress }
}

function incrementalUnlockCondition(progress: ReturnType<typeof calculateIncrementalProgress>, tier: TierLevel) {
  if (progress.goal.metric === 'count') {
    const remaining = Math.max(0, progress.goal.thresholds[tier - 1] - progress.totalCount)
    return remaining <= 1 ? '本次可' : `再记录 ${remaining}${progress.goal.unit}可`
  }

  const threshold = progress.goal.thresholds[tier - 1]
  if (progress.goal.mode === 'per_occurrence') {
    const remaining = Math.max(0, threshold.count - (progress.qualifiedCounts[tier] ?? 0))
    const defaultQualifies = (progress.goal.defaultDurationSeconds ?? 0) >= threshold.durationSeconds
    if (remaining <= 1 && defaultQualifies) return '使用常用时长可'
    return `再 ${remaining} 次达到每次${formatDurationSeconds(threshold.durationSeconds)}可`
  }

  const countRemaining = Math.max(0, threshold.count - progress.totalCount)
  const durationRemaining = Math.max(0, threshold.durationSeconds - progress.totalDurationSeconds)
  const defaultQualifies = countRemaining <= 1
    && (progress.goal.defaultDurationSeconds ?? 0) >= durationRemaining
  if (defaultQualifies) return '使用常用时长可'
  const parts = [
    countRemaining > 0 ? `${countRemaining} 次` : '',
    durationRemaining > 0 ? formatDurationSeconds(durationRemaining) : '',
  ].filter(Boolean)
  return `还差 ${parts.join(' · ')}可`
}

export function getV5WeeklyRewardPreview(
  activity: Activity,
  completions: Completion[],
  today: string,
  activeCompletion?: Completion,
): V5ActionRewardPreview {
  const { complete, progress } = weeklyViewState(activity, completions, today)
  const cycle = weeklyCycle(activity, completions, today)

  if (progress) {
    const progressCompletions = cycle
      .filter((completion) => completion.status === 'active' && completion.progress)
      .sort((left, right) => (left.progress?.sequence ?? 0) - (right.progress?.sequence ?? 0))
    const difficulty = progressCompletions[0]?.difficultySnapshot ?? activity.difficulty
    const tierCount = getTierCount(progress.goal)
    if (progress.maxReached && progress.highestTier) {
      const earned = getTierReward(difficulty, progress.highestTier, tierCount)
      return {
        label: `本周已获 +${earned.xp} XP · +${earned.coins} 金币`,
        coinDelta: 0,
        state: 'earned',
      }
    }

    const nextTier = progress.nextTier ?? getTierLevels(progress.goal).at(-1)!
    const currentXp = progress.highestTier
      ? getTierReward(difficulty, progress.highestTier, tierCount).xp
      : 0
    const nextReward = getTierReward(difficulty, nextTier, tierCount)
    const coinDelta = progress.highestTier ? 0 : nextReward.coins
    return {
      label: `${incrementalUnlockCondition(progress, nextTier)}解锁 +${nextReward.xp - currentXp} XP${coinDelta ? ` · +${coinDelta} 金币` : ' · 金币已领取'}`,
      coinDelta,
      state: 'unlock',
    }
  }

  const direct = cycle.filter((completion) => completion.status === 'active' && !completion.progress)
  if (complete) {
    const earned = direct.reduce((total, completion) => {
      const reward = completionReward(activity, completion)
      return { xp: total.xp + reward.xp, coins: total.coins + reward.coins }
    }, { xp: 0, coins: 0 })
    return {
      label: `本周已获 +${earned.xp} XP · +${earned.coins} 金币`,
      coinDelta: 0,
      state: 'earned',
    }
  }

  return getV5ActionRewardPreview(activity, activeCompletion)
}

export function weeklyCycle(activity: Activity, completions: Completion[], today: string) {
  const cycleStart = startOfWeek(new Date(`${today}T12:00:00`))
  const cycleEnd = addDays(cycleStart, 6)
  return completions.filter((completion) => completion.activityId === activity.id && completion.occurredOn >= cycleStart && completion.occurredOn <= cycleEnd)
}

export function incrementalSummary(progress: ReturnType<typeof calculateIncrementalProgress>) {
  const finalTier = getTierLevels(progress.goal).at(-1)!
  if (progress.goal.metric === 'count') return `${progress.totalCount}/${progress.goal.thresholds[finalTier - 1]}${progress.goal.unit}`
  const threshold = progress.goal.thresholds[finalTier - 1]
  if (progress.goal.mode === 'per_occurrence') return `${progress.totalCount} 次 · ${formatDurationSeconds(progress.totalDurationSeconds)}`
  return `${progress.totalCount}/${threshold.count} 次 · ${formatDurationSeconds(progress.totalDurationSeconds)}/${formatDurationSeconds(threshold.durationSeconds)}`
}

export function incrementalNext(progress: ReturnType<typeof calculateIncrementalProgress>) {
  if (progress.maxReached) return '最高层已达成'
  const tier = progress.nextTier ?? getTierLevels(progress.goal).at(-1)!
  if (progress.goal.metric === 'count') return `距${tierLabels[tier]}层还差 ${Math.max(0, progress.goal.thresholds[tier - 1] - progress.totalCount)}${progress.goal.unit}`
  const threshold = progress.goal.thresholds[tier - 1]
  if (progress.goal.mode === 'per_occurrence') return `${progress.qualifiedCounts[tier] ?? 0}/${threshold.count} 次达到 ${formatDurationSeconds(threshold.durationSeconds)}`
  return `距${tierLabels[tier]}层还差 ${Math.max(0, threshold.count - progress.totalCount)} 次`
}

export function currentMinute() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

export function parseCueMinute(cue?: string) {
  const match = cue?.match(/(?:^|\D)([01]\d|2[0-3]):([0-5]\d)(?:\D|$)/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined
}

function parseTimeMinute(value?: string) {
  if (!value) return undefined
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function activityScheduledMinute(activity: Activity) {
  return parseTimeMinute(getActivityScheduledTime(activity))
}

export function gameDayMinute(minute: number) {
  return (minute - 4 * 60 + 24 * 60) % (24 * 60)
}

export interface HabitAnchorView {
  group: 0 | 1 | 2 | 3
  label: string
  needsAdjustment: boolean
}

export function getHabitAnchorView(
  activity: Activity,
  activities: Activity[],
  completedActivityIds: ReadonlySet<string>,
  minute: number,
): HabitAnchorView {
  const anchor = getEffectiveHabitAnchor(activity)
  if (!anchor) return { group: 2, label: '随时', needsAdjustment: false }
  if (anchor.kind === 'time') {
    const anchorMinute = parseTimeMinute(anchor.time)!
    return {
      group: gameDayMinute(anchorMinute) <= gameDayMinute(minute) ? 0 : 3,
      label: anchor.time,
      needsAdjustment: false,
    }
  }
  if (anchor.kind === 'event') {
    return { group: 2, label: `${anchor.label}之后`, needsAdjustment: false }
  }
  const predecessor = activities.find((candidate) => candidate.id === anchor.activityId)
  const valid = predecessor?.type === 'habit'
    && predecessor.schedule.kind === 'daily'
    && predecessor.enabled
    && !predecessor.archivedAt
  return {
    group: valid && completedActivityIds.has(anchor.activityId) ? 1 : 2,
    label: valid
      ? `${anchor.titleSnapshot}完成后${completedActivityIds.has(anchor.activityId) ? ' · 已触发' : ''}`
      : `${anchor.titleSnapshot}完成后 · 锚点需要调整`,
    needsAdjustment: !valid,
  }
}

export function orderDailyActions(
  activities: Activity[],
  minute: number,
  priorityIds: string[],
  allActivities: Activity[] = activities,
  completedActivityIds: ReadonlySet<string> = new Set(),
) {
  const originalOrder = new Map(activities.map((activity, index) => [activity.id, index]))
  const priorityOrder = new Map(priorityIds.map((id, index) => [id, priorityIds.length - index - 1]))
  return [...activities].sort((left, right) => {
    const leftMinute = activityScheduledMinute(left)
    const rightMinute = activityScheduledMinute(right)
    const leftGameMinute = leftMinute === undefined ? undefined : gameDayMinute(leftMinute)
    const rightGameMinute = rightMinute === undefined ? undefined : gameDayMinute(rightMinute)
    const leftGroup = getHabitAnchorView(left, allActivities, completedActivityIds, minute).group
    const rightGroup = getHabitAnchorView(right, allActivities, completedActivityIds, minute).group
    if (leftGroup !== rightGroup) return leftGroup - rightGroup
    if (left.isKey !== right.isKey) return Number(right.isKey) - Number(left.isKey)
    if (leftGameMinute !== undefined && rightGameMinute !== undefined) {
      return leftGameMinute - rightGameMinute || (originalOrder.get(left.id)! - originalOrder.get(right.id)!)
    }
    const leftPriority = priorityOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightPriority = priorityOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER
    return leftPriority - rightPriority || (originalOrder.get(left.id)! - originalOrder.get(right.id)!)
  })
}

export function orderFocusCandidates(
  activities: Activity[],
  minute: number,
  allActivities: Activity[] = activities,
  completedActivityIds: ReadonlySet<string> = new Set(),
) {
  return [...activities].sort((left, right) => {
    const leftMinute = activityScheduledMinute(left)
    const rightMinute = activityScheduledMinute(right)
    const leftGameMinute = leftMinute === undefined ? undefined : gameDayMinute(leftMinute)
    const rightGameMinute = rightMinute === undefined ? undefined : gameDayMinute(rightMinute)
    const leftGroup = getHabitAnchorView(left, allActivities, completedActivityIds, minute).group
    const rightGroup = getHabitAnchorView(right, allActivities, completedActivityIds, minute).group
    if (leftGroup !== rightGroup) return leftGroup - rightGroup
    if (left.isKey !== right.isKey) return Number(right.isKey) - Number(left.isKey)
    if (leftGameMinute === undefined || rightGameMinute === undefined) return 0
    return leftGameMinute - rightGameMinute
  })
}

export function orderTimeline(activities: Activity[]) {
  return [...activities].sort((left, right) => {
    const leftMinute = activityScheduledMinute(left)
    const rightMinute = activityScheduledMinute(right)
    if (leftMinute === undefined && rightMinute === undefined) return 0
    if (leftMinute === undefined) return 1
    if (rightMinute === undefined) return -1
    return gameDayMinute(leftMinute) - gameDayMinute(rightMinute)
  })
}

export function formatMinute(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

export function formatChineseDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00`))
}

export function formatCompactDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

export function tierLabel(completion: Completion) {
  return completion.tier ? `${tierLabels[completion.tier]}层` : ''
}

export function activityFrequency(activity: Activity) {
  if (activity.schedule.kind === 'daily') return '每天'
  if (activity.schedule.kind === 'weekly') return `每周 ${activity.schedule.times} 次`
  return activity.plannedOn ? `计划 ${activity.plannedOn}` : '一次性'
}
