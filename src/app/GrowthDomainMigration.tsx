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

import { displayVersion } from './model'
import { DomainMark, ProgressBar } from './shared-ui'
export function GrowthDomainMigration({
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
          <span className="modal-kicker">地球 Online {displayVersion}</span>
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
