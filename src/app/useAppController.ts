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
  FileJson,
  Gift,
  Home,
  History,
  Leaf,
  ListTodo,
  Pause,
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
  Vibrate,
  Volume2,
  X,
  Zap,
} from 'lucide-react'
import { createBackup, createLedgerMarkdown, previewBackupRestore, restoreBackup, type BackupRestorePreview } from '../backup'
import {
  archiveActivity as archiveActivityDefinition,
  activateGrowthDomains,
  activateCoachPlanDraft,
  applyRewardBudgetRollover,
  calibrateSeasonWithStableLife,
  cancelRewardClaim,
  cancelTodayCompletion,
  completeApplicationSeason,
  completeApplicationTrial,
  completeSeason,
  completeActivity,
  activateApplicationTrialRestart,
  createActivity,
  createSeason,
  createReward,
  db,
  getSnapshot,
  fulfillRewardClaim,
  initializeDatabase,
  acknowledgeLevelMilestone,
  recordIncrementalProgress,
  reserveRewardClaim,
  respondToSeasonSuggestion,
  permanentlyDeleteActivity,
  saveWeeklyReview,
  saveCoachPlanDraft,
  prepareApplicationTrialRestart,
  saveSeasonDailySignal,
  setActivityEnabled,
  setActivityKey,
  setRewardEnabled,
  setRewardQueue,
  setSeasonDailyFocus,
  setTodayActionPriority,
  undoCompletion,
  undoLatestIncrementalProgress,
  updateTodayRating,
  updateHabit,
  restoreActivity,
  syncLevelMilestones,
  updatePreferences,
  updateReward,
  type CompletionDetails,
  type HabitUpdate,
  type NewActivity,
} from '../db'
import {
  addDays,
  applicationDecisions,
  coachBehaviorRoleLabels,
  CoachPlanDraftSchema,
  createCoachPlanDraft,
  domainLabel,
  calculateStats,
  calculateIncrementalProgress,
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
  getIncrementalCycleGoal,
  identityMessage,
  formatDurationSeconds,
  isDurationGoal,
  isRatingGoal,
  isTieredGoal,
  effectiveGameDate,
  localDate,
  nextGameDayBoundary,
  rewardTable,
  reviewDecisions,
  startOfWeek,
  formatTierGoalValue,
  getRewardPriceSuggestions,
  tierLabels,
  tierLevels,
  TieredGoalSchema,
  RatingGoalSchema,
  type Activity,
  type ApplicationDecision,
  type ApplicationTrial,
  type ApplicationTrialRestart,
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
  type RewardClaim,
  type ReviewDecision,
  type TierLevel,
  type TierMetric,
  type TieredGoal,
  type RatingGoal,
  type TimeInputUnit,
  type WeeklyReview,
  type JourneyEntry,
  type JourneyMonth,
} from '../domain'
import { playCompletionChime, playCompletionVibration, prepareCompletionAudio, requestNotificationPermission, sendCompletionFeedback } from '../feedback'
import { CoachSuggestionSummary, SeasonHubModal, SeasonTodaySummary } from '../SeasonExperience'
import { RewardExperience } from '../RewardExperience'
import { KnowledgeActionImportModal } from '../KnowledgeActionImportModal'
import {
  importKnowledgeActionPackage,
  previewKnowledgeActionPackage,
  type KnowledgeActionPackagePreview,
} from '../knowledge-action-package'
import {
  applicationResultFilename,
  createPlanningContextPackage,
  createSeasonResultPackage,
  createTrialResultPackage,
  planningContextFilename,
} from '../application-bridge'
import {
  V5GrowthPage,
  V5Navigation,
  V5TodayPage,
  getV5DailyRewardSummary,
  type V5Page,
} from '../prototype/V5Experience'

import { defaultPreferences, emptySnapshot, navigateTo, routeFromHash, type AppNotice, type AwardFeedback, type NoticeTone, type Page, type SecondaryPage, type Snapshot } from './model'
import { errorMessage, formatIncrementalSummary } from './shared-ui'

export function useAppController() {
  const initialRoute = useMemo(routeFromHash, [])
  const [page, setPage] = useState<Page>(initialRoute.page)
  const [secondaryPage, setSecondaryPage] = useState<SecondaryPage | undefined>(initialRoute.secondary)
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [ready, setReady] = useState(false)
  const [notice, setNoticeState] = useState<AppNotice | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [noteActivity, setNoteActivity] = useState<Activity | null>(null)
  const [tierActivity, setTierActivity] = useState<Activity | null>(null)
  const [goalActivity, setGoalActivity] = useState<Activity | null>(null)
  const [completionActivity, setCompletionActivity] = useState<Activity | null>(null)
  const [durationActivity, setDurationActivity] = useState<Activity | null>(null)
  const [weeklyDetailActivity, setWeeklyDetailActivity] = useState<Activity | null>(null)
  const [archiveActivity, setArchiveActivity] = useState<Activity | null>(null)
  const [deleteActivity, setDeleteActivity] = useState<Activity | null>(null)
  const [activityManagerOpen, setActivityManagerOpen] = useState(false)
  const [seasonHubOpen, setSeasonHubOpen] = useState(false)
  const [seasonHubInitialView, setSeasonHubInitialView] = useState<'overview' | 'signal'>('overview')
  const [feedback, setFeedback] = useState<AwardFeedback | null>(null)
  const [knowledgePackagePreview, setKnowledgePackagePreview] = useState<KnowledgeActionPackagePreview | null>(null)
  const [knowledgePackageImporting, setKnowledgePackageImporting] = useState(false)
  const progressLocks = useRef(new Set<string>())
  const [clock, setClock] = useState(() => new Date())

  const setNotice = useCallback((message: string, tone: NoticeTone = 'success') => {
    setNoticeState(message ? { message, tone } : null)
  }, [])
  const setErrorNotice = useCallback((message: string) => setNotice(message, 'error'), [setNotice])

  async function openKnowledgePackagePreview(file?: File) {
    if (!file) return
    try {
      const input = JSON.parse(await file.text())
      setKnowledgePackagePreview(await previewKnowledgeActionPackage(input))
    } catch (error) {
      setErrorNotice(`知识行动包无效：${errorMessage(error)}`)
    }
  }

  async function confirmKnowledgePackageImport() {
    if (!knowledgePackagePreview) return
    try {
      setKnowledgePackageImporting(true)
      await importKnowledgeActionPackage(knowledgePackagePreview.actionPackage)
      await refresh()
      setKnowledgePackagePreview(null)
      setNotice('知识行动包已转为规划草稿，请逐项确认后再启动')
      navigateTo('coach/plan')
    } catch (error) {
      setErrorNotice(errorMessage(error))
    } finally {
      setKnowledgePackageImporting(false)
    }
  }

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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [page, secondaryPage])

  const refresh = useCallback(async () => {
    setSnapshot(await getSnapshot())
  }, [])

  useEffect(() => {
    initializeDatabase()
      .then(() => applyRewardBudgetRollover())
      .then(() => syncLevelMilestones())
      .then(refresh)
      .then(() => setReady(true))
      .catch((error: unknown) => setErrorNotice(errorMessage(error)))
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
  const journeyMonths = useMemo(
    () => getJourneyMonths(snapshot.completions, snapshot.ledgerEvents, levelSystem),
    [snapshot.completions, snapshot.ledgerEvents, levelSystem],
  )
  const rewardSystemSetting = snapshot.settings.find((item) => item.key === 'rewardSystem')
  const rewardSystem = rewardSystemSetting?.key === 'rewardSystem' ? rewardSystemSetting.value : undefined
  const targetRewardId = rewardSystem?.activeRewardId ?? (metaSetting?.key === 'meta' ? metaSetting.value.targetRewardId : undefined)
  const gameDayBoundaryActivatedAt = metaSetting?.key === 'meta' ? metaSetting.value.gameDayBoundaryActivatedAt : undefined
  const growthDomainSystem = metaSetting?.key === 'meta' ? metaSetting.value.growthDomainSystem : undefined
  const coachDraftSetting = snapshot.settings.find((item) => item.key === 'coachPlanDraft')
  const coachDraft = coachDraftSetting?.key === 'coachPlanDraft' ? coachDraftSetting.value : undefined
  const applicationTrialSetting = snapshot.settings.find((item) => item.key === 'applicationTrial')
  const applicationTrial = applicationTrialSetting?.key === 'applicationTrial' ? applicationTrialSetting.value : undefined
  const applicationTrialRestartSetting = snapshot.settings.find((item) => item.key === 'applicationTrialRestart')
  const applicationTrialRestart = applicationTrialRestartSetting?.key === 'applicationTrialRestart' ? applicationTrialRestartSetting.value : undefined
  const targetReward = snapshot.rewards.find((reward) => reward.id === targetRewardId && reward.enabled)
  const pendingRewardClaim = snapshot.rewardClaims
    .filter((claim) => claim.status === 'reserved')
    .sort((left, right) => left.plannedFor.localeCompare(right.plannedFor))[0]
  const rewardPriceSuggestions = getRewardPriceSuggestions(snapshot.ledgerEvents, effectiveGameDate(clock, gameDayBoundaryActivatedAt))
  const activeSeason = snapshot.seasons.find((season) => season.status === 'active')
  const characterNeedsAttention = Boolean(levelSystem?.milestones.some(
    (milestone) => !milestone.acknowledgedAt || (milestone.voucherMaxCost && !milestone.claimedAt),
  ))
  const today = effectiveGameDate(clock, gameDayBoundaryActivatedAt)
  const todayActionPriorityIds = metaSetting?.key === 'meta' && metaSetting.value.todayActionPriority?.gameDate === today
    ? metaSetting.value.todayActionPriority.activityIds
    : []
  const currentCycleStart = startOfWeek(new Date(`${today}T12:00:00`))
  const currentIncrementalGoal = (activity: Activity) => getIncrementalCycleGoal(activity, snapshot.completions, currentCycleStart)
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
  const dailyHabits = enabledActivities.filter((activity) => activity.type === 'habit' && !activity.isKey && activity.schedule.kind === 'daily')
  const weeklyHabits = enabledActivities
    .filter((activity) => activity.type === 'habit' && activity.schedule.kind === 'weekly')
    .sort((left, right) => Number(right.isKey) - Number(left.isKey))
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
      const followUp = result.completion.ratingValue !== undefined
        ? { kind: 'rating-note' as const, activityId: activity.id }
        : activity.cue === '23:00'
        && activeSeason?.calibration
        && !activeSeason.dailySignals.some((signal) => signal.date === today)
        ? { kind: 'daily-signal' as const, seasonId: activeSeason.id }
        : undefined
      if (!activity.domain) throw new Error('请先完成成长领域迁移')
      setFeedback({
        completionId: result.completion.id,
        activityId: activity.id,
        title: activity.title,
        domain: activity.domain,
        xp: result.event.xpDelta,
        coins: result.event.coinDelta,
        durationMinutes: result.completion.durationMinutes,
        tier: result.completion.tier,
        ratingValue: result.completion.ratingValue,
        ratingPrompt: result.completion.ratingGoalSnapshot?.prompt,
        achievedLabel: result.completion.tier && completedTierGoal
          ? formatTierGoalValue(completedTierGoal, result.completion.tier)
          : undefined,
        upgraded: result.upgraded,
        leveledUp,
        level: nextLevel,
        rewardGoal: targetReward
          ? { title: targetReward.title, remaining: Math.max(0, targetReward.cost - nextStats.coins) }
          : undefined,
        followUp,
      })
      await refresh()
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
        setNotice(`${[vibrationFailed ? '振动' : '', soundFailed ? '声音' : ''].filter(Boolean).join('和')}在当前设备不可用，已自动关闭`, 'warning')
      }).catch((error: unknown) => setErrorNotice(errorMessage(error)))
    } catch (error) {
      setErrorNotice(errorMessage(error))
    }
  }

  async function finishIncremental(activity: Activity, durationSeconds?: number) {
    if (progressLocks.current.has(activity.id)) return
    progressLocks.current.add(activity.id)
    const preparedAudio = preferences.sound ? prepareCompletionAudio() : undefined
    try {
      const result = await recordIncrementalProgress(activity.id, durationSeconds, crypto.randomUUID())
      if (!result.recorded) return
      const nextEvents = result.event ? [...snapshot.ledgerEvents, result.event] : snapshot.ledgerEvents
      const nextStats = calculateStats(nextEvents)
      const nextLevel = getLevel(nextStats.totalXp)
      const leveledUp = nextLevel.level > level.level
      const progressLabel = formatIncrementalSummary(result.progress)
      setFeedback({
        completionId: result.completion.id,
        activityId: activity.id,
        incremental: true,
        title: activity.title,
        domain: activity.domain!,
        xp: result.event?.xpDelta ?? 0,
        coins: result.event?.coinDelta ?? 0,
        durationSeconds,
        tier: result.progress.highestTier,
        progressLabel,
        upgraded: result.upgraded,
        leveledUp,
        level: nextLevel,
        rewardGoal: result.event && targetReward
          ? { title: targetReward.title, remaining: Math.max(0, targetReward.cost - nextStats.coins) }
          : undefined,
      })
      await refresh()
      void sendCompletionFeedback(preferences, {
        title: activity.title,
        xp: result.event?.xpDelta ?? 0,
        coins: result.event?.coinDelta ?? 0,
        domain: activity.domain!,
        durationSeconds,
        tier: result.progress.highestTier,
        progressLabel,
        upgraded: result.upgraded,
        leveledUp,
      }, preparedAudio).then(async (feedbackResult) => {
        const vibrationFailed = feedbackResult.vibration === false
        const soundFailed = feedbackResult.sound === false
        if (!vibrationFailed && !soundFailed) return
        await updatePreferences({
          ...preferences,
          vibration: vibrationFailed ? false : preferences.vibration,
          sound: soundFailed ? false : preferences.sound,
        })
        await refresh()
        setNotice(`${[vibrationFailed ? '振动' : '', soundFailed ? '声音' : ''].filter(Boolean).join('和')}在当前设备不可用，已自动关闭`, 'warning')
      }).catch((error: unknown) => setErrorNotice(errorMessage(error)))
    } catch (error) {
      setErrorNotice(errorMessage(error))
    } finally {
      progressLocks.current.delete(activity.id)
    }
  }

  function requestCompletion(activity: Activity) {
    const incrementalGoal = currentIncrementalGoal(activity)
    if (incrementalGoal?.metric === 'combined') setDurationActivity(activity)
    else if (incrementalGoal) void finishIncremental(activity)
    else if (isTieredGoal(activity)) setTierActivity(activity)
    else if (isRatingGoal(activity)) setNoteActivity(activity)
    else if (isDurationGoal(activity) || activity.difficulty === '困难' || activity.difficulty === 'Boss') setNoteActivity(activity)
    else void finishActivity(activity)
  }

  async function undoLast() {
    if (!feedback) return
    try {
      if (feedback.incremental && feedback.activityId) await undoLatestIncrementalProgress(feedback.activityId)
      else await undoCompletion(feedback.completionId)
      setFeedback(null)
      await refresh()
      setNotice('已撤销，本次成长已用修正流水抵消')
    } catch (error) {
      setErrorNotice(errorMessage(error))
    }
  }

  return {
    page,
    setPage,
    secondaryPage,
    setSecondaryPage,
    snapshot,
    ready,
    notice,
    setNotice,
    setErrorNotice,
    createOpen,
    setCreateOpen,
    noteActivity,
    setNoteActivity,
    tierActivity,
    setTierActivity,
    goalActivity,
    setGoalActivity,
    completionActivity,
    setCompletionActivity,
    durationActivity,
    setDurationActivity,
    weeklyDetailActivity,
    setWeeklyDetailActivity,
    archiveActivity,
    setArchiveActivity,
    deleteActivity,
    setDeleteActivity,
    activityManagerOpen,
    setActivityManagerOpen,
    seasonHubOpen,
    setSeasonHubOpen,
    seasonHubInitialView,
    setSeasonHubInitialView,
    feedback,
    setFeedback,
    knowledgePackagePreview,
    setKnowledgePackagePreview,
    knowledgePackageImporting,
    openKnowledgePackagePreview,
    confirmKnowledgePackageImport,
    refresh,
    preferences,
    stats,
    level,
    metaSetting,
    levelSystem,
    journeyMonths,
    rewardSystem,
    targetRewardId,
    gameDayBoundaryActivatedAt,
    growthDomainSystem,
    coachDraft,
    applicationTrial,
    applicationTrialRestart,
    targetReward,
    pendingRewardClaim,
    rewardPriceSuggestions,
    activeSeason,
    characterNeedsAttention,
    today,
    todayActionPriorityIds,
    currentIncrementalGoal,
    growthDomainCandidates,
    activeCompletion,
    keyActivities,
    dailyHabits,
    weeklyHabits,
    tasks,
    reviewActivities,
    finishActivity,
    finishIncremental,
    requestCompletion,
    undoLast,
  }
}
