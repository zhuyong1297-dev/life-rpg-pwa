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

import { activityDomainLabel, type Page, type Snapshot } from './model'
import { activityFrequencyLabel, activityGoalLabel, DomainMark, formatChineseDate, formatIncrementalSummary, formatShortDate, ProgressBar, scheduleLabel, TravelerPortrait } from './shared-ui'
export function Navigation({
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
export function TodayPage({
  today,
  totalXp,
  level,
  levelSystem,
  coins,
  keyActivities,
  dailyHabits,
  weeklyHabits,
  tasks,
  season,
  activities,
  completions,
  activeCompletion,
  onComplete,
  onCompleted,
  onWeeklyDetails,
  onCreate,
  onOpenSeason,
  coachDraft,
  onOpenCoach,
  activeReward,
  pendingRewardClaim,
  rewardDailyCoins,
  onOpenRewards,
  travelerAppearance = 'masculine',
}: {
  today: string
  totalXp: number
  level: ReturnType<typeof getLevel>
  levelSystem?: LevelSystem
  coins: number
  keyActivities: Activity[]
  dailyHabits: Activity[]
  weeklyHabits: Activity[]
  tasks: Activity[]
  season?: Snapshot['seasons'][number]
  activities: Activity[]
  completions: Completion[]
  activeCompletion: (activity: Activity) => Completion | undefined
  onComplete: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  onWeeklyDetails: (activity: Activity) => void
  onCreate: () => void
  onOpenSeason: () => void
  coachDraft?: CoachPlanDraft
  onOpenCoach: () => void
  activeReward?: Reward
  pendingRewardClaim?: RewardClaim
  rewardDailyCoins?: number
  onOpenRewards: () => void
  travelerAppearance?: import('../domain').TravelerAppearance
}) {
  const stage = getCharacterStage(level.level)
  const cycleStart = startOfWeek(new Date(`${today}T12:00:00`))
  const completedKeys = keyActivities.filter((activity) => {
    const goal = getIncrementalCycleGoal(activity, completions, cycleStart)
    if (!goal) return Boolean(activeCompletion(activity))
    return Boolean(calculateIncrementalProgress(goal, completions.filter((completion) => completion.activityId === activity.id && completion.progress?.cycleStart === cycleStart)).highestTier)
  }).length
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
            <TodayStatusPanel today={today} stage={stage} totalXp={totalXp} level={level} levelSystem={levelSystem} coins={coins} completed={completedKeys} total={keyActivities.length} activeReward={activeReward} pendingRewardClaim={pendingRewardClaim} rewardDailyCoins={rewardDailyCoins} onOpenRewards={onOpenRewards} travelerAppearance={travelerAppearance} compact />
          </div>
          <ActivitySection
            title="关键行动"
            icon={<Star aria-hidden="true" />}
            variant="key"
            activities={keyActivities}
            completions={completions}
            today={today}
            activeCompletion={activeCompletion}
            onComplete={onComplete}
            onCompleted={onCompleted}
            onWeeklyDetails={onWeeklyDetails}
            empty="还没有关键行动。从一个真正值得坚持的行为开始。"
          />
          <ActivitySection
            title="每日行动"
            variant="regular"
            activities={dailyHabits}
            completions={completions}
            today={today}
            activeCompletion={activeCompletion}
            onComplete={onComplete}
            onCompleted={onCompleted}
            empty=""
          />
          <WeeklyProgressSection
            activities={weeklyHabits}
            completions={completions}
            today={today}
            activeCompletion={activeCompletion}
            onRecord={onComplete}
            onDetails={onWeeklyDetails}
            onCompleted={onCompleted}
          />
          <ActivitySection
            title="一次性任务"
            variant="regular"
            activities={tasks}
            completions={completions}
            today={today}
            activeCompletion={activeCompletion}
            onComplete={onComplete}
            onCompleted={onCompleted}
            empty=""
          />
        </section>
        <aside className="today-sidebar" aria-label="角色状态">
          <TodayStatusPanel today={today} stage={stage} totalXp={totalXp} level={level} levelSystem={levelSystem} coins={coins} completed={completedKeys} total={keyActivities.length} activeReward={activeReward} pendingRewardClaim={pendingRewardClaim} rewardDailyCoins={rewardDailyCoins} onOpenRewards={onOpenRewards} travelerAppearance={travelerAppearance} />
          <button className="primary-action sidebar-create" type="button" onClick={onCreate}><Plus aria-hidden="true" />创建行动</button>
          <p className="sidebar-note"><ShieldCheck aria-hidden="true" />成长记录仅保存在本机</p>
        </aside>
      </div>
    </div>
  )
}

export function TodayStatusPanel({
  today,
  stage,
  totalXp,
  level,
  levelSystem,
  coins,
  completed,
  total,
  activeReward,
  pendingRewardClaim,
  rewardDailyCoins,
  onOpenRewards,
  travelerAppearance = 'masculine',
  compact = false,
}: {
  today: string
  stage: number
  totalXp: number
  level: ReturnType<typeof getLevel>
  levelSystem?: LevelSystem
  coins: number
  completed: number
  total: number
  activeReward?: Reward
  pendingRewardClaim?: RewardClaim
  rewardDailyCoins?: number
  onOpenRewards: () => void
  travelerAppearance?: import('../domain').TravelerAppearance
  compact?: boolean
}) {
  const keyProgress = total > 0 ? completed / total : 0
  const pendingVoucher = levelSystem?.milestones.find((milestone) => milestone.voucherMaxCost && !milestone.claimedAt && !milestone.reservedClaimId)
  const nextRewardLevel = pendingVoucher?.level ?? getNextVoucherLevel(level.level)
  const nextRewardCost = pendingVoucher?.voucherMaxCost ?? getMilestoneVoucherCost(nextRewardLevel)
  const rewardXpRemaining = Math.max(0, getTotalXpForLevel(nextRewardLevel) - totalXp)
  if (compact) {
    return (
      <section className="status-strip" aria-label="今日旅者状态">
        <span className="status-strip-portrait"><TravelerPortrait stage={stage} appearance={travelerAppearance} label={`Lv.${level.level} 像素旅者`} /></span>
        <div className="status-strip-copy">
          <span>旅者状态</span>
          <strong>Lv.{level.level} · {level.current}/{level.needed} XP</strong>
          <ProgressBar value={level.progress} label="" compact />
        </div>
        <dl className="status-strip-stats">
          <div><dt>金币</dt><dd>{coins}</dd></div>
          <div><dt>关键</dt><dd>{completed}/{total}</dd></div>
        </dl>
        {(pendingRewardClaim || activeReward) && (
          <button className="status-strip-reward" type="button" onClick={onOpenRewards}>
            <Gift aria-hidden="true" />
            <span>{pendingRewardClaim ? `${pendingRewardClaim.plannedFor < today ? '已到期' : '待兑现'} · ${pendingRewardClaim.titleSnapshot}` : `${activeReward!.title} · ${coins}/${activeReward!.cost}`}</span>
            <ChevronRight aria-hidden="true" />
          </button>
        )}
      </section>
    )
  }
  return (
    <section className="status-panel">
      <div className="status-identity">
        <span className="portrait-frame"><TravelerPortrait stage={stage} appearance={travelerAppearance} label={`Lv.${level.level} 像素旅者`} /></span>
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
        <button type="button" onClick={onOpenRewards}>
          {pendingRewardClaim ? (
            <><span>{pendingRewardClaim.plannedFor < today ? '奖励已到兑现日' : '待兑现奖励'}：{pendingRewardClaim.titleSnapshot}</span><small>计划 {pendingRewardClaim.plannedFor} · 点击查看奖励券</small></>
          ) : activeReward ? (
            <><span>当前愿望：{activeReward.title}</span><small>{coins}/{activeReward.cost} 金币{coins >= activeReward.cost ? ' · 已可锁定' : rewardDailyCoins ? ` · 预计约 ${Math.ceil((activeReward.cost - coins) / rewardDailyCoins)} 天` : ` · 还差 ${activeReward.cost - coins}`}</small></>
          ) : (
            <><span>{pendingVoucher ? '待领取奖励' : '下一奖励'}：Lv.{nextRewardLevel} · {nextRewardCost} 金币档礼券</span><small>{pendingVoucher ? '已达到，可前往奖励商店预留' : `还需 ${rewardXpRemaining} XP`}{levelSystem?.focusDomain ? ` · 当前方向：${domainLabel(levelSystem.focusDomain)}` : ''}</small></>
          )}
        </button>
      </div>
    </section>
  )
}

export function TargetMark() {
  return <Crosshair aria-hidden="true" />
}

export function ActivitySection({
  title,
  icon,
  variant,
  activities,
  completions,
  today,
  activeCompletion,
  onComplete,
  onCompleted,
  onWeeklyDetails,
  empty,
}: {
  title: string
  icon?: React.ReactNode
  variant: 'key' | 'regular'
  activities: Activity[]
  completions: Completion[]
  today: string
  activeCompletion: (activity: Activity) => Completion | undefined
  onComplete: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  onWeeklyDetails?: (activity: Activity) => void
  empty: string
}) {
  if (variant === 'regular' && activities.length === 0) return null
  return (
    <section className={`content-section activity-section activity-section-${variant}`}>
      <div className="section-heading">
        <div><h2>{icon}{title}</h2></div>
        <span>{activities.length}</span>
      </div>
      <div className={variant === 'key' ? 'mission-list' : 'activity-list'}>
        {activities.length === 0 && <div className="empty-mission"><TargetMark /><strong>设定第一项主线</strong><p>{empty}</p></div>}
        {activities.map((activity) => {
          if (variant === 'key' && activity.schedule.kind === 'weekly') {
            return <WeeklyKeyCard key={activity.id} activity={activity} completions={completions} today={today} activeCompletion={activeCompletion(activity)} onRecord={onComplete} onCompleted={onCompleted} onDetails={onWeeklyDetails ?? onCompleted} />
          }
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

export function weeklyCycleCompletions(activity: Activity, completions: Completion[], today: string) {
  const cycleStart = startOfWeek(new Date(`${today}T12:00:00`))
  const cycleEnd = addDays(cycleStart, 6)
  return completions.filter((completion) => completion.activityId === activity.id && completion.occurredOn >= cycleStart && completion.occurredOn <= cycleEnd)
}

export function weeklyDirectCompletions(activity: Activity, completions: Completion[], today: string) {
  return weeklyCycleCompletions(activity, completions, today).filter(
    (completion) => completion.status === 'active' && !completion.progress && (completion.activityRevision ?? 1) === (activity.revision ?? 1),
  )
}

export function WeeklyKeyCard({
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
  onRecord: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  onDetails: (activity: Activity) => void
}) {
  const cycleStart = startOfWeek(new Date(`${today}T12:00:00`))
  const cycle = weeklyCycleCompletions(activity, completions, today)
  const goal = getIncrementalCycleGoal(activity, cycle, cycleStart)
  const progress = goal ? calculateIncrementalProgress(goal, cycle) : undefined
  const direct = goal ? [] : weeklyDirectCompletions(activity, completions, today)
  const complete = progress?.maxReached ?? direct.length >= (activity.schedule.kind === 'weekly' ? activity.schedule.times : 1)
  const summary = progress ? formatIncrementalCurrent(progress) : `本周 ${direct.length}/${activity.schedule.kind === 'weekly' ? activity.schedule.times : 1} 次`
  const next = progress ? formatIncrementalNext(progress) : complete ? '本周计划已经完成' : `还差 ${(activity.schedule.kind === 'weekly' ? activity.schedule.times : 1) - direct.length} 次达到周计划`
  const action = progress
    ? progress.goal.metric === 'combined' ? '选择时长' : '记录一次'
    : activeCompletion ? '查看今天' : isTieredGoal(activity) ? '选择层次' : '记录今天'
  return (
    <article className={`mission-card weekly-key-card${complete ? ' complete' : ''}`}>
      <div className="activity-copy">
        <div className="mission-meta">{activity.domain && <DomainMark domain={activity.domain} />}<span className={`difficulty difficulty-${activity.difficulty}`}>{activity.difficulty}</span><span className="weekly-key-badge">每周</span></div>
        <div className="activity-title-line"><strong>{activity.title}</strong>{progress?.highestTier && <span className="tier-status">{tierLabels[progress.highestTier]}</span>}</div>
        <strong className="weekly-key-summary">{summary}</strong>
        <span className="weekly-key-next">{next}</span>
        <button className="weekly-detail-link" type="button" onClick={() => onDetails(activity)}><History aria-hidden="true" />查看本周详情</button>
      </div>
      <button className="weekly-record-button" type="button" disabled={complete} onClick={() => activeCompletion && !progress ? onCompleted(activity) : onRecord(activity)}>
        {complete ? <><Check aria-hidden="true" />本周已完成</> : <><Plus aria-hidden="true" />{action}</>}
      </button>
    </article>
  )
}

export function formatIncrementalCurrent(progress: ReturnType<typeof calculateIncrementalProgress>) {
  const finalTier = getTierLevels(progress.goal).at(-1)!
  if (progress.goal.metric === 'count') return `本周 ${progress.totalCount}/${progress.goal.thresholds[finalTier - 1]}${progress.goal.unit}`
  const finalThreshold = progress.goal.thresholds[finalTier - 1]
  if (progress.goal.mode === 'per_occurrence') return `本周已记录 ${progress.totalCount} 次 · ${formatDurationSeconds(progress.totalDurationSeconds)}`
  return `本周 ${progress.totalCount}/${finalThreshold.count} 次 · ${formatDurationSeconds(progress.totalDurationSeconds)}/${formatDurationSeconds(finalThreshold.durationSeconds)}`
}

export function formatIncrementalNext(progress: ReturnType<typeof calculateIncrementalProgress>) {
  return progress.maxReached ? '最高层已经达成' : formatIncrementalSummary(progress)
}

export function WeeklyMilestoneTrack({
  goal,
  progress,
  directCompletions,
  scheduleTimes,
}: {
  goal?: NonNullable<ReturnType<typeof getIncrementalCycleGoal>>
  progress?: ReturnType<typeof calculateIncrementalProgress>
  directCompletions: Completion[]
  scheduleTimes: number
}) {
  const directGoal = directCompletions.map((completion) => completion.tierGoalSnapshot).find(Boolean)
  const activityGoal = goal ?? directGoal
  const levels = activityGoal ? getTierLevels(activityGoal) : []
  const highestDirectTier = directCompletions.reduce<TierLevel | undefined>((highest, completion) => completion.tier && (!highest || completion.tier > highest) ? completion.tier : highest, undefined)
  const milestones = levels.length > 0
    ? levels.map((tier) => ({
      label: `${tierLabels[tier]}层`,
      target: formatTierGoalValue(activityGoal!, tier),
      reached: goal ? Boolean(progress?.highestTier && progress.highestTier >= tier) : Boolean(highestDirectTier && highestDirectTier >= tier),
    }))
    : [{ label: '周计划', target: `${scheduleTimes} 次`, reached: directCompletions.length >= scheduleTimes }]
  return (
    <div className={`weekly-milestone-track milestones-${milestones.length}`} aria-label="本周里程碑">
      {milestones.map((milestone) => (
        <div className={milestone.reached ? 'reached' : ''} key={milestone.label}>
          <span className="weekly-milestone-node">{milestone.reached ? <Check aria-hidden="true" /> : null}</span>
          <strong>{milestone.label}</strong>
          <small>{milestone.target}</small>
        </div>
      ))}
    </div>
  )
}

export function weeklyRewardSummary(
  activity: Activity,
  cycle: Completion[],
  progress: ReturnType<typeof calculateIncrementalProgress> | undefined,
  direct: Completion[],
) {
  if (progress) {
    if (!progress.highestTier) return '达到基础层后获得奖励'
    const difficulty = cycle[0]?.difficultySnapshot ?? activity.difficulty
    const reward = getTierReward(difficulty, progress.highestTier, getTierCount(progress.goal))
    return `本周已获 ${reward.xp} XP · ${reward.coins} 金币`
  }
  const earned = direct.reduce((total, completion) => {
    const difficulty = completion.difficultySnapshot ?? activity.difficulty
    const completionGoal = getCompletionTierGoal(completion, activity)
    const reward = completion.tier && completionGoal
      ? getTierReward(difficulty, completion.tier, getTierCount(completionGoal))
      : rewardTable[difficulty]
    return { xp: total.xp + reward.xp, coins: total.coins + reward.coins }
  }, { xp: 0, coins: 0 })
  return direct.length === 0 ? '完成一次即可获得对应奖励' : `本周已获 ${earned.xp} XP · ${earned.coins} 金币`
}

export function WeeklyProgressRow({
  activity,
  completions,
  today,
  activeCompletion,
  onRecord,
  onDetails,
  onCompleted,
}: {
  activity: Activity
  completions: Completion[]
  today: string
  activeCompletion?: Completion
  onRecord: (activity: Activity) => void
  onDetails: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
}) {
  const cycleStart = startOfWeek(new Date(`${today}T12:00:00`))
  const cycle = weeklyCycleCompletions(activity, completions, today)
  const goal = getIncrementalCycleGoal(activity, cycle, cycleStart)
  const progress = goal ? calculateIncrementalProgress(goal, cycle) : undefined
  const direct = goal ? [] : weeklyDirectCompletions(activity, completions, today)
  const scheduleTimes = activity.schedule.kind === 'weekly' ? activity.schedule.times : 1
  const complete = progress?.maxReached ?? direct.length >= scheduleTimes
  const summary = progress ? formatIncrementalCurrent(progress) : `本周 ${direct.length}/${scheduleTimes} 次`
  const next = progress ? formatIncrementalNext(progress) : complete ? '本周计划已经完成' : `还差 ${scheduleTimes - direct.length} 次达到周计划`
  const action = progress
    ? progress.goal.metric === 'combined' ? '选择时长' : '记录一次'
    : activeCompletion ? '查看今日记录' : isTieredGoal(activity) ? '选择层次' : '记录今天'
  return (
    <article className={`weekly-progress-item${complete ? ' complete' : ''}`}>
      <div className="weekly-progress-header">
        <div className="activity-title-line"><strong>{activity.title}</strong>{activity.isKey && <span className="weekly-key-label"><Star aria-hidden="true" />关键</span>}<span className={`difficulty difficulty-${activity.difficulty}`}>{activity.difficulty}</span></div>
        <DomainMark domain={activity.domain!} />
      </div>
      <div className="weekly-progress-copy"><strong>{summary}</strong><span>{next}</span></div>
      <WeeklyMilestoneTrack goal={goal} progress={progress} directCompletions={direct} scheduleTimes={scheduleTimes} />
      <div className="weekly-reward-status"><Award aria-hidden="true" /><span>{weeklyRewardSummary(activity, cycle, progress, direct)}</span></div>
      <div className="weekly-progress-actions">
        <button className="weekly-detail-button" type="button" onClick={() => onDetails(activity)}><History aria-hidden="true" />详情</button>
        <button className="weekly-record-button" type="button" disabled={complete} onClick={() => activeCompletion && !progress ? onCompleted(activity) : onRecord(activity)}>
          {complete ? <><Check aria-hidden="true" />本周已完成</> : <><Plus aria-hidden="true" />{action}</>}
        </button>
      </div>
    </article>
  )
}

export function WeeklyProgressSection({
  activities,
  completions,
  today,
  activeCompletion,
  onRecord,
  onDetails,
  onCompleted,
}: {
  activities: Activity[]
  completions: Completion[]
  today: string
  activeCompletion: (activity: Activity) => Completion | undefined
  onRecord: (activity: Activity) => void
  onDetails: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
}) {
  const [showAll, setShowAll] = useState(false)
  if (activities.length === 0) return null
  const renderRow = (activity: Activity) => (
    <WeeklyProgressRow key={activity.id} activity={activity} completions={completions} today={today} activeCompletion={activeCompletion(activity)} onRecord={onRecord} onDetails={onDetails} onCompleted={onCompleted} />
  )
  return (
    <section className="content-section weekly-progress-section">
      <div className="section-heading"><div><span>周一 04:00 更新</span><h2><CalendarDays aria-hidden="true" />本周进度</h2></div><span>{activities.length}</span></div>
      <div className="weekly-progress-list">{activities.slice(0, 3).map(renderRow)}</div>
      {activities.length > 3 && <button className="weekly-view-all" type="button" onClick={() => setShowAll(true)}>查看全部 {activities.length} 项<ChevronRight aria-hidden="true" /></button>}
      {showAll && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal weekly-list-modal" role="dialog" aria-modal="true" aria-labelledby="weekly-list-title">
            <div className="modal-header"><div><span className="modal-kicker">本周全部行动</span><h2 id="weekly-list-title">本周进度</h2></div><button className="icon-button" type="button" title="关闭" onClick={() => setShowAll(false)}><X aria-hidden="true" /></button></div>
            <div className="weekly-progress-list">{activities.map(renderRow)}</div>
          </section>
        </div>
      )}
    </section>
  )
}
