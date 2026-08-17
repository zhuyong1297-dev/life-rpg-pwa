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


export type Page = 'today' | 'character' | 'review' | 'settings'
export type SecondaryPage = 'coach-plan' | 'rewards' | 'data' | 'feedback'
export type Snapshot = Awaited<ReturnType<typeof getSnapshot>>

export function routeFromHash(): { page: Page; secondary?: SecondaryPage } {
  const path = window.location.hash.replace(/^#\/?/, '')
  if (path === 'coach/plan') return { page: 'today', secondary: 'coach-plan' }
  if (path === 'rewards') return { page: 'character', secondary: 'rewards' }
  if (path === 'profile/data') return { page: 'settings', secondary: 'data' }
  if (path === 'profile/feedback') return { page: 'settings', secondary: 'feedback' }
  if (path === 'growth') return { page: 'character' }
  if (path === 'profile') return { page: 'settings' }
  if (path === 'character' || path === 'review' || path === 'settings') return { page: path }
  return { page: 'today' }
}

export function navigateTo(path: string, replace = false) {
  const url = `${window.location.pathname}${window.location.search}#/${path}`
  const state = { ...window.history.state, earthOnlineRoute: true }
  if (replace) window.history.replaceState(state, '', url)
  else window.history.pushState(state, '', url)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function navigateBackTo(path: string) {
  if (window.history.state?.earthOnlineRoute) window.history.back()
  else navigateTo(path, true)
}

export const emptySnapshot: Snapshot = {
  activities: [],
  completions: [],
  ledgerEvents: [],
  rewards: [],
  rewardClaims: [],
  weeklyReviews: [],
  seasons: [],
  settings: [],
}

export const defaultPreferences: Preferences = { notifications: false, vibration: true, sound: false, feedbackIntensity: 'clear' }

export interface AwardFeedback {
  completionId: string
  activityId?: string
  incremental?: boolean
  title: string
  domain: GrowthDomain
  xp: number
  coins: number
  durationMinutes?: number
  durationSeconds?: number
  progressLabel?: string
  tier?: TierLevel
  achievedLabel?: string
  ratingValue?: number
  ratingPrompt?: string
  upgraded?: boolean
  leveledUp?: boolean
  level: ReturnType<typeof getLevel>
  rewardGoal?: { title: string; remaining: number }
  followUp?: { kind: 'daily-signal'; seasonId: string } | { kind: 'rating-note'; activityId: string }
}

export type NoticeTone = 'info' | 'success' | 'warning' | 'error'

export interface AppNotice {
  message: string
  tone: NoticeTone
}

export interface ReviewDraft {
  impact: number
  friction: number
  decision: ReviewDecision
  note: string
}

export type StringTriple = [string, string, string]
export type StringQuad = [string, string, string, string]
export type CombinedThresholdDraft = { count: string; durationSeconds: string }

export interface TierGoalDraft {
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
  progressMode: 'direct' | 'incremental'
  durationOptionsSeconds: StringQuad
}

export interface RatingGoalDraft {
  prompt: string
  low: string
  middle: string
  high: string
  notePrompt: string
}

export function defaultRatingGoalDraft(): RatingGoalDraft {
  return {
    prompt: '今天的体验如何？',
    low: '很差',
    middle: '一般',
    high: '很好',
    notePrompt: '主要影响因素',
  }
}

export function ratingGoalDraftFromGoal(goal?: RatingGoal): RatingGoalDraft {
  return goal
    ? {
        prompt: goal.prompt,
        low: goal.anchors.low,
        middle: goal.anchors.middle,
        high: goal.anchors.high,
        notePrompt: goal.notePrompt ?? '',
      }
    : defaultRatingGoalDraft()
}

export function buildRatingGoal(draft: RatingGoalDraft): RatingGoal {
  return RatingGoalSchema.parse({
    kind: 'rating',
    scale: 5,
    prompt: draft.prompt.trim(),
    anchors: {
      low: draft.low.trim(),
      middle: draft.middle.trim(),
      high: draft.high.trim(),
    },
    notePrompt: draft.notePrompt.trim() || undefined,
  })
}

export function defaultTierGoalDraft(): TierGoalDraft {
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
    progressMode: 'direct',
    durationOptionsSeconds: ['1800', '', '', ''],
  }
}

export function tierGoalDraftFromGoal(goal: TieredGoal): TierGoalDraft {
  const draft = defaultTierGoalDraft()
  const tierCount = getTierCount(goal)
  if (goal.metric === 'count') {
    const countThresholds = [...draft.countThresholds]
    goal.thresholds.forEach((value, index) => { countThresholds[index] = String(value) })
    return { ...draft, tierCount, metric: 'count', countUnit: goal.unit, countThresholds: countThresholds as StringTriple, progressMode: goal.progressMode === 'incremental' ? 'incremental' : 'direct' }
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
    progressMode: goal.progressMode === 'incremental' ? 'incremental' : 'direct',
    durationOptionsSeconds: goal.metric === 'combined' && goal.durationOptionsSeconds
      ? [0, 1, 2, 3].map((index) => String(goal.durationOptionsSeconds?.[index] ?? '')) as StringQuad
      : draft.durationOptionsSeconds,
  }
}

export function tierGoalDraftFromLegacy(activity: Activity): TierGoalDraft {
  const draft = defaultTierGoalDraft()
  if (activity.goal.kind === 'tiered') return tierGoalDraftFromGoal(activity.goal)
  if (activity.goal.kind === 'rating') return draft
  if (isDurationGoal(activity)) return { ...draft, durationSeconds: ['', String(activity.goal.count * 60), ''] }
  return { ...draft, metric: 'count', countUnit: activity.goal.unit, countThresholds: ['', String(activity.goal.count), ''] }
}

export function buildTierGoal(draft: TierGoalDraft): TieredGoal {
  const takeTiers = <T,>(values: T[]): [T, T] | [T, T, T] => values.slice(0, draft.tierCount) as [T, T] | [T, T, T]
  if (draft.advanced) {
    const durations = draft.durationOptionsSeconds.map(Number).filter((value) => Number.isInteger(value) && value > 0)
    return {
      kind: 'tiered',
      metric: 'combined',
      mode: draft.combinedMode,
      countUnit: draft.countUnit,
      inputUnit: draft.combinedTimeUnit,
      ...(draft.progressMode === 'incremental' ? {
        progressMode: 'incremental' as const,
        defaultDurationSeconds: durations[0],
        durationOptionsSeconds: durations,
      } : {}),
      thresholds: takeTiers(draft.combinedThresholds.map((value) => ({
        count: Number(value.count),
        durationSeconds: Number(value.durationSeconds),
      }))),
    }
  }
  if (draft.metric === 'count') {
    return { kind: 'tiered', metric: 'count', unit: draft.countUnit, thresholds: takeTiers(draft.countThresholds.map(Number)), ...(draft.progressMode === 'incremental' ? { progressMode: 'incremental' as const } : {}) }
  }
  return {
    kind: 'tiered',
    metric: 'duration',
    unit: '秒',
    inputUnit: draft.timeUnit,
    thresholds: takeTiers(draft.durationSeconds.map(Number)),
  }
}

export function draftUsesIncremental(draft: TierGoalDraft, weekly: boolean) {
  return weekly && draft.progressMode === 'incremental' && (draft.advanced || draft.metric === 'count')
}

export function draftStandardCount(draft: TierGoalDraft) {
  return Number(draft.advanced ? draft.combinedThresholds[1].count : draft.countThresholds[1])
}

export function timeInputValue(seconds: string, unit: TimeInputUnit) {
  if (!seconds) return ''
  return String(Number(seconds) / (unit === '分钟' ? 60 : 1))
}

export function timeInputSeconds(value: string, unit: TimeInputUnit) {
  if (!value) return ''
  return String(Number(value) * (unit === '分钟' ? 60 : 1))
}

export function activityDomainLabel(activity: Activity) {
  return activity.domain ? domainLabel(activity.domain) : `${activity.attribute ?? '未分类'} · 旧体系`
}

export const isPreview = import.meta.env.MODE === 'preview'
export const displayVersion = isPreview ? 'V5.6.0 预览版' : 'V5.6.0'
