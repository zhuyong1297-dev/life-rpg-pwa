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

import { buildRatingGoal, buildTierGoal, defaultRatingGoalDraft, defaultTierGoalDraft, draftStandardCount, draftUsesIncremental, timeInputSeconds, timeInputValue, type RatingGoalDraft, type StringQuad, type StringTriple, type TierGoalDraft } from './model'
export function CreateActivityModal({ today, onClose, onCreate }: { today: string; onClose: () => void; onCreate: (activity: NewActivity) => void }) {
  const [type, setType] = useState<'habit' | 'task'>('habit')
  const [title, setTitle] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [cue, setCue] = useState('')
  const [protocol, setProtocol] = useState('')
  const [domain, setDomain] = useState<GrowthDomain>('health')
  const [difficulty, setDifficulty] = useState<Difficulty>('简单')
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily')
  const [weeklyTimes, setWeeklyTimes] = useState(3)
  const [goalMode, setGoalMode] = useState<'single' | 'tiered' | 'rating'>('single')
  const [tierDraft, setTierDraft] = useState<TierGoalDraft>(defaultTierGoalDraft)
  const [ratingDraft, setRatingDraft] = useState<RatingGoalDraft>(defaultRatingGoalDraft)
  const [plannedOn, setPlannedOn] = useState(today)
  const [isKey, setIsKey] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    const goal: Activity['goal'] = type === 'habit' && goalMode === 'tiered'
      ? buildTierGoal(tierDraft)
      : type === 'habit' && goalMode === 'rating'
        ? buildRatingGoal(ratingDraft)
        : { kind: 'count', count: 1, unit: '次' }
    const habitFrequency = goalMode === 'rating' ? 'daily' : frequency
    onCreate({
      title,
      scheduledTime: type === 'habit' && habitFrequency === 'daily' && scheduledTime ? scheduledTime : undefined,
      cue: type === 'habit' && cue.trim() ? cue.trim() : undefined,
      protocol: type === 'habit' && protocol.trim() ? protocol.trim() : undefined,
      type,
      domain,
      difficulty,
      goal,
      schedule: type === 'task' ? { kind: 'once' } : habitFrequency === 'daily' ? { kind: 'daily' } : { kind: 'weekly', times: draftUsesIncremental(tierDraft, goalMode === 'tiered') ? draftStandardCount(tierDraft) : weeklyTimes },
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
              <label>频率<select value={goalMode === 'rating' ? 'daily' : frequency} disabled={goalMode === 'rating'} onChange={(event) => setFrequency(event.target.value as 'daily' | 'weekly')}><option value="daily">每天</option><option value="weekly">每周</option></select></label>
              {frequency === 'weekly' && goalMode !== 'rating' && <label>每周次数<input type="number" min={1} max={draftUsesIncremental(tierDraft, goalMode === 'tiered') ? 999 : 7} value={draftUsesIncremental(tierDraft, goalMode === 'tiered') ? draftStandardCount(tierDraft) : weeklyTimes} disabled={draftUsesIncremental(tierDraft, goalMode === 'tiered')} onChange={(event) => setWeeklyTimes(Number(event.target.value))} /></label>}
            </div>
            <div className="goal-type-block">
              <span>目标类型</span>
              <div className="segmented-control" aria-label="目标类型">
                <button type="button" className={goalMode === 'single' ? 'selected' : ''} onClick={() => setGoalMode('single')}>单次完成</button>
                <button type="button" className={goalMode === 'tiered' ? 'selected' : ''} onClick={() => setGoalMode('tiered')}>分层目标</button>
                <button type="button" className={goalMode === 'rating' ? 'selected' : ''} onClick={() => { setGoalMode('rating'); setFrequency('daily') }}>评分体验</button>
              </div>
            </div>
            {goalMode === 'tiered' && (
              <TierGoalFields value={tierDraft} weekly={frequency === 'weekly'} onChange={setTierDraft} />
            )}
            {goalMode === 'rating' && <RatingGoalFields value={ratingDraft} onChange={setRatingDraft} />}
          </>
        ) : <label className="full-field">计划日期<input type="date" required value={plannedOn} onChange={(event) => setPlannedOn(event.target.value)} /></label>}
        <label className="checkbox-field"><input type="checkbox" checked={isKey} onChange={(event) => setIsKey(event.target.checked)} /><Star aria-hidden="true" />关键行为</label>
        {type === 'habit' && <details className="execution-details">
          <summary><span><strong>执行提示</strong><small>{scheduledTime || cue.trim() || '可选的时间、触发条件与行动协议'}</small></span><Target aria-hidden="true" /></summary>
          {frequency === 'daily' && <label className="full-field">建议执行时间（可选）<input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>}
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
export function RatingGoalFields({ value, onChange }: { value: RatingGoalDraft; onChange: (value: RatingGoalDraft) => void }) {
  const set = (next: Partial<RatingGoalDraft>) => onChange({ ...value, ...next })
  return (
    <div className="rating-goal-fields">
      <label className="full-field">评分问题<input required maxLength={60} value={value.prompt} onChange={(event) => set({ prompt: event.target.value })} /></label>
      <div className="rating-anchor-grid">
        <label>1 分锚点<input required maxLength={60} value={value.low} onChange={(event) => set({ low: event.target.value })} /></label>
        <label>3 分锚点<input required maxLength={60} value={value.middle} onChange={(event) => set({ middle: event.target.value })} /></label>
        <label>5 分锚点<input required maxLength={60} value={value.high} onChange={(event) => set({ high: event.target.value })} /></label>
      </div>
      <label className="full-field">备注提示（可选）<input maxLength={60} value={value.notePrompt} onChange={(event) => set({ notePrompt: event.target.value })} placeholder="例如：主要影响因素" /></label>
      <p className="field-hint">1～5 分都算完成，奖励只由难度决定；分数只用于观察现实体验。</p>
    </div>
  )
}

export function TierGoalFields({ value, weekly = false, onChange }: { value: TierGoalDraft; weekly?: boolean; onChange: (value: TierGoalDraft) => void }) {
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
      {weekly && (value.advanced || value.metric === 'count') && (
        <div className="goal-type-block">
          <span>记录方式</span>
          <div className="segmented-control" aria-label="记录方式">
            <button type="button" className={value.progressMode === 'direct' ? 'selected' : ''} onClick={() => set({ progressMode: 'direct' })}>直接选层</button>
            <button type="button" className={value.progressMode === 'incremental' ? 'selected' : ''} onClick={() => set({ progressMode: 'incremental' })}>逐次累计</button>
          </div>
          {value.progressMode === 'incremental' && <span className="field-hint">每次真实完成都可记录；达到新层次时才发奖励。</span>}
        </div>
      )}
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
          {weekly && value.progressMode === 'incremental' && (
            <div className="quick-duration-fields">
              <strong>快捷时长</strong>
              <span className="field-hint">第一个是主按钮默认值，另外最多填写三个备用值。</span>
              <div className="field-grid">
                {value.durationOptionsSeconds.map((seconds, index) => (
                  <label key={index}>{index === 0 ? '默认时长' : `备用 ${index}`}（{value.combinedTimeUnit}）
                    <input
                      type="number"
                      min={1}
                      max={value.combinedTimeUnit === '分钟' ? 1440 : 86_400}
                      step={1}
                      required={index === 0}
                      value={timeInputValue(seconds, value.combinedTimeUnit)}
                      onChange={(event) => {
                        const next = [...value.durationOptionsSeconds] as StringQuad
                        next[index] = timeInputSeconds(event.target.value, value.combinedTimeUnit)
                        set({ durationOptionsSeconds: next })
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function TimeUnitControl({ value, seconds, onChange }: { value: TimeInputUnit; seconds: string[]; onChange: (value: TimeInputUnit) => void }) {
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
