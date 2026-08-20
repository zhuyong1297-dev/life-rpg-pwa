import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Target } from 'lucide-react'
import {
  calculateIncrementalProgress,
  getIncrementalCycleGoal,
  getLevel,
  startOfWeek,
  type Activity,
  type Completion,
  type TravelerAppearance,
  type TierLevel,
} from '../../domain'
import {
  currentMinute,
  formatChineseDate,
  orderFocusCandidates,
  orderTimeline,
  weeklyCycle,
} from './selectors'
import {
  V5Feedback,
  V5PageHeader,
  V5PlanEntry,
  V5SectionHeading,
  V5StatusStrip,
  V5TravelerSummary,
} from './shared'
import { V5ActionSection, V5DailySection, V5FocusAction, V5TimelineRow } from './DailyActions'
import { V5WeeklySection } from './WeeklyActions'
import type { V5DailyRewardSummary, V5FeedbackView, V5Stats } from './types'

export function V5TodayPage({
  today,
  stats,
  level,
  keyActivities,
  dailyHabits,
  weeklyHabits,
  tasks,
  completions,
  todayPriorityIds,
  dailyRewardSummary,
  activeRewardGoal,
  feedback,
  activeCompletion,
  seasonTitle,
  coachPlanLabel,
  onComplete,
  onCompleteTier,
  onCompleted,
  onWeeklyDetails,
  onCreate,
  onUndo,
  onOpenSeason,
  onRecordDailySignal,
  onEditRating,
  onOpenCoach,
  onSetTodayPriority,
  quickStart,
  newcomerProgress,
  travelerAppearance = 'masculine',
}: {
  today: string
  stats: V5Stats
  level: ReturnType<typeof getLevel>
  keyActivities: Activity[]
  dailyHabits: Activity[]
  weeklyHabits: Activity[]
  tasks: Activity[]
  completions: Completion[]
  todayPriorityIds: string[]
  dailyRewardSummary: V5DailyRewardSummary
  activeRewardGoal?: { title: string; cost: number }
  feedback: V5FeedbackView | null
  activeCompletion: (activity: Activity) => Completion | undefined
  seasonTitle?: string
  coachPlanLabel: string
  onComplete: (activity: Activity) => void
  onCompleteTier: (activity: Activity, tier: TierLevel) => void
  onCompleted: (activity: Activity) => void
  onWeeklyDetails: (activity: Activity) => void
  onCreate: () => void
  onUndo: () => void
  onOpenSeason: () => void
  onRecordDailySignal: (seasonId: string) => void
  onEditRating: (activityId: string) => void
  onOpenCoach: () => void
  onSetTodayPriority: (activity: Activity, prioritized: boolean) => Promise<void>
  quickStart?: ReactNode
  newcomerProgress?: ReactNode
  travelerAppearance?: TravelerAppearance
}) {
  const [minute, setMinute] = useState(() => currentMinute())
  const [preferredId, setPreferredId] = useState<string>()
  const [heldCompletedId, setHeldCompletedId] = useState<string>()
  const nonWeeklyKeys = keyActivities.filter((activity) => activity.schedule.kind !== 'weekly')
  const allDailyHabits = useMemo(
    () => [
      ...keyActivities.filter((activity) => activity.type === 'habit' && activity.schedule.kind === 'daily'),
      ...dailyHabits,
    ].filter((activity, index, source) => source.findIndex((item) => item.id === activity.id) === index),
    [dailyHabits, keyActivities],
  )
  const completedActivityIds = useMemo(
    () => new Set(completions.filter((completion) => completion.status === 'active' && completion.occurredOn === today).map((completion) => completion.activityId)),
    [completions, today],
  )
  const incompleteCandidates = useMemo(
    () => orderFocusCandidates(
      allDailyHabits.filter((activity) => !activeCompletion(activity)),
      minute,
      allDailyHabits,
      completedActivityIds,
    ),
    [allDailyHabits, activeCompletion, completedActivityIds, minute],
  )

  useEffect(() => {
    const refreshMinute = () => {
      if (document.visibilityState === 'visible') setMinute(currentMinute())
    }
    const timer = window.setInterval(refreshMinute, 60_000)
    document.addEventListener('visibilitychange', refreshMinute)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshMinute)
    }
  }, [])

  useEffect(() => {
    if (preferredId && incompleteCandidates.some((activity) => activity.id === preferredId)) return
    setPreferredId(incompleteCandidates[0]?.id)
  }, [incompleteCandidates, preferredId])

  useEffect(() => {
    if (!feedback?.activityId || !allDailyHabits.some((activity) => activity.id === feedback.activityId)) return
    setHeldCompletedId(feedback.activityId)
    const timer = window.setTimeout(() => setHeldCompletedId(undefined), 1_000)
    return () => window.clearTimeout(timer)
  }, [allDailyHabits, feedback?.activityId])

  const focusActivity = heldCompletedId
    ? allDailyHabits.find((activity) => activity.id === heldCompletedId)
    : incompleteCandidates.find((activity) => activity.id === preferredId) ?? incompleteCandidates[0]
  const orderedKeyActivities = orderTimeline(nonWeeklyKeys)
  const focusSequence = focusActivity && !orderedKeyActivities.some((activity) => activity.id === focusActivity.id)
    ? [focusActivity, ...orderedKeyActivities]
    : orderedKeyActivities
  const completedKeyCount = keyActivities.filter((activity) => {
    if (activity.schedule.kind !== 'weekly') return Boolean(activeCompletion(activity))
    const cycleStart = startOfWeek(new Date(`${today}T12:00:00`))
    const cycle = weeklyCycle(activity, completions, today)
    const goal = getIncrementalCycleGoal(activity, cycle, cycleStart)
    return goal
      ? Boolean(calculateIncrementalProgress(goal, cycle).highestTier)
      : cycle.filter((completion) => completion.status === 'active').length >= activity.schedule.times
  }).length

  const rotateFocus = () => {
    if (incompleteCandidates.length < 2) return
    const currentIndex = incompleteCandidates.findIndex((activity) => activity.id === focusActivity?.id)
    setPreferredId(incompleteCandidates[(currentIndex + 1) % incompleteCandidates.length].id)
  }

  if (quickStart) {
    return (
      <div className="v5-page v5-today-layout v5-onboarding-layout">
        <section className="v5-today-primary">
          <V5PageHeader eyebrow="地球 Online · 本地成长教练" title="今天" />
          {quickStart}
        </section>
        <aside className="v5-today-aside">
          <V5TravelerSummary level={level} totalXp={stats.totalXp} appearance={travelerAppearance} />
        </aside>
      </div>
    )
  }

  return (
    <div className="v5-page v5-today-layout">
      <section className="v5-today-primary">
        <V5PageHeader
          eyebrow={`行动日志 · ${formatChineseDate(today)}`}
          title="今天"
          onCreate={onCreate}
        />
        <V5StatusStrip
          level={level}
          coins={stats.coins}
          dailyRewardSummary={dailyRewardSummary}
        />
        {newcomerProgress}
        <V5PlanEntry
          seasonTitle={seasonTitle}
          coachPlanLabel={coachPlanLabel}
          onOpenSeason={onOpenSeason}
          onOpenCoach={onOpenCoach}
        />

        <section className="v5-section">
          <V5SectionHeading title="时间锚点 + 灵活行动" description="时间是参考，不是必须。到时间、触发场景或随时行动。" />
          {feedback && (
            <V5Feedback
              key={feedback.completionId}
              feedback={feedback}
              onUndo={() => {
                if (feedback.activityId) setPreferredId(feedback.activityId)
                setHeldCompletedId(undefined)
                onUndo()
              }}
              onFollowUp={() => {
                if (feedback.followUp?.kind === 'daily-signal') onRecordDailySignal(feedback.followUp.seasonId)
                if (feedback.followUp?.kind === 'rating-note') onEditRating(feedback.followUp.activityId)
              }}
            />
          )}
          <div className="v5-focus-sequence">
            {focusSequence.map((activity) => {
              if (activity.id === focusActivity?.id) {
                return (
                  <V5FocusAction
                    activity={activity}
                    completion={activeCompletion(activity)}
                    canSwitch={incompleteCandidates.length > 1 && !heldCompletedId}
                    coins={stats.coins}
                    activeRewardGoal={activeRewardGoal}
                    allActivities={allDailyHabits}
                    completedActivityIds={completedActivityIds}
                    minute={minute}
                    key={activity.id}
                    onComplete={() => onComplete(activity)}
                    onCompleteTier={(tier) => onCompleteTier(activity, tier)}
                    onSwitch={rotateFocus}
                  />
                )
              }
              const completion = activeCompletion(activity)
              return (
                <V5TimelineRow
                  activity={activity}
                  completion={completion}
                  key={activity.id}
                  onClick={() => completion ? onCompleted(activity) : onComplete(activity)}
                  allActivities={allDailyHabits}
                  completedActivityIds={completedActivityIds}
                  minute={minute}
                />
              )
            })}
          </div>
          {nonWeeklyKeys.length === 0 && (
            <div className="v5-empty-line"><Target size={18} /><span>还没有关键行动，可先从一个真正重要的行为开始。</span></div>
          )}
        </section>

        <V5DailySection
          activities={dailyHabits.filter((activity) => activity.id !== focusActivity?.id)}
          allActivities={allDailyHabits}
          completedActivityIds={completedActivityIds}
          minute={minute}
          priorityIds={todayPriorityIds}
          feedbackActivityId={feedback?.activityId}
          activeCompletion={activeCompletion}
          onComplete={onComplete}
          onCompleted={onCompleted}
          onSetPriority={onSetTodayPriority}
        />
        <V5WeeklySection
          activities={weeklyHabits}
          completions={completions}
          today={today}
          activeCompletion={activeCompletion}
          onRecord={onComplete}
          onCompleted={onCompleted}
          onDetails={onWeeklyDetails}
        />
        <V5ActionSection
          title="一次性任务"
          activities={tasks}
          activeCompletion={activeCompletion}
          onComplete={onComplete}
          onCompleted={onCompleted}
        />
      </section>
      <aside className="v5-today-aside">
        <V5TravelerSummary level={level} totalXp={stats.totalXp} appearance={travelerAppearance} />
        <div className="v5-aside-card"><span>今日进度</span><strong>{completedKeyCount}/{keyActivities.length} 项关键行动</strong><p>完成最低标准就算向前推进。</p></div>
      </aside>
    </div>
  )
}
