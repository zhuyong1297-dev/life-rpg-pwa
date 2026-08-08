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

import type { Snapshot } from './model'
import { DomainMark, formatShortDate, ProgressBar, TravelerPortrait } from './shared-ui'

export function CharacterPage({
  stats,
  level,
  ledgerEvents,
  completions,
  today,
  levelSystem,
  rewards,
  targetRewardId,
  onAcknowledge,
  onOpenRewards,
}: {
  stats: ReturnType<typeof calculateStats>
  level: ReturnType<typeof getLevel>
  ledgerEvents: LedgerEvent[]
  completions: Completion[]
  today: string
  levelSystem?: LevelSystem
  rewards: Snapshot['rewards']
  targetRewardId?: string
  onAcknowledge: (level: number, focusDomain: GrowthDomain) => void
  onOpenRewards: () => void
}) {
  const [routeOpen, setRouteOpen] = useState(false)
  const [journeyOpen, setJourneyOpen] = useState(false)
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
  const pendingVoucher = milestones.find((milestone) => milestone.voucherMaxCost && !milestone.claimedAt && !milestone.reservedClaimId)
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
  return (
    <div className="character-page">
      <header className="page-header"><div><p className="eyebrow">角色 · 成长总览</p><h1>旅者档案</h1><p className="page-lead">现实中的每一次行动，都在这里留下成长。</p></div></header>
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
        <button className="feature-summary shop-summary" type="button" onClick={onOpenRewards} aria-label="查看奖励愿望">
          <span className="feature-summary-icon"><Coins aria-hidden="true" /></span>
          <span className="feature-summary-copy">
            <small>奖励愿望 · {stats.coins} 金币</small>
            <strong>{targetReward ? targetReward.title : '选择一个真正期待的愿望'}</strong>
            <span>{targetReward ? (stats.coins >= targetReward.cost ? '现在可以锁定' : `${stats.coins} / ${targetReward.cost} · 还差 ${targetReward.cost - stats.coins} 金币`) : '建立主目标和候选队列'}</span>
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
                const state = milestone?.claimedAt ? 'claimed' : milestone?.reservedClaimId ? 'reserved' : milestone ? 'claimable' : 'locked'
                return (
                  <article className={`milestone-row milestone-${state}`} key={routeLevel}>
                    <span className="milestone-node" aria-hidden="true">{state === 'claimed' ? <Check aria-hidden="true" /> : routeLevel}</span>
                    <div className="milestone-main">
                      <div><strong>Lv.{routeLevel} · {voucherCost} 金币档礼券</strong><span>{getTotalXpForLevel(routeLevel)} 累计 XP</span></div>
                      <p>{milestone ? (milestone.claimedAt ? '已领取 · 永久保留记录' : milestone.reservedClaimId ? '已预留 · 兑现后正式领取' : '已达到 · 可以预留') : `还需 ${Math.max(0, getTotalXpForLevel(routeLevel) - stats.totalXp)} XP`}</p>
                      {milestone?.voucherMaxCost && !milestone.claimedAt && !milestone.reservedClaimId && (
                        <button className="secondary-action" type="button" onClick={onOpenRewards}>前往奖励愿望预留</button>
                      )}
                      {milestone?.reservedClaimId && <small>已预留奖励，兑现后正式领取。</small>}
                    </div>
                    <span className="milestone-state">{state === 'claimed' ? '已领取' : state === 'reserved' ? '已预留' : state === 'claimable' ? '可预留' : '未达到'}</span>
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

    </div>
  )
}

export function GrowthEntryRow({ entry }: { entry: JourneyEntry }) {
  return (
    <div className={`growth-row growth-${entry.kind}`}>
      <span className="growth-icon">{entry.kind === 'action' ? <ActivityIcon aria-hidden="true" /> : <Gift aria-hidden="true" />}</span>
      <div><strong>{entry.title}</strong><span>{formatShortDate(entry.occurredOn)}{entry.domain ? ` · ${domainLabel(entry.domain)}` : entry.attribute ? ` · ${entry.attribute} · 旧体系` : ''}{entry.tier ? ` · ${tierLabels[entry.tier]}` : ''}</span></div>
      <b>{entry.kind === 'action' ? `+${entry.xp} XP${entry.coins ? ` · +${entry.coins}` : ''}` : '里程碑'}</b>
    </div>
  )
}

export function ActionLogModal({ months, today, onClose }: { months: JourneyMonth[]; today: string; onClose: () => void }) {
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

export function JourneyEntryDetails({ entry }: { entry: JourneyEntry }) {
  if (entry.kind !== 'action') return <article className="journey-milestone"><Gift aria-hidden="true" /><div><strong>{entry.title}</strong><span>永久里程碑</span></div></article>
  const hasDetails = Boolean(entry.note || entry.ratingValue || entry.durationMinutes || entry.durationSeconds || entry.count || (entry.tier && entry.tierGoalSnapshot))
  const classification = entry.domain ? domainLabel(entry.domain) : entry.attribute ? `${entry.attribute} · 旧体系` : '未分类'
  const main = <div className="journey-entry-main"><div><strong>{entry.title}</strong><span>{entry.progressLabel ?? classification}{entry.tier ? ` · ${tierLabels[entry.tier]}层` : ''}</span></div><b>{entry.xp > 0 || entry.coins > 0 ? `+${entry.xp} XP · +${entry.coins}` : '进度已记录'}</b></div>
  if (!hasDetails) return <article className="journey-entry">{main}</article>
  return <details className="journey-entry"><summary>{main}</summary><div className="journey-entry-details">{entry.ratingValue && <p>{entry.ratingGoalSnapshot?.prompt ?? '最终评分'}：{entry.ratingValue}/5</p>}{entry.note && <p>{entry.ratingGoalSnapshot?.notePrompt ?? '成果'}：{entry.note}</p>}{entry.durationMinutes && <p>实际时长：{entry.durationMinutes} 分钟</p>}{entry.durationSeconds && <p>当日累计时长：{formatDurationSeconds(entry.durationSeconds)}</p>}{entry.count && <p>当日完成次数：{entry.count}</p>}{entry.tier && entry.tierGoalSnapshot && <p>已达标准：{formatTierGoalValue(entry.tierGoalSnapshot, entry.tier)}</p>}</div></details>
}
