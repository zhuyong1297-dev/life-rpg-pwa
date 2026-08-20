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
import type { TravelerAppearance } from '../domain'
import { travelerAssetUrl } from '../traveler'
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

export const assetUrl = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`
export function ProgressBar({ value, label, compact = false }: { value: number; label: string; compact?: boolean }) {
  const percent = Math.max(0, Math.min(100, value * 100))
  return (
    <div className={compact ? 'progress-wrap compact' : 'progress-wrap'}>
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{ width: `${percent}%` }} /></div>
      <span>{label}</span>
    </div>
  )
}

export function TravelerPortrait({ stage, label, appearance = 'masculine' }: { stage: number; label: string; appearance?: TravelerAppearance }) {
  return (
    <span
      className="traveler-portrait"
      style={{ backgroundImage: `url("${travelerAssetUrl(stage, appearance)}")`, backgroundPosition: 'center', backgroundSize: 'contain' }}
      role="img"
      aria-label={label}
    />
  )
}

export function SettingToggle({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: () => void }) {
  return <label className="setting-toggle"><span>{icon}<strong>{label}</strong></span><input type="checkbox" role="switch" checked={checked} onChange={onChange} /></label>
}

export function scheduleLabel(activity: Activity) {
  const goal = activity.goal
  if (goal.kind === 'rating') return `每天 · 评分 1–${goal.scale}`
  if (goal.kind === 'tiered') {
    const tiers = getTierLevels(goal).map((tier) => `${tierLabels[tier]} ${formatTierGoalValue(goal, tier)}`).join(' · ')
    return activity.schedule.kind === 'weekly' ? `每周 ${activity.schedule.times} 次 · ${tiers}` : `每天 · ${tiers}`
  }
  const duration = goal.kind === 'duration' || goal.unit === '分钟'
  if (activity.schedule.kind === 'daily') return duration ? `每天 · 目标 ${goal.count} 分钟` : `每天 ${goal.count}${goal.unit}`
  if (activity.schedule.kind === 'weekly') return duration ? `每周 ${activity.schedule.times} 次 · 每次 ${goal.count} 分钟` : `每周 ${activity.schedule.times} 次`
  return activity.plannedOn ? formatShortDate(activity.plannedOn) : '单次'
}

export function activityFrequencyLabel(activity: Activity) {
  if (activity.schedule.kind === 'daily') return '每天'
  if (activity.schedule.kind === 'weekly') return `每周 ${activity.schedule.times} 次`
  return activity.plannedOn ? `计划 ${formatShortDate(activity.plannedOn)}` : '一次性任务'
}

export function activityGoalLabel(activity: Activity) {
  const goal = activity.goal
  if (goal.kind === 'rating') return `评分体验 · ${goal.prompt}`
  if (goal.kind === 'tiered') {
    return getTierLevels(goal).map((tier) => `${tierLabels[tier]} ${formatTierGoalValue(goal, tier)}`).join(' · ')
  }
  const duration = goal.kind === 'duration' || goal.unit === '分钟'
  return `目标 ${goal.count}${duration ? ' 分钟' : goal.unit}`
}

export function formatIncrementalSummary(progress: ReturnType<typeof calculateIncrementalProgress>) {
  if (progress.maxReached) {
    const time = progress.totalDurationSeconds > 0 ? ` · ${formatDurationSeconds(progress.totalDurationSeconds)}` : ''
    return `本周已完成 · ${progress.totalCount} 次${time}`
  }
  const tier = progress.nextTier ?? getTierLevels(progress.goal).at(-1)!
  if (progress.goal.metric === 'count') {
    const threshold = progress.goal.thresholds[tier - 1]
    return `距离${tierLabels[tier]}层：${progress.totalCount}/${threshold}${progress.goal.unit}`
  }
  const threshold = progress.goal.thresholds[tier - 1]
  if (progress.goal.mode === 'per_occurrence') {
    return `${tierLabels[tier]}层：${progress.qualifiedCounts[tier] ?? 0}/${threshold.count} 次达到每次 ${formatDurationSeconds(threshold.durationSeconds)}`
  }
  return `本周 ${progress.totalCount}/${threshold.count} 次 · ${formatDurationSeconds(progress.totalDurationSeconds)}/${formatDurationSeconds(threshold.durationSeconds)}`
}

export function formatChineseDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00`))
}

export function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function shareJsonWithFallback(name: string, value: unknown): Promise<'shared' | 'downloaded'> {
  const content = JSON.stringify(value, null, 2)
  const file = new File([content], name, { type: 'application/json' })
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ files: [file], title: name })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared'
    }
  }
  downloadFile(name, content, 'application/json')
  return 'downloaded'
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试'
}


export const domainIcons: Record<GrowthDomain, typeof Dumbbell> = {
  health: Dumbbell,
  learning: BookOpen,
  creation: Brain,
  career: ClipboardCheck,
  life: Home,
  mindset: Leaf,
}

export function DomainMark({ domain }: { domain: GrowthDomain }) {
  const Icon = domainIcons[domain]
  return <span className={`attribute-mark domain-${domain}`}><Icon aria-hidden="true" />{domainLabel(domain)}</span>
}
