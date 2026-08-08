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

import { RatingGoalFields, TierGoalFields } from './ActivityForms'
import { buildRatingGoal, buildTierGoal, draftStandardCount, draftUsesIncremental, ratingGoalDraftFromGoal, tierGoalDraftFromLegacy, type AwardFeedback, type RatingGoalDraft, type TierGoalDraft } from './model'
import { formatIncrementalCurrent, formatIncrementalNext, weeklyDirectCompletions, WeeklyMilestoneTrack } from './LegacyToday'
import { activityGoalLabel, formatIncrementalSummary, formatShortDate, ProgressBar, TravelerPortrait } from './shared-ui'
export function TierPickerModal({
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
export function EditHabitModal({ activity, onClose, onSave }: { activity: Activity; onClose: () => void; onSave: (input: HabitUpdate) => void }) {
  const tiered = isTieredGoal(activity)
  const rating = isRatingGoal(activity)
  const legacy = activity.goal.kind !== 'tiered' && activity.goal.kind !== 'rating' && (isDurationGoal(activity) || activity.goal.count !== 1 || activity.goal.unit !== '次')
  const [title, setTitle] = useState(activity.title)
  const [scheduledTime, setScheduledTime] = useState(activity.scheduledTime ?? '')
  const [cue, setCue] = useState(activity.cue ?? '')
  const [protocol, setProtocol] = useState(activity.protocol ?? '')
  const [domain, setDomain] = useState<GrowthDomain>(activity.domain ?? 'health')
  const [difficulty, setDifficulty] = useState<Difficulty>(activity.difficulty)
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>(activity.schedule.kind === 'weekly' ? 'weekly' : 'daily')
  const [weeklyTimes, setWeeklyTimes] = useState(activity.schedule.kind === 'weekly' ? activity.schedule.times : 3)
  const [isKey, setIsKey] = useState(activity.isKey)
  const [mode, setMode] = useState<'legacy' | 'single' | 'tiered' | 'rating'>(rating ? 'rating' : tiered ? 'tiered' : legacy ? 'legacy' : 'single')
  const [tierDraft, setTierDraft] = useState<TierGoalDraft>(() => tierGoalDraftFromLegacy(activity))
  const [ratingDraft, setRatingDraft] = useState<RatingGoalDraft>(() => ratingGoalDraftFromGoal(rating ? activity.goal : undefined))

  function submit(event: FormEvent) {
    event.preventDefault()
    const goal: Activity['goal'] = mode === 'legacy'
      ? activity.goal
      : mode === 'single'
        ? { kind: 'count', count: 1, unit: '次' }
        : mode === 'rating'
          ? buildRatingGoal(ratingDraft)
          : buildTierGoal(tierDraft)
    const nextFrequency = mode === 'rating' ? 'daily' : frequency
    onSave({
      title: title.trim(),
      scheduledTime: nextFrequency === 'daily' && scheduledTime ? scheduledTime : undefined,
      cue: cue.trim() || undefined,
      protocol: protocol.trim() || undefined,
      domain,
      difficulty,
      schedule: nextFrequency === 'daily' ? { kind: 'daily' } : { kind: 'weekly', times: draftUsesIncremental(tierDraft, mode === 'tiered') ? draftStandardCount(tierDraft) : weeklyTimes },
      goal,
      isKey,
    })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={submit} aria-labelledby="edit-habit-title">
        <div className="modal-header"><h2 id="edit-habit-title">编辑习惯</h2><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <label className="full-field">习惯名称<input required maxLength={40} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <details className="execution-details" open={Boolean(activity.scheduledTime || activity.cue || activity.protocol)}>
          <summary><span><strong>执行提示</strong><small>{scheduledTime || cue.trim() || '可选'}</small></span><Target aria-hidden="true" /></summary>
          {frequency === 'daily' && <label className="full-field">建议执行时间（可选）<input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>}
          <label className="full-field">什么时候开始<input maxLength={80} value={cue} onChange={(event) => setCue(event.target.value)} /></label>
          <label className="full-field">怎样执行<textarea maxLength={280} value={protocol} onChange={(event) => setProtocol(event.target.value)} /></label>
        </details>
        <div className="field-grid">
          <label>成长领域<select value={domain} onChange={(event) => setDomain(event.target.value as GrowthDomain)}>{growthDomains.map((value) => <option key={value} value={value}>{domainLabel(value)}</option>)}</select></label>
          <label>难度<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>{difficulties.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <p className="domain-definition"><strong>{growthDomainDetails[domain].description}</strong><span>例如：{growthDomainDetails[domain].examples}</span></p>
        <div className="field-grid">
          <label>频率<select value={mode === 'rating' ? 'daily' : frequency} disabled={mode === 'rating'} onChange={(event) => setFrequency(event.target.value as 'daily' | 'weekly')}><option value="daily">每天</option><option value="weekly">每周 N 次</option></select></label>
          {frequency === 'weekly' && mode !== 'rating' && <label>每周次数<input type="number" min={1} max={draftUsesIncremental(tierDraft, mode === 'tiered') ? 999 : 7} required value={draftUsesIncremental(tierDraft, mode === 'tiered') ? draftStandardCount(tierDraft) : weeklyTimes} disabled={draftUsesIncremental(tierDraft, mode === 'tiered')} onChange={(event) => setWeeklyTimes(Number(event.target.value))} /></label>}
        </div>
        <span className="form-section-label">目标设置</span>
        <div className="segmented-control" aria-label="目标设置">
          {legacy && <button type="button" className={mode === 'legacy' ? 'selected' : ''} onClick={() => setMode('legacy')}>保留原目标</button>}
          <button type="button" className={mode === 'single' ? 'selected' : ''} onClick={() => setMode('single')}>单次完成</button>
          <button type="button" className={mode === 'tiered' ? 'selected' : ''} onClick={() => setMode('tiered')}>分层目标</button>
          <button type="button" className={mode === 'rating' ? 'selected' : ''} onClick={() => { setMode('rating'); setFrequency('daily') }}>评分体验</button>
        </div>
        {mode === 'legacy' && activity.goal.kind !== 'tiered' && activity.goal.kind !== 'rating' && <p className="legacy-goal">当前目标：{activity.goal.count}{activity.goal.unit}</p>}
        {mode === 'tiered' && (
          <TierGoalFields value={tierDraft} weekly={frequency === 'weekly'} onChange={setTierDraft} />
        )}
        {mode === 'rating' && <RatingGoalFields value={ratingDraft} onChange={setRatingDraft} />}
        <label className="checkbox-field"><input type="checkbox" checked={isKey} onChange={(event) => setIsKey(event.target.checked)} /><Star aria-hidden="true" />设为关键行为</label>
        <button className="primary-action" type="submit"><Check aria-hidden="true" />保存修改</button>
      </form>
    </div>
  )
}

export function IncrementalDurationPickerModal({
  activity,
  goal,
  completions,
  today,
  onClose,
  onSelect,
}: {
  activity: Activity
  goal: NonNullable<ReturnType<typeof getIncrementalCycleGoal>>
  completions: Completion[]
  today: string
  onClose: () => void
  onSelect: (seconds: number) => void
}) {
  const cycleStart = startOfWeek(new Date(`${today}T12:00:00`))
  const cycle = completions.filter((completion) => completion.activityId === activity.id && completion.progress?.cycleStart === cycleStart)
  const progress = calculateIncrementalProgress(goal, cycle)
  const options = goal.metric === 'combined' ? goal.durationOptionsSeconds ?? [] : []
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal compact-modal duration-picker-modal" role="dialog" aria-modal="true" aria-labelledby="duration-picker-title">
        <div className="modal-header"><div><span className="modal-kicker">记录本周进度</span><h2 id="duration-picker-title">{activity.title}</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <div className="duration-picker-summary"><strong>{formatIncrementalCurrent(progress)}</strong><span>{formatIncrementalNext(progress)}</span></div>
        <WeeklyMilestoneTrack goal={goal} progress={progress} directCompletions={[]} scheduleTimes={activity.schedule.kind === 'weekly' ? activity.schedule.times : 1} />
        <div className="duration-options">
          <span className="form-section-label">选择本次实际时长</span>
          {options.map((seconds) => (
            <button type="button" key={seconds} onClick={() => onSelect(seconds)}>
              <span>{formatDurationSeconds(seconds)}</span>{goal.metric === 'combined' && seconds === goal.defaultDurationSeconds && <small>常用</small>}
            </button>
          ))}
        </div>
        <p className="modal-description">打开此窗口不会记录数据；点选时长后立即记录一次并关闭。</p>
      </section>
    </div>
  )
}

export function WeeklyActivityDetailModal({
  activity,
  completions,
  today,
  onClose,
  onViewToday,
}: {
  activity: Activity
  completions: Completion[]
  today: string
  onClose: () => void
  onViewToday: () => void
}) {
  const cycle = weeklyDirectCompletions(activity, completions, today).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const todayCompletion = cycle.find((completion) => completion.occurredOn === today)
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="weekly-detail-title">
        <div className="modal-header"><div><span className="modal-kicker">本周行动详情</span><h2 id="weekly-detail-title">{activity.title}</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <div className="weekly-progress-hero"><strong>本周 {cycle.length}/{activity.schedule.kind === 'weekly' ? activity.schedule.times : 1} 次</strong><span>{activityGoalLabel(activity)}</span></div>
        {isTieredGoal(activity) && <WeeklyMilestoneTrack directCompletions={cycle} scheduleTimes={activity.schedule.kind === 'weekly' ? activity.schedule.times : 1} />}
        <div className="weekly-progress-records">
          <span className="form-section-label">有效记录</span>
          {cycle.length === 0 ? <p className="empty-state">本周还没有记录</p> : cycle.map((completion) => (
            <div key={completion.id}><span>{formatShortDate(completion.occurredOn)}</span><strong>{completion.tier ? `${tierLabels[completion.tier]}层` : '已完成'}{completion.durationMinutes ? ` · ${completion.durationMinutes} 分钟` : ''}</strong></div>
          ))}
        </div>
        {todayCompletion && <button className="secondary-action" type="button" onClick={onViewToday}><CheckCircle2 aria-hidden="true" />查看或取消今天的记录</button>}
      </section>
    </div>
  )
}

export function IncrementalProgressModal({
  activity,
  completions,
  today,
  onClose,
  onUndo,
}: {
  activity: Activity
  completions: Completion[]
  today: string
  onClose: () => void
  onUndo: () => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const cycleStart = startOfWeek(new Date(`${today}T12:00:00`))
  const cycle = completions
    .filter((completion) => completion.activityId === activity.id && completion.progress?.cycleStart === cycleStart)
    .sort((left, right) => (right.progress?.sequence ?? 0) - (left.progress?.sequence ?? 0))
  const goal = getIncrementalCycleGoal(activity, cycle, cycleStart)
  if (!goal) return null
  const progress = calculateIncrementalProgress(goal, cycle)
  const active = cycle.filter((completion) => completion.status === 'active')
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal compact-modal" aria-labelledby="weekly-progress-title">
        <div className="modal-header"><div><span className="modal-kicker">本周逐次累计</span><h2 id="weekly-progress-title">{activity.title}</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <div className="weekly-progress-hero"><strong>{formatIncrementalSummary(progress)}</strong><span>{formatShortDate(cycleStart)} 至 {formatShortDate(addDays(cycleStart, 6))}</span></div>
        <div className="weekly-tier-progress">
          {getTierLevels(goal).map((tier) => {
            const reached = Boolean(progress.highestTier && tier <= progress.highestTier)
            return <div className={reached ? 'reached' : ''} key={tier}><CheckCircle2 aria-hidden="true" /><span><strong>{tierLabels[tier]}层</strong><small>{formatTierGoalValue(goal, tier)}</small></span></div>
          })}
        </div>
        <div className="weekly-progress-records">
          <span className="form-section-label">有效记录</span>
          {active.length === 0 ? <p className="empty-state">本周还没有记录</p> : active.map((completion) => (
            <div key={completion.id}><span>{formatShortDate(completion.occurredOn)} · 第 {completion.progress!.sequence} 次{completion.progress?.imported ? ' · 由旧层次导入' : ''}</span><strong>+{completion.progress!.countDelta} 次{completion.progress?.durationSeconds ? ` · ${formatDurationSeconds(completion.progress.durationSeconds)}` : ''}</strong></div>
          ))}
        </div>
        {active.length > 0 && (!confirming ? (
          <button className="danger-action" type="button" onClick={() => setConfirming(true)}><RotateCcw aria-hidden="true" />撤销最近一次</button>
        ) : (
          <div className="cancel-confirmation" role="alert"><strong>撤销本周最近一次记录？</strong><p>只有最后一条有效进度会被撤销；如果它触发了层次奖励，系统会追加修正流水。</p><div className="confirmation-actions"><button type="button" onClick={() => setConfirming(false)}>返回</button><button className="danger-action" type="button" onClick={() => void onUndo().then(() => setConfirming(false))}>确认撤销</button></div></div>
        ))}
      </section>
    </div>
  )
}

export function CompletionActionsModal({
  activity,
  completion,
  onClose,
  onUpgrade,
  onUpdateRating,
  onCancel,
}: {
  activity: Activity
  completion: Completion
  onClose: () => void
  onUpgrade: (tier: TierLevel) => void
  onUpdateRating: (ratingValue: number, note?: string) => Promise<void>
  onCancel: () => Promise<void>
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [ratingValue, setRatingValue] = useState(completion.ratingValue ?? 3)
  const [ratingNote, setRatingNote] = useState(completion.note ?? '')
  const [savingRating, setSavingRating] = useState(false)
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
      <section className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="completion-actions-title">
        <div className="modal-header">
          <div><span className={`difficulty difficulty-${difficulty}`}>{difficulty}</span><h2 id="completion-actions-title">完成记录</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button>
        </div>
        <div className="completion-summary">
          <CheckCircle2 aria-hidden="true" />
          <div><strong>{completion.titleSnapshot ?? activity.title}</strong><span>{currentTier ? `${tierLabels[currentTier]}层 · ` : ''}+{currentReward.xp} XP / +{currentReward.coins} 金币</span></div>
        </div>
        {completion.ratingValue !== undefined && completion.ratingGoalSnapshot && (
          <div className="completion-rating-editor">
            <span className="form-section-label">{completion.ratingGoalSnapshot.prompt}</span>
            <div className="rating-score-grid" aria-label="修改今天的评分">
              {[1, 2, 3, 4, 5].map((score) => (
                <button className={ratingValue === score ? 'selected' : ''} type="button" key={score} aria-pressed={ratingValue === score} onClick={() => setRatingValue(score)}>{score}</button>
              ))}
            </div>
            <label className="full-field">{completion.ratingGoalSnapshot.notePrompt ?? '影响因素（可选）'}
              <textarea maxLength={140} value={ratingNote} onChange={(event) => setRatingNote(event.target.value)} />
            </label>
            <button className="secondary-action" type="button" disabled={savingRating || (ratingValue === completion.ratingValue && ratingNote.trim() === (completion.note ?? ''))} onClick={() => {
              setSavingRating(true)
              void onUpdateRating(ratingValue, ratingNote.trim() || undefined).finally(() => setSavingRating(false))
            }}><Check aria-hidden="true" />{savingRating ? '保存中…' : '保存评分'}</button>
          </div>
        )}
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

export function ArchiveActivityModal({ activity, onClose, onConfirm }: { activity: Activity; onClose: () => void; onConfirm: () => Promise<void> }) {
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

export function DeleteActivityModal({ activity, onClose, onConfirm }: { activity: Activity; onClose: () => void; onConfirm: () => Promise<void> }) {
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

export function CompletionModal({ activity, onClose, onComplete }: { activity: Activity; onClose: () => void; onComplete: (details: CompletionDetails) => void }) {
  const [note, setNote] = useState('')
  const [duration, setDuration] = useState('')
  if (isRatingGoal(activity)) {
    return (
      <div className="modal-backdrop" role="presentation">
        <section className="modal compact-modal rating-completion-modal" role="dialog" aria-modal="true" aria-labelledby="rating-completion-title">
          <div className="modal-header">
            <div><span className={`difficulty difficulty-${activity.difficulty}`}>评分体验</span><h2 id="rating-completion-title">{activity.goal.prompt}</h2></div>
            <button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button>
          </div>
          <div className="rating-score-grid" aria-label="选择 1 至 5 分">
            {[1, 2, 3, 4, 5].map((score) => (
              <button key={score} type="button" onClick={() => onComplete({ ratingValue: score })}>
                <strong>{score}</strong><span>分</span>
              </button>
            ))}
          </div>
          <div className="rating-anchor-copy">
            <span><b>1 分</b>{activity.goal.anchors.low}</span>
            <span><b>3 分</b>{activity.goal.anchors.middle}</span>
            <span><b>5 分</b>{activity.goal.anchors.high}</span>
          </div>
          <p className="field-hint">任何分数都算完成并获得同一份奖励；分数只用于观察现实变化。</p>
        </section>
      </div>
    )
  }
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

export function FeedbackOverlay({ feedback, onUndo }: { feedback: AwardFeedback; onUndo: () => void }) {
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
        <span>{feedback.leveledUp ? `角色升级 · Lv.${feedback.level.level}` : feedback.upgraded ? '委托升级' : feedback.incremental && feedback.xp === 0 ? '进度已记录' : '委托完成'}</span>
        <strong>{feedback.title}</strong>
        <div className="reward-gains">{feedback.xp > 0 && <b>+{feedback.xp} XP</b>}{feedback.coins > 0 && <b>+{feedback.coins} 金币</b>}<b>{feedback.progressLabel ?? domainLabel(feedback.domain)}</b></div>
        <div className="feedback-detail">
          {feedback.durationMinutes && <p className="feedback-duration">本次持续 {feedback.durationMinutes} 分钟</p>}
          {feedback.durationSeconds && <p className="feedback-duration">本次记录 {formatDurationSeconds(feedback.durationSeconds)}</p>}
          {feedback.tier && feedback.achievedLabel && <p className="feedback-duration">{tierLabels[feedback.tier]}层 · 至少 {feedback.achievedLabel}</p>}
          {feedback.ratingValue && <p className="feedback-duration">{feedback.ratingPrompt ?? feedback.title} {feedback.ratingValue}/5</p>}
          <p>{identityMessage(feedback.domain)}</p>
          {feedback.rewardGoal && (
            <p className="feedback-goal">
              {feedback.rewardGoal.remaining === 0
                ? `「${feedback.rewardGoal.title}」现在可以锁定`
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
