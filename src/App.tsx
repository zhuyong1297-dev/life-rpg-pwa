import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Activity as ActivityIcon,
  Award,
  Bell,
  BellOff,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Coins,
  Crosshair,
  Download,
  Dumbbell,
  Gift,
  Home,
  History,
  Leaf,
  ListTodo,
  Pause,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  UsersRound,
  Vibrate,
  Volume2,
  X,
  Zap,
} from 'lucide-react'
import { createBackup, createLedgerMarkdown, restoreBackup } from './backup'
import {
  archiveActivity as archiveActivityDefinition,
  activateGrowthDomains,
  activateCoachPlanDraft,
  calibrateSeasonWithStableLife,
  cancelTodayCompletion,
  completeSeason,
  completeActivity,
  createActivity,
  createSeason,
  createReward,
  db,
  getSnapshot,
  initializeDatabase,
  acknowledgeLevelMilestone,
  claimMilestoneReward,
  redeemReward,
  respondToSeasonSuggestion,
  permanentlyDeleteActivity,
  saveWeeklyReview,
  saveCoachPlanDraft,
  saveSeasonDailySignal,
  setActivityEnabled,
  setActivityKey,
  setRewardEnabled,
  setSeasonDailyFocus,
  setTargetReward,
  undoCompletion,
  updateHabit,
  restoreActivity,
  syncLevelMilestones,
  updatePreferences,
  updateReward,
  type CompletionDetails,
  type HabitUpdate,
  type NewActivity,
  type RewardInput,
} from './db'
import {
  addDays,
  coachBehaviorRoleLabels,
  CoachPlanDraftSchema,
  createCoachPlanDraft,
  domainLabel,
  calculateStats,
  difficulties,
  growthDomainDetails,
  growthDomains,
  legacyDomainSuggestions,
  getCharacterStage,
  getCharacterStageName,
  getCompletionTierGoal,
  getLevel,
  getLevelReport,
  getJourneyMonths,
  getMilestoneVoucherCost,
  getNextVoucherLevel,
  getTotalXpForLevel,
  getTierAchievement,
  getTierCount,
  getTierLevels,
  getTierReward,
  identityMessage,
  formatDurationSeconds,
  isDurationGoal,
  isTieredGoal,
  effectiveGameDate,
  localDate,
  nextGameDayBoundary,
  rewardTable,
  reviewDecisions,
  startOfWeek,
  formatTierGoalValue,
  tierLabels,
  tierLevels,
  TieredGoalSchema,
  type Activity,
  type CoachBehaviorRole,
  type CoachPlanBehavior,
  type CoachPlanDraft,
  type GrowthDomain,
  type Completion,
  type Difficulty,
  type FeedbackIntensity,
  type CombinedMode,
  type LedgerEvent,
  type LevelSystem,
  type Preferences,
  type Reward,
  type ReviewDecision,
  type TierLevel,
  type TierMetric,
  type TieredGoal,
  type TimeInputUnit,
  type WeeklyReview,
  type JourneyEntry,
  type JourneyMonth,
} from './domain'
import { playCompletionChime, playCompletionVibration, prepareCompletionAudio, requestNotificationPermission, sendCompletionFeedback } from './feedback'
import { CoachSuggestionSummary, SeasonHubModal, SeasonTodaySummary } from './SeasonExperience'

type Page = 'today' | 'character' | 'review' | 'settings'
type SecondaryPage = 'coach-plan'
type Snapshot = Awaited<ReturnType<typeof getSnapshot>>

function routeFromHash(): { page: Page; secondary?: SecondaryPage } {
  const path = window.location.hash.replace(/^#\/?/, '')
  if (path === 'coach/plan') return { page: 'today', secondary: 'coach-plan' }
  if (path === 'character' || path === 'review' || path === 'settings') return { page: path }
  return { page: 'today' }
}

function navigateTo(path: string, replace = false) {
  const url = `${window.location.pathname}${window.location.search}#/${path}`
  if (replace) window.history.replaceState(null, '', url)
  else window.location.hash = `/${path}`
}

const emptySnapshot: Snapshot = {
  activities: [],
  completions: [],
  ledgerEvents: [],
  rewards: [],
  weeklyReviews: [],
  seasons: [],
  settings: [],
}

const defaultPreferences: Preferences = { notifications: false, vibration: true, sound: false, feedbackIntensity: 'clear' }

interface AwardFeedback {
  completionId: string
  title: string
  domain: GrowthDomain
  xp: number
  coins: number
  durationMinutes?: number
  tier?: TierLevel
  achievedLabel?: string
  upgraded?: boolean
  leveledUp?: boolean
  level: ReturnType<typeof getLevel>
  rewardGoal?: { title: string; remaining: number }
}

interface ReviewDraft {
  impact: number
  friction: number
  decision: ReviewDecision
  note: string
}

type StringTriple = [string, string, string]
type CombinedThresholdDraft = { count: string; durationSeconds: string }

interface TierGoalDraft {
  tierCount: 2 | 3
  advanced: boolean
  metric: TierMetric
  durationSeconds: StringTriple
  countThresholds: StringTriple
  countUnit: string
  timeUnit: TimeInputUnit
  combinedMode: CombinedMode
  combinedTimeUnit: TimeInputUnit
  combinedThresholds: [CombinedThresholdDraft, CombinedThresholdDraft, CombinedThresholdDraft]
}

function defaultTierGoalDraft(): TierGoalDraft {
  return {
    tierCount: 3,
    advanced: false,
    metric: 'duration',
    durationSeconds: ['300', '1200', '2700'],
    countThresholds: ['1', '3', '5'],
    countUnit: '次',
    timeUnit: '分钟',
    combinedMode: 'per_occurrence',
    combinedTimeUnit: '秒',
    combinedThresholds: [
      { count: '3', durationSeconds: '60' },
      { count: '5', durationSeconds: '60' },
      { count: '5', durationSeconds: '120' },
    ],
  }
}

function tierGoalDraftFromGoal(goal: TieredGoal): TierGoalDraft {
  const draft = defaultTierGoalDraft()
  const tierCount = getTierCount(goal)
  if (goal.metric === 'count') {
    const countThresholds = [...draft.countThresholds]
    goal.thresholds.forEach((value, index) => { countThresholds[index] = String(value) })
    return { ...draft, tierCount, metric: 'count', countUnit: goal.unit, countThresholds: countThresholds as StringTriple }
  }
  if (goal.metric === 'duration') {
    const multiplier = goal.unit === '分钟' ? 60 : 1
    return {
      ...draft,
      tierCount,
      metric: 'duration',
      timeUnit: 'inputUnit' in goal ? goal.inputUnit : '分钟',
      durationSeconds: draft.durationSeconds.map((value, index) => goal.thresholds[index] === undefined ? value : String(goal.thresholds[index] * multiplier)) as StringTriple,
    }
  }
  return {
    ...draft,
    tierCount,
    advanced: true,
    combinedMode: goal.mode,
    combinedTimeUnit: goal.inputUnit,
    countUnit: goal.countUnit,
    combinedThresholds: draft.combinedThresholds.map((value, index) => goal.thresholds[index] === undefined ? value : ({ count: String(goal.thresholds[index].count), durationSeconds: String(goal.thresholds[index].durationSeconds) })) as TierGoalDraft['combinedThresholds'],
  }
}

function tierGoalDraftFromLegacy(activity: Activity): TierGoalDraft {
  const draft = defaultTierGoalDraft()
  if (activity.goal.kind === 'tiered') return tierGoalDraftFromGoal(activity.goal)
  if (isDurationGoal(activity)) return { ...draft, durationSeconds: ['', String(activity.goal.count * 60), ''] }
  return { ...draft, metric: 'count', countUnit: activity.goal.unit, countThresholds: ['', String(activity.goal.count), ''] }
}

function buildTierGoal(draft: TierGoalDraft): TieredGoal {
  const takeTiers = <T,>(values: T[]): [T, T] | [T, T, T] => values.slice(0, draft.tierCount) as [T, T] | [T, T, T]
  if (draft.advanced) {
    return {
      kind: 'tiered',
      metric: 'combined',
      mode: draft.combinedMode,
      countUnit: draft.countUnit,
      inputUnit: draft.combinedTimeUnit,
      thresholds: takeTiers(draft.combinedThresholds.map((value) => ({
        count: Number(value.count),
        durationSeconds: Number(value.durationSeconds),
      }))),
    }
  }
  if (draft.metric === 'count') {
    return { kind: 'tiered', metric: 'count', unit: draft.countUnit, thresholds: takeTiers(draft.countThresholds.map(Number)) }
  }
  return {
    kind: 'tiered',
    metric: 'duration',
    unit: '秒',
    inputUnit: draft.timeUnit,
    thresholds: takeTiers(draft.durationSeconds.map(Number)),
  }
}

function timeInputValue(seconds: string, unit: TimeInputUnit) {
  if (!seconds) return ''
  return String(Number(seconds) / (unit === '分钟' ? 60 : 1))
}

function timeInputSeconds(value: string, unit: TimeInputUnit) {
  if (!value) return ''
  return String(Number(value) * (unit === '分钟' ? 60 : 1))
}

function activityDomainLabel(activity: Activity) {
  return activity.domain ? domainLabel(activity.domain) : `${activity.attribute ?? '未分类'} · 旧体系`
}

function GrowthDomainMigration({
  activities,
  onComplete,
  notice,
}: {
  activities: Activity[]
  onComplete: (assignments: Record<string, GrowthDomain>) => Promise<void>
  notice: string
}) {
  const [assignments, setAssignments] = useState<Record<string, GrowthDomain>>(() => Object.fromEntries(
    activities.map((activity) => [activity.id, activity.attribute ? legacyDomainSuggestions[activity.attribute] : 'life']),
  ))
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const remainingActivities = activities.filter((activity) => !confirmed.has(activity.id))
  const ready = remainingActivities.length === 0
  const remainingLabel = ready
    ? '所有活动已经确认'
    : `还未确认：${remainingActivities[0].title}${remainingActivities.length > 1 ? ` 等 ${remainingActivities.length} 项` : ''}`

  function focusFirstUnconfirmed() {
    const index = activities.findIndex((activity) => activity.id === remainingActivities[0]?.id)
    const item = document.getElementById(`migration-activity-${index}`)
    item?.scrollIntoView({ block: 'center' })
    item?.focus({ preventScroll: true })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || submitting) return
    setSubmitting(true)
    await onComplete(assignments)
    setSubmitting(false)
  }

  return (
    <main className="migration-screen">
      <form className="migration-panel" onSubmit={submit}>
        <header className="migration-header">
          <span className="modal-kicker">地球 Online V4.2.0</span>
          <h1>建立六个成长领域</h1>
          <p>按行动最终改善的现实结果分类。建议值只来自旧属性映射，每一项仍需由你亲自确认。</p>
          <div className="migration-progress"><span>已确认 {confirmed.size} / {activities.length}</span><ProgressBar value={activities.length ? confirmed.size / activities.length : 1} label="迁移确认进度" compact /></div>
          <div className={ready ? 'migration-pending ready' : 'migration-pending'} role="status">
            <span>{remainingLabel}</span>
            {!ready && <button type="button" onClick={focusFirstUnconfirmed}><Crosshair aria-hidden="true" />定位未确认项</button>}
          </div>
        </header>
        {notice && <div className="notice" role="status"><span>{notice}</span></div>}
        <div className="migration-list">
          {activities.length === 0 && <p className="empty-state">没有需要迁移的现有活动。启用后，新建行动将直接使用成长领域。</p>}
          {activities.map((activity, index) => {
            const selected = assignments[activity.id]
            const isConfirmed = confirmed.has(activity.id)
            return (
              <section id={`migration-activity-${index}`} tabIndex={-1} className={isConfirmed ? 'migration-item confirmed' : 'migration-item'} key={activity.id}>
                <div className="migration-item-heading">
                  <div><strong>{activity.title}</strong><span>旧属性：{activity.attribute ?? '未分类'} · 建议：{domainLabel(selected)}</span></div>
                  {isConfirmed ? <Check aria-label="已确认" /> : <span className="migration-waiting">待确认</span>}
                </div>
                <div className="domain-choice-grid" aria-label={`${activity.title}的成长领域`}>
                  {growthDomains.map((domain) => {
                    const details = growthDomainDetails[domain]
                    return (
                      <button
                        type="button"
                        key={domain}
                        className={selected === domain ? 'selected' : ''}
                        aria-pressed={selected === domain}
                        onClick={() => {
                          setAssignments((current) => ({ ...current, [activity.id]: domain }))
                          setConfirmed((current) => new Set(current).add(activity.id))
                        }}
                      >
                        <DomainMark domain={domain} />
                        <small>{details.description}</small>
                      </button>
                    )
                  })}
                </div>
                <p className="domain-example">当前选择示例：{growthDomainDetails[selected].examples}</p>
              </section>
            )
          })}
        </div>
        <footer className="migration-footer">
          <div className="migration-footer-copy">
            <strong>{remainingLabel}</strong>
            <p>总 XP、金币、完成记录和旧日志不会改变；六个新领域从 0 XP 开始。</p>
            {!ready && <button type="button" onClick={focusFirstUnconfirmed}><Crosshair aria-hidden="true" />定位未确认项</button>}
          </div>
          <button className="primary-action" type="submit" disabled={!ready || submitting}><ShieldCheck aria-hidden="true" />{submitting ? '正在启用…' : '启用新领域体系'}</button>
        </footer>
      </form>
    </main>
  )
}

const assetUrl = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`
const isPreview = import.meta.env.MODE === 'preview'

function App() {
  const initialRoute = useMemo(routeFromHash, [])
  const [page, setPage] = useState<Page>(initialRoute.page)
  const [secondaryPage, setSecondaryPage] = useState<SecondaryPage | undefined>(initialRoute.secondary)
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [noteActivity, setNoteActivity] = useState<Activity | null>(null)
  const [tierActivity, setTierActivity] = useState<Activity | null>(null)
  const [goalActivity, setGoalActivity] = useState<Activity | null>(null)
  const [completionActivity, setCompletionActivity] = useState<Activity | null>(null)
  const [archiveActivity, setArchiveActivity] = useState<Activity | null>(null)
  const [deleteActivity, setDeleteActivity] = useState<Activity | null>(null)
  const [activityManagerOpen, setActivityManagerOpen] = useState(false)
  const [seasonHubOpen, setSeasonHubOpen] = useState(false)
  const [feedback, setFeedback] = useState<AwardFeedback | null>(null)
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    if (!window.location.hash) navigateTo('today', true)
    const syncRoute = () => {
      const route = routeFromHash()
      setPage(route.page)
      setSecondaryPage(route.secondary)
    }
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  const refresh = useCallback(async () => {
    setSnapshot(await getSnapshot())
  }, [])

  useEffect(() => {
    initializeDatabase()
      .then(() => syncLevelMilestones())
      .then(refresh)
      .then(() => setReady(true))
      .catch((error: unknown) => setNotice(errorMessage(error)))
  }, [refresh])

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => {
      setFeedback(null)
      void syncLevelMilestones().then(refresh)
    }, 10_000)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const preferences = useMemo(() => {
    const setting = snapshot.settings.find((item) => item.key === 'preferences')
    return setting?.key === 'preferences' ? { ...defaultPreferences, ...setting.value } : defaultPreferences
  }, [snapshot.settings])

  useEffect(() => {
    if (!preferences.sound) return
    const resumeAudio = () => {
      if (document.visibilityState === 'visible') void prepareCompletionAudio()
    }
    document.addEventListener('visibilitychange', resumeAudio)
    return () => document.removeEventListener('visibilitychange', resumeAudio)
  }, [preferences.sound])

  const stats = useMemo(() => calculateStats(snapshot.ledgerEvents), [snapshot.ledgerEvents])
  const level = getLevel(stats.totalXp)
  const metaSetting = snapshot.settings.find((item) => item.key === 'meta')
  const levelSystem = metaSetting?.key === 'meta' ? metaSetting.value.levelSystem : undefined
  const targetRewardId = metaSetting?.key === 'meta' ? metaSetting.value.targetRewardId : undefined
  const gameDayBoundaryActivatedAt = metaSetting?.key === 'meta' ? metaSetting.value.gameDayBoundaryActivatedAt : undefined
  const growthDomainSystem = metaSetting?.key === 'meta' ? metaSetting.value.growthDomainSystem : undefined
  const coachDraftSetting = snapshot.settings.find((item) => item.key === 'coachPlanDraft')
  const coachDraft = coachDraftSetting?.key === 'coachPlanDraft' ? coachDraftSetting.value : undefined
  const targetReward = snapshot.rewards.find((reward) => reward.id === targetRewardId && reward.enabled)
  const activeSeason = snapshot.seasons.find((season) => season.status === 'active')
  const characterNeedsAttention = Boolean(levelSystem?.milestones.some(
    (milestone) => !milestone.acknowledgedAt || (milestone.voucherMaxCost && !milestone.claimedAt),
  ))
  const today = effectiveGameDate(clock, gameDayBoundaryActivatedAt)
  const growthDomainCandidates = useMemo(() => {
    const settledTaskIds = new Set(snapshot.completions.filter((completion) => completion.status === 'active' && completion.occurredOn < today).map((completion) => completion.activityId))
    return snapshot.activities.filter((activity) => !activity.domain && (activity.type === 'habit' || !settledTaskIds.has(activity.id)))
  }, [snapshot.activities, snapshot.completions, today])

  useEffect(() => {
    const refreshClock = () => {
      setClock(new Date())
      void refresh()
    }
    const delay = Math.max(0, nextGameDayBoundary(new Date()).getTime() - Date.now()) + 250
    const timer = window.setTimeout(refreshClock, delay)
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshClock() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [clock, gameDayBoundaryActivatedAt, refresh])

  const activeCompletion = useCallback(
    (activity: Activity) =>
      snapshot.completions.find(
        (completion) =>
          completion.activityId === activity.id &&
          completion.status === 'active' &&
          completion.occurredOn === today,
      ),
    [snapshot.completions, today],
  )

  const completedTaskIds = new Set(snapshot.completions.filter((completion) => completion.status === 'active' && completion.occurredOn < today).map((completion) => completion.activityId))
  const enabledActivities = snapshot.activities.filter(
    (activity) => activity.enabled && (activity.type !== 'task' || !completedTaskIds.has(activity.id)),
  )
  const isDue = (activity: Activity) => activity.type === 'habit' || !activity.plannedOn || activity.plannedOn <= today
  const seasonFocusOrder = new Map(activeSeason?.focusActivities.map((focus, index) => [focus.activityId, index]) ?? [])
  const keyActivities = enabledActivities
    .filter((activity) => activity.isKey && isDue(activity))
    .sort((left, right) => (seasonFocusOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (seasonFocusOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER))
  const otherHabits = enabledActivities.filter((activity) => activity.type === 'habit' && !activity.isKey)
  const tasks = enabledActivities.filter((activity) => activity.type === 'task' && !activity.isKey && isDue(activity))
  const reviewActivities = activeSeason
    ? activeSeason.focusActivities
        .map((focus) => snapshot.activities.find((activity) => activity.id === focus.activityId))
        .filter((activity): activity is Activity => Boolean(activity))
    : keyActivities

  async function finishActivity(activity: Activity, details?: CompletionDetails) {
    const preparedAudio = preferences.sound ? prepareCompletionAudio() : undefined
    try {
      const result = await completeActivity(activity.id, undefined, details)
      setNoteActivity(null)
      if (!result.awarded) return
      const nextStats = calculateStats([...snapshot.ledgerEvents, result.event])
      const completedTierGoal = getCompletionTierGoal(result.completion, result.activity)
      const nextLevel = getLevel(nextStats.totalXp)
      const leveledUp = nextLevel.level > level.level
      if (!activity.domain) throw new Error('请先完成成长领域迁移')
      setFeedback({
        completionId: result.completion.id,
        title: activity.title,
        domain: activity.domain,
        xp: result.event.xpDelta,
        coins: result.event.coinDelta,
        durationMinutes: result.completion.durationMinutes,
        tier: result.completion.tier,
        achievedLabel: result.completion.tier && completedTierGoal
          ? formatTierGoalValue(completedTierGoal, result.completion.tier)
          : undefined,
        upgraded: result.upgraded,
        leveledUp,
        level: nextLevel,
        rewardGoal: targetReward
          ? { title: targetReward.title, remaining: Math.max(0, targetReward.cost - nextStats.coins) }
          : undefined,
      })
      await refresh()
      if (activity.cue === '23:00' && activeSeason?.calibration && !activeSeason.dailySignals.some((signal) => signal.date === today)) {
        setNotice('夜间收尾已完成；可在赛季卡中用约 15 秒记录今日状态')
      }
      void sendCompletionFeedback(preferences, {
        title: activity.title,
        xp: result.event.xpDelta,
        coins: result.event.coinDelta,
        domain: activity.domain,
        durationMinutes: result.completion.durationMinutes,
        tier: result.completion.tier,
        upgraded: result.upgraded,
        leveledUp,
      }, preparedAudio).then(async (result) => {
        const vibrationFailed = result.vibration === false
        const soundFailed = result.sound === false
        if (!vibrationFailed && !soundFailed) return
        await updatePreferences({
          ...preferences,
          vibration: vibrationFailed ? false : preferences.vibration,
          sound: soundFailed ? false : preferences.sound,
        })
        await refresh()
        setNotice(`${[vibrationFailed ? '振动' : '', soundFailed ? '声音' : ''].filter(Boolean).join('和')}在当前设备不可用，已自动关闭`)
      }).catch((error: unknown) => setNotice(errorMessage(error)))
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  function requestCompletion(activity: Activity) {
    if (isTieredGoal(activity)) setTierActivity(activity)
    else if (isDurationGoal(activity) || activity.difficulty === '困难' || activity.difficulty === 'Boss') setNoteActivity(activity)
    else void finishActivity(activity)
  }

  async function undoLast() {
    if (!feedback) return
    try {
      await undoCompletion(feedback.completionId)
      setFeedback(null)
      await refresh()
      setNotice('已撤销，本次成长已用修正流水抵消')
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  if (!ready) {
    return (
      <main className="loading-screen">
        <ShieldCheck aria-hidden="true" />
        <span>正在读取本地存档…</span>
      </main>
    )
  }

  if (!growthDomainSystem) {
    return (
      <GrowthDomainMigration
        activities={growthDomainCandidates}
        onComplete={async (assignments) => {
          try {
            await activateGrowthDomains(assignments)
            await refresh()
            setNotice('六个成长领域已启用，新领域从 0 XP 开始')
          } catch (error) {
            setNotice(errorMessage(error))
          }
        }}
        notice={notice}
      />
    )
  }

  return (
    <div className={secondaryPage ? 'app-shell secondary-route' : 'app-shell'}>
      {!secondaryPage && <Navigation
        page={page}
        onChange={(nextPage) => {
          navigateTo(nextPage)
          if (nextPage === 'character') void syncLevelMilestones().then(refresh)
        }}
        onCreate={() => setCreateOpen(true)}
        characterNeedsAttention={characterNeedsAttention}
      />}
      <main className="main-content">
        {isPreview && (
          <div className="preview-banner" role="status">
            <ShieldCheck aria-hidden="true" />
            <span><strong>预览版</strong> · 测试数据与正式版完全分开</span>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button className="icon-button" type="button" title="关闭提示" onClick={() => setNotice('')}>
              <X aria-hidden="true" />
            </button>
          </div>
        )}
        {secondaryPage === 'coach-plan' ? (
          <CoachPlanScreen
            storedDraft={coachDraft}
            activities={snapshot.activities}
            activeSeason={activeSeason}
            onBack={() => navigateTo(page)}
            onSave={async (draft) => {
              await saveCoachPlanDraft(draft)
              await refresh()
            }}
            onFinish={async (draft) => {
              const readyDraft = { ...draft, currentStep: 4 as const, status: 'ready' as const }
              await saveCoachPlanDraft(readyDraft)
              if (activeSeason) {
                await refresh()
                setNotice('下个赛季方案已保存，当前赛季和关键行为没有改变')
              } else {
                await activateCoachPlanDraft(readyDraft.id, today)
                await refresh()
                setNotice('28 天成长赛季已启动，规划行为已设为关键行动')
              }
              navigateTo('today')
            }}
          />
        ) : page === 'today' && (
          <TodayPage
            today={today}
            totalXp={stats.totalXp}
            level={level}
            levelSystem={levelSystem}
            coins={stats.coins}
            keyActivities={keyActivities}
            otherHabits={otherHabits}
            tasks={tasks}
            season={activeSeason}
            activities={snapshot.activities}
            completions={snapshot.completions}
            activeCompletion={activeCompletion}
            onComplete={requestCompletion}
            onCompleted={setCompletionActivity}
            onCreate={() => setCreateOpen(true)}
            onOpenSeason={() => setSeasonHubOpen(true)}
            coachDraft={coachDraft}
            onOpenCoach={() => navigateTo('coach/plan')}
          />
        )}
        {page === 'character' && (
          <CharacterPage
            stats={stats}
            level={level}
            ledgerEvents={snapshot.ledgerEvents}
            completions={snapshot.completions}
            today={today}
            levelSystem={levelSystem}
            rewards={snapshot.rewards}
            targetRewardId={targetRewardId}
            onAcknowledge={async (milestoneLevel, focusDomain) => {
              try {
                await acknowledgeLevelMilestone(milestoneLevel, focusDomain)
                await refresh()
                setNotice(`下一阶段重点领域已设为${domainLabel(focusDomain)}`)
              } catch (error) {
                setNotice(errorMessage(error))
              }
            }}
            onClaimVoucher={async (milestoneLevel, rewardId) => {
              try {
                await claimMilestoneReward(milestoneLevel, rewardId)
                await refresh()
                setNotice('阶段礼券已领取，不扣除金币')
              } catch (error) {
                setNotice(errorMessage(error))
              }
            }}
            onRedeem={async (rewardId) => {
              try {
                await redeemReward(rewardId)
                await refresh()
                setNotice('奖励兑换成功，已写入金币流水')
              } catch (error) {
                setNotice(errorMessage(error))
              }
            }}
            onCreateReward={async (input) => {
              try {
                await createReward(input)
                await refresh()
                setNotice('奖励商品已加入商店')
              } catch (error) {
                setNotice(errorMessage(error))
                throw error
              }
            }}
            onUpdateReward={async (rewardId, input) => {
              try {
                await updateReward(rewardId, input)
                await refresh()
                setNotice('奖励商品已更新，历史兑换保持不变')
              } catch (error) {
                setNotice(errorMessage(error))
                throw error
              }
            }}
            onSetRewardEnabled={async (rewardId, enabled) => {
              try {
                await setRewardEnabled(rewardId, enabled)
                await refresh()
                setNotice(enabled ? '奖励商品已恢复' : '奖励商品已停用')
              } catch (error) {
                setNotice(errorMessage(error))
              }
            }}
            onSetTargetReward={async (rewardId) => {
              try {
                await setTargetReward(rewardId)
                await refresh()
                setNotice(rewardId ? '当前奖励目标已更新' : '已取消当前奖励目标')
              } catch (error) {
                setNotice(errorMessage(error))
              }
            }}
          />
        )}
        {page === 'review' && (
          <ReviewPage
            activities={reviewActivities}
            completions={snapshot.completions}
            reviews={snapshot.weeklyReviews}
            today={today}
            season={activeSeason}
            onOpenSeason={() => setSeasonHubOpen(true)}
            onSave={async (review) => {
              try {
                const result = await saveWeeklyReview(review)
                await refresh()
                setNotice(result.suggestions.length > 0
                  ? `本周复盘已保存，生成 ${result.suggestions.length} 条透明建议`
                  : '本周复盘已保存，请导出 JSON 备份与 Markdown 账本')
              } catch (error) {
                setNotice(errorMessage(error))
                throw error
              }
            }}
          />
        )}
        {page === 'settings' && (
          <SettingsPage
            preferences={preferences}
            activities={snapshot.activities}
            completions={snapshot.completions}
            onManage={() => setActivityManagerOpen(true)}
            onPreferences={async (value) => {
              await updatePreferences(value)
              await refresh()
            }}
            onRefresh={refresh}
            onNotice={setNotice}
          />
        )}
      </main>

      {createOpen && (
        <CreateActivityModal
          today={today}
          onClose={() => setCreateOpen(false)}
          onCreate={async (activity) => {
            try {
              await createActivity(activity)
              await refresh()
              setCreateOpen(false)
            } catch (error) {
              setNotice(errorMessage(error))
            }
          }}
        />
      )}
      {noteActivity && (
        <CompletionModal
          activity={noteActivity}
          onClose={() => setNoteActivity(null)}
          onComplete={(details) => void finishActivity(noteActivity, details)}
        />
      )}
      {tierActivity && (
        <TierPickerModal
          activity={tierActivity}
          completion={activeCompletion(tierActivity)}
          onClose={() => setTierActivity(null)}
          onComplete={(tier) => {
            setTierActivity(null)
            void finishActivity(tierActivity, { tier })
          }}
        />
      )}
      {goalActivity && (
        <EditHabitModal
          activity={goalActivity}
          onClose={() => setGoalActivity(null)}
          onSave={async (input) => {
            try {
              await updateHabit(goalActivity.id, input)
              setGoalActivity(null)
              await refresh()
              setNotice('习惯已更新，历史完成和账本保持不变')
            } catch (error) {
              setNotice(errorMessage(error))
            }
          }}
        />
      )}
      {completionActivity && activeCompletion(completionActivity) && (
        <CompletionActionsModal
          activity={completionActivity}
          completion={activeCompletion(completionActivity)!}
          onClose={() => setCompletionActivity(null)}
          onUpgrade={(tier) => {
            setCompletionActivity(null)
            void finishActivity(completionActivity, { tier })
          }}
          onCancel={async () => {
            const completion = activeCompletion(completionActivity)
            if (!completion) return
            try {
              await cancelTodayCompletion(completion.id)
              setCompletionActivity(null)
              await refresh()
              setNotice('今天的完成已取消，奖励已用修正流水抵消')
            } catch (error) {
              setNotice(errorMessage(error))
            }
          }}
        />
      )}
      {archiveActivity && (
        <ArchiveActivityModal
          activity={archiveActivity}
          onClose={() => setArchiveActivity(null)}
          onConfirm={async () => {
            try {
              await archiveActivityDefinition(archiveActivity.id)
              setArchiveActivity(null)
              await refresh()
              setNotice('活动已归档，历史记录仍然保留')
            } catch (error) {
              setNotice(errorMessage(error))
            }
          }}
        />
      )}
      {activityManagerOpen && (
        <ActivityManagerModal
          activities={snapshot.activities}
          completions={snapshot.completions}
          today={today}
          onClose={() => setActivityManagerOpen(false)}
          onEdit={(activity) => {
            setActivityManagerOpen(false)
            setGoalActivity(activity)
          }}
          onArchive={setArchiveActivity}
          onDelete={setDeleteActivity}
          onRestore={async (activityId) => {
            try {
              await restoreActivity(activityId)
              await refresh()
              setNotice('活动已恢复')
            } catch (error) {
              setNotice(errorMessage(error))
            }
          }}
          onRefresh={refresh}
          onNotice={setNotice}
        />
      )}
      {deleteActivity && (
        <DeleteActivityModal
          activity={deleteActivity}
          onClose={() => setDeleteActivity(null)}
          onConfirm={async () => {
            try {
              await permanentlyDeleteActivity(deleteActivity.id)
              setDeleteActivity(null)
              await refresh()
              setNotice('活动定义已删除，成长历史和角色数值保持不变')
            } catch (error) {
              setNotice(errorMessage(error))
            }
          }}
        />
      )}
      {seasonHubOpen && (
        <SeasonHubModal
          seasons={snapshot.seasons}
          activities={snapshot.activities}
          completions={snapshot.completions}
          reviews={snapshot.weeklyReviews}
          today={today}
          onClose={() => setSeasonHubOpen(false)}
          onCreate={async (input) => {
            try {
              await createSeason(input, today)
              await refresh()
              setNotice('28 天成长赛季已开始，现实结果是唯一成功标准')
            } catch (error) {
              setNotice(errorMessage(error))
              throw error
            }
          }}
          onSetDailyFocus={async (seasonId, activityIds) => {
            try {
              await setSeasonDailyFocus(seasonId, activityIds, today)
              await refresh()
              setNotice('今日重点已更新，不会修改赛季核心行为')
            } catch (error) {
              setNotice(errorMessage(error))
              throw error
            }
          }}
          onCalibrate={async (seasonId) => {
            try {
              await calibrateSeasonWithStableLife(seasonId, today)
              await refresh()
              setNotice('稳定生活方案已启用，今天重新作为第 1 天')
            } catch (error) {
              setNotice(errorMessage(error))
              throw error
            }
          }}
          onSaveSignal={async (seasonId, signal) => {
            try {
              await saveSeasonDailySignal(seasonId, signal, today)
              await refresh()
              setNotice('今日现实状态已保存，不影响 XP 或金币')
            } catch (error) {
              setNotice(errorMessage(error))
              throw error
            }
          }}
          onRespond={async (seasonId, suggestionId, status, note) => {
            try {
              await respondToSeasonSuggestion(seasonId, suggestionId, status, note)
              await refresh()
              setNotice(status === 'ignored' ? '建议已忽略，活动没有改变' : '建议已记录，活动仍需由你手动调整')
            } catch (error) {
              setNotice(errorMessage(error))
              throw error
            }
          }}
          onComplete={async (seasonId, result, evidence) => {
            try {
              await completeSeason(seasonId, result, evidence, today)
              await refresh()
              setNotice('赛季结论已进入个人策略库')
            } catch (error) {
              setNotice(errorMessage(error))
              throw error
            }
          }}
        />
      )}
      {feedback && <FeedbackOverlay feedback={feedback} onUndo={() => void undoLast()} />}
    </div>
  )
}

type NewCoachBehavior = Extract<CoachPlanBehavior, { source: 'new' }>

function createNewCoachBehavior(role: CoachBehaviorRole): NewCoachBehavior {
  return {
    id: crypto.randomUUID(),
    role,
    source: 'new',
    title: '',
    cue: '',
    protocol: '',
    domain: role === 'progress' ? 'career' : role === 'maintain' ? 'life' : 'health',
    difficulty: role === 'progress' ? '普通' : '简单',
    goal: { kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '分钟', thresholds: [300, 900] },
    schedule: { kind: 'daily' },
    confirmed: false,
  }
}

function CoachPlanScreen({
  storedDraft,
  activities,
  activeSeason,
  onBack,
  onSave,
  onFinish,
}: {
  storedDraft?: CoachPlanDraft
  activities: Activity[]
  activeSeason?: Snapshot['seasons'][number]
  onBack: () => void
  onSave: (draft: CoachPlanDraft) => Promise<void>
  onFinish: (draft: CoachPlanDraft) => Promise<void>
}) {
  const [draft, setDraft] = useState<CoachPlanDraft>(() => storedDraft ?? createCoachPlanDraft())
  const [reuseRole, setReuseRole] = useState<CoachBehaviorRole>('progress')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [replaceConfirm, setReplaceConfirm] = useState(false)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    if (storedDraft && storedDraft.id !== draft.id) setDraft(storedDraft)
  }, [storedDraft?.id])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => undefined).then(() => onSave(draft))
      void saveQueue.current.catch((saveError: unknown) => setError(errorMessage(saveError)))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [draft])

  const updateDraft = (next: Partial<CoachPlanDraft>) => {
    setError('')
    setDraft((current) => ({ ...current, ...next, status: 'editing', updatedAt: new Date().toISOString() }))
  }
  const updateBehavior = (id: string, update: (behavior: CoachPlanBehavior) => CoachPlanBehavior) => {
    updateDraft({ behaviors: draft.behaviors.map((behavior) => behavior.id === id ? update(behavior) : behavior) })
  }
  const eligibleActivities = activities.filter((activity) => activity.type === 'habit' && activity.enabled && !activity.archivedAt)
  const selectedActivityIds = new Set(draft.behaviors.flatMap((behavior) => behavior.source === 'existing' ? [behavior.activityId] : []))
  const activityById = new Map(activities.map((activity) => [activity.id, activity]))

  function stepError(step: number) {
    if (step === 1 && (!draft.title.trim() || !draft.successCriterion.trim() || !draft.baseline.trim() || !draft.targetOutcome.trim())) return '请先完整填写现实结果和可验证标准'
    if (step === 2 && (draft.behaviors.length < 1 || draft.behaviors.length > 3)) return '请选择 1 至 3 项核心行为'
    if (step === 3) {
      if (draft.behaviors.some((behavior) => behavior.source === 'existing' && (!behavior.confirmed || !activityById.get(behavior.activityId)?.enabled || activityById.get(behavior.activityId)?.archivedAt))) return '请确认每项复用活动仍然可用'
      if (draft.behaviors.some((behavior) => behavior.source === 'new' && !behavior.confirmed)) return '请逐项确认新行为的领域、难度、触发条件和最低标准'
    }
    return ''
  }

  function goNext() {
    const message = stepError(draft.currentStep)
    if (message) return setError(message)
    updateDraft({ currentStep: Math.min(4, draft.currentStep + 1) })
  }

  const burden = draft.behaviors.reduce((summary, behavior) => {
    const activity = behavior.source === 'existing' ? activityById.get(behavior.activityId) : behavior
    if (!activity) return summary
    const times = activity.schedule.kind === 'weekly' ? activity.schedule.times : 7
    summary.sessions += times
    if (activity.goal.kind === 'tiered') {
      const achievement = getTierAchievement(activity.goal, 1)
      summary.seconds += (achievement.durationSeconds ?? 0) * times
    } else if (activity.goal.kind === 'duration' || activity.goal.unit === '分钟') {
      summary.seconds += activity.goal.count * 60 * times
    }
    return summary
  }, { sessions: 0, seconds: 0 })

  async function finish() {
    const message = stepError(3)
    if (message) return setError(message)
    try {
      setSubmitting(true)
      const readyDraft = CoachPlanDraftSchema.parse({ ...draft, currentStep: 4, status: 'ready' })
      await saveQueue.current
      await onFinish(readyDraft)
    } catch (finishError) {
      setError(errorMessage(finishError))
    } finally {
      setSubmitting(false)
    }
  }

  const steps = ['现实结果', '行动链', '最低标准', '现实检查']
  return (
    <section className="coach-plan-screen" aria-labelledby="coach-plan-title">
      <header className="coach-plan-header">
        <button className="coach-back" type="button" onClick={onBack}><ChevronLeft aria-hidden="true" />返回</button>
        <div><span className="modal-kicker">个人成长教练</span><h1 id="coach-plan-title">目标规划器</h1><p>把一个现实目标拆成最多三项能真正执行的行为。</p></div>
        <button className={replaceConfirm ? 'coach-restart confirming' : 'coach-restart'} type="button" onClick={() => {
          if (!replaceConfirm) return setReplaceConfirm(true)
          setDraft(createCoachPlanDraft())
          setReplaceConfirm(false)
        }}><RotateCcw aria-hidden="true" />{replaceConfirm ? '确认替换草稿' : '重新规划'}</button>
      </header>

      <ol className="coach-steps" aria-label="规划进度">
        {steps.map((label, index) => {
          const number = index + 1
          return <li key={label} className={number === draft.currentStep ? 'active' : number < draft.currentStep ? 'done' : ''}><span>{number < draft.currentStep ? <Check aria-hidden="true" /> : number}</span><b>{label}</b></li>
        })}
      </ol>

      {error && <div className="coach-error" role="alert">{error}</div>}

      <div className="coach-plan-body">
        {draft.currentStep === 1 && (
          <section className="coach-step-panel">
            <div className="coach-step-heading"><span>第 1 步</span><h2>先定义现实结果</h2><p>成功标准必须能在 28 天后用事实回答，而不是“获得多少 XP”。</p></div>
            <label className="full-field">成长主题<input maxLength={40} value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} placeholder="例如：建立稳定的生活节奏" /></label>
            <label className="full-field">开始状态<textarea maxLength={280} value={draft.baseline} onChange={(event) => updateDraft({ baseline: event.target.value })} placeholder="现在具体是什么状态？" /></label>
            <label className="full-field">期望结果<textarea maxLength={280} value={draft.targetOutcome} onChange={(event) => updateDraft({ targetOutcome: event.target.value })} placeholder="28 天后希望现实中发生什么变化？" /></label>
            <label className="full-field">可验证成功标准<textarea maxLength={180} value={draft.successCriterion} onChange={(event) => updateDraft({ successCriterion: event.target.value })} placeholder="写出日期、次数、结果或可观察证据" /></label>
          </section>
        )}

        {draft.currentStep === 2 && (
          <section className="coach-step-panel">
            <div className="coach-step-heading"><span>第 2 步</span><h2>建立最短行动链</h2><p>选择 1～3 项行为。模板只提供结构，不会替你判断领域和难度。</p></div>
            <div className="coach-template-grid">
              {(['start', 'progress', 'maintain'] as CoachBehaviorRole[]).map((role) => (
                <button key={role} type="button" disabled={draft.behaviors.length >= 3} onClick={() => updateDraft({ behaviors: [...draft.behaviors, createNewCoachBehavior(role)] })}>
                  <Zap aria-hidden="true" /><strong>{coachBehaviorRoleLabels[role]}</strong><small>{role === 'start' ? '降低开始阻力' : role === 'progress' ? '直接推动结果' : '维持环境或完成收尾'}</small><Plus aria-hidden="true" />
                </button>
              ))}
            </div>
            {eligibleActivities.length > 0 && (
              <section className="coach-reuse-block">
                <div className="coach-reuse-head"><div><strong>复用现有活动</strong><small>沿用它当前的频率和最低标准</small></div><BehaviorRoleControl value={reuseRole} onChange={setReuseRole} /></div>
                <div className="coach-reuse-list">
                  {eligibleActivities.map((activity) => (
                    <button key={activity.id} type="button" disabled={draft.behaviors.length >= 3 || selectedActivityIds.has(activity.id)} onClick={() => updateDraft({ behaviors: [...draft.behaviors, { id: crypto.randomUUID(), role: reuseRole, source: 'existing', activityId: activity.id, confirmed: false }] })}>
                      <span><strong>{activity.title}</strong><small>{activity.domain ? domainLabel(activity.domain) : '旧体系'} · {activity.difficulty} · {activityFrequencyLabel(activity)}</small></span><Plus aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>
            )}
            <CoachSelectedBehaviors draft={draft} activityById={activityById} onUpdate={updateBehavior} onRemove={(id) => updateDraft({ behaviors: draft.behaviors.filter((behavior) => behavior.id !== id) })} />
          </section>
        )}

        {draft.currentStep === 3 && (
          <section className="coach-step-panel">
            <div className="coach-step-heading"><span>第 3 步</span><h2>确认最低标准</h2><p>状态差时先做到基础层；标准层是状态正常时的完整行动。</p></div>
            <div className="coach-behavior-editors">
              {draft.behaviors.map((behavior) => behavior.source === 'new' ? (
                <CoachNewBehaviorEditor key={behavior.id} behavior={behavior} onChange={(next) => updateBehavior(behavior.id, () => next)} />
              ) : (
                <CoachExistingBehaviorEditor key={behavior.id} behavior={behavior} activity={activityById.get(behavior.activityId)} onChange={(next) => updateBehavior(behavior.id, () => next)} />
              ))}
            </div>
          </section>
        )}

        {draft.currentStep === 4 && (
          <section className="coach-step-panel">
            <div className="coach-step-heading"><span>第 4 步</span><h2>现实检查</h2><p>奖励能强化行动，但不能证明目标已经实现。</p></div>
            <div className="coach-burden">
              <Target aria-hidden="true" />
              <div><small>预计每周最低负担</small><strong>{burden.sessions} 次执行{burden.seconds > 0 ? ` · ${formatDurationSeconds(burden.seconds)}` : ''}</strong><p>次数按计划频率计算；只有含时间的行为才汇总时长。</p></div>
            </div>
            <CoachSelectedBehaviors draft={draft} activityById={activityById} compact onUpdate={updateBehavior} onRemove={(id) => updateDraft({ behaviors: draft.behaviors.filter((behavior) => behavior.id !== id) })} />
            <label className="coach-check"><input type="checkbox" checked={draft.badDayConfirmed} onChange={(event) => updateDraft({ badDayConfirmed: event.target.checked })} /><span><strong>状态较差时，我仍能完成基础层</strong><small>如果答案是否定的，返回上一步继续降低门槛。</small></span></label>
            <label className="coach-check"><input type="checkbox" checked={draft.evidenceConfirmed} onChange={(event) => updateDraft({ evidenceConfirmed: event.target.checked })} /><span><strong>这些行为会推动成功标准</strong><small>它们必须改变现实结果，而不只是容易打卡。</small></span></label>
            {activeSeason && <p className="coach-queue-note"><ShieldCheck aria-hidden="true" />当前赛季仍在进行。保存后不会创建活动，也不会修改当前关键行为。</p>}
          </section>
        )}
      </div>

      <footer className="coach-plan-footer">
        <button className="secondary-action" type="button" disabled={draft.currentStep === 1} onClick={() => updateDraft({ currentStep: Math.max(1, draft.currentStep - 1) })}><ChevronLeft aria-hidden="true" />上一步</button>
        <span>草稿自动保存在本机</span>
        {draft.currentStep < 4 ? (
          <button className="primary-action" type="button" onClick={goNext}>下一步<ChevronRight aria-hidden="true" /></button>
        ) : (
          <button className="primary-action" type="button" disabled={submitting || !draft.badDayConfirmed || !draft.evidenceConfirmed} onClick={() => void finish()}><ShieldCheck aria-hidden="true" />{submitting ? '正在保存…' : activeSeason ? '保存为下个赛季' : '启动 28 天赛季'}</button>
        )}
      </footer>
    </section>
  )
}

function BehaviorRoleControl({ value, onChange }: { value: CoachBehaviorRole; onChange: (role: CoachBehaviorRole) => void }) {
  return <div className="coach-role-control" aria-label="行为角色">{(['start', 'progress', 'maintain'] as CoachBehaviorRole[]).map((role) => <button key={role} type="button" className={value === role ? 'selected' : ''} onClick={() => onChange(role)}>{coachBehaviorRoleLabels[role]}</button>)}</div>
}

function CoachSelectedBehaviors({ draft, activityById, onUpdate, onRemove, compact = false }: {
  draft: CoachPlanDraft
  activityById: Map<string, Activity>
  onUpdate: (id: string, update: (behavior: CoachPlanBehavior) => CoachPlanBehavior) => void
  onRemove: (id: string) => void
  compact?: boolean
}) {
  if (draft.behaviors.length === 0) return <div className="coach-empty">还没有行动。只选真正推动结果的 1～3 项。</div>
  return <div className={compact ? 'coach-selected compact' : 'coach-selected'}>{draft.behaviors.map((behavior) => {
    const activity = behavior.source === 'existing' ? activityById.get(behavior.activityId) : undefined
    return <article key={behavior.id}><span className="coach-role-badge">{coachBehaviorRoleLabels[behavior.role]}</span><div><strong>{behavior.source === 'new' ? behavior.title || '未命名新行为' : activity?.title ?? '活动已失效'}</strong><small>{behavior.source === 'new' ? '新建行为' : '复用现有活动'} · {behavior.confirmed ? '已确认' : '待确认'}</small></div>{!compact && <BehaviorRoleControl value={behavior.role} onChange={(role) => onUpdate(behavior.id, (item) => ({ ...item, role }))} />}<button className="icon-button" type="button" title="移除" onClick={() => onRemove(behavior.id)}><X aria-hidden="true" /></button></article>
  })}</div>
}

function CoachExistingBehaviorEditor({ behavior, activity, onChange }: { behavior: Extract<CoachPlanBehavior, { source: 'existing' }>; activity?: Activity; onChange: (behavior: Extract<CoachPlanBehavior, { source: 'existing' }>) => void }) {
  if (!activity || !activity.enabled || activity.archivedAt) return <article className="coach-editor invalid"><strong>复用活动已失效</strong><p>它可能已暂停、归档或删除。请返回上一步替换。</p></article>
  return (
    <article className={behavior.confirmed ? 'coach-editor confirmed' : 'coach-editor'}>
      <div className="coach-editor-title"><span className="coach-role-badge">{coachBehaviorRoleLabels[behavior.role]}</span><div><h3>{activity.title}</h3><p>复用现有活动</p></div>{behavior.confirmed && <CheckCircle2 aria-label="已确认" />}</div>
      <dl className="coach-existing-details"><div><dt>成长领域</dt><dd>{activity.domain ? domainLabel(activity.domain) : '旧体系'}</dd></div><div><dt>难度</dt><dd>{activity.difficulty}</dd></div><div><dt>频率</dt><dd>{activityFrequencyLabel(activity)}</dd></div><div><dt>最低标准</dt><dd>{activityGoalLabel(activity)}</dd></div></dl>
      <button className="secondary-action" type="button" onClick={() => onChange({ ...behavior, confirmed: true })}><Check aria-hidden="true" />确认沿用当前标准</button>
    </article>
  )
}

function CoachNewBehaviorEditor({ behavior, onChange }: { behavior: NewCoachBehavior; onChange: (behavior: NewCoachBehavior) => void }) {
  const [goalDraft, setGoalDraft] = useState<TierGoalDraft>(() => tierGoalDraftFromGoal(behavior.goal))
  const [localError, setLocalError] = useState('')
  const change = (next: Partial<NewCoachBehavior>) => onChange({ ...behavior, ...next, confirmed: false })
  function confirm() {
    try {
      const goal = TieredGoalSchema.parse(buildTierGoal(goalDraft))
      if (!behavior.title.trim() || !behavior.cue.trim() || !behavior.protocol.trim()) throw new Error('请填写名称、触发条件和执行协议')
      setLocalError('')
      onChange({ ...behavior, goal, confirmed: true })
    } catch (confirmError) {
      setLocalError(errorMessage(confirmError))
    }
  }
  return (
    <article className={behavior.confirmed ? 'coach-editor confirmed' : 'coach-editor'}>
      <div className="coach-editor-title"><span className="coach-role-badge">{coachBehaviorRoleLabels[behavior.role]}</span><div><h3>{behavior.title || '新行为'}</h3><p>所有分类和标准都需要你确认</p></div>{behavior.confirmed && <CheckCircle2 aria-label="已确认" />}</div>
      <label className="full-field">行为名称<input maxLength={60} value={behavior.title} onChange={(event) => change({ title: event.target.value })} /></label>
      <div className="field-grid"><label>成长领域<select value={behavior.domain} onChange={(event) => change({ domain: event.target.value as GrowthDomain })}>{growthDomains.map((domain) => <option key={domain} value={domain}>{domainLabel(domain)}</option>)}</select></label><label>难度<select value={behavior.difficulty} onChange={(event) => change({ difficulty: event.target.value as Difficulty })}>{difficulties.map((difficulty) => <option key={difficulty}>{difficulty}</option>)}</select></label></div>
      <p className="domain-definition"><strong>{growthDomainDetails[behavior.domain].description}</strong><span>例如：{growthDomainDetails[behavior.domain].examples}</span></p>
      <div className="field-grid"><label>频率<select value={behavior.schedule.kind} onChange={(event) => change({ schedule: event.target.value === 'daily' ? { kind: 'daily' } : { kind: 'weekly', times: 3 } })}><option value="daily">每天</option><option value="weekly">每周 N 次</option></select></label>{behavior.schedule.kind === 'weekly' && <label>每周次数<input type="number" min={1} max={7} value={behavior.schedule.times} onChange={(event) => change({ schedule: { kind: 'weekly', times: Number(event.target.value) } })} /></label>}</div>
      <label className="full-field">触发条件<input maxLength={80} value={behavior.cue} onChange={(event) => change({ cue: event.target.value })} placeholder="什么时候、什么之后开始" /></label>
      <label className="full-field">执行协议<textarea maxLength={280} value={behavior.protocol} onChange={(event) => change({ protocol: event.target.value })} placeholder="具体做什么，走神或中断后怎样返回" /></label>
      <div className="coach-goal-box"><strong>分层最低标准</strong><TierGoalFields value={goalDraft} onChange={(next) => { setGoalDraft(next); change({}) }} /></div>
      {localError && <p className="coach-inline-error" role="alert">{localError}</p>}
      <button className="secondary-action" type="button" onClick={confirm}><Check aria-hidden="true" />确认这个行为</button>
    </article>
  )
}

function Navigation({
  page,
  onChange,
  onCreate,
  characterNeedsAttention,
}: {
  page: Page
  onChange: (page: Page) => void
  onCreate: () => void
  characterNeedsAttention: boolean
}) {
  const items: Array<{ id: Page; label: string; icon: typeof Home }> = [
    { id: 'today', label: '今天', icon: Home },
    { id: 'character', label: '角色', icon: UserRound },
    { id: 'review', label: '复盘', icon: ClipboardCheck },
    { id: 'settings', label: '设置', icon: SettingsIcon },
  ]
  return (
    <nav className="navigation" aria-label="主导航">
      <div className="brand-mark">
        <span className="brand-icon"><Zap aria-hidden="true" /></span>
        <span className="brand-copy"><strong>地球 Online</strong><small>现实成长日志</small></span>
      </div>
      {items.map((item, index) => {
        const Icon = item.icon
        return [
          index === 2 ? (
            <button className="nav-create" type="button" onClick={onCreate} title="创建行动" aria-label="创建行动" key="create">
              <Plus aria-hidden="true" />
            </button>
          ) : null,
          <button
            key={item.id}
            className={page === item.id ? 'nav-item active' : 'nav-item'}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={page === item.id ? 'page' : undefined}
          >
            <span className="nav-icon-wrap">
              <Icon aria-hidden="true" />
              {item.id === 'character' && characterNeedsAttention && <span className="nav-attention" aria-label="有新的成长奖励" />}
            </span>
            <span>{item.label}</span>
          </button>,
        ]
      })}
    </nav>
  )
}

function TodayPage({
  today,
  totalXp,
  level,
  levelSystem,
  coins,
  keyActivities,
  otherHabits,
  tasks,
  season,
  activities,
  completions,
  activeCompletion,
  onComplete,
  onCompleted,
  onCreate,
  onOpenSeason,
  coachDraft,
  onOpenCoach,
}: {
  today: string
  totalXp: number
  level: ReturnType<typeof getLevel>
  levelSystem?: LevelSystem
  coins: number
  keyActivities: Activity[]
  otherHabits: Activity[]
  tasks: Activity[]
  season?: Snapshot['seasons'][number]
  activities: Activity[]
  completions: Completion[]
  activeCompletion: (activity: Activity) => Completion | undefined
  onComplete: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  onCreate: () => void
  onOpenSeason: () => void
  coachDraft?: CoachPlanDraft
  onOpenCoach: () => void
}) {
  const stage = getCharacterStage(level.level)
  const completedKeys = keyActivities.filter((activity) => Boolean(activeCompletion(activity))).length
  return (
    <div className="today-page">
      <div className="today-layout">
        <section className="today-actions" aria-label="今日行动">
          <header className="page-header today-header">
            <div>
              <p className="eyebrow">行动日志 · {formatChineseDate(today)}</p>
              <h1>今天</h1>
              <p className="page-lead">把注意力留给真正重要的行动。</p>
              <p className="game-day-note"><CalendarDays aria-hidden="true" />本日结算至 {formatShortDate(addDays(today, 1))} 04:00</p>
            </div>
          </header>
          <SeasonTodaySummary
            season={season}
            today={today}
            activities={activities}
            completions={completions}
            draft={coachDraft}
            onOpen={onOpenSeason}
            onPlan={onOpenCoach}
          />
          <div className="mobile-status">
            <TodayStatusPanel stage={stage} totalXp={totalXp} level={level} levelSystem={levelSystem} coins={coins} completed={completedKeys} total={keyActivities.length} />
          </div>
          <ActivitySection
            title="关键行动"
            subtitle="主线委托"
            icon={<Star aria-hidden="true" />}
            variant="key"
            activities={keyActivities}
            activeCompletion={activeCompletion}
            onComplete={onComplete}
            onCompleted={onCompleted}
            empty="还没有关键行动。从一个真正值得坚持的行为开始。"
          />
          <ActivitySection
            title="其他习惯"
            subtitle="日常委托"
            variant="regular"
            activities={otherHabits}
            activeCompletion={activeCompletion}
            onComplete={onComplete}
            onCompleted={onCompleted}
            empty=""
          />
          <ActivitySection
            title="一次性任务"
            subtitle="临时委托"
            variant="regular"
            activities={tasks}
            activeCompletion={activeCompletion}
            onComplete={onComplete}
            onCompleted={onCompleted}
            empty=""
          />
        </section>
        <aside className="today-sidebar" aria-label="角色状态">
          <TodayStatusPanel stage={stage} totalXp={totalXp} level={level} levelSystem={levelSystem} coins={coins} completed={completedKeys} total={keyActivities.length} />
          <button className="primary-action sidebar-create" type="button" onClick={onCreate}><Plus aria-hidden="true" />创建行动</button>
          <p className="sidebar-note"><ShieldCheck aria-hidden="true" />成长记录仅保存在本机</p>
        </aside>
      </div>
    </div>
  )
}

function TodayStatusPanel({
  stage,
  totalXp,
  level,
  levelSystem,
  coins,
  completed,
  total,
}: {
  stage: number
  totalXp: number
  level: ReturnType<typeof getLevel>
  levelSystem?: LevelSystem
  coins: number
  completed: number
  total: number
}) {
  const keyProgress = total > 0 ? completed / total : 0
  const pendingVoucher = levelSystem?.milestones.find((milestone) => milestone.voucherMaxCost && !milestone.claimedAt)
  const nextRewardLevel = pendingVoucher?.level ?? getNextVoucherLevel(level.level)
  const nextRewardCost = pendingVoucher?.voucherMaxCost ?? getMilestoneVoucherCost(nextRewardLevel)
  const rewardXpRemaining = Math.max(0, getTotalXpForLevel(nextRewardLevel) - totalXp)
  return (
    <section className="status-panel">
      <div className="status-identity">
        <span className="portrait-frame"><TravelerPortrait stage={stage} label={`Lv.${level.level} 像素旅者`} /></span>
        <div><span>旅者状态</span><strong>Lv.{level.level}</strong><small>{getCharacterStageName(level.level)} · 阶段 {stage}</small></div>
      </div>
      <div className="status-stat-grid">
        <div><Coins aria-hidden="true" /><span>金币</span><strong>{coins}</strong></div>
        <div><TargetMark /><span>主线</span><strong>{completed}/{total}</strong></div>
      </div>
      <div className="status-progress">
        <div><span>等级进度</span><b>{level.current}/{level.needed} XP</b></div>
        <ProgressBar value={level.progress} label="" compact />
      </div>
      <div className="status-progress key-progress">
        <div><span>关键行动</span><b>{total === 0 ? '待设定' : `${Math.round(keyProgress * 100)}%`}</b></div>
        <ProgressBar value={keyProgress} label="" compact />
      </div>
      <div className="next-reward-summary">
        <Gift aria-hidden="true" />
        <div><span>{pendingVoucher ? '待领取奖励' : '下一奖励'}：Lv.{nextRewardLevel} · {nextRewardCost} 金币档礼券</span><small>{pendingVoucher ? '已达到，可前往角色页领取' : `还需 ${rewardXpRemaining} XP`}{levelSystem?.focusDomain ? ` · 当前方向：${domainLabel(levelSystem.focusDomain)}` : ''}</small></div>
      </div>
    </section>
  )
}

function TargetMark() {
  return <Crosshair aria-hidden="true" />
}

function ActivitySection({
  title,
  subtitle,
  icon,
  variant,
  activities,
  activeCompletion,
  onComplete,
  onCompleted,
  empty,
}: {
  title: string
  subtitle: string
  icon?: React.ReactNode
  variant: 'key' | 'regular'
  activities: Activity[]
  activeCompletion: (activity: Activity) => Completion | undefined
  onComplete: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  empty: string
}) {
  if (variant === 'regular' && activities.length === 0) return null
  return (
    <section className={`content-section activity-section activity-section-${variant}`}>
      <div className="section-heading">
        <div><span>{subtitle}</span><h2>{icon}{title}</h2></div>
        <span>{activities.length}</span>
      </div>
      <div className={variant === 'key' ? 'mission-list' : 'activity-list'}>
        {activities.length === 0 && <div className="empty-mission"><TargetMark /><strong>设定第一项主线</strong><p>{empty}</p></div>}
        {activities.map((activity) => {
          const completion = activeCompletion(activity)
          const complete = Boolean(completion)
          const completionGoal = completion ? getCompletionTierGoal(completion, activity) : undefined
          const canUpgrade = Boolean(completion?.tier && completionGoal && completion.tier < getTierCount(completionGoal))
          const reward = rewardTable[activity.difficulty]
          return (
            <article className={`${variant === 'key' ? 'mission-card' : 'activity-row'}${complete ? ' complete' : ''}`} key={activity.id}>
              <div className="activity-copy">
                {variant === 'key' && activity.domain && <div className="mission-meta"><DomainMark domain={activity.domain} /><span className={`difficulty difficulty-${activity.difficulty}`}>{activity.difficulty}</span></div>}
                <div className="activity-title-line">
                  <strong>{activity.title}</strong>
                  {variant === 'regular' && <span className={`difficulty difficulty-${activity.difficulty}`}>{activity.difficulty}</span>}
                  {completion?.tier && <span className="tier-status">{tierLabels[completion.tier]}</span>}
                </div>
                {variant === 'regular' ? (
                  <>
                    <span className="activity-frequency">{activityDomainLabel(activity)} · {activityFrequencyLabel(activity)}</span>
                    <div className="activity-detail-line">
                      <span className="activity-goal">{activityGoalLabel(activity)}</span>
                      <span className="activity-row-reward"><Award aria-hidden="true" />{isTieredGoal(activity) ? '最高 ' : '+'}{reward.xp} XP <Coins aria-hidden="true" />+{reward.coins}</span>
                    </div>
                  </>
                ) : <span className="activity-schedule">{scheduleLabel(activity)}</span>}
                {variant === 'key' && <div className="mission-reward"><Award aria-hidden="true" /><span>{isTieredGoal(activity) ? '最高 ' : '+'}{reward.xp} XP</span><Coins aria-hidden="true" /><span>+{reward.coins}</span></div>}
                {(activity.cue || activity.protocol) && <details className="activity-protocol"><summary>执行提示{activity.cue ? ` · ${activity.cue}` : ''}</summary>{activity.protocol && <p>{activity.protocol}</p>}</details>}
              </div>
              <button
                className="complete-button"
                type="button"
                title={complete ? '查看完成记录' : `完成 ${activity.title}`}
                aria-label={complete ? `查看 ${activity.title} 完成记录` : `完成 ${activity.title}`}
                onClick={() => complete ? onCompleted(activity) : onComplete(activity)}
              >
                {canUpgrade ? <Zap aria-hidden="true" /> : complete ? <Check aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

const domainIcons: Record<GrowthDomain, typeof Dumbbell> = {
  health: Dumbbell,
  learning: BookOpen,
  creation: Brain,
  career: ClipboardCheck,
  life: Home,
  mindset: Leaf,
}

function DomainMark({ domain }: { domain: GrowthDomain }) {
  const Icon = domainIcons[domain]
  return <span className={`attribute-mark domain-${domain}`}><Icon aria-hidden="true" />{domainLabel(domain)}</span>
}

function CharacterPage({
  stats,
  level,
  ledgerEvents,
  completions,
  today,
  levelSystem,
  rewards,
  targetRewardId,
  onRedeem,
  onAcknowledge,
  onClaimVoucher,
  onCreateReward,
  onUpdateReward,
  onSetRewardEnabled,
  onSetTargetReward,
}: {
  stats: ReturnType<typeof calculateStats>
  level: ReturnType<typeof getLevel>
  ledgerEvents: LedgerEvent[]
  completions: Completion[]
  today: string
  levelSystem?: LevelSystem
  rewards: Snapshot['rewards']
  targetRewardId?: string
  onRedeem: (rewardId: string) => void
  onAcknowledge: (level: number, focusDomain: GrowthDomain) => void
  onClaimVoucher: (level: number, rewardId: string) => void
  onCreateReward: (input: RewardInput) => Promise<void>
  onUpdateReward: (rewardId: string, input: RewardInput) => Promise<void>
  onSetRewardEnabled: (rewardId: string, enabled: boolean) => Promise<void>
  onSetTargetReward: (rewardId?: string) => Promise<void>
}) {
  const [routeOpen, setRouteOpen] = useState(false)
  const [journeyOpen, setJourneyOpen] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)
  const [shopFilter, setShopFilter] = useState<'affordable' | 'all' | 'disabled'>('affordable')
  const [shopSearch, setShopSearch] = useState('')
  const [rewardEditor, setRewardEditor] = useState<Reward | 'new' | null>(null)
  const [voucherSelections, setVoucherSelections] = useState<Record<number, string>>({})
  const stage = getCharacterStage(level.level)
  const stageName = getCharacterStageName(level.level)
  const milestones = levelSystem?.milestones ?? []
  const enabledRewards = rewards.filter((reward) => reward.enabled)
  const targetReward = enabledRewards.find((reward) => reward.id === targetRewardId)
  const pendingReport = milestones.find((milestone) => !milestone.acknowledgedAt)
  const reportStart = pendingReport
    ? milestones.filter((milestone) => milestone.level < pendingReport.level).at(-1)?.reachedAt ?? levelSystem?.activatedAt ?? pendingReport.reachedAt
    : undefined
  const pendingReportData = pendingReport && reportStart ? getLevelReport(ledgerEvents, pendingReport, reportStart) : undefined
  const pendingVoucher = milestones.find((milestone) => milestone.voucherMaxCost && !milestone.claimedAt)
  const currentVoucherMilestone = milestones.find((milestone) => milestone.level === level.level)
  const currentVoucherCost = getMilestoneVoucherCost(level.level)
  const unrecordedCurrentVoucher = currentVoucherCost && !currentVoucherMilestone
  const nextRewardLevel = pendingVoucher?.level ?? (unrecordedCurrentVoucher ? level.level : getNextVoucherLevel(level.level))
  const nextRewardCost = pendingVoucher?.voucherMaxCost ?? getMilestoneVoucherCost(nextRewardLevel) ?? 200
  const rewardXpRemaining = Math.max(0, getTotalXpForLevel(nextRewardLevel) - stats.totalXp)
  const reachedVoucherLevels = milestones.filter((milestone) => milestone.voucherMaxCost).map((milestone) => milestone.level)
  const futureVoucherLevels: number[] = []
  let routeCursor = unrecordedCurrentVoucher ? level.level : getNextVoucherLevel(level.level)
  while (futureVoucherLevels.length < 3) {
    if (!reachedVoucherLevels.includes(routeCursor)) futureVoucherLevels.push(routeCursor)
    routeCursor = getNextVoucherLevel(routeCursor)
  }
  const routeLevels = [...new Set([...reachedVoucherLevels, ...futureVoucherLevels])].sort((left, right) => left - right)
  const journeyMonths = getJourneyMonths(completions, ledgerEvents, levelSystem)
  const recentCutoff = addDays(today, -6)
  const recentEntries = journeyMonths
    .flatMap((month) => month.days.flatMap((day) => day.entries))
    .filter((entry) => entry.occurredOn >= recentCutoff && entry.occurredOn <= today)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 3)
  const affordableCount = enabledRewards.filter((reward) => reward.cost <= stats.coins).length
  const shopBase = rewards.filter((reward) => shopFilter === 'disabled' ? !reward.enabled : reward.enabled && (shopFilter !== 'affordable' || reward.cost <= stats.coins))
  const showShopSearch = shopBase.length > 8
  const visibleRewards = shopBase
    .filter((reward) => !showShopSearch || reward.title.toLocaleLowerCase().includes(shopSearch.trim().toLocaleLowerCase()))
    .sort((left, right) => {
      if (left.id === targetRewardId) return -1
      if (right.id === targetRewardId) return 1
      const leftAffordable = left.cost <= stats.coins
      const rightAffordable = right.cost <= stats.coins
      if (leftAffordable !== rightAffordable) return leftAffordable ? -1 : 1
      return left.cost - right.cost
    })
  return (
    <div className="character-page">
      <header className="page-header"><div><p className="eyebrow">冒险者档案</p><h1>角色</h1><p className="page-lead">现实中的每一次行动，都在这里留下成长。</p></div></header>
      <section className="character-hero">
        <div className="character-portrait-wrap"><span className="stage-badge">{stageName}</span><TravelerPortrait stage={stage} label={`${stageName}阶段的像素旅者`} /></div>
        <div className="character-progress">
          <div className="character-level-line"><div><span>当前等级</span><strong>Lv.{level.level}</strong></div><div className="coin-balance"><Coins aria-hidden="true" /><span>金币</span><strong>{stats.coins}</strong></div></div>
          <div className="hero-xp"><b>{stats.totalXp} XP</b><span>距离 Lv.{level.level + 1} 还需 {level.needed - level.current} XP</span></div>
          <ProgressBar value={level.progress} label={`${level.current} / ${level.needed} XP`} />
          <p className="focus-line"><Crosshair aria-hidden="true" />下一阶段重点领域：{levelSystem?.focusDomain ? domainLabel(levelSystem.focusDomain) : '完成下一份成长报告后选择'}</p>
        </div>
      </section>
      {pendingReport && pendingReportData && (
        <section className="content-section level-report" aria-labelledby="level-report-title">
          <div className="section-heading"><div><span>Lv.{pendingReport.level} 永久里程碑</span><h2 id="level-report-title"><Award aria-hidden="true" />成长报告待确认</h2></div></div>
          <div className="report-stat-grid">
            <div><span>活跃天数</span><strong>{pendingReportData.activeDays}</strong></div>
            <div><span>唯一完成</span><strong>{pendingReportData.completionCount}</strong></div>
            <div><span>主要成长领域</span><strong>{pendingReportData.strongestDomain ? domainLabel(pendingReportData.strongestDomain) : '新体系待积累'}</strong></div>
          </div>
          <div className="report-columns">
            <div><h3>领域成长</h3><div className="report-attribute-list">{growthDomains.map((domain) => <span key={domain}>{domainLabel(domain)}<b>+{pendingReportData.domainXp[domain]} XP</b></span>)}</div></div>
            <div><h3>贡献最高的行动</h3>{pendingReportData.topActions.length > 0 ? <ol>{pendingReportData.topActions.map((action, index) => <li key={`${action.title}:${index}`}><span>{action.title}</span><b>+{action.xp} XP</b></li>)}</ol> : <p className="empty-state">本周期还没有可统计的行动。</p>}</div>
          </div>
          <fieldset className="focus-picker">
            <legend>下一阶段重点领域</legend>
            <p>只作为身份提醒，不改变奖励倍率。</p>
            <div>{growthDomains.map((domain) => <button type="button" key={domain} onClick={() => onAcknowledge(pendingReport.level, domain)}><DomainMark domain={domain} /></button>)}</div>
          </fieldset>
        </section>
      )}
      <section className="content-section compact-feature-section">
        <button className="feature-summary reward-route-summary" type="button" onClick={() => setRouteOpen(true)} aria-label="查看等级奖励路线">
          <span className="feature-summary-icon"><Gift aria-hidden="true" /></span>
          <span className="feature-summary-copy">
            <small>{pendingVoucher ? '礼券待领取' : '下一奖励'}</small>
            <strong>Lv.{nextRewardLevel} · {nextRewardCost} 金币档礼券</strong>
            <span>{pendingVoucher ? '已经达到，选择一项现实奖励' : `${getTotalXpForLevel(nextRewardLevel)} 累计 XP · 还需 ${rewardXpRemaining} XP`}</span>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
      </section>
      <section className="content-section">
        <div className="section-heading"><div><span>现实结果</span><h2>六个成长领域</h2></div></div>
        <div className="attribute-grid">
          {growthDomains.map((domain) => {
            const domainLevel = getLevel(stats.domainXp[domain])
            return (
              <div className="attribute-item" key={domain}>
                <div><DomainMark domain={domain} /><span>Lv.{domainLevel.level}</span></div>
                <ProgressBar value={domainLevel.progress} label={`${stats.domainXp[domain]} XP`} compact />
              </div>
            )
          })}
        </div>
      </section>
      <section className="content-section growth-section">
        <div className="section-heading"><div><span>最近 7 天</span><h2><TrendingUp aria-hidden="true" />成长轨迹</h2></div><button className="text-action" type="button" onClick={() => setJourneyOpen(true)}>行动日志</button></div>
        <div className="growth-list">
          {recentEntries.length === 0 && <p className="empty-state">最近 7 天还没有成长记录。</p>}
          {recentEntries.map((entry) => <GrowthEntryRow entry={entry} key={entry.id} />)}
        </div>
      </section>
      <section className="content-section compact-feature-section">
        <button className="feature-summary shop-summary" type="button" onClick={() => setShopOpen(true)} aria-label="查看奖励商店">
          <span className="feature-summary-icon"><Coins aria-hidden="true" /></span>
          <span className="feature-summary-copy">
            <small>奖励商店 · {stats.coins} 金币</small>
            <strong>{targetReward ? targetReward.title : '选择一个现实奖励目标'}</strong>
            <span>{targetReward ? (stats.coins >= targetReward.cost ? '现在可以兑换' : `${stats.coins} / ${targetReward.cost} · 还差 ${targetReward.cost - stats.coins} 金币`) : `当前有 ${affordableCount} 项可以兑换`}</span>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
      </section>

      {routeOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal feature-modal" role="dialog" aria-modal="true" aria-labelledby="route-modal-title">
            <div className="modal-header"><div><span className="modal-kicker">可预期的成长</span><h2 id="route-modal-title">等级奖励路线</h2></div><button className="icon-button" type="button" title="关闭" onClick={() => setRouteOpen(false)}><X aria-hidden="true" /></button></div>
            <p className="modal-description">礼券不扣金币，不提高奖励倍率。Lv.15 起每 5 级获得一张 200 金币档礼券。</p>
            <div className="milestone-list compact-milestone-list">
              {routeLevels.map((routeLevel) => {
                const milestone = milestones.find((item) => item.level === routeLevel)
                const voucherCost = getMilestoneVoucherCost(routeLevel) ?? 200
                const state = milestone?.claimedAt ? 'claimed' : milestone ? 'claimable' : 'locked'
                const eligibleRewards = enabledRewards.filter((reward) => reward.cost <= voucherCost)
                const selectedReward = voucherSelections[routeLevel] ?? ''
                return (
                  <article className={`milestone-row milestone-${state}`} key={routeLevel}>
                    <span className="milestone-node" aria-hidden="true">{state === 'claimed' ? <Check aria-hidden="true" /> : routeLevel}</span>
                    <div className="milestone-main">
                      <div><strong>Lv.{routeLevel} · {voucherCost} 金币档礼券</strong><span>{getTotalXpForLevel(routeLevel)} 累计 XP</span></div>
                      <p>{milestone ? (milestone.claimedAt ? '已领取 · 永久保留记录' : '已达到 · 可以领取') : `还需 ${Math.max(0, getTotalXpForLevel(routeLevel) - stats.totalXp)} XP`}</p>
                      {milestone?.voucherMaxCost && !milestone.claimedAt && (
                        eligibleRewards.length > 0 ? (
                          <div className="voucher-picker">
                            <label>选择奖励<select aria-label={`Lv.${routeLevel} 礼券奖励`} value={selectedReward} onChange={(event) => setVoucherSelections((current) => ({ ...current, [routeLevel]: event.target.value }))}><option value="">请选择</option>{eligibleRewards.map((reward) => <option value={reward.id} key={reward.id}>{reward.title} · {reward.cost} 金币</option>)}</select></label>
                            <button type="button" disabled={!selectedReward} onClick={() => onClaimVoucher(routeLevel, selectedReward)}>领取</button>
                          </div>
                        ) : <small>商店中暂无符合额度的启用商品。</small>
                      )}
                    </div>
                    <span className="milestone-state">{state === 'claimed' ? '已领取' : state === 'claimable' ? '可领取' : '未达到'}</span>
                  </article>
                )
              })}
            </div>
            {milestones.some((milestone) => milestone.acknowledgedAt) && (
              <details className="report-history">
                <summary>历史成长报告</summary>
                {[...milestones].reverse().filter((milestone) => milestone.acknowledgedAt).map((milestone) => {
                  const previous = milestones.find((item) => item.level === milestone.level - 1)
                  const report = getLevelReport(ledgerEvents, milestone, previous?.reachedAt ?? levelSystem?.activatedAt ?? milestone.reachedAt)
                  const focus = milestone.focusDomain ? domainLabel(milestone.focusDomain) : milestone.focusAttribute ? `${milestone.focusAttribute}（旧体系）` : '未选择方向'
                  return <p key={milestone.level}>Lv.{milestone.level} · {focus} · {report.activeDays} 个活跃日 · {report.completionCount} 项完成</p>
                })}
              </details>
            )}
          </section>
        </div>
      )}

      {journeyOpen && (
        <ActionLogModal months={journeyMonths} today={today} onClose={() => setJourneyOpen(false)} />
      )}

      {shopOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal feature-modal shop-modal" role="dialog" aria-modal="true" aria-labelledby="shop-modal-title">
            <div className="modal-header"><div><span className="modal-kicker">现实奖励 · {stats.coins} 金币</span><h2 id="shop-modal-title">奖励商店</h2></div><div className="modal-header-actions"><button className="icon-button" type="button" title="新增奖励商品" onClick={() => setRewardEditor('new')}><PackagePlus aria-hidden="true" /></button><button className="icon-button" type="button" title="关闭" onClick={() => setShopOpen(false)}><X aria-hidden="true" /></button></div></div>
            <div className="segmented-control" aria-label="奖励商品筛选">
              <button type="button" className={shopFilter === 'affordable' ? 'selected' : ''} onClick={() => setShopFilter('affordable')}>可兑换 {affordableCount}</button>
              <button type="button" className={shopFilter === 'all' ? 'selected' : ''} onClick={() => setShopFilter('all')}>全部 {enabledRewards.length}</button>
              <button type="button" className={shopFilter === 'disabled' ? 'selected' : ''} onClick={() => setShopFilter('disabled')}>已停用 {rewards.length - enabledRewards.length}</button>
            </div>
            {showShopSearch && <label className="shop-search"><Search aria-hidden="true" /><span className="sr-only">搜索奖励</span><input aria-label="搜索奖励" type="search" value={shopSearch} onChange={(event) => setShopSearch(event.target.value)} placeholder="搜索奖励" /></label>}
            <div className="shop-list">
              {visibleRewards.length === 0 && <p className="empty-state">这个分类中还没有商品。</p>}
              {visibleRewards.map((reward) => (
                <article className="shop-row" key={reward.id}>
                  <div className="shop-product"><strong>{reward.title}</strong><span>{reward.id === targetRewardId ? '当前目标 · ' : ''}{reward.enabled ? (reward.cost <= stats.coins ? '现在可兑换' : `还差 ${reward.cost - stats.coins} 金币`) : '已停用'}</span></div>
                  <b className="shop-price"><Coins aria-hidden="true" />{reward.cost}</b>
                  <div className="shop-actions">
                    {reward.enabled && <button className={reward.id === targetRewardId ? 'icon-button selected' : 'icon-button'} type="button" title={reward.id === targetRewardId ? '取消当前目标' : '设为当前目标'} aria-pressed={reward.id === targetRewardId} onClick={() => void onSetTargetReward(reward.id === targetRewardId ? undefined : reward.id)}><Target aria-hidden="true" /></button>}
                    {reward.enabled && <button className="icon-button" type="button" title="编辑奖励商品" onClick={() => setRewardEditor(reward)}><Pencil aria-hidden="true" /></button>}
                    <button className="icon-button" type="button" title={reward.enabled ? '停用奖励商品' : '恢复奖励商品'} onClick={() => void onSetRewardEnabled(reward.id, !reward.enabled)}>{reward.enabled ? <Pause aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}</button>
                    {reward.enabled && <button className="redeem-button" type="button" disabled={stats.coins < reward.cost} onClick={() => onRedeem(reward.id)}>兑换</button>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {rewardEditor && (
        <RewardEditorModal
          reward={rewardEditor === 'new' ? undefined : rewardEditor}
          target={rewardEditor !== 'new' && rewardEditor.id === targetRewardId}
          onClose={() => setRewardEditor(null)}
          onSave={async (input) => {
            if (rewardEditor === 'new') await onCreateReward(input)
            else await onUpdateReward(rewardEditor.id, input)
          }}
        />
      )}
    </div>
  )
}

function GrowthEntryRow({ entry }: { entry: JourneyEntry }) {
  return (
    <div className={`growth-row growth-${entry.kind}`}>
      <span className="growth-icon">{entry.kind === 'action' ? <ActivityIcon aria-hidden="true" /> : <Gift aria-hidden="true" />}</span>
      <div><strong>{entry.title}</strong><span>{formatShortDate(entry.occurredOn)}{entry.domain ? ` · ${domainLabel(entry.domain)}` : entry.attribute ? ` · ${entry.attribute} · 旧体系` : ''}{entry.tier ? ` · ${tierLabels[entry.tier]}` : ''}</span></div>
      <b>{entry.kind === 'action' ? `+${entry.xp} XP${entry.coins ? ` · +${entry.coins}` : ''}` : '里程碑'}</b>
    </div>
  )
}

function ActionLogModal({ months, today, onClose }: { months: JourneyMonth[]; today: string; onClose: () => void }) {
  const currentMonth = today.slice(0, 7)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [highlightedDate, setHighlightedDate] = useState<string>()
  const month = months.find((item) => item.month === selectedMonth)
  const [year, monthNumber] = selectedMonth.split('-').map(Number)
  const daysInMonth = new Date(year, monthNumber, 0).getDate()
  const leading = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7
  const dayByDate = new Map(month?.days.map((day) => [day.date, day]) ?? [])
  const cells = [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]

  function moveMonth(amount: number) {
    const date = new Date(year, monthNumber - 1 + amount, 1, 12)
    setSelectedMonth(localDate(date).slice(0, 7))
    setHighlightedDate(undefined)
  }

  function selectDate(date: string) {
    if (!dayByDate.has(date)) return
    setHighlightedDate(date)
    document.getElementById(`journey-day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal feature-modal action-log-modal" role="dialog" aria-modal="true" aria-labelledby="journey-modal-title">
        <div className="modal-header"><div><span className="modal-kicker">只看最终有效成长</span><h2 id="journey-modal-title">行动日志</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <div className="month-switcher">
          <button className="icon-button" type="button" title="上个月" onClick={() => moveMonth(-1)}><ChevronLeft aria-hidden="true" /></button>
          <strong>{year} 年 {monthNumber} 月</strong>
          <button className="icon-button" type="button" title="下个月" disabled={selectedMonth >= currentMonth} onClick={() => moveMonth(1)}><ChevronRight aria-hidden="true" /></button>
          {selectedMonth !== currentMonth && <button className="text-action" type="button" onClick={() => setSelectedMonth(currentMonth)}>返回本月</button>}
        </div>
        <div className="journey-summary-grid">
          <span>活跃天数<b>{month?.activeDays ?? 0}</b></span><span>行动数<b>{month?.actionCount ?? 0}</b></span>
          <span>获得 XP<b>+{month?.xp ?? 0}</b></span><span>获得金币<b>+{month?.coins ?? 0}</b></span><span>主要成长领域<b>{month?.strongestDomain ? domainLabel(month.strongestDomain) : '待积累'}</b></span>
        </div>
        <div className="journey-calendar" aria-label={`${year} 年 ${monthNumber} 月行动月历`}>
          {['一', '二', '三', '四', '五', '六', '日'].map((label) => <span className="calendar-weekday" key={label}>{label}</span>)}
          {cells.map((day, index) => {
            if (!day) return <span className="calendar-empty" key={`empty:${index}`} />
            const date = `${selectedMonth}-${String(day).padStart(2, '0')}`
            const journeyDay = dayByDate.get(date)
            return <button type="button" key={date} className={`${journeyDay ? 'has-entry' : ''}${highlightedDate === date ? ' selected' : ''}`} onClick={() => selectDate(date)} disabled={!journeyDay}><b>{day}</b>{journeyDay && <small>{journeyDay.actionCount} 项{journeyDay.hasMilestone ? <i aria-label="有里程碑" /> : null}</small>}</button>
          })}
        </div>
        <div className="journey-timeline">
          {!month && <p className="empty-state">这个月还没有有效行动。</p>}
          {month?.days.map((day) => (
            <section className={highlightedDate === day.date ? 'journey-day highlighted' : 'journey-day'} id={`journey-day-${day.date}`} key={day.date}>
              <div className="journey-day-heading"><b>{formatShortDate(day.date)}</b><span>{day.actionCount} 项行动</span></div>
              {day.entries.map((entry) => <JourneyEntryDetails entry={entry} key={entry.id} />)}
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}

function JourneyEntryDetails({ entry }: { entry: JourneyEntry }) {
  if (entry.kind !== 'action') return <article className="journey-milestone"><Gift aria-hidden="true" /><div><strong>{entry.title}</strong><span>永久里程碑</span></div></article>
  const hasDetails = Boolean(entry.note || entry.durationMinutes || (entry.tier && entry.tierGoalSnapshot))
  const classification = entry.domain ? domainLabel(entry.domain) : entry.attribute ? `${entry.attribute} · 旧体系` : '未分类'
  const main = <div className="journey-entry-main"><div><strong>{entry.title}</strong><span>{classification}{entry.tier ? ` · ${tierLabels[entry.tier]}层` : ''}</span></div><b>+{entry.xp} XP · +{entry.coins}</b></div>
  if (!hasDetails) return <article className="journey-entry">{main}</article>
  return <details className="journey-entry"><summary>{main}</summary><div className="journey-entry-details">{entry.note && <p>成果：{entry.note}</p>}{entry.durationMinutes && <p>实际时长：{entry.durationMinutes} 分钟</p>}{entry.tier && entry.tierGoalSnapshot && <p>完成标准：{formatTierGoalValue(entry.tierGoalSnapshot, entry.tier)}</p>}</div></details>
}

function RewardEditorModal({ reward, target, onClose, onSave }: { reward?: Reward; target: boolean; onClose: () => void; onSave: (input: RewardInput) => Promise<void> }) {
  const [title, setTitle] = useState(reward?.title ?? '')
  const [cost, setCost] = useState(String(reward?.cost ?? 30))
  const [isTarget, setIsTarget] = useState(target)
  const presets = [30, 80, 200]
  const numericCost = Number(cost)
  const valid = Number.isSafeInteger(numericCost) && numericCost > 0
  return (
    <div className="modal-backdrop nested-modal" role="presentation">
      <form className="modal compact-modal" onSubmit={(event) => { event.preventDefault(); if (!valid) return; void onSave({ title: title.trim(), cost: numericCost, target: isTarget }).then(onClose) }} aria-labelledby="reward-editor-title">
        <div className="modal-header"><div><span className="modal-kicker">现实奖励</span><h2 id="reward-editor-title">{reward ? '编辑商品' : '新增商品'}</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <label className="full-field">商品名称<input required maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>
        <div className="goal-type-block"><span>价格档位</span><div className="segmented-control reward-presets" aria-label="奖励价格档位">{presets.map((preset) => <button type="button" key={preset} className={numericCost === preset ? 'selected' : ''} onClick={() => setCost(String(preset))}>{preset}</button>)}<button type="button" className={!presets.includes(numericCost) ? 'selected' : ''} onClick={() => { if (presets.includes(numericCost)) setCost('') }}>自定义</button></div></div>
        <label className="full-field">金币价格<input required type="number" min={1} step={1} value={cost} onChange={(event) => setCost(event.target.value)} /></label>
        <p className="form-detail-note">30 适合小型即时奖励，80 适合一次有价值的体验，200 适合半天级的重要奖励。</p>
        <label className="checkbox-field"><input type="checkbox" checked={isTarget} onChange={(event) => setIsTarget(event.target.checked)} /><Target aria-hidden="true" />设为当前奖励目标</label>
        <button className="primary-action" type="submit" disabled={!valid || title.trim().length === 0}><Check aria-hidden="true" />保存商品</button>
      </form>
    </div>
  )
}

function ReviewPage({
  activities,
  completions,
  reviews,
  today,
  season,
  onOpenSeason,
  onSave,
}: {
  activities: Activity[]
  completions: Snapshot['completions']
  reviews: Snapshot['weeklyReviews']
  today: string
  season?: Snapshot['seasons'][number]
  onOpenSeason: () => void
  onSave: (review: WeeklyReview) => Promise<void>
}) {
  const weekStart = startOfWeek(new Date(`${today}T12:00:00`))
  const weekEnd = addDays(weekStart, 6)
  const existing = reviews.find((review) => review.weekStart === weekStart)
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({})

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        activities.map((activity) => {
          const item = existing?.items.find((value) => value.activityId === activity.id)
          return [activity.id, { impact: item?.impact ?? 3, friction: item?.friction ?? 3, decision: item?.decision ?? '保留', note: item?.note ?? '' }]
        }),
      ),
    )
  }, [activities, existing])

  const progress = activities.map((activity) => {
    const matchingCompletions = completions.filter(
      (completion) =>
        completion.activityId === activity.id &&
        completion.status === 'active' &&
        completion.occurredOn >= weekStart &&
        completion.occurredOn <= weekEnd,
    )
    const completed = new Set(matchingCompletions.map((completion) => completion.occurredOn)).size
    const planned = activity.schedule.kind === 'daily' ? 7 : activity.schedule.kind === 'weekly' ? activity.schedule.times : 1
    const actualDurationMinutes = matchingCompletions.reduce((total, completion) => total + (completion.durationMinutes ?? 0), 0)
    const plannedDurationMinutes = isDurationGoal(activity) ? planned * activity.goal.count : undefined
    const tierCount = Math.max(
      isTieredGoal(activity) ? getTierCount(activity.goal) : 2,
      ...matchingCompletions.map((completion) => completion.tierGoalSnapshot ? getTierCount(completion.tierGoalSnapshot) : 2),
    ) as 2 | 3
    const reviewTiers = tierLevels.slice(0, tierCount)
    const tierCounts = reviewTiers.map((tier) => matchingCompletions.filter((completion) => completion.tier === tier).length) as [number, number] | [number, number, number]
    const achievement = matchingCompletions.reduce(
      (total, completion) => {
        if (!completion.tier) return total
        const goal = getCompletionTierGoal(completion, activity)
        if (!goal) return total
        const value = getTierAchievement(goal, completion.tier)
        return {
          count: total.count + value.count,
          durationSeconds: total.durationSeconds + value.durationSeconds,
          countUnit: total.countUnit ?? value.countUnit,
        }
      },
      { count: 0, durationSeconds: 0, countUnit: undefined as string | undefined },
    )
    return { activity, completed, planned, adherence: Math.min(completed / planned, 1), actualDurationMinutes, plannedDurationMinutes, tierCounts, reviewTiers, achievement }
  })
  const overallAdherence = progress.length > 0 ? progress.reduce((total, item) => total + item.adherence, 0) / progress.length : 0

  function submit(event: FormEvent) {
    event.preventDefault()
    if (progress.length === 0) return
    void onSave({
      id: `review:${weekStart}`,
      weekStart,
      items: progress.map(({ activity, completed, planned, adherence, actualDurationMinutes, plannedDurationMinutes, tierCounts, achievement }) => ({
        activityId: activity.id,
        titleSnapshot: activity.title,
        domainSnapshot: activity.domain,
        completed,
        planned,
        adherence,
        impact: drafts[activity.id]?.impact ?? 3,
        friction: drafts[activity.id]?.friction ?? 3,
        decision: drafts[activity.id]?.decision ?? '保留',
        note: drafts[activity.id]?.note.trim() || undefined,
        actualDurationMinutes: plannedDurationMinutes ? actualDurationMinutes : undefined,
        plannedDurationMinutes,
        tierCounts: isTieredGoal(activity) ? tierCounts : undefined,
        achievedCountTotal: isTieredGoal(activity) && achievement.count > 0 ? achievement.count : undefined,
        achievedDurationSeconds: isTieredGoal(activity) && achievement.durationSeconds > 0 ? achievement.durationSeconds : undefined,
        achievedCountUnit: isTieredGoal(activity) && achievement.count > 0 ? achievement.countUnit : undefined,
      })),
      createdAt: new Date().toISOString(),
    }).catch(() => undefined)
  }

  return (
    <div className="review-page">
      <header className="page-header"><div><p className="eyebrow">冒险日志 · {formatShortDate(weekStart)} — {formatShortDate(weekEnd)}</p><h1>每周复盘</h1><p className="page-lead">判断行动是否真的有帮助，而不是只看获得了多少 XP。</p></div></header>
      <CoachSuggestionSummary season={season} onOpen={onOpenSeason} />
      {activities.length === 0 ? (
        <div className="empty-panel"><Star aria-hidden="true" /><p>启用关键行为后，这里会生成本周复盘。</p></div>
      ) : (
        <>
          <section className="review-overview">
            <div><span>本周关键行动</span><strong>{activities.length}</strong></div>
            <div><span>整体坚持率</span><strong>{Math.round(overallAdherence * 100)}%</strong></div>
            <ProgressBar value={overallAdherence} label={`${formatShortDate(weekStart)} — ${formatShortDate(weekEnd)}`} compact />
          </section>
          <form onSubmit={submit} className="review-form">
          {progress.map(({ activity, completed, planned, adherence, actualDurationMinutes, plannedDurationMinutes, tierCounts, reviewTiers, achievement }) => {
            const draft = drafts[activity.id] ?? { impact: 3, friction: 3, decision: '保留' as const, note: '' }
            const update = (next: Partial<ReviewDraft>) => setDrafts((current) => ({ ...current, [activity.id]: { ...draft, ...next } }))
            return (
              <section className="review-item" key={activity.id}>
                <div className="review-title">
                  <div><strong>{activity.title}</strong><span>{completed} / {planned} 次</span></div>
                  <b>{Math.round(adherence * 100)}%</b>
                </div>
                <ProgressBar value={adherence} label="坚持率" compact />
                {plannedDurationMinutes && (
                  <p className="duration-summary">本周时长：{actualDurationMinutes} / {plannedDurationMinutes} 分钟</p>
                )}
                {isTieredGoal(activity) && (
                  <div className="tier-review-summary">
                    {reviewTiers.map((tier, index) => <span key={tier}>{tierLabels[tier]} {tierCounts[index]}</span>)}
                    {achievement.count > 0 && <strong>最低次数：{achievement.count}{achievement.countUnit ?? '次'}</strong>}
                    {achievement.durationSeconds > 0 && <strong>最低时间：{formatDurationSeconds(achievement.durationSeconds)}</strong>}
                  </div>
                )}
                <div className="review-fields">
                  <RatingControl label="现实帮助" value={draft.impact} onChange={(impact) => update({ impact })} />
                  <RatingControl label="执行阻力" value={draft.friction} onChange={(friction) => update({ friction })} />
                </div>
                <span className="form-section-label">下周决策</span>
                <div className="segmented-control" aria-label={`${activity.title} 下周决策`}>
                  {reviewDecisions.map((decision) => (
                    <button key={decision} type="button" className={draft.decision === decision ? 'selected' : ''} onClick={() => update({ decision })}>
                      {decision}
                    </button>
                  ))}
                </div>
                <label className="full-field">复盘备注
                  <textarea maxLength={280} value={draft.note} onChange={(event) => update({ note: event.target.value })} />
                </label>
              </section>
            )
          })}
          <button className="primary-action" type="submit"><Check aria-hidden="true" />保存本周复盘</button>
          </form>
        </>
      )}
    </div>
  )
}

function RatingControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <fieldset className="rating-control">
      <legend>{label}</legend>
      <div>
        {[1, 2, 3, 4, 5].map((option) => (
          <button key={option} type="button" className={value === option ? 'selected' : ''} aria-label={`${label} ${option} 分`} aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>
        ))}
      </div>
      <span>{label === '现实帮助' ? '没有帮助 — 非常有帮助' : '很容易 — 阻力很大'}</span>
    </fieldset>
  )
}

function SettingsPage({
  preferences,
  activities,
  completions,
  onPreferences,
  onRefresh,
  onNotice,
  onManage,
}: {
  preferences: Preferences
  activities: Activity[]
  completions: Completion[]
  onPreferences: (value: Preferences) => Promise<void>
  onRefresh: () => Promise<void>
  onNotice: (message: string) => void
  onManage: () => void
}) {
  const activityGroups = groupManagedActivities(activities, completions)

  async function toggleNotifications() {
    if (!preferences.notifications) {
      const permission = await requestNotificationPermission()
      if (permission !== 'granted') {
        onNotice(permission === 'unsupported' ? '当前浏览器不支持系统通知' : '通知未获授权，界面反馈仍会正常显示')
        return
      }
    }
    await onPreferences({ ...preferences, notifications: !preferences.notifications })
  }

  async function toggleSound() {
    if (preferences.sound) {
      await onPreferences({ ...preferences, sound: false })
      return
    }
    const supported = await playCompletionChime('completion', preferences.feedbackIntensity)
    if (!supported) {
      await onPreferences({ ...preferences, sound: false })
      onNotice('当前设备无法启用完成声音，已保持关闭')
      return
    }
    await onPreferences({ ...preferences, sound: true })
    onNotice('完成声音已开启，刚才播放的是试听音')
  }

  async function toggleVibration() {
    if (preferences.vibration) {
      await onPreferences({ ...preferences, vibration: false })
      return
    }
    if (!playCompletionVibration('completion', preferences.feedbackIntensity)) {
      await onPreferences({ ...preferences, vibration: false })
      onNotice('当前设备或系统设置没有接受振动请求，已保持关闭')
      return
    }
    await onPreferences({ ...preferences, vibration: true })
    onNotice('振动反馈已开启，刚才触发的是测试振动')
  }

  async function setFeedbackIntensity(feedbackIntensity: FeedbackIntensity) {
    const next = { ...preferences, feedbackIntensity }
    await onPreferences(next)
    if (next.vibration) playCompletionVibration('completion', feedbackIntensity)
    if (next.sound) await playCompletionChime('completion', feedbackIntensity)
  }

  async function testImmediateFeedback() {
    if (!preferences.sound && !preferences.vibration) {
      onNotice('请先开启声音或振动')
      return
    }
    let sound = preferences.sound
    let vibration = preferences.vibration
    if (sound && !(await playCompletionChime('completion', preferences.feedbackIntensity))) sound = false
    if (vibration && !playCompletionVibration('completion', preferences.feedbackIntensity)) vibration = false
    if (sound !== preferences.sound || vibration !== preferences.vibration) {
      await onPreferences({ ...preferences, sound, vibration })
      onNotice('部分反馈在当前设备不可用，已自动关闭对应开关')
      return
    }
    onNotice('已播放当前强度的完成反馈')
  }

  async function exportJson() {
    const meta = await db.settings.get('meta')
    await db.settings.put({ key: 'meta', value: { ...(meta?.key === 'meta' ? meta.value : {}), lastBackupAt: new Date().toISOString() } })
    const backup = await createBackup()
    downloadFile(`earth-online-backup-${localDate()}.json`, JSON.stringify(backup, null, 2), 'application/json')
    await onRefresh()
    onNotice('JSON 全量备份已导出')
  }

  async function exportMarkdown() {
    downloadFile(`earth-online-ledger-${localDate()}.md`, await createLedgerMarkdown(), 'text/markdown')
    onNotice('Markdown 账本已导出')
  }

  async function importJson(file?: File) {
    if (!file) return
    try {
      await restoreBackup(JSON.parse(await file.text()))
      await onRefresh()
      onNotice('备份已校验并完整恢复')
    } catch (error) {
      onNotice(`导入失败：${errorMessage(error)}`)
    }
  }

  return (
    <div className="settings-page">
      <header className="page-header"><div><p className="eyebrow">系统与存档</p><h1>设置</h1><p className="page-lead">管理反馈方式、行动和本机数据。</p></div><SettingsIcon aria-hidden="true" className="header-icon" /></header>
      <section className="content-section settings-section">
        <div className="section-heading"><div><span>体验偏好</span><h2>即时反馈</h2></div></div>
        <SettingToggle
          icon={preferences.notifications ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}
          label="系统通知"
          checked={preferences.notifications}
          onChange={() => void toggleNotifications()}
        />
        <SettingToggle
          icon={<Vibrate aria-hidden="true" />}
          label="完成振动"
          checked={preferences.vibration}
          onChange={() => void toggleVibration()}
        />
        <SettingToggle
          icon={<Volume2 aria-hidden="true" />}
          label="完成声音"
          checked={preferences.sound}
          onChange={() => void toggleSound()}
        />
        <div className="feedback-intensity-control">
          <div><strong>反馈强度</strong><span>声音和振动使用同一档位</span></div>
          <div className="segmented-control" aria-label="反馈强度">
            {([
              ['gentle', '柔和'],
              ['clear', '清晰'],
              ['strong', '强烈'],
            ] as const).map(([value, label]) => (
              <button type="button" key={value} className={preferences.feedbackIntensity === value ? 'selected' : ''} aria-pressed={preferences.feedbackIntensity === value} onClick={() => void setFeedbackIntensity(value)}>{label}</button>
            ))}
          </div>
        </div>
        <button className="secondary-action feedback-test" type="button" onClick={() => void testImmediateFeedback()}><Zap aria-hidden="true" />测试反馈</button>
      </section>

      <section className="content-section settings-section">
        <div className="section-heading"><div><span>行动编排</span><h2>活动管理</h2></div></div>
        <button className="activity-management-summary" type="button" onClick={onManage} aria-label="管理全部活动">
          <span className="feature-summary-icon"><ListTodo aria-hidden="true" /></span>
          <span className="activity-management-copy">
            <strong>{activities.length === 0 ? '还没有活动' : `共 ${activities.length} 项活动`}</strong>
            <small>进行中 {activityGroups.running.length} · 已暂停 {activityGroups.paused.length} · 已归档 {activityGroups.archived.length} · 已完成 {activityGroups.completed.length}</small>
          </span>
          <span className="activity-management-action">管理全部<ChevronRight aria-hidden="true" /></span>
        </button>
      </section>

      <section className="content-section settings-section">
        <div className="section-heading"><div><span>存档与恢复</span><h2>本地数据</h2></div></div>
        <div className="data-actions">
          <button type="button" onClick={() => void exportJson()}><Download aria-hidden="true" />导出 JSON</button>
          <button type="button" onClick={() => void exportMarkdown()}><Download aria-hidden="true" />导出账本</button>
          <label className="file-button"><Upload aria-hidden="true" />恢复 JSON
            <input type="file" accept="application/json,.json" onChange={(event) => void importJson(event.target.files?.[0])} />
          </label>
        </div>
      </section>
      <footer className="version-footer"><ShieldCheck aria-hidden="true" />数据仅保存在本机 · V4.2.0{isPreview ? ' 预览版' : ''}</footer>
    </div>
  )
}

type ActivityManagerTab = 'running' | 'paused' | 'archived' | 'completed'

function groupManagedActivities(activities: Activity[], completions: Completion[]) {
  const completedTaskById = new Map(
    completions
      .filter((completion) => completion.status === 'active')
      .map((completion) => [completion.activityId, completion]),
  )
  const available = activities.filter((activity) => !activity.archivedAt && !(activity.type === 'task' && completedTaskById.has(activity.id)))
  return {
    running: available.filter((activity) => activity.enabled),
    paused: available.filter((activity) => !activity.enabled),
    archived: activities.filter((activity) => Boolean(activity.archivedAt)),
    completed: activities
      .filter((activity) => !activity.archivedAt && activity.type === 'task' && completedTaskById.has(activity.id))
      .sort((left, right) => completedTaskById.get(right.id)!.occurredOn.localeCompare(completedTaskById.get(left.id)!.occurredOn)),
    completedTaskById,
  }
}

function ActivityManagerModal({
  activities,
  completions,
  today,
  onClose,
  onEdit,
  onArchive,
  onDelete,
  onRestore,
  onRefresh,
  onNotice,
}: {
  activities: Activity[]
  completions: Completion[]
  today: string
  onClose: () => void
  onEdit: (activity: Activity) => void
  onArchive: (activity: Activity) => void
  onDelete: (activity: Activity) => void
  onRestore: (activityId: string) => Promise<void>
  onRefresh: () => Promise<void>
  onNotice: (message: string) => void
}) {
  const [tab, setTab] = useState<ActivityManagerTab>('running')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string>()
  const groups = groupManagedActivities(activities, completions)
  const tabs: Array<{ id: ActivityManagerTab; label: string }> = [
    { id: 'running', label: '进行中' },
    { id: 'paused', label: '已暂停' },
    { id: 'archived', label: '已归档' },
    { id: 'completed', label: '已完成' },
  ]
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visible = groups[tab].filter((activity) => (
    !normalizedQuery || `${activity.title} ${activityDomainLabel(activity)} ${activity.difficulty}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
  ))

  async function updateActivity(action: () => Promise<unknown>) {
    try {
      await action()
      await onRefresh()
    } catch (error) {
      onNotice(errorMessage(error))
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal activity-manager-modal" role="dialog" aria-modal="true" aria-labelledby="activity-manager-title">
        <div className="modal-header">
          <div><span className="modal-kicker">行动编排</span><h2 id="activity-manager-title">活动管理</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button>
        </div>
        <div className="segmented-control activity-manager-tabs" aria-label="活动状态">
          {tabs.map((item) => (
            <button
              type="button"
              key={item.id}
              className={tab === item.id ? 'selected' : ''}
              onClick={() => { setTab(item.id); setExpandedId(undefined) }}
            >{item.label}<small>{groups[item.id].length}</small></button>
          ))}
        </div>
        {activities.length > 8 && (
          <label className="activity-manager-search"><Search aria-hidden="true" /><span className="sr-only">搜索活动</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、成长领域或难度" /></label>
        )}
        <div className="activity-manager-list">
          {visible.length === 0 && <p className="empty-state">{normalizedQuery ? '没有匹配的活动' : '这里还没有活动'}</p>}
          {visible.map((activity) => {
            const expanded = expandedId === activity.id
            const completion = groups.completedTaskById.get(activity.id)
            const completedToday = completions.some((item) => item.activityId === activity.id && item.status === 'active' && item.occurredOn === today)
            return (
              <div className={expanded ? 'activity-manager-row expanded' : 'activity-manager-row'} key={activity.id}>
                <button className="activity-manager-row-summary" type="button" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? undefined : activity.id)}>
                  <span><strong>{activity.title}</strong><small>{activity.type === 'habit' ? '习惯' : '一次性任务'} · {activityDomainLabel(activity)} · {activity.difficulty}</small></span>
                  <ChevronRight aria-hidden="true" />
                </button>
                {expanded && (
                  <div className="activity-manager-row-details">
                    <p>{completion ? `${formatShortDate(completion.occurredOn)} 完成` : scheduleLabel(activity)}</p>
                    <div className="activity-manager-actions">
                      {(tab === 'running' || tab === 'paused') && (
                        <>
                          {activity.type === 'habit' && <button type="button" onClick={() => onEdit(activity)}><Pencil aria-hidden="true" />编辑</button>}
                          <button type="button" aria-pressed={activity.isKey} onClick={() => void updateActivity(() => setActivityKey(activity.id, !activity.isKey))}><Star aria-hidden="true" />{activity.isKey ? '取消关键' : '设为关键'}</button>
                          <button type="button" onClick={() => void updateActivity(() => setActivityEnabled(activity.id, !activity.enabled))}>{activity.enabled ? <Pause aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}{activity.enabled ? '暂停' : '启用'}</button>
                          <button className="danger-action" type="button" onClick={() => onArchive(activity)}><Trash2 aria-hidden="true" />归档</button>
                        </>
                      )}
                      {tab === 'archived' && (
                        <>
                          <button type="button" onClick={() => void onRestore(activity.id)}><RotateCcw aria-hidden="true" />恢复</button>
                          <button className="danger-action" type="button" disabled={completedToday} onClick={() => onDelete(activity)}><Trash2 aria-hidden="true" />永久删除</button>
                        </>
                      )}
                      {tab === 'completed' && (
                        <button className="danger-action" type="button" disabled={completion?.occurredOn === today} onClick={() => onDelete(activity)}><Trash2 aria-hidden="true" />永久删除</button>
                      )}
                    </div>
                    {((tab === 'archived' && completedToday) || (tab === 'completed' && completion?.occurredOn === today)) && <small className="delete-wait-note">本日结算后可永久删除</small>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function CreateActivityModal({ today, onClose, onCreate }: { today: string; onClose: () => void; onCreate: (activity: NewActivity) => void }) {
  const [type, setType] = useState<'habit' | 'task'>('habit')
  const [title, setTitle] = useState('')
  const [cue, setCue] = useState('')
  const [protocol, setProtocol] = useState('')
  const [domain, setDomain] = useState<GrowthDomain>('health')
  const [difficulty, setDifficulty] = useState<Difficulty>('简单')
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily')
  const [weeklyTimes, setWeeklyTimes] = useState(3)
  const [goalMode, setGoalMode] = useState<'single' | 'tiered'>('single')
  const [tierDraft, setTierDraft] = useState<TierGoalDraft>(defaultTierGoalDraft)
  const [plannedOn, setPlannedOn] = useState(today)
  const [isKey, setIsKey] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    const goal: Activity['goal'] = type === 'habit' && goalMode === 'tiered'
      ? buildTierGoal(tierDraft)
      : { kind: 'count', count: 1, unit: '次' }
    onCreate({
      title,
      cue: type === 'habit' && cue.trim() ? cue.trim() : undefined,
      protocol: type === 'habit' && protocol.trim() ? protocol.trim() : undefined,
      type,
      domain,
      difficulty,
      goal,
      schedule: type === 'task' ? { kind: 'once' } : frequency === 'daily' ? { kind: 'daily' } : { kind: 'weekly', times: weeklyTimes },
      plannedOn: type === 'task' ? plannedOn : undefined,
      isKey,
      enabled: true,
    })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={submit} aria-labelledby="create-title">
        <div className="modal-header"><div><span className="modal-kicker">登记新委托</span><h2 id="create-title">创建行动</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <div className="segmented-control">
          <button type="button" className={type === 'habit' ? 'selected' : ''} onClick={() => setType('habit')}>习惯</button>
          <button type="button" className={type === 'task' ? 'selected' : ''} onClick={() => setType('task')}>一次性任务</button>
        </div>
        <label className="full-field">名称<input required maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>
        {type === 'habit' ? (
          <>
            <div className="field-grid">
              <label>频率<select value={frequency} onChange={(event) => setFrequency(event.target.value as 'daily' | 'weekly')}><option value="daily">每天</option><option value="weekly">每周</option></select></label>
              {frequency === 'weekly' && <label>每周次数<input type="number" min={1} max={7} value={weeklyTimes} onChange={(event) => setWeeklyTimes(Number(event.target.value))} /></label>}
            </div>
            <div className="goal-type-block">
              <span>目标类型</span>
              <div className="segmented-control" aria-label="目标类型">
                <button type="button" className={goalMode === 'single' ? 'selected' : ''} onClick={() => setGoalMode('single')}>单次完成</button>
                <button type="button" className={goalMode === 'tiered' ? 'selected' : ''} onClick={() => setGoalMode('tiered')}>分层目标</button>
              </div>
            </div>
            {goalMode === 'tiered' && (
              <TierGoalFields value={tierDraft} onChange={setTierDraft} />
            )}
          </>
        ) : <label className="full-field">计划日期<input type="date" required value={plannedOn} onChange={(event) => setPlannedOn(event.target.value)} /></label>}
        <label className="checkbox-field"><input type="checkbox" checked={isKey} onChange={(event) => setIsKey(event.target.checked)} /><Star aria-hidden="true" />关键行为</label>
        {type === 'habit' && <details className="execution-details">
          <summary><span><strong>执行提示</strong><small>{cue.trim() || '可选的触发条件与行动协议'}</small></span><Target aria-hidden="true" /></summary>
          <label className="full-field">什么时候开始<input maxLength={80} value={cue} onChange={(event) => setCue(event.target.value)} placeholder="例如：起床后、第一段工作前" /></label>
          <label className="full-field">怎样执行<textarea maxLength={280} value={protocol} onChange={(event) => setProtocol(event.target.value)} placeholder="写清最低动作和走神后的返回方式" /></label>
        </details>}
        <details className="form-details">
          <summary><span><strong>成长领域与奖励</strong><small>{domainLabel(domain)} · {difficulty}</small></span><ListTodo aria-hidden="true" /></summary>
          <div className="field-grid">
            <label>成长领域<select value={domain} onChange={(event) => setDomain(event.target.value as GrowthDomain)}>{growthDomains.map((value) => <option key={value} value={value}>{domainLabel(value)}</option>)}</select></label>
            <label>难度<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>{difficulties.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
          <p className="domain-definition"><strong>{growthDomainDetails[domain].description}</strong><span>例如：{growthDomainDetails[domain].examples}</span></p>
          <p className="form-detail-note">奖励由难度决定；目标次数和时长不会放大奖励。</p>
        </details>
        <button className="primary-action" type="submit"><Plus aria-hidden="true" />创建</button>
      </form>
    </div>
  )
}

function TierGoalFields({ value, onChange }: { value: TierGoalDraft; onChange: (value: TierGoalDraft) => void }) {
  const set = (next: Partial<TierGoalDraft>) => onChange({ ...value, ...next })
  const levels = tierLevels.slice(0, value.tierCount)
  return (
    <div className="tier-goal-fields">
      <div className="goal-type-block">
        <span>层次数量</span>
        <div className="segmented-control" aria-label="层次数量">
          <button type="button" className={value.tierCount === 2 ? 'selected' : ''} onClick={() => set({ tierCount: 2 })}>两层</button>
          <button type="button" className={value.tierCount === 3 ? 'selected' : ''} onClick={() => set({ tierCount: 3 })}>三层</button>
        </div>
      </div>
      <label className="advanced-toggle">
        <span><strong>高级设置</strong><small>组合次数和时间</small></span>
        <input type="checkbox" role="switch" checked={value.advanced} onChange={(event) => set({ advanced: event.target.checked })} />
      </label>
      {!value.advanced ? (
        <>
          <div className="goal-type-block">
            <span>度量方式</span>
            <div className="segmented-control" aria-label="度量方式">
              <button type="button" className={value.metric === 'duration' ? 'selected' : ''} onClick={() => set({ metric: 'duration' })}>按时间</button>
              <button type="button" className={value.metric === 'count' ? 'selected' : ''} onClick={() => set({ metric: 'count' })}>按次数</button>
            </div>
          </div>
          {value.metric === 'duration' ? (
            <>
              <TimeUnitControl
                value={value.timeUnit}
                seconds={value.durationSeconds}
                onChange={(timeUnit) => set({ timeUnit })}
              />
              <div className={`tier-threshold-grid tiers-${value.tierCount}`}>
                {levels.map((tier, index) => (
                  <label key={tier}>{tierLabels[tier]}层（{value.timeUnit}）
                    <input
                      type="number"
                      min={1}
                      max={value.timeUnit === '分钟' ? 1440 : 86_400}
                      step={1}
                      required
                      value={timeInputValue(value.durationSeconds[index], value.timeUnit)}
                      onChange={(event) => {
                        const next = [...value.durationSeconds] as StringTriple
                        next[index] = timeInputSeconds(event.target.value, value.timeUnit)
                        set({ durationSeconds: next })
                      }}
                    />
                  </label>
                ))}
              </div>
            </>
          ) : (
            <>
              <label className="full-field">次数单位<input required maxLength={12} value={value.countUnit} onChange={(event) => set({ countUnit: event.target.value })} /></label>
              <div className={`tier-threshold-grid tiers-${value.tierCount}`}>
                {levels.map((tier, index) => (
                  <label key={tier}>{tierLabels[tier]}层（{value.countUnit || '单位'}）
                    <input
                      type="number"
                      min={1}
                      max={999}
                      step={1}
                      required
                      value={value.countThresholds[index]}
                      onChange={(event) => {
                        const next = [...value.countThresholds] as StringTriple
                        next[index] = event.target.value
                        set({ countThresholds: next })
                      }}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
          <span className="field-hint">{value.tierCount === 2 ? '基础、标准必须依次增加' : '基础、标准、突破必须依次增加'}</span>
        </>
      ) : (
        <>
          <div className="goal-type-block">
            <span>组合方式</span>
            <div className="segmented-control" aria-label="组合方式">
              <button type="button" className={value.combinedMode === 'per_occurrence' ? 'selected' : ''} onClick={() => set({ combinedMode: 'per_occurrence' })}>每次固定时长</button>
              <button type="button" className={value.combinedMode === 'total' ? 'selected' : ''} onClick={() => set({ combinedMode: 'total' })}>累计总量</button>
            </div>
          </div>
          <label className="full-field">次数单位<input required maxLength={12} value={value.countUnit} onChange={(event) => set({ countUnit: event.target.value })} /></label>
          <TimeUnitControl
            value={value.combinedTimeUnit}
            seconds={value.combinedThresholds.map((threshold) => threshold.durationSeconds)}
            onChange={(combinedTimeUnit) => set({ combinedTimeUnit })}
          />
          <div className="combined-tier-list">
            {levels.map((tier, index) => (
              <div className="combined-tier-row" key={tier}>
                <strong>{tierLabels[tier]}层</strong>
                <label>{value.combinedMode === 'per_occurrence' ? '次数' : '总次数'}
                  <input
                    aria-label={`${tierLabels[tier]}层次数`}
                    type="number"
                    min={1}
                    max={999}
                    step={1}
                    required
                    value={value.combinedThresholds[index].count}
                    onChange={(event) => {
                      const next = value.combinedThresholds.map((threshold) => ({ ...threshold })) as TierGoalDraft['combinedThresholds']
                      next[index].count = event.target.value
                      set({ combinedThresholds: next })
                    }}
                  />
                </label>
                <label>{value.combinedMode === 'per_occurrence' ? `每次时长（${value.combinedTimeUnit}）` : `累计时间（${value.combinedTimeUnit}）`}
                  <input
                    aria-label={`${tierLabels[tier]}层${value.combinedMode === 'per_occurrence' ? '每次时长' : '累计时间'}（${value.combinedTimeUnit}）`}
                    type="number"
                    min={1}
                    max={value.combinedTimeUnit === '分钟' ? 1440 : 86_400}
                    step={1}
                    required
                    value={timeInputValue(value.combinedThresholds[index].durationSeconds, value.combinedTimeUnit)}
                    onChange={(event) => {
                      const next = value.combinedThresholds.map((threshold) => ({ ...threshold })) as TierGoalDraft['combinedThresholds']
                      next[index].durationSeconds = timeInputSeconds(event.target.value, value.combinedTimeUnit)
                      set({ combinedThresholds: next })
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
          <span className="field-hint">次数和时间不能下降，每升一层至少增加一项</span>
        </>
      )}
    </div>
  )
}

function TimeUnitControl({ value, seconds, onChange }: { value: TimeInputUnit; seconds: string[]; onChange: (value: TimeInputUnit) => void }) {
  const canUseMinutes = seconds.every((item) => !item || Number(item) % 60 === 0)
  return (
    <div className="goal-type-block">
      <span>时间单位</span>
      <div className="segmented-control" aria-label="时间单位">
        <button type="button" className={value === '秒' ? 'selected' : ''} onClick={() => onChange('秒')}>秒</button>
        <button type="button" className={value === '分钟' ? 'selected' : ''} disabled={!canUseMinutes} title={canUseMinutes ? undefined : '当前秒数不能完整换算为整数分钟'} onClick={() => onChange('分钟')}>分钟</button>
      </div>
      {!canUseMinutes && value === '秒' && <span className="field-hint">秒数能被 60 整除后才可切换为分钟</span>}
    </div>
  )
}

function TierPickerModal({
  activity,
  completion,
  onClose,
  onComplete,
}: {
  activity: Activity
  completion?: Completion
  onClose: () => void
  onComplete: (tier: TierLevel) => void
}) {
  if (!isTieredGoal(activity)) return null
  const currentTier = completion?.tier
  const goal = completion ? getCompletionTierGoal(completion, activity) : activity.goal
  if (!goal) return null
  const levels = getTierLevels(goal)
  const tierCount = getTierCount(goal)
  const currentXp = currentTier ? getTierReward(activity.difficulty, currentTier, tierCount).xp : 0
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal compact-modal" aria-labelledby="tier-title">
        <div className="modal-header"><div><span className={`difficulty difficulty-${activity.difficulty}`}>{activity.difficulty}</span><h2 id="tier-title">{currentTier ? '升级层次' : activity.title}</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <div className="tier-choice-list">
          {levels.filter((tier) => !currentTier || tier > currentTier).map((tier) => {
            const reward = getTierReward(activity.difficulty, tier, tierCount)
            return (
              <button key={tier} type="button" className={`tier-choice tier-choice-${tier}`} onClick={() => onComplete(tier)} aria-label={`${currentTier ? '升级到' : '选择'} ${tierLabels[tier]}层`}>
                <span><b>{tierLabels[tier]}层</b><small>{formatTierGoalValue(goal, tier)}</small></span>
                <strong>{currentTier ? `再 +${reward.xp - currentXp} XP` : `+${reward.xp} XP · +${reward.coins} 金币`}</strong>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function EditHabitModal({ activity, onClose, onSave }: { activity: Activity; onClose: () => void; onSave: (input: HabitUpdate) => void }) {
  const tiered = isTieredGoal(activity)
  const legacy = activity.goal.kind !== 'tiered' && (isDurationGoal(activity) || activity.goal.count !== 1 || activity.goal.unit !== '次')
  const [title, setTitle] = useState(activity.title)
  const [cue, setCue] = useState(activity.cue ?? '')
  const [protocol, setProtocol] = useState(activity.protocol ?? '')
  const [domain, setDomain] = useState<GrowthDomain>(activity.domain ?? 'health')
  const [difficulty, setDifficulty] = useState<Difficulty>(activity.difficulty)
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>(activity.schedule.kind === 'weekly' ? 'weekly' : 'daily')
  const [weeklyTimes, setWeeklyTimes] = useState(activity.schedule.kind === 'weekly' ? activity.schedule.times : 3)
  const [isKey, setIsKey] = useState(activity.isKey)
  const [mode, setMode] = useState<'legacy' | 'single' | 'tiered'>(tiered ? 'tiered' : legacy ? 'legacy' : 'single')
  const [tierDraft, setTierDraft] = useState<TierGoalDraft>(() => tierGoalDraftFromLegacy(activity))

  function submit(event: FormEvent) {
    event.preventDefault()
    const goal: Activity['goal'] = mode === 'legacy'
      ? activity.goal
      : mode === 'single'
        ? { kind: 'count', count: 1, unit: '次' }
        : buildTierGoal(tierDraft)
    onSave({
      title: title.trim(),
      cue: cue.trim() || undefined,
      protocol: protocol.trim() || undefined,
      domain,
      difficulty,
      schedule: frequency === 'daily' ? { kind: 'daily' } : { kind: 'weekly', times: weeklyTimes },
      goal,
      isKey,
    })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={submit} aria-labelledby="edit-habit-title">
        <div className="modal-header"><h2 id="edit-habit-title">编辑习惯</h2><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <label className="full-field">习惯名称<input required maxLength={40} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <details className="execution-details" open={Boolean(activity.cue || activity.protocol)}>
          <summary><span><strong>执行提示</strong><small>{cue.trim() || '可选'}</small></span><Target aria-hidden="true" /></summary>
          <label className="full-field">什么时候开始<input maxLength={80} value={cue} onChange={(event) => setCue(event.target.value)} /></label>
          <label className="full-field">怎样执行<textarea maxLength={280} value={protocol} onChange={(event) => setProtocol(event.target.value)} /></label>
        </details>
        <div className="field-grid">
          <label>成长领域<select value={domain} onChange={(event) => setDomain(event.target.value as GrowthDomain)}>{growthDomains.map((value) => <option key={value} value={value}>{domainLabel(value)}</option>)}</select></label>
          <label>难度<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>{difficulties.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <p className="domain-definition"><strong>{growthDomainDetails[domain].description}</strong><span>例如：{growthDomainDetails[domain].examples}</span></p>
        <div className="field-grid">
          <label>频率<select value={frequency} onChange={(event) => setFrequency(event.target.value as 'daily' | 'weekly')}><option value="daily">每天</option><option value="weekly">每周 N 次</option></select></label>
          {frequency === 'weekly' && <label>每周次数<input type="number" min={1} max={7} required value={weeklyTimes} onChange={(event) => setWeeklyTimes(Number(event.target.value))} /></label>}
        </div>
        <span className="form-section-label">目标设置</span>
        <div className="segmented-control" aria-label="目标设置">
          {legacy && <button type="button" className={mode === 'legacy' ? 'selected' : ''} onClick={() => setMode('legacy')}>保留原目标</button>}
          <button type="button" className={mode === 'single' ? 'selected' : ''} onClick={() => setMode('single')}>单次完成</button>
          <button type="button" className={mode === 'tiered' ? 'selected' : ''} onClick={() => setMode('tiered')}>分层目标</button>
        </div>
        {mode === 'legacy' && activity.goal.kind !== 'tiered' && <p className="legacy-goal">当前目标：{activity.goal.count}{activity.goal.unit}</p>}
        {mode === 'tiered' && (
          <TierGoalFields value={tierDraft} onChange={setTierDraft} />
        )}
        <label className="checkbox-field"><input type="checkbox" checked={isKey} onChange={(event) => setIsKey(event.target.checked)} /><Star aria-hidden="true" />设为关键行为</label>
        <button className="primary-action" type="submit"><Check aria-hidden="true" />保存修改</button>
      </form>
    </div>
  )
}

function CompletionActionsModal({
  activity,
  completion,
  onClose,
  onUpgrade,
  onCancel,
}: {
  activity: Activity
  completion: Completion
  onClose: () => void
  onUpgrade: (tier: TierLevel) => void
  onCancel: () => Promise<void>
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const difficulty = completion.difficultySnapshot ?? activity.difficulty
  const goal = getCompletionTierGoal(completion, activity)
  const currentTier = completion.tier
  const levels = goal ? getTierLevels(goal) : []
  const tierCount = goal ? getTierCount(goal) : 3
  const canUpgrade = Boolean(currentTier && goal && currentTier < tierCount)
  const canCancel = true
  const currentReward = currentTier ? getTierReward(difficulty, currentTier, tierCount) : rewardTable[difficulty]

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal compact-modal" aria-labelledby="completion-actions-title">
        <div className="modal-header">
          <div><span className={`difficulty difficulty-${difficulty}`}>{difficulty}</span><h2 id="completion-actions-title">完成记录</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button>
        </div>
        <div className="completion-summary">
          <CheckCircle2 aria-hidden="true" />
          <div><strong>{completion.titleSnapshot ?? activity.title}</strong><span>{currentTier ? `${tierLabels[currentTier]}层 · ` : ''}+{currentReward.xp} XP / +{currentReward.coins} 金币</span></div>
        </div>
        {canUpgrade && (
          <div className="completion-upgrades">
            <span className="form-section-label">升级到更高层</span>
            <div className="tier-choice-list">
              {levels.filter((tier) => tier > currentTier!).map((tier) => {
                const reward = getTierReward(difficulty, tier, tierCount)
                return (
                  <button key={tier} type="button" className={`tier-choice tier-choice-${tier}`} onClick={() => onUpgrade(tier)} aria-label={`升级到 ${tierLabels[tier]}层`}>
                    <span><b>{tierLabels[tier]}层</b><small>{formatTierGoalValue(goal!, tier)}</small></span>
                    <strong>再 +{reward.xp - currentReward.xp} XP</strong>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {!canCancel ? (
          <p className="historical-completion-note">这条完成不是今天的记录，不能取消。</p>
        ) : !confirmingCancel ? (
          <button className="danger-action" type="button" onClick={() => setConfirmingCancel(true)}><RotateCcw aria-hidden="true" />取消今天的完成</button>
        ) : (
          <div className="cancel-confirmation" role="alert">
            <strong>确认取消今天的完成？</strong>
            <p>系统会追加修正流水抵消奖励；历史记录不会被删除。</p>
            <div className="confirmation-actions">
              <button type="button" onClick={() => setConfirmingCancel(false)}>返回</button>
              <button className="danger-action" type="button" onClick={() => void onCancel()}>确认取消</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function ArchiveActivityModal({ activity, onClose, onConfirm }: { activity: Activity; onClose: () => void; onConfirm: () => Promise<void> }) {
  return (
    <div className="modal-backdrop nested-modal" role="presentation">
      <section className="modal compact-modal" aria-labelledby="archive-activity-title">
        <div className="modal-header"><h2 id="archive-activity-title">归档活动</h2><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <p className="modal-description">“{activity.title}”将从今天和默认管理列表隐藏，历史完成、奖励流水和复盘记录会保留，之后可以恢复。</p>
        <div className="confirmation-actions">
          <button type="button" onClick={onClose}>返回</button>
          <button className="danger-action" type="button" onClick={() => void onConfirm()}><Trash2 aria-hidden="true" />确认归档</button>
        </div>
      </section>
    </div>
  )
}

function DeleteActivityModal({ activity, onClose, onConfirm }: { activity: Activity; onClose: () => void; onConfirm: () => Promise<void> }) {
  return (
    <div className="modal-backdrop nested-modal" role="presentation">
      <section className="modal compact-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-activity-title">
        <div className="modal-header"><h2 id="delete-activity-title">永久删除活动定义</h2><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <p className="modal-description">“{activity.title}”将不再出现在活动管理中。XP、金币、完成记录、行动日志和复盘会永久保留，角色数值不会变化。</p>
        <div className="confirmation-actions">
          <button type="button" onClick={onClose}>返回</button>
          <button className="danger-action" type="button" onClick={() => void onConfirm()}><Trash2 aria-hidden="true" />确认永久删除</button>
        </div>
      </section>
    </div>
  )
}

function CompletionModal({ activity, onClose, onComplete }: { activity: Activity; onClose: () => void; onComplete: (details: CompletionDetails) => void }) {
  const [note, setNote] = useState('')
  const [duration, setDuration] = useState('')
  const required = activity.difficulty === 'Boss'
  const durationGoal = isDurationGoal(activity)
  const durationValue = Number(duration)
  const durationValid = !durationGoal || (Number.isInteger(durationValue) && durationValue >= activity.goal.count && durationValue <= 1440)
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal compact-modal" onSubmit={(event) => { event.preventDefault(); onComplete({ note: note.trim() || undefined, durationMinutes: durationGoal ? durationValue : undefined }) }} aria-labelledby="completion-title">
        <div className="modal-header"><div><span className={`difficulty difficulty-${activity.difficulty}`}>{activity.difficulty}</span><h2 id="completion-title">{activity.title}</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        {durationGoal && (
          <label className="full-field">实际时长（分钟）
            <input type="number" min={activity.goal.count} max={1440} step={1} required value={duration} onChange={(event) => setDuration(event.target.value)} autoFocus />
            <span className="field-hint">本次目标：至少 {activity.goal.count} 分钟</span>
          </label>
        )}
        <label className="full-field">实际成果{required ? '（必填）' : '（选填）'}<textarea required={required} minLength={required ? 1 : undefined} maxLength={140} value={note} onChange={(event) => setNote(event.target.value)} autoFocus={!durationGoal} /></label>
        <div className="character-count">{note.length} / 140</div>
        <button className="primary-action" type="submit" disabled={(required && note.trim().length === 0) || !durationValid}><Check aria-hidden="true" />确认完成</button>
      </form>
    </div>
  )
}

function FeedbackOverlay({ feedback, onUndo }: { feedback: AwardFeedback; onUndo: () => void }) {
  const stage = getCharacterStage(feedback.level.level)
  const [condensed, setCondensed] = useState(false)

  useEffect(() => {
    setCondensed(false)
    const timer = window.setTimeout(() => setCondensed(true), 1400)
    return () => window.clearTimeout(timer)
  }, [feedback.completionId])

  return (
    <aside className={condensed ? 'feedback-overlay condensed' : 'feedback-overlay'} role="status" aria-live="assertive">
      <span className="feedback-portrait"><TravelerPortrait stage={stage} label="像素旅者成长反馈" /></span>
      <div className="feedback-copy">
        <span>{feedback.leveledUp ? `角色升级 · Lv.${feedback.level.level}` : feedback.upgraded ? '委托升级' : '委托完成'}</span>
        <strong>{feedback.title}</strong>
        <div className="reward-gains"><b>+{feedback.xp} XP</b>{feedback.coins > 0 && <b>+{feedback.coins} 金币</b>}<b>{domainLabel(feedback.domain)}</b></div>
        <div className="feedback-detail">
          {feedback.durationMinutes && <p className="feedback-duration">本次持续 {feedback.durationMinutes} 分钟</p>}
          {feedback.tier && <p className="feedback-duration">{tierLabels[feedback.tier]}层 · 至少 {feedback.achievedLabel}</p>}
          <p>{identityMessage(feedback.domain)}</p>
          {feedback.rewardGoal && (
            <p className="feedback-goal">
              {feedback.rewardGoal.remaining === 0
                ? `「${feedback.rewardGoal.title}」现在可以兑换`
                : `距离「${feedback.rewardGoal.title}」还差 ${feedback.rewardGoal.remaining} 金币`}
            </p>
          )}
          <ProgressBar value={feedback.level.progress} label={`Lv.${feedback.level.level} · ${feedback.level.current}/${feedback.level.needed} XP`} compact />
        </div>
      </div>
      <button type="button" className="undo-button" onClick={onUndo}><RotateCcw aria-hidden="true" />撤销</button>
    </aside>
  )
}

function ProgressBar({ value, label, compact = false }: { value: number; label: string; compact?: boolean }) {
  const percent = Math.max(0, Math.min(100, value * 100))
  return (
    <div className={compact ? 'progress-wrap compact' : 'progress-wrap'}>
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{ width: `${percent}%` }} /></div>
      <span>{label}</span>
    </div>
  )
}

function TravelerPortrait({ stage, label }: { stage: number; label: string }) {
  return (
    <span
      className={`traveler-portrait traveler-stage-${stage}`}
      style={{ backgroundImage: `url("${assetUrl('traveler-stages.png')}")` }}
      role="img"
      aria-label={label}
    />
  )
}

function SettingToggle({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: () => void }) {
  return <label className="setting-toggle"><span>{icon}<strong>{label}</strong></span><input type="checkbox" role="switch" checked={checked} onChange={onChange} /></label>
}

function scheduleLabel(activity: Activity) {
  const goal = activity.goal
  if (goal.kind === 'tiered') {
    const tiers = getTierLevels(goal).map((tier) => `${tierLabels[tier]} ${formatTierGoalValue(goal, tier)}`).join(' · ')
    return activity.schedule.kind === 'weekly' ? `每周 ${activity.schedule.times} 次 · ${tiers}` : `每天 · ${tiers}`
  }
  const duration = goal.kind === 'duration' || goal.unit === '分钟'
  if (activity.schedule.kind === 'daily') return duration ? `每天 · 目标 ${goal.count} 分钟` : `每天 ${goal.count}${goal.unit}`
  if (activity.schedule.kind === 'weekly') return duration ? `每周 ${activity.schedule.times} 次 · 每次 ${goal.count} 分钟` : `每周 ${activity.schedule.times} 次`
  return activity.plannedOn ? formatShortDate(activity.plannedOn) : '单次'
}

function activityFrequencyLabel(activity: Activity) {
  if (activity.schedule.kind === 'daily') return '每天'
  if (activity.schedule.kind === 'weekly') return `每周 ${activity.schedule.times} 次`
  return activity.plannedOn ? `计划 ${formatShortDate(activity.plannedOn)}` : '一次性任务'
}

function activityGoalLabel(activity: Activity) {
  const goal = activity.goal
  if (goal.kind === 'tiered') {
    return getTierLevels(goal).map((tier) => `${tierLabels[tier]} ${formatTierGoalValue(goal, tier)}`).join(' · ')
  }
  const duration = goal.kind === 'duration' || goal.unit === '分钟'
  return `目标 ${goal.count}${duration ? ' 分钟' : goal.unit}`
}

function formatChineseDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00`))
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试'
}

export default App
