import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import {
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Coins,
  Compass,
  Dumbbell,
  Gift,
  GraduationCap,
  History,
  Leaf,
  ListChecks,
  Medal,
  Palette,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Target,
  UserRound,
  X,
} from 'lucide-react'
import {
  addDays,
  calculateIncrementalProgress,
  domainLabel,
  formatDurationSeconds,
  formatTierGoalValue,
  getCharacterStage,
  getCharacterStageName,
  getActivityScheduledTime,
  getIncrementalCycleGoal,
  getLevel,
  getMilestoneVoucherCost,
  getNextVoucherLevel,
  getTierLevels,
  getTotalXpForLevel,
  growthDomains,
  isTieredGoal,
  rewardTable,
  startOfWeek,
  tierLabels,
  type Activity,
  type Completion,
  type GrowthDomain,
  type JourneyEntry,
  type JourneyMonth,
  type LevelSystem,
  type TierLevel,
} from '../domain'

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
  level: ReturnType<typeof getLevel>
  leveledUp?: boolean
  followUp?: { kind: 'daily-signal'; seasonId: string }
}

export function getV5FeedbackDisplay(feedback: V5FeedbackView, condensed: boolean) {
  const showFollowUp = condensed && feedback.followUp?.kind === 'daily-signal'
  return {
    showFollowUp,
    title: showFollowUp
      ? '今日闭环还差一步'
      : condensed
        ? '本次行动已记录'
        : feedback.leveledUp
          ? `升级到 Lv.${feedback.level.level}`
          : feedback.title,
    detail: showFollowUp
      ? '约 15 秒记录今日状态'
      : condensed
        ? '可在 10 秒内撤销'
        : feedback.progressLabel ?? domainLabel(feedback.domain),
  }
}

interface V5Stats {
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

const navItems = [
  { page: 'today' as const, label: '行动', icon: ListChecks },
  { page: 'growth' as const, label: '成长', icon: Compass },
  { page: 'review' as const, label: '复盘', icon: ClipboardCheck },
  { page: 'rewards' as const, label: '愿望', icon: Gift },
  { page: 'profile' as const, label: '我的', icon: UserRound },
]

const domainIcons = {
  health: Dumbbell,
  learning: GraduationCap,
  creation: Palette,
  career: BriefcaseBusiness,
  life: CircleDollarSign,
  mindset: Leaf,
}

const domainTones: Record<GrowthDomain, string> = {
  health: 'coral',
  learning: 'blue',
  creation: 'violet',
  career: 'green',
  life: 'gold',
  mindset: 'leaf',
}

export function V5Navigation({
  active,
  preview,
  onNavigate,
  onCreate,
}: {
  active: V5Page
  preview: boolean
  onNavigate: (page: V5Page) => void
  onCreate: () => void
}) {
  return (
    <>
      <aside className="v5-desktop-rail">
        <div className="v5-brand">
          <Sparkles size={22} />
          <div><strong>地球 Online</strong><span>{preview ? 'V5 预览版' : 'V5.0.0'}</span></div>
        </div>
        <nav aria-label="主要导航">
          {navItems.map(({ page, label, icon: Icon }) => (
            <button className={page === active ? 'active' : ''} key={page} type="button" onClick={() => onNavigate(page)}>
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>
        <button className="v5-primary-button v5-wide" type="button" onClick={onCreate}>
          <Plus size={18} />
          创建行动
        </button>
        {preview && <div className="v5-data-note"><strong>真实预览数据</strong><span>与正式版完全分开</span></div>}
      </aside>
      <nav className="v5-mobile-navigation" aria-label="主要导航">
        {navItems.map(({ page, label, icon: Icon }) => (
          <button className={page === active ? 'active' : ''} key={page} type="button" onClick={() => onNavigate(page)}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </>
  )
}

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
  onOpenCoach,
  onSetTodayPriority,
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
  onOpenCoach: () => void
  onSetTodayPriority: (activity: Activity, prioritized: boolean) => Promise<void>
}) {
  const [minute, setMinute] = useState(() => currentMinute())
  const [preferredId, setPreferredId] = useState<string>()
  const [heldCompletedId, setHeldCompletedId] = useState<string>()
  const nonWeeklyKeys = keyActivities.filter((activity) => activity.schedule.kind !== 'weekly')
  const incompleteCandidates = useMemo(
    () => orderFocusCandidates(
      nonWeeklyKeys.filter((activity) => !activeCompletion(activity)),
      minute,
    ),
    [nonWeeklyKeys, activeCompletion, minute],
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
    if (!feedback?.activityId || !nonWeeklyKeys.some((activity) => activity.id === feedback.activityId)) return
    setHeldCompletedId(feedback.activityId)
    const timer = window.setTimeout(() => setHeldCompletedId(undefined), 1_000)
    return () => window.clearTimeout(timer)
  }, [feedback?.activityId])

  const focusActivity = heldCompletedId
    ? nonWeeklyKeys.find((activity) => activity.id === heldCompletedId)
    : incompleteCandidates.find((activity) => activity.id === preferredId) ?? incompleteCandidates[0]
  const orderedKeyActivities = orderTimeline(nonWeeklyKeys)
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
          completed={completedKeyCount}
          total={keyActivities.length}
        />
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
              }}
            />
          )}
          <div className="v5-focus-sequence">
            {orderedKeyActivities.map((activity) => {
              if (activity.id === focusActivity?.id) {
                return (
                  <V5FocusAction
                    activity={activity}
                    completion={activeCompletion(activity)}
                    canSwitch={incompleteCandidates.length > 1 && !heldCompletedId}
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
                />
              )
            })}
          </div>
          {nonWeeklyKeys.length === 0 && (
            <div className="v5-empty-line"><Target size={18} /><span>还没有关键行动，可先从一个真正重要的行为开始。</span></div>
          )}
        </section>

        <V5DailySection
          activities={dailyHabits}
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
        <V5TravelerSummary level={level} totalXp={stats.totalXp} />
        <div className="v5-aside-card"><span>今日进度</span><strong>{completedKeyCount}/{keyActivities.length} 项关键行动</strong><p>完成最低标准就算向前推进。</p></div>
      </aside>
    </div>
  )
}

export function V5GrowthPage({
  stats,
  level,
  levelSystem,
  journeyMonths,
  today,
  onCreate,
  onOpenRewards,
}: {
  stats: V5Stats
  level: ReturnType<typeof getLevel>
  levelSystem?: LevelSystem
  journeyMonths: JourneyMonth[]
  today: string
  onCreate: () => void
  onOpenRewards: () => void
}) {
  const [selectedDomain, setSelectedDomain] = useState<GrowthDomain>()
  const nextRewardLevel = getNextVoucherLevel(level.level)
  const nextRewardCost = getMilestoneVoucherCost(nextRewardLevel) ?? 200
  const remainingXp = Math.max(0, getTotalXpForLevel(nextRewardLevel) - stats.totalXp)
  const selectedDetail = selectedDomain
    ? getV5DomainGrowthDetail(selectedDomain, stats.domainXp[selectedDomain], journeyMonths, today)
    : undefined
  return (
    <div className="v5-page v5-growth-layout">
      <section className="v5-growth-primary">
        <V5PageHeader eyebrow="角色成长" title="成长" description="现实中的每一次行动，都在这里留下成长。" onCreate={onCreate} />
        <div className="v5-growth-overview">
          <V5GrowthHero stats={stats} level={level} focusDomain={levelSystem?.focusDomain} />
          <button className="v5-feature-row" type="button" onClick={onOpenRewards}>
            <Gift size={22} />
            <div><span>下一奖励</span><strong>Lv.{nextRewardLevel} · {nextRewardCost} 金币档礼券</strong><small>还需 {remainingXp} XP</small></div>
            <ChevronRight size={20} />
          </button>
        </div>
        <section className="v5-section">
          <V5SectionHeading title="六个成长领域" description="按现实结果分类，每项行动只归入一个领域。" />
          <div className="v5-domain-grid">
            {growthDomains.map((domain) => {
              const Icon = domainIcons[domain]
              const domainLevel = getLevel(stats.domainXp[domain])
              return (
                <button
                  className={`v5-domain-card tone-${domainTones[domain]}`}
                  key={domain}
                  type="button"
                  aria-label={`查看${domainLabel(domain)}领域详情，当前 Lv.${domainLevel.level}`}
                  onClick={() => setSelectedDomain(domain)}
                >
                  <div><Icon size={20} /><strong>{domainLabel(domain)}</strong><span>Lv.{domainLevel.level}</span><ChevronRight size={17} /></div>
                  <div className="v5-domain-progress"><span style={{ width: `${domainLevel.progress * 100}%` }} /></div>
                  <small>{stats.domainXp[domain]} XP</small>
                </button>
              )
            })}
          </div>
        </section>
      </section>
      {selectedDetail && <V5DomainDetail detail={selectedDetail} onClose={() => setSelectedDomain(undefined)} />}
    </div>
  )
}

function V5GrowthHero({
  stats,
  level,
  focusDomain,
}: {
  stats: V5Stats
  level: ReturnType<typeof getLevel>
  focusDomain?: GrowthDomain
}) {
  const stage = getCharacterStage(level.level)
  return (
    <section className="v5-growth-hero" aria-label="旅者成长状态">
      <div className="v5-growth-identity">
        <img src={`${import.meta.env.BASE_URL}assets/v5/traveler-stage-${stage}.png`} alt={`${getCharacterStageName(level.level)}阶段旅者`} />
        <div>
          <span>{getCharacterStageName(level.level)} · 阶段 {stage}</span>
          <strong>Lv.{level.level}</strong>
          <small>每次现实行动都在塑造现在的你</small>
        </div>
      </div>
      <div className="v5-growth-level-progress">
        <div><span>等级进度</span><strong>{level.current} / {level.needed} XP</strong></div>
        <div className="v5-growth-progress-track" role="progressbar" aria-label="当前等级进度" aria-valuemin={0} aria-valuemax={level.needed} aria-valuenow={level.current}>
          <span style={{ width: `${level.progress * 100}%` }} />
        </div>
        <small>距离 Lv.{level.level + 1} 还需 {Math.max(0, level.needed - level.current)} XP</small>
      </div>
      <div className="v5-growth-metrics">
        <div><Medal size={18} /><span>累计成长<strong>{stats.totalXp} XP</strong></span></div>
        <div><Coins size={18} /><span>持有金币<strong>{stats.coins}</strong></span></div>
      </div>
      <div className="v5-growth-focus">
        <Target size={17} />
        <span>下一阶段重点</span>
        <strong>{focusDomain ? domainLabel(focusDomain) : '完成下一份成长报告后选择'}</strong>
      </div>
    </section>
  )
}

function V5DomainDetail({ detail, onClose }: { detail: V5DomainGrowthDetail; onClose: () => void }) {
  const Icon = domainIcons[detail.domain]
  return (
    <V5ModalSurface title={`${domainLabel(detail.domain)}领域`} kicker="成长领域" onClose={onClose}>
      <div className={`v5-domain-detail tone-${domainTones[detail.domain]}`}>
        <div className="v5-domain-detail-hero">
          <span><Icon size={22} /></span>
          <div><small>现实成长领域</small><strong>{domainLabel(detail.domain)}</strong><p>Lv.{detail.level.level} · 累计 {detail.totalXp} XP</p></div>
        </div>
        <div className="v5-domain-detail-progress">
          <div><span>当前等级进度</span><strong>{detail.level.current} / {detail.level.needed} XP</strong></div>
          <div className="v5-domain-progress"><span style={{ width: `${detail.level.progress * 100}%` }} /></div>
        </div>
        <div className="v5-domain-detail-stats" aria-label="最近 28 个游戏日">
          <div><span>近 28 日 XP</span><strong>+{detail.recentXp}</strong></div>
          <div><span>有效行动</span><strong>{detail.actionCount}</strong></div>
          <div><span>活跃天数</span><strong>{detail.activeDays}</strong></div>
        </div>
        <section className="v5-domain-detail-section">
          <h3>主要贡献行动</h3>
          {detail.topActions.length > 0 ? (
            <div className="v5-domain-top-actions">
              {detail.topActions.map((action, index) => (
                <div key={action.title}><b>{index + 1}</b><span>{action.title}<small>{action.count} 次有效行动</small></span><strong>+{action.xp} XP</strong></div>
              ))}
            </div>
          ) : <p className="v5-domain-empty">最近 28 个游戏日还没有这个领域的有效成长。</p>}
        </section>
        {detail.recentEntries.length > 0 && (
          <section className="v5-domain-detail-section">
            <h3>近期成长记录</h3>
            <div className="v5-domain-recent-list">
              {detail.recentEntries.map((entry) => (
                <article key={entry.id}>
                  <time>{formatCompactDate(entry.occurredOn)}</time>
                  <div><strong>{entry.title}</strong><span>{entry.tier ? `${tierLabels[entry.tier]}层` : entry.progressLabel ?? '已完成'}</span></div>
                  <b>{entry.xp > 0 ? `+${entry.xp} XP` : '已记录'}</b>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </V5ModalSurface>
  )
}

function V5PageHeader({
  eyebrow,
  title,
  description,
  onCreate,
}: {
  eyebrow: string
  title: string
  description?: string
  onCreate: () => void
}) {
  return (
    <header className="v5-page-header">
      <div><span>{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>
      <button type="button" onClick={onCreate} title="创建行动" aria-label="创建行动"><Plus size={24} /></button>
    </header>
  )
}

function V5SectionHeading({ title, description }: { title: string; description?: string }) {
  return <div className="v5-section-heading"><h2>{title}</h2>{description && <p>{description}</p>}</div>
}

function V5StatusStrip({
  level,
  coins,
  completed,
  total,
}: {
  level: ReturnType<typeof getLevel>
  coins: number
  completed: number
  total: number
}) {
  return (
    <section className="v5-status-strip" aria-label="今日状态">
      <div><strong>Lv.{level.level}</strong><span>{level.current} / {level.needed} XP</span></div>
      <div><strong>稳定生活状态</strong><span>今日 {completed}/{total}</span></div>
      <div><strong>{coins}</strong><span>金币</span></div>
    </section>
  )
}

function V5PlanEntry({
  seasonTitle,
  coachPlanLabel,
  onOpenSeason,
  onOpenCoach,
}: {
  seasonTitle?: string
  coachPlanLabel: string
  onOpenSeason: () => void
  onOpenCoach: () => void
}) {
  const managingSeason = Boolean(seasonTitle)
  return (
    <button
      className="v5-plan-entry"
      type="button"
      aria-label={managingSeason ? '管理当前成长赛季' : coachPlanLabel}
      onClick={managingSeason ? onOpenSeason : onOpenCoach}
    >
      <ClipboardCheck size={20} />
      <span>
        <small>{managingSeason ? '本赛季' : '28 天目标'}</small>
        <strong>{seasonTitle ?? coachPlanLabel}</strong>
      </span>
      <ChevronRight size={18} />
    </button>
  )
}

function V5Feedback({
  feedback,
  onUndo,
  onFollowUp,
}: {
  feedback: V5FeedbackView
  onUndo: () => void
  onFollowUp: () => void
}) {
  const [condensed, setCondensed] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setCondensed(true), 1_200)
    return () => window.clearTimeout(timer)
  }, [])

  const display = getV5FeedbackDisplay(feedback, condensed)
  return (
    <div
      className={`v5-feedback${condensed ? ' condensed' : ''}${display.showFollowUp ? ' follow-up' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="v5-feedback-icon">{display.showFollowUp ? <ClipboardCheck size={18} /> : <Check size={18} />}</span>
      <div className="v5-feedback-copy">
        <strong>{display.title}</strong>
        <span>{display.detail}</span>
        {!condensed && (
          <span className="v5-feedback-reward">
            {feedback.xp > 0 && <b>+{feedback.xp} XP</b>}
            {feedback.coins > 0 && <b>+{feedback.coins} 金币</b>}
          </span>
        )}
      </div>
      <div className="v5-feedback-actions">
        {display.showFollowUp && <button className="primary" type="button" onClick={onFollowUp}>记录状态</button>}
        <button type="button" onClick={onUndo}><RotateCcw size={16} />撤销</button>
      </div>
    </div>
  )
}

function V5FocusAction({
  activity,
  completion,
  canSwitch,
  onComplete,
  onCompleteTier,
  onSwitch,
}: {
  activity: Activity
  completion?: Completion
  canSwitch: boolean
  onComplete: () => void
  onCompleteTier: (tier: TierLevel) => void
  onSwitch: () => void
}) {
  const [protocolOpen, setProtocolOpen] = useState(false)
  const goal = isTieredGoal(activity) ? activity.goal : undefined
  const tiers = goal ? getTierLevels(goal).slice(0, 2) : []
  const summary = activity.protocol?.split(/[。；]/)[0] || activity.cue || '完成当前行动的最低标准。'
  return (
    <article className={`v5-focus-action${completion ? ' completed' : ''}`}>
      <div className="v5-focus-meta">
        <span>现在 · {[getActivityScheduledTime(activity), activity.cue].filter((value, index, values) => value && values.indexOf(value) === index).join(' · ') || '今天随时'}</span>
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
        <div><h3>{activity.title}</h3><p>{completion ? '本次已经记录，可从完成详情继续升级。' : summary}</p></div>
        {canSwitch && <button type="button" onClick={onSwitch}>换一个</button>}
      </div>
      {completion ? (
        <div className="v5-completed-line"><Check size={18} />已记录{completion.tier ? `${tierLabels[completion.tier]}层` : '完成'}</div>
      ) : goal ? (
        <div className="v5-focus-actions">
          {tiers.map((tier) => (
            <button className={tier === 1 ? 'primary' : 'secondary'} type="button" key={tier} onClick={() => onCompleteTier(tier)}>
              {tierLabels[tier]} {formatTierGoalValue(goal, tier)}
            </button>
          ))}
        </div>
      ) : (
        <button className="v5-primary-button v5-wide" type="button" aria-label={`完成 ${activity.title}`} onClick={onComplete}>记录完成</button>
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

function V5TimelineRow({
  activity,
  completion,
  onClick,
}: {
  activity: Activity
  completion?: Completion
  onClick: () => void
}) {
  const cueMinute = activityScheduledMinute(activity)
  return (
    <div className="v5-timeline-row">
      <time>{cueMinute === undefined ? '随时' : formatMinute(cueMinute)}</time>
      <button className={completion ? 'done' : ''} type="button" onClick={onClick} aria-label={completion ? `查看 ${activity.title} 完成记录` : `完成 ${activity.title}`}>
        {completion ? <Check size={19} /> : <Clock3 size={18} />}
      </button>
      <div><strong>{activity.title}</strong><span>{completion ? `${tierLabel(completion)}已完成` : activity.cue ?? '等待执行'}</span></div>
    </div>
  )
}

function V5DailySection({
  activities,
  minute,
  priorityIds,
  feedbackActivityId,
  activeCompletion,
  onComplete,
  onCompleted,
  onSetPriority,
}: {
  activities: Activity[]
  minute: number
  priorityIds: string[]
  feedbackActivityId?: string
  activeCompletion: (activity: Activity) => Completion | undefined
  onComplete: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  onSetPriority: (activity: Activity, prioritized: boolean) => Promise<void>
}) {
  const [drawerTab, setDrawerTab] = useState<'pending' | 'completed'>()
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
    activities.filter((activity) => !activeCompletion(activity) || activity.id === heldCompletedId),
    minute,
    priorityIds,
  )
  const visible = pending.slice(0, 5)
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
          meta={`${getActivityScheduledTime(activity) ?? '随时'} · ${activity.domain ? domainLabel(activity.domain) : '旧体系'} · ${activity.difficulty}`}
          onClick={() => activeCompletion(activity) ? onCompleted(activity) : onComplete(activity)}
        />
      ))}
      {pending.length > 5 && (
        <button className="v5-text-button" type="button" onClick={() => setDrawerTab('pending')}>
          查看全部 {pending.filter((activity) => !activeCompletion(activity)).length} 项待行动
        </button>
      )}
      {completed.length > 0 && (
        <button className="v5-completed-summary" type="button" onClick={() => setDrawerTab('completed')}>
          <Check size={17} />
          <span>今日已完成 {completed.length} 项</span>
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

function V5CompactActionRow({
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
  return (
    <article className={`v5-compact-action${completion ? ' completed' : ''}`}>
      <div>
        <strong>{activity.title}</strong>
        <span>{meta}</span>
      </div>
      <button type="button" className={completion ? 'done' : ''} onClick={onClick} aria-label={completion ? `查看 ${activity.title} 完成记录` : `完成 ${activity.title}`}>
        {completion ? <Check size={18} /> : <ChevronRight size={19} />}
      </button>
    </article>
  )
}

function V5ActionSection({
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
  activeCompletion: (activity: Activity) => Completion | undefined
  initialTab: 'pending' | 'completed'
  minute: number
  priorityIds: string[]
  onClose: () => void
  onComplete: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  onSetPriority: (activity: Activity, prioritized: boolean) => Promise<void>
}) {
  const [tab, setTab] = useState(initialTab)
  const [query, setQuery] = useState('')
  const pending = orderDailyActions(activities.filter((activity) => !activeCompletion(activity)), minute, priorityIds)
  const completed = activities.filter((activity) => Boolean(activeCompletion(activity)))
  const source = tab === 'pending' ? pending : completed
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
      <div className="v5-drawer-tabs" role="tablist" aria-label="今日行动状态">
        <button type="button" role="tab" aria-selected={tab === 'pending'} className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>待行动 {pending.length}</button>
        <button type="button" role="tab" aria-selected={tab === 'completed'} className={tab === 'completed' ? 'active' : ''} onClick={() => setTab('completed')}>已完成 {completed.length}</button>
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
          const scheduled = getActivityScheduledTime(activity)
          const prioritized = priorityIds.includes(activity.id)
          return (
            <article className="v5-drawer-row" key={activity.id}>
              <div>
                <strong>{activity.title}</strong>
                <span>{scheduled ?? '随时'} · {activity.domain ? domainLabel(activity.domain) : '旧体系'} · {activity.difficulty}</span>
              </div>
              <div className="v5-drawer-row-actions">
                {!completion && !scheduled && (
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
                  {completion ? '查看' : '记录'}
                </button>
              </div>
            </article>
          )
        })}
        {visible.length === 0 && <p className="v5-drawer-empty">{query ? '没有匹配的行动' : tab === 'pending' ? '今天的行动已经完成' : '今天还没有完成记录'}</p>}
      </div>
    </V5ModalSurface>
  )
}

function V5ModalSurface({
  title,
  kicker = '完整清单',
  onClose,
  children,
}: {
  title: string
  kicker?: string
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const panel = panelRef.current
    window.setTimeout(() => panel?.querySelector<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])')?.focus(), 0)
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
      openerRef.current?.focus()
    }
  }, [])

  function trapFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return
    const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? [])]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable.at(-1)!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="v5-list-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={panelRef} className="v5-list-dialog" role="dialog" aria-modal="true" aria-labelledby="v5-list-dialog-title" onKeyDown={trapFocus}>
        <header>
          <div><span>{kicker}</span><h2 id="v5-list-dialog-title">{title}</h2></div>
          <button type="button" title="关闭" aria-label={`关闭${title}`} onClick={onClose}><X size={21} /></button>
        </header>
        {children}
      </section>
    </div>
  )
}

function V5WeeklySection({
  activities,
  completions,
  today,
  activeCompletion,
  onRecord,
  onCompleted,
  onDetails,
}: {
  activities: Activity[]
  completions: Completion[]
  today: string
  activeCompletion: (activity: Activity) => Completion | undefined
  onRecord: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  onDetails: (activity: Activity) => void
}) {
  const [drawerTab, setDrawerTab] = useState<'pending' | 'completed'>()
  if (activities.length === 0) return null
  const pending = activities.filter((activity) => !weeklyViewState(activity, completions, today).complete)
  const completed = activities.filter((activity) => weeklyViewState(activity, completions, today).complete)
  const visible = pending.slice(0, 3)
  return (
    <section className="v5-section v5-weekly-section">
      <div className="v5-section-count"><div><span>周一 04:00 更新</span><h2>本周灵活</h2></div><b>{activities.length}</b></div>
      {visible.map((activity) => (
        <V5WeeklyRow
          activity={activity}
          completions={completions}
          today={today}
          activeCompletion={activeCompletion(activity)}
          key={activity.id}
          onRecord={() => onRecord(activity)}
          onCompleted={() => onCompleted(activity)}
          onDetails={() => onDetails(activity)}
        />
      ))}
      {pending.length > 3 && (
        <button className="v5-text-button" type="button" onClick={() => setDrawerTab('pending')}>
          查看全部 {pending.length} 项待推进
        </button>
      )}
      {completed.length > 0 && (
        <button className="v5-completed-summary" type="button" onClick={() => setDrawerTab('completed')}>
          <Check size={17} />
          <span>本周已完成 {completed.length} 项</span>
          <ChevronRight size={17} />
        </button>
      )}
      {drawerTab && (
        <V5WeeklyDrawer
          activities={activities}
          completions={completions}
          today={today}
          activeCompletion={activeCompletion}
          initialTab={drawerTab}
          onClose={() => setDrawerTab(undefined)}
          onRecord={(activity) => {
            setDrawerTab(undefined)
            onRecord(activity)
          }}
          onCompleted={(activity) => {
            setDrawerTab(undefined)
            onCompleted(activity)
          }}
          onDetails={(activity) => {
            setDrawerTab(undefined)
            onDetails(activity)
          }}
        />
      )}
    </section>
  )
}

function V5WeeklyDrawer({
  activities,
  completions,
  today,
  activeCompletion,
  initialTab,
  onClose,
  onRecord,
  onCompleted,
  onDetails,
}: {
  activities: Activity[]
  completions: Completion[]
  today: string
  activeCompletion: (activity: Activity) => Completion | undefined
  initialTab: 'pending' | 'completed'
  onClose: () => void
  onRecord: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  onDetails: (activity: Activity) => void
}) {
  const [tab, setTab] = useState(initialTab)
  const [query, setQuery] = useState('')
  const pending = activities.filter((activity) => !weeklyViewState(activity, completions, today).complete)
  const completed = activities.filter((activity) => weeklyViewState(activity, completions, today).complete)
  const source = tab === 'pending' ? pending : completed
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visible = normalizedQuery
    ? source.filter((activity) => [
        activity.title,
        activity.domain ? domainLabel(activity.domain) : '旧体系',
        activity.difficulty,
      ].some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery)))
    : source
  return (
    <V5ModalSurface title="本周行动" onClose={onClose}>
      <div className="v5-drawer-tabs" role="tablist" aria-label="本周行动状态">
        <button type="button" role="tab" aria-selected={tab === 'pending'} className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>待推进 {pending.length}</button>
        <button type="button" role="tab" aria-selected={tab === 'completed'} className={tab === 'completed' ? 'active' : ''} onClick={() => setTab('completed')}>本周完成 {completed.length}</button>
      </div>
      {activities.length > 12 && (
        <label className="v5-drawer-search">
          <Search size={17} />
          <span className="sr-only">搜索本周行动</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、领域或难度" />
        </label>
      )}
      <div className="v5-drawer-list">
        {visible.map((activity) => (
          <V5WeeklyRow
            activity={activity}
            completions={completions}
            today={today}
            activeCompletion={activeCompletion(activity)}
            key={activity.id}
            onRecord={() => onRecord(activity)}
            onCompleted={() => onCompleted(activity)}
            onDetails={() => onDetails(activity)}
          />
        ))}
        {visible.length === 0 && <p className="v5-drawer-empty">{query ? '没有匹配的行动' : tab === 'pending' ? '本周行动已经全部完成' : '本周还没有完成的行动'}</p>}
      </div>
    </V5ModalSurface>
  )
}

function V5WeeklyRow({
  activity,
  completions,
  today,
  activeCompletion,
  onRecord,
  onCompleted,
  onDetails,
}: {
  activity: Activity
  completions: Completion[]
  today: string
  activeCompletion?: Completion
  onRecord: () => void
  onCompleted: () => void
  onDetails: () => void
}) {
  const { complete, summary, next, progress } = weeklyViewState(activity, completions, today)
  return (
    <article className={`v5-weekly-row${complete ? ' completed' : ''}`}>
      <div>
        <span>{activity.isKey ? '关键 · ' : ''}{activity.domain ? domainLabel(activity.domain) : '旧体系'}</span>
        <strong>{activity.title}</strong>
        <small>{summary} · {next}</small>
      </div>
      <div className="v5-weekly-actions">
        <button type="button" onClick={onDetails} title="查看本周详情" aria-label={`查看 ${activity.title} 本周详情`}><History size={17} /></button>
        <button type="button" disabled={complete} onClick={() => activeCompletion && !progress ? onCompleted() : onRecord()}>
          {complete ? '本周完成' : progress?.goal.metric === 'combined' ? '选择时长' : progress ? '记录一次' : activeCompletion ? '查看今天' : '记录'}
        </button>
      </div>
    </article>
  )
}

function weeklyViewState(activity: Activity, completions: Completion[], today: string) {
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

function V5TravelerSummary({ level, totalXp }: { level: ReturnType<typeof getLevel>; totalXp: number }) {
  const stage = getCharacterStage(level.level)
  return (
    <div className="v5-traveler-summary">
      <img src={`${import.meta.env.BASE_URL}assets/v5/traveler-stage-${stage}.png`} alt={`${getCharacterStageName(level.level)}阶段旅者`} />
      <div><span>{getCharacterStageName(level.level)} · 阶段 {stage}</span><strong>Lv.{level.level}</strong><small>{totalXp} XP</small></div>
    </div>
  )
}

function weeklyCycle(activity: Activity, completions: Completion[], today: string) {
  const cycleStart = startOfWeek(new Date(`${today}T12:00:00`))
  const cycleEnd = addDays(cycleStart, 6)
  return completions.filter((completion) => completion.activityId === activity.id && completion.occurredOn >= cycleStart && completion.occurredOn <= cycleEnd)
}

function incrementalSummary(progress: ReturnType<typeof calculateIncrementalProgress>) {
  const finalTier = getTierLevels(progress.goal).at(-1)!
  if (progress.goal.metric === 'count') return `${progress.totalCount}/${progress.goal.thresholds[finalTier - 1]}${progress.goal.unit}`
  const threshold = progress.goal.thresholds[finalTier - 1]
  if (progress.goal.mode === 'per_occurrence') return `${progress.totalCount} 次 · ${formatDurationSeconds(progress.totalDurationSeconds)}`
  return `${progress.totalCount}/${threshold.count} 次 · ${formatDurationSeconds(progress.totalDurationSeconds)}/${formatDurationSeconds(threshold.durationSeconds)}`
}

function incrementalNext(progress: ReturnType<typeof calculateIncrementalProgress>) {
  if (progress.maxReached) return '最高层已达成'
  const tier = progress.nextTier ?? getTierLevels(progress.goal).at(-1)!
  if (progress.goal.metric === 'count') return `距${tierLabels[tier]}层还差 ${Math.max(0, progress.goal.thresholds[tier - 1] - progress.totalCount)}${progress.goal.unit}`
  const threshold = progress.goal.thresholds[tier - 1]
  if (progress.goal.mode === 'per_occurrence') return `${progress.qualifiedCounts[tier] ?? 0}/${threshold.count} 次达到 ${formatDurationSeconds(threshold.durationSeconds)}`
  return `距${tierLabels[tier]}层还差 ${Math.max(0, threshold.count - progress.totalCount)} 次`
}

function currentMinute() {
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

function activityScheduledMinute(activity: Activity) {
  return parseTimeMinute(getActivityScheduledTime(activity))
}

export function gameDayMinute(minute: number) {
  return (minute - 4 * 60 + 24 * 60) % (24 * 60)
}

export function orderDailyActions(activities: Activity[], minute: number, priorityIds: string[]) {
  const originalOrder = new Map(activities.map((activity, index) => [activity.id, index]))
  const priorityOrder = new Map(priorityIds.map((id, index) => [id, priorityIds.length - index - 1]))
  const now = gameDayMinute(minute)
  return [...activities].sort((left, right) => {
    const leftMinute = activityScheduledMinute(left)
    const rightMinute = activityScheduledMinute(right)
    const leftGameMinute = leftMinute === undefined ? undefined : gameDayMinute(leftMinute)
    const rightGameMinute = rightMinute === undefined ? undefined : gameDayMinute(rightMinute)
    const group = (value: number | undefined) => value === undefined ? 1 : value <= now ? 0 : 2
    const leftGroup = group(leftGameMinute)
    const rightGroup = group(rightGameMinute)
    if (leftGroup !== rightGroup) return leftGroup - rightGroup
    if (leftGameMinute !== undefined && rightGameMinute !== undefined) {
      return leftGameMinute - rightGameMinute || (originalOrder.get(left.id)! - originalOrder.get(right.id)!)
    }
    const leftPriority = priorityOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightPriority = priorityOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER
    return leftPriority - rightPriority || (originalOrder.get(left.id)! - originalOrder.get(right.id)!)
  })
}

export function orderFocusCandidates(activities: Activity[], minute: number) {
  return [...activities].sort((left, right) => {
    const now = gameDayMinute(minute)
    const leftMinute = activityScheduledMinute(left)
    const rightMinute = activityScheduledMinute(right)
    const leftGameMinute = leftMinute === undefined ? undefined : gameDayMinute(leftMinute)
    const rightGameMinute = rightMinute === undefined ? undefined : gameDayMinute(rightMinute)
    const group = (cueMinute: number | undefined) => {
      if (cueMinute !== undefined && cueMinute <= now) return 0
      if (cueMinute !== undefined && cueMinute - now <= 90) return 1
      if (cueMinute === undefined) return 2
      return 3
    }
    const leftGroup = group(leftGameMinute)
    const rightGroup = group(rightGameMinute)
    if (leftGroup !== rightGroup) return leftGroup - rightGroup
    if (leftGameMinute === undefined || rightGameMinute === undefined) return 0
    return leftGameMinute - rightGameMinute
  })
}

function orderTimeline(activities: Activity[]) {
  return [...activities].sort((left, right) => {
    const leftMinute = activityScheduledMinute(left)
    const rightMinute = activityScheduledMinute(right)
    if (leftMinute === undefined && rightMinute === undefined) return 0
    if (leftMinute === undefined) return 1
    if (rightMinute === undefined) return -1
    return gameDayMinute(leftMinute) - gameDayMinute(rightMinute)
  })
}

function formatMinute(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function formatChineseDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00`))
}

function formatCompactDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

function tierLabel(completion: Completion) {
  return completion.tier ? `${tierLabels[completion.tier]}层` : ''
}

function activityFrequency(activity: Activity) {
  if (activity.schedule.kind === 'daily') return '每天'
  if (activity.schedule.kind === 'weekly') return `每周 ${activity.schedule.times} 次`
  return activity.plannedOn ? `计划 ${activity.plannedOn}` : '一次性'
}
