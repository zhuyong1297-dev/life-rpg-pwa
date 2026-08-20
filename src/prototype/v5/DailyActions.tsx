import { useEffect, useState } from 'react'
import { BookOpen, Check, ChevronRight, Clock3, Gift, Medal, Pin, PinOff, Search, Sparkles } from 'lucide-react'
import {
  domainLabel,
  formatTierGoalValue,
  getActivityScheduledTime,
  getTierCount,
  getTierLevels,
  getTierReward,
  isRatingGoal,
  isTieredGoal,
  tierLabels,
  type Activity,
  type Completion,
  type TierLevel,
} from '../../domain'
import {
  activityFrequency,
  activityScheduledMinute,
  formatMinute,
  getHabitAnchorView,
  getV5ActionRewardPreview,
  getV5NextTier,
  orderDailyActions,
  v5TierProgressLabel,
} from './selectors'
import { V5ModalSurface } from './shared'

export function V5FocusAction({
  activity,
  completion,
  canSwitch,
  coins,
  activeRewardGoal,
  onComplete,
  onCompleteTier,
  onSwitch,
  allActivities,
  completedActivityIds,
  minute,
}: {
  activity: Activity
  completion?: Completion
  canSwitch: boolean
  coins: number
  activeRewardGoal?: { title: string; cost: number }
  onComplete: () => void
  onCompleteTier: (tier: TierLevel) => void
  onSwitch: () => void
  allActivities: Activity[]
  completedActivityIds: ReadonlySet<string>
  minute: number
}) {
  const [protocolOpen, setProtocolOpen] = useState(false)
  const goal = isTieredGoal(activity) ? activity.goal : undefined
  const tiers = goal ? getTierLevels(goal).slice(0, 2) : []
  const nextTier = getV5NextTier(activity, completion)
  const summary = activity.protocol?.split(/[。；]/)[0] || activity.cue || '完成当前行动的最低标准。'
  const rewardPreview = getV5ActionRewardPreview(activity, completion)
  const anchorView = getHabitAnchorView(activity, allActivities, completedActivityIds, minute)
  const wishProgress = activeRewardGoal && rewardPreview.coinDelta > 0 && coins < activeRewardGoal.cost
    ? Math.min(activeRewardGoal.cost, coins + rewardPreview.coinDelta)
    : undefined
  return (
    <article className={`v5-focus-action${completion ? ' completed' : ''}`}>
      <div className="v5-focus-meta">
        <span>现在 · {anchorView.label}</span>
        <div>
          {activity.protocol && (
            <button type="button" title="查看执行说明" aria-label={`查看 ${activity.title} 执行说明`} onClick={() => setProtocolOpen(true)}>
              <BookOpen size={14} />
            </button>
          )}
          <span>{activity.domain ? domainLabel(activity.domain) : '旧体系'}</span>
        </div>
      </div>
      <div className="v5-focus-title">
        <div><h3>{activity.title}</h3><p>{completion ? nextTier ? `已经达到${tierLabels[completion.tier!]}层，今天仍可继续升级。` : '今天的目标已经完成。' : summary}</p></div>
        {canSwitch && <button type="button" onClick={onSwitch}>换一个</button>}
      </div>
      <div className="v5-action-reward"><Medal size={15} /><span>{rewardPreview.label}</span></div>
      {wishProgress !== undefined && (
        <div className="v5-wish-progress"><Gift size={15} /><span>完成后「{activeRewardGoal!.title}」{wishProgress}/{activeRewardGoal!.cost} 金币</span></div>
      )}
      {completion ? (
        <div className={`v5-completed-line${nextTier ? ' upgradeable' : ''}`}>
          {nextTier ? <Sparkles size={18} /> : <Check size={18} />}
          {v5TierProgressLabel(activity, completion)}
        </div>
      ) : goal ? (
        <div className="v5-focus-actions">
          {tiers.map((tier) => (
            <button className={tier === 1 ? 'primary' : 'secondary'} type="button" key={tier} onClick={() => onCompleteTier(tier)}>
              <span>{tierLabels[tier]} {formatTierGoalValue(goal, tier)}</span>
              <small>+{getTierReward(activity.difficulty, tier, getTierCount(goal)).xp} XP · +{getTierReward(activity.difficulty, tier, getTierCount(goal)).coins}</small>
            </button>
          ))}
        </div>
      ) : (
        <button className="v5-primary-button v5-wide" type="button" aria-label={`${isRatingGoal(activity) ? '记录体验' : '完成'} ${activity.title}`} onClick={onComplete}>{isRatingGoal(activity) ? '记录体验' : '记录完成'}</button>
      )}
      {protocolOpen && (
        <div className="v5-protocol-backdrop" role="presentation" onClick={() => setProtocolOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="v5-protocol-title" onClick={(event) => event.stopPropagation()}>
            <span>执行说明</span>
            <h2 id="v5-protocol-title">{activity.title}</h2>
            <p>{activity.protocol}</p>
            <button type="button" onClick={() => setProtocolOpen(false)}>知道了</button>
          </section>
        </div>
      )}
    </article>
  )
}

export function V5TimelineRow({
  activity,
  completion,
  onClick,
  allActivities,
  completedActivityIds,
  minute,
}: {
  activity: Activity
  completion?: Completion
  onClick: () => void
  allActivities: Activity[]
  completedActivityIds: ReadonlySet<string>
  minute: number
}) {
  const cueMinute = activityScheduledMinute(activity)
  const nextTier = getV5NextTier(activity, completion)
  const rewardPreview = getV5ActionRewardPreview(activity, completion)
  const anchorView = getHabitAnchorView(activity, allActivities, completedActivityIds, minute)
  return (
    <div className="v5-timeline-row">
      <time>{cueMinute === undefined ? '随时' : formatMinute(cueMinute)}</time>
      <button className={completion ? nextTier ? 'upgradeable' : 'done' : ''} type="button" onClick={onClick} aria-label={completion ? nextTier ? `继续提升 ${activity.title}` : `查看 ${activity.title} 完成记录` : `${isRatingGoal(activity) ? '记录体验' : '完成'} ${activity.title}`}>
        {completion ? nextTier ? <Sparkles size={18} /> : <Check size={19} /> : <Clock3 size={18} />}
      </button>
      <div>
        <strong>{activity.title}</strong>
        <span>{completion ? v5TierProgressLabel(activity, completion) : anchorView.label}</span>
        <span className="v5-action-reward"><Medal size={13} />{rewardPreview.label}</span>
      </div>
    </div>
  )
}

export function V5DailySection({
  activities,
  allActivities,
  completedActivityIds,
  minute,
  priorityIds,
  feedbackActivityId,
  activeCompletion,
  onComplete,
  onCompleted,
  onSetPriority,
}: {
  activities: Activity[]
  allActivities: Activity[]
  completedActivityIds: ReadonlySet<string>
  minute: number
  priorityIds: string[]
  feedbackActivityId?: string
  activeCompletion: (activity: Activity) => Completion | undefined
  onComplete: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  onSetPriority: (activity: Activity, prioritized: boolean) => Promise<void>
}) {
  const [drawerTab, setDrawerTab] = useState<'pending' | 'upgradeable' | 'completed'>()
  const [heldCompletedId, setHeldCompletedId] = useState<string>()

  useEffect(() => {
    if (!feedbackActivityId || !activities.some((activity) => activity.id === feedbackActivityId)) return
    setHeldCompletedId(feedbackActivityId)
    const timer = window.setTimeout(() => setHeldCompletedId(undefined), 1_000)
    return () => window.clearTimeout(timer)
  }, [activities, feedbackActivityId])

  if (activities.length === 0) return null
  const completed = activities.filter((activity) => Boolean(activeCompletion(activity)))
  const pending = orderDailyActions(
    activities.filter((activity) => !activeCompletion(activity)),
    minute,
    priorityIds,
    allActivities,
    completedActivityIds,
  )
  const upgradeable = orderDailyActions(
    activities.filter((activity) => getV5NextTier(activity, activeCompletion(activity))),
    minute,
    priorityIds,
    allActivities,
    completedActivityIds,
  )
  const heldCompleted = activities.filter((activity) => (
    activity.id === heldCompletedId
    && Boolean(activeCompletion(activity))
    && !upgradeable.some((candidate) => candidate.id === activity.id)
  ))
  const actionable = [...pending, ...upgradeable, ...heldCompleted]
  const visible = actionable.slice(0, 5)
  return (
    <section className="v5-section v5-action-section">
      <div className="v5-section-count">
        <div><span>按时间与今日优先排列</span><h2>今天随时</h2></div>
        <b>{activities.length}</b>
      </div>
      {visible.map((activity) => (
        <V5CompactActionRow
          activity={activity}
          completion={activeCompletion(activity)}
          key={activity.id}
          meta={`${getHabitAnchorView(activity, allActivities, completedActivityIds, minute).label} · ${activity.domain ? domainLabel(activity.domain) : '旧体系'} · ${activity.difficulty}`}
          onClick={() => activeCompletion(activity) ? onCompleted(activity) : onComplete(activity)}
        />
      ))}
      {actionable.length > 5 && (
        <button className="v5-text-button" type="button" onClick={() => setDrawerTab('pending')}>
          查看完整清单 · {pending.length} 项待行动，{upgradeable.length} 项可提升
        </button>
      )}
      {completed.length > 0 && (
        <button className="v5-completed-summary" type="button" onClick={() => setDrawerTab('completed')}>
          <Check size={17} />
          <span>今日已达标 {completed.length} 项{upgradeable.length > 0 ? ` · ${upgradeable.length} 项仍可提升` : ''}</span>
          <ChevronRight size={17} />
        </button>
      )}
      {drawerTab && (
        <V5DailyDrawer
          activities={activities}
          activeCompletion={activeCompletion}
          initialTab={drawerTab}
          minute={minute}
          priorityIds={priorityIds}
          allActivities={allActivities}
          completedActivityIds={completedActivityIds}
          onClose={() => setDrawerTab(undefined)}
          onComplete={(activity) => {
            setDrawerTab(undefined)
            onComplete(activity)
          }}
          onCompleted={(activity) => {
            setDrawerTab(undefined)
            onCompleted(activity)
          }}
          onSetPriority={onSetPriority}
        />
      )}
    </section>
  )
}

export function V5CompactActionRow({
  activity,
  completion,
  meta,
  onClick,
}: {
  activity: Activity
  completion?: Completion
  meta: string
  onClick: () => void
}) {
  const nextTier = getV5NextTier(activity, completion)
  const rewardPreview = getV5ActionRewardPreview(activity, completion)
  return (
    <article className={`v5-compact-action${completion ? ' completed' : ''}${nextTier ? ' upgradeable' : ''}`}>
      <div>
        <strong>{activity.title}</strong>
        <span>{meta}</span>
        <span className="v5-action-reward"><Medal size={13} />{rewardPreview.label}</span>
        {completion && <span className="v5-action-progress">{v5TierProgressLabel(activity, completion)}</span>}
      </div>
      <button type="button" className={completion ? nextTier ? 'upgradeable' : 'done' : ''} onClick={onClick} aria-label={completion ? nextTier ? `继续提升 ${activity.title}` : `查看 ${activity.title} 完成记录` : `${isRatingGoal(activity) ? '记录体验' : '完成'} ${activity.title}`}>
        {completion ? nextTier ? <Sparkles size={18} /> : <Check size={18} /> : <ChevronRight size={19} />}
      </button>
    </article>
  )
}

export function V5ActionSection({
  title,
  activities,
  activeCompletion,
  onComplete,
  onCompleted,
}: {
  title: string
  activities: Activity[]
  activeCompletion: (activity: Activity) => Completion | undefined
  onComplete: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
}) {
  if (activities.length === 0) return null
  return (
    <section className="v5-section v5-action-section">
      <div className="v5-section-count"><h2>{title}</h2><span>{activities.length}</span></div>
      {activities.map((activity) => {
        const completion = activeCompletion(activity)
        return (
          <V5CompactActionRow
            activity={activity}
            completion={completion}
            key={activity.id}
            meta={`${activity.domain ? domainLabel(activity.domain) : '旧体系'} · ${activity.difficulty} · ${activityFrequency(activity)}`}
            onClick={() => completion ? onCompleted(activity) : onComplete(activity)}
          />
        )
      })}
    </section>
  )
}

function V5DailyDrawer({
  activities,
  allActivities,
  completedActivityIds,
  activeCompletion,
  initialTab,
  minute,
  priorityIds,
  onClose,
  onComplete,
  onCompleted,
  onSetPriority,
}: {
  activities: Activity[]
  allActivities: Activity[]
  completedActivityIds: ReadonlySet<string>
  activeCompletion: (activity: Activity) => Completion | undefined
  initialTab: 'pending' | 'upgradeable' | 'completed'
  minute: number
  priorityIds: string[]
  onClose: () => void
  onComplete: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  onSetPriority: (activity: Activity, prioritized: boolean) => Promise<void>
}) {
  const [tab, setTab] = useState(initialTab)
  const [query, setQuery] = useState('')
  const pending = orderDailyActions(activities.filter((activity) => !activeCompletion(activity)), minute, priorityIds, allActivities, completedActivityIds)
  const completed = activities.filter((activity) => Boolean(activeCompletion(activity)))
  const upgradeable = orderDailyActions(
    activities.filter((activity) => getV5NextTier(activity, activeCompletion(activity))),
    minute,
    priorityIds,
    allActivities,
    completedActivityIds,
  )
  const source = tab === 'pending' ? pending : tab === 'upgradeable' ? upgradeable : completed
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visible = normalizedQuery
    ? source.filter((activity) => [
        activity.title,
        activity.domain ? domainLabel(activity.domain) : '旧体系',
        activity.difficulty,
      ].some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery)))
    : source
  return (
    <V5ModalSurface title="今日行动" onClose={onClose}>
      <div className="v5-drawer-tabs three" role="tablist" aria-label="今日行动状态">
        <button type="button" role="tab" aria-selected={tab === 'pending'} className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>待行动 {pending.length}</button>
        <button type="button" role="tab" aria-selected={tab === 'upgradeable'} className={tab === 'upgradeable' ? 'active' : ''} onClick={() => setTab('upgradeable')}>可提升 {upgradeable.length}</button>
        <button type="button" role="tab" aria-selected={tab === 'completed'} className={tab === 'completed' ? 'active' : ''} onClick={() => setTab('completed')}>已达标 {completed.length}</button>
      </div>
      {activities.length > 12 && (
        <label className="v5-drawer-search">
          <Search size={17} />
          <span className="sr-only">搜索今日行动</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、领域或难度" />
        </label>
      )}
      <div className="v5-drawer-list">
        {visible.map((activity) => {
          const completion = activeCompletion(activity)
          const nextTier = getV5NextTier(activity, completion)
          const anchorView = getHabitAnchorView(activity, allActivities, completedActivityIds, minute)
          const scheduled = getActivityScheduledTime(activity)
          const prioritized = priorityIds.includes(activity.id)
          return (
            <article className="v5-drawer-row" key={activity.id}>
              <div>
                <strong>{activity.title}</strong>
                <span>{anchorView.label} · {activity.domain ? domainLabel(activity.domain) : '旧体系'} · {activity.difficulty}</span>
                <span className="v5-action-reward"><Medal size={13} />{getV5ActionRewardPreview(activity, completion).label}</span>
                {completion && <span className="v5-action-progress">{v5TierProgressLabel(activity, completion)}</span>}
              </div>
              <div className="v5-drawer-row-actions">
                {!completion && !scheduled && activity.habitFormation?.anchor?.kind !== 'after_activity' && (
                  <button
                    type="button"
                    aria-pressed={prioritized}
                    title={prioritized ? '取消今天优先' : '设为今天优先'}
                    aria-label={`${prioritized ? '取消' : '设为'} ${activity.title} 今天优先`}
                    onClick={() => void onSetPriority(activity, !prioritized)}
                  >
                    {prioritized ? <PinOff size={17} /> : <Pin size={17} />}
                  </button>
                )}
                <button type="button" onClick={() => completion ? onCompleted(activity) : onComplete(activity)}>
                  {completion ? nextTier ? '继续提升' : '查看' : '记录'}
                </button>
              </div>
            </article>
          )
        })}
        {visible.length === 0 && <p className="v5-drawer-empty">{query ? '没有匹配的行动' : tab === 'pending' ? '今天没有待行动项目' : tab === 'upgradeable' ? '当前没有可继续提升的行动' : '今天还没有达标记录'}</p>}
      </div>
    </V5ModalSurface>
  )
}
