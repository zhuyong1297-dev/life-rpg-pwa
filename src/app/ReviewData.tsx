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
  getHabitFormationReview,
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

import { RatingGoalFields } from './ActivityForms'
import { buildRatingGoal, displayVersion, type RatingGoalDraft, type ReviewDraft, type Snapshot } from './model'
import { activityGoalLabel, downloadFile, errorMessage, formatShortDate, ProgressBar, shareJsonWithFallback } from './shared-ui'
export function ReviewPage({
  activities,
  completions,
  reviews,
  today,
  season,
  applicationTrial,
  applicationTrialRestart,
  onOpenSeason,
  onCompleteTrial,
  onPrepareTrialRestart,
  onActivateTrialRestart,
  onSave,
}: {
  activities: Activity[]
  completions: Snapshot['completions']
  reviews: Snapshot['weeklyReviews']
  today: string
  season?: Snapshot['seasons'][number]
  applicationTrial?: ApplicationTrial
  applicationTrialRestart?: ApplicationTrialRestart
  onOpenSeason: () => void
  onCompleteTrial: (
    trial: ApplicationTrial,
    observedOutcome: string,
    decision: ApplicationDecision,
    decisionReason: string,
  ) => Promise<void>
  onPrepareTrialRestart: (trial: ApplicationTrial, activityId: string, goal: RatingGoal) => Promise<void>
  onActivateTrialRestart: () => Promise<void>
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
    const incrementalGoal = getIncrementalCycleGoal(activity, matchingCompletions, weekStart)
    const incremental = incrementalGoal ? calculateIncrementalProgress(incrementalGoal, matchingCompletions) : undefined
    const completed = incremental ? incremental.totalCount : new Set(matchingCompletions.map((completion) => completion.occurredOn)).size
    const standard = incrementalGoal?.thresholds[1]
    const planned = incrementalGoal ? (typeof standard === 'number' ? standard : standard!.count) : activity.schedule.kind === 'daily' ? 7 : activity.schedule.kind === 'weekly' ? activity.schedule.times : 1
    const actualDurationMinutes = incremental ? Math.floor(incremental.totalDurationSeconds / 60) : matchingCompletions.reduce((total, completion) => total + (completion.durationMinutes ?? 0), 0)
    const plannedDurationMinutes = incrementalGoal?.metric === 'combined'
      ? (() => {
        const combinedStandard = incrementalGoal.thresholds[1]
        return Math.ceil((incrementalGoal.mode === 'per_occurrence' ? combinedStandard.count * combinedStandard.durationSeconds : combinedStandard.durationSeconds) / 60)
      })()
      : isDurationGoal(activity) ? planned * activity.goal.count : undefined
    const tierCount = Math.max(
      isTieredGoal(activity) ? getTierCount(activity.goal) : 2,
      ...matchingCompletions.map((completion) => completion.tierGoalSnapshot ? getTierCount(completion.tierGoalSnapshot) : 2),
    ) as 2 | 3
    const reviewTiers = tierLevels.slice(0, tierCount)
    const tierCounts = (incremental
      ? reviewTiers.map((tier) => incremental.highestTier === tier ? 1 : 0)
      : reviewTiers.map((tier) => matchingCompletions.filter((completion) => completion.tier === tier).length)) as [number, number] | [number, number, number]
    const achievement = incremental ? {
      count: incremental.totalCount,
      durationSeconds: incremental.totalDurationSeconds,
      countUnit: incremental.goal.metric === 'count' ? incremental.goal.unit : incremental.goal.countUnit,
    } : matchingCompletions.reduce(
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
      {applicationTrial && (
        <ApplicationTrialReviewPanel
          trial={applicationTrial}
          completions={completions}
          pendingRestart={applicationTrialRestart}
          today={today}
          onComplete={onCompleteTrial}
          onPrepareRestart={onPrepareTrialRestart}
          onActivateRestart={onActivateTrialRestart}
        />
      )}
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
            const formationReview = getHabitFormationReview(activity, completions, today)
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
                {formationReview && (
                  <div className="habit-formation-review compact">
                    <span>启动锚点建议</span>
                    <strong>首七日完成 {formationReview.completedDays}/7 天 · 当前：{formationReview.anchorLabel}</strong>
                    <p>可在活动管理中换时间、现实事件或前置行动，也可以缩小基础层；系统不会自动修改。</p>
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
export function RatingControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
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

export function ApplicationTrialReviewPanel({
  trial,
  completions,
  pendingRestart,
  today,
  onComplete,
  onPrepareRestart,
  onActivateRestart,
}: {
  trial: ApplicationTrial
  completions: Completion[]
  pendingRestart?: ApplicationTrialRestart
  today: string
  onComplete: (
    trial: ApplicationTrial,
    observedOutcome: string,
    decision: ApplicationDecision,
    decisionReason: string,
  ) => Promise<void>
  onPrepareRestart: (trial: ApplicationTrial, activityId: string, goal: RatingGoal) => Promise<void>
  onActivateRestart: () => Promise<void>
}) {
  const [observedOutcome, setObservedOutcome] = useState('')
  const [decision, setDecision] = useState<ApplicationDecision>('continue')
  const [decisionReason, setDecisionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [restartOpen, setRestartOpen] = useState(false)
  const [restartActivityId, setRestartActivityId] = useState(trial.focusActivities[0]?.activityId ?? '')
  const [ratingDraft, setRatingDraft] = useState<RatingGoalDraft>({
    prompt: '今天醒来后的睡眠恢复感如何？',
    low: '很差，几乎没有恢复',
    middle: '一般',
    high: '很好，醒来精力充足',
    notePrompt: '主要影响因素',
  })
  const [restartSubmitting, setRestartSubmitting] = useState(false)
  const ratingEvidence = trial.focusActivities.flatMap((activity) => {
    if (activity.goal.kind !== 'rating') return []
    const records = completions.filter((completion) =>
      completion.activityId === activity.activityId
      && completion.status === 'active'
      && completion.ratingValue !== undefined
      && completion.occurredOn >= trial.startsOn
      && completion.occurredOn <= trial.endsOn)
    const recordedDays = new Set(records.map((completion) => completion.occurredOn)).size
    const values = records.map((completion) => completion.ratingValue!)
    return [{
      activity,
      recordedDays,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined,
      sufficient: recordedDays >= 5,
    }]
  })

  async function finishTrial() {
    if (!observedOutcome.trim() || !decisionReason.trim() || submitting) return
    setSubmitting(true)
    try {
      await onComplete(trial, observedOutcome, decision, decisionReason)
      setObservedOutcome('')
      setDecisionReason('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="application-review-card">
      <div className="section-heading">
        <div><span>知识应用试跑</span><h2>{trial.title}</h2></div>
        <b>{trial.status === 'active' ? `${trial.startsOn} — ${trial.endsOn}` : '已完成人工判断'}</b>
      </div>
      <p><b>主原则：</b>{trial.knowledge.primary.title}</p>
      <p><b>现实指标：</b>{trial.outcomeIndicator}</p>
      {ratingEvidence.map((evidence) => (
        <div className="application-rating-evidence" key={evidence.activity.activityId}>
          <span><strong>{evidence.activity.title}</strong><small>评分覆盖率 {evidence.recordedDays}/7</small></span>
          <b>{evidence.average === undefined ? '暂无评分' : `平均 ${evidence.average.toFixed(1)}/5`}</b>
          <small>{evidence.sufficient ? '证据较充分' : '数据不足，仍可参考但不能自动判断结果'}</small>
        </div>
      ))}
      {trial.status === 'active' && pendingRestart?.sourceTrialId === trial.id && (
        <div className="application-restart-status">
          <strong>修正方案已准备</strong>
          <p>旧 XP、金币和历史不会改变。新行为会使用新的 ID，从启动日重新计算 7 天证据。</p>
          <button className="primary-action" type="button" disabled={restartSubmitting || today < pendingRestart.notBefore} onClick={() => {
            setRestartSubmitting(true)
            void onActivateRestart().finally(() => setRestartSubmitting(false))
          }}><RotateCcw aria-hidden="true" />{today < pendingRestart.notBefore ? `${pendingRestart.notBefore} 04:00 后可启动` : restartSubmitting ? '正在启动…' : '一键开始新的 7 天试跑'}</button>
        </div>
      )}
      {trial.status === 'active' && !pendingRestart && (
        <details className="application-restart-editor" open={restartOpen} onToggle={(event) => setRestartOpen(event.currentTarget.open)}>
          <summary>修正规划并重新开始</summary>
          <p>先明确选择哪一项行为改为评分体验；另一项保持原目标。保存今天不改数据，明天 04:00 后再由你启动。</p>
          <label className="full-field">改为评分的行为
            <select value={restartActivityId} onChange={(event) => setRestartActivityId(event.target.value)}>
              {trial.focusActivities.map((activity) => <option value={activity.activityId} key={activity.activityId}>{activity.title}</option>)}
            </select>
          </label>
          <RatingGoalFields value={ratingDraft} onChange={setRatingDraft} />
          <div className="application-restart-preview">
            {trial.focusActivities.map((activity) => (
              <div key={activity.activityId}>
                <strong>{activity.title}</strong>
                <span>{activity.activityId === restartActivityId ? `评分体验 · ${ratingDraft.prompt}` : activityGoalLabel({
                  ...activity,
                  id: activity.activityId,
                  type: 'habit',
                  isKey: true,
                  enabled: true,
                  revision: 1,
                  createdAt: trial.createdAt,
                })}</span>
              </div>
            ))}
          </div>
          <button className="secondary-action" type="button" disabled={restartSubmitting || !restartActivityId} onClick={() => {
            setRestartSubmitting(true)
            void onPrepareRestart(trial, restartActivityId, buildRatingGoal(ratingDraft)).finally(() => setRestartSubmitting(false))
          }}><ShieldCheck aria-hidden="true" />{restartSubmitting ? '保存中…' : '保存待启动方案'}</button>
        </details>
      )}
      {trial.status === 'completed' ? (
        <div className="application-review-result">
          <strong>7 天结果：{trial.decision === 'continue' ? '继续' : trial.decision === 'adjust' ? '调整' : '停止'}</strong>
          <span>{trial.observedOutcome}</span>
        </div>
      ) : today < trial.endsOn ? (
        <p className="empty-state">试跑需运行完整七个游戏日。到 {trial.endsOn} 后，在这里根据现实变化作出继续、调整或停止的判断。</p>
      ) : (
        <div className="season-inline-editor season-complete-form">
          <label>{trial.outcomeIndicator}<textarea required maxLength={500} value={observedOutcome} onChange={(event) => setObservedOutcome(event.target.value)} placeholder="记录实际状态或数值，不要写 XP 或金币" /></label>
          <div className="segmented-control" aria-label="试跑决定">
            {applicationDecisions.map((item) => (
              <button type="button" className={decision === item ? 'selected' : ''} key={item} onClick={() => setDecision(item)}>
                {item === 'continue' ? '继续' : item === 'adjust' ? '调整' : '停止'}
              </button>
            ))}
          </div>
          <label>决定理由<textarea required maxLength={500} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="为什么继续、调整或停止？" /></label>
          <button className="primary-action" type="button" disabled={submitting || !observedOutcome.trim() || !decisionReason.trim()} onClick={() => void finishTrial().catch(() => undefined)}>
            <ClipboardCheck aria-hidden="true" />{submitting ? '正在保存…' : '保存人工判断'}
          </button>
        </div>
      )}
    </section>
  )
}

export function ApplicationExchangePanel({
  trial,
  seasons,
  activities,
  completions,
  onNotice,
}: {
  trial?: ApplicationTrial
  seasons: Snapshot['seasons']
  activities: Activity[]
  completions: Completion[]
  onNotice: (message: string) => void
}) {
  const activeSeason = seasons.find((season) => season.status === 'active')
  const latestApplicationSeason = [...seasons]
    .filter((season) => season.status === 'completed' && season.applicationContext)
    .sort((left, right) => (right.concludedOn ?? right.endsOn).localeCompare(left.concludedOn ?? left.endsOn))[0]

  async function exportPlanningContext() {
    const context = createPlanningContextPackage(trial, activeSeason, activities)
    const method = await shareJsonWithFallback(planningContextFilename(), context)
    onNotice(method === 'shared' ? '规划上下文已打开系统分享' : '规划上下文 JSON 已下载')
  }

  async function exportTrialResult() {
    if (!trial) return
    const result = createTrialResultPackage(trial)
    const method = await shareJsonWithFallback(applicationResultFilename(result), result)
    onNotice(method === 'shared' ? '7 天结果包已打开系统分享' : '7 天结果包 JSON 已下载')
  }

  async function exportSeasonResult() {
    if (!latestApplicationSeason) return
    const result = createSeasonResultPackage(latestApplicationSeason, completions)
    const method = await shareJsonWithFallback(applicationResultFilename(result), result)
    onNotice(method === 'shared' ? '28 天结果包已打开系统分享' : '28 天结果包 JSON 已下载')
  }

  return (
    <div className="application-exchange-list">
      <button className="data-center-row" type="button" onClick={() => void exportPlanningContext()}>
        <span className="feature-summary-icon"><Download aria-hidden="true" /></span>
        <span><strong>导出规划上下文</strong><small>当前阶段与关键行为定义，不包含每日流水、XP、金币或愿望。</small></span>
        <ChevronRight aria-hidden="true" />
      </button>

      {trial?.status === 'completed' && (
        <button className="data-center-row" type="button" onClick={() => void exportTrialResult()}>
          <span className="feature-summary-icon"><ClipboardCheck aria-hidden="true" /></span>
          <span>
            <strong>导出最近 7 天结果</strong>
            <small>{trial.title} · {trial.decision === 'continue' ? '继续' : trial.decision === 'adjust' ? '调整' : '停止'}</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
      )}

      {latestApplicationSeason && (
        <button className="data-center-row" type="button" onClick={() => void exportSeasonResult()}>
          <span className="feature-summary-icon"><CalendarDays aria-hidden="true" /></span>
          <span>
            <strong>导出最近赛季结果</strong>
            <small>{latestApplicationSeason.title} · {latestApplicationSeason.finalResult}</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export function DataCenterPage({
  snapshot,
  applicationTrial,
  onBack,
  onKnowledgePackageFile,
  onRefresh,
  onNotice,
}: {
  snapshot: Snapshot
  applicationTrial?: ApplicationTrial
  onBack: () => void
  onKnowledgePackageFile: (file?: File) => void
  onRefresh: () => Promise<void>
  onNotice: (message: string) => void
}) {
  const [restorePreview, setRestorePreview] = useState<BackupRestorePreview>()
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const meta = snapshot.settings.find((setting) => setting.key === 'meta')
  const lastBackupAt = meta?.key === 'meta' ? meta.value.lastBackupAt : undefined

  async function exportJson() {
    const storedMeta = await db.settings.get('meta')
    await db.settings.put({ key: 'meta', value: { ...(storedMeta?.key === 'meta' ? storedMeta.value : {}), lastBackupAt: new Date().toISOString() } })
    const backup = await createBackup()
    downloadFile(`earth-online-backup-${localDate()}.json`, JSON.stringify(backup, null, 2), 'application/json')
    await onRefresh()
    onNotice('JSON 全量备份已导出')
  }

  async function exportMarkdown() {
    downloadFile(`earth-online-ledger-${localDate()}.md`, await createLedgerMarkdown(), 'text/markdown')
    onNotice('Markdown 账本已导出')
  }

  async function prepareRestore(file?: File) {
    if (!file) return
    try {
      const preview = previewBackupRestore(JSON.parse(await file.text()), snapshot)
      setRestoreConfirmed(false)
      setRestorePreview(preview)
    } catch (error) {
      setRestorePreview(undefined)
      onNotice(`备份校验失败：${errorMessage(error)}`)
    }
  }

  async function confirmRestore() {
    if (!restorePreview || !restoreConfirmed || restoring) return
    setRestoring(true)
    try {
      await restoreBackup(restorePreview.backup)
      await onRefresh()
      setRestorePreview(undefined)
      setRestoreConfirmed(false)
      onNotice('备份已校验并完整恢复')
    } catch (error) {
      onNotice(`恢复失败：${errorMessage(error)}`)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="data-center-page">
      <header className="secondary-page-header">
        <button className="secondary-back-button" type="button" onClick={onBack}><ChevronLeft aria-hidden="true" />返回</button>
        <div><p className="eyebrow">仅保存在这台设备</p><h1>数据中心</h1><p className="page-lead">备份人生数据，并与 Obsidian 交换最小必要信息。</p></div>
      </header>

      <section className="data-center-status" aria-label="本机数据状态">
        <ShieldCheck aria-hidden="true" />
        <span><strong>本地存档正常</strong><small>{lastBackupAt ? `上次完整备份：${new Date(lastBackupAt).toLocaleString('zh-CN')}` : '尚未导出完整 JSON 备份'}</small></span>
        <b>schema 12</b>
      </section>

      <section className="data-center-section">
        <div className="section-heading"><div><span>安全副本</span><h2>备份与导出</h2></div></div>
        <button className="data-center-row" type="button" onClick={() => void exportJson()}>
          <span className="feature-summary-icon"><FileJson aria-hidden="true" /></span>
          <span><strong>导出完整 JSON</strong><small>包含八张表和全部本机设置，可用于整体恢复。</small></span>
          <Download aria-hidden="true" />
        </button>
        <button className="data-center-row" type="button" onClick={() => void exportMarkdown()}>
          <span className="feature-summary-icon"><BookOpen aria-hidden="true" /></span>
          <span><strong>导出 Markdown 账本</strong><small>只用于阅读和 Obsidian 归档，不能恢复应用数据。</small></span>
          <Download aria-hidden="true" />
        </button>
      </section>

      <section className="data-center-section">
        <div className="section-heading"><div><span>最小必要交换</span><h2>Obsidian</h2></div></div>
        <ApplicationExchangePanel
          trial={applicationTrial}
          seasons={snapshot.seasons}
          activities={snapshot.activities}
          completions={snapshot.completions}
          onNotice={onNotice}
        />
        <label className="data-center-row data-center-file-row">
          <span className="feature-summary-icon"><Upload aria-hidden="true" /></span>
          <span><strong>导入 Application 行动包</strong><small>兼容 v1/v2；v3 可保留评分体验语义，且只生成规划草稿。</small></span>
          <ChevronRight aria-hidden="true" />
          <input
            type="file"
            aria-label="选择行动包"
            accept="application/json,.json"
            onChange={(event) => {
              onKnowledgePackageFile(event.target.files?.[0])
              event.currentTarget.value = ''
            }}
          />
        </label>
      </section>

      <section className="data-center-section data-center-danger">
        <div className="section-heading"><div><span>整体替换</span><h2>恢复与迁移</h2></div></div>
        <p>恢复完整 JSON 会替换当前八张表。选择文件后只进行校验和差异预览，不会立即写入。</p>
        <label className="data-center-row data-center-file-row restore-entry">
          <span className="feature-summary-icon"><Upload aria-hidden="true" /></span>
          <span><strong>选择完整备份</strong><small>行动包和 Markdown 账本不能在这里恢复。</small></span>
          <ChevronRight aria-hidden="true" />
          <input type="file" aria-label="选择完整备份" accept="application/json,.json" onChange={(event) => {
            void prepareRestore(event.target.files?.[0])
            event.currentTarget.value = ''
          }} />
        </label>
      </section>

      <footer className="version-footer"><ShieldCheck aria-hidden="true" />数据仅保存在本机 · {displayVersion}</footer>

      {restorePreview && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal feature-modal restore-preview-modal" role="dialog" aria-modal="true" aria-labelledby="restore-preview-title">
            <div className="modal-header">
              <div><span className="modal-kicker">写入前检查</span><h2 id="restore-preview-title">完整备份差异</h2></div>
              <button className="icon-button" type="button" title="关闭" onClick={() => setRestorePreview(undefined)}><X aria-hidden="true" /></button>
            </div>
            <div className="restore-preview-meta">
              <span><small>导出时间</small><strong>{new Date(restorePreview.exportedAt).toLocaleString('zh-CN')}</strong></span>
              <span><small>应用版本</small><strong>V{restorePreview.appVersion}</strong></span>
              <span><small>备份结构</small><strong>schema {restorePreview.schemaVersion}</strong></span>
            </div>
            <div className="restore-diff-table" role="table" aria-label="恢复前后数据对比">
              <div role="row"><strong role="columnheader">数据</strong><strong role="columnheader">当前</strong><strong role="columnheader">恢复后</strong></div>
              {restorePreview.metrics.map((metric) => (
                <div role="row" key={metric.key}><span role="cell">{metric.label}</span><span role="cell">{metric.current}</span><b role="cell">{metric.incoming}</b></div>
              ))}
            </div>
            <p className="restore-warning">当前数据中没有包含在该备份里的内容会被移除。恢复使用单个事务，失败时不会留下部分数据。</p>
            <label className="season-conclusion-check"><input type="checkbox" checked={restoreConfirmed} onChange={(event) => setRestoreConfirmed(event.target.checked)} />使用该备份整体替换本机数据</label>
            <div className="confirmation-actions">
              <button type="button" onClick={() => setRestorePreview(undefined)}>取消</button>
              <button className="danger-button" type="button" disabled={!restoreConfirmed || restoring} onClick={() => void confirmRestore()}>
                <Upload aria-hidden="true" />{restoring ? '正在恢复…' : '确认整体恢复'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
