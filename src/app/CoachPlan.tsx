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
  Compass,
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
import { HabitFormationFields } from './HabitFormationFields'
import { activityFrequencyLabel, activityGoalLabel, errorMessage } from './shared-ui'
import { buildRatingGoal, buildTierGoal, defaultTierGoalDraft, draftStandardCount, draftUsesIncremental, ratingGoalDraftFromGoal, tierGoalDraftFromGoal, type RatingGoalDraft, type Snapshot, type TierGoalDraft } from './model'
export type NewCoachBehavior = Extract<CoachPlanBehavior, { source: 'new' }>

export function createNewCoachBehavior(role: CoachBehaviorRole): NewCoachBehavior {
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
export function CoachPlanScreen({
  storedDraft,
  activities,
  activeSeason,
  activeTrial,
  onBack,
  onOpenTemplates,
  onSave,
  onFinish,
}: {
  storedDraft?: CoachPlanDraft
  activities: Activity[]
  activeSeason?: Snapshot['seasons'][number]
  activeTrial: boolean
  onBack: () => void
  onOpenTemplates: () => void
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
  const applicationPhase = draft.knowledgeSource && draft.knowledgeSource.schemaVersion !== 1 ? draft.knowledgeSource.phase : undefined
  const cycleLabel = applicationPhase === 'trial' ? '7 天试跑' : '28 天赛季'
  const finishLabel = activeSeason || activeTrial
    ? applicationPhase === 'trial' ? '保存试跑方案' : '保存为下个赛季'
    : applicationPhase === 'trial' ? '启动 7 天试跑' : '启动 28 天赛季'

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
    } else if (activity.goal.kind !== 'rating' && (activity.goal.kind === 'duration' || activity.goal.unit === '分钟')) {
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
        <div><span className="modal-kicker">个人成长教练</span><h1 id="coach-plan-title">目标规划器</h1><p>把一个现实目标拆成最多三项能真正执行的行为，准备{cycleLabel}。</p></div>
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

      {draft.knowledgeSource && (
        <aside className="coach-knowledge-source" aria-label="导入的知识来源">
          <BookOpen aria-hidden="true" />
          <div>
            <span>来自 Obsidian 知识行动包</span>
            <strong>{draft.knowledgeSource.schemaVersion === 1 ? draft.knowledgeSource.knowledgeTitle : draft.knowledgeSource.knowledge.primary.title}</strong>
            <code>{draft.knowledgeSource.schemaVersion === 1 ? draft.knowledgeSource.knowledgeReference : draft.knowledgeSource.knowledge.primary.reference}</code>
            <p>{draft.knowledgeSource.schemaVersion === 1 ? draft.knowledgeSource.principle : draft.knowledgeSource.knowledge.primary.principle}</p>
            {draft.knowledgeSource.schemaVersion !== 1 && (
              <>
                <small>{draft.knowledgeSource.phase === 'trial' ? '7 天试跑' : '28 天正式赛季'} · 结果指标：{draft.knowledgeSource.outcomeIndicator}</small>
                {draft.knowledgeSource.knowledge.supporting.map((item) => (
                  <p key={item.reference}><b>辅助：{item.title}</b> — {item.contribution}</p>
                ))}
              </>
            )}
          </div>
        </aside>
      )}

      <div className="coach-plan-body">
        {draft.currentStep === 1 && (
          <section className="coach-step-panel">
            <div className="coach-step-heading"><span>第 1 步</span><h2>先定义现实结果</h2><p>成功标准必须能在{cycleLabel}结束后用事实回答，而不是“获得多少 XP”。</p></div>
            <button className="coach-library-entry" type="button" onClick={onOpenTemplates}><Compass aria-hidden="true" /><span><strong>从计划模板开始</strong><small>预填目标和行为，仍需由你逐项确认</small></span><ChevronRight aria-hidden="true" /></button>
            <label className="full-field">成长主题<input maxLength={40} value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} placeholder="例如：建立稳定的生活节奏" /></label>
            <label className="full-field">开始状态<textarea maxLength={280} value={draft.baseline} onChange={(event) => updateDraft({ baseline: event.target.value })} placeholder="现在具体是什么状态？" /></label>
            <label className="full-field">期望结果<textarea maxLength={280} value={draft.targetOutcome} onChange={(event) => updateDraft({ targetOutcome: event.target.value })} placeholder={`${cycleLabel}结束后希望现实中发生什么变化？`} /></label>
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
                <CoachNewBehaviorEditor key={behavior.id} behavior={behavior} activities={activities} onChange={(next) => updateBehavior(behavior.id, () => next)} />
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
          <button className="primary-action" type="button" disabled={submitting || !draft.badDayConfirmed || !draft.evidenceConfirmed} onClick={() => void finish()}><ShieldCheck aria-hidden="true" />{submitting ? '正在保存…' : finishLabel}</button>
        )}
      </footer>
    </section>
  )
}

export function BehaviorRoleControl({ value, onChange }: { value: CoachBehaviorRole; onChange: (role: CoachBehaviorRole) => void }) {
  return <div className="coach-role-control" aria-label="行为角色">{(['start', 'progress', 'maintain'] as CoachBehaviorRole[]).map((role) => <button key={role} type="button" className={value === role ? 'selected' : ''} onClick={() => onChange(role)}>{coachBehaviorRoleLabels[role]}</button>)}</div>
}

export function CoachSelectedBehaviors({ draft, activityById, onUpdate, onRemove, compact = false }: {
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

export function CoachExistingBehaviorEditor({ behavior, activity, onChange }: { behavior: Extract<CoachPlanBehavior, { source: 'existing' }>; activity?: Activity; onChange: (behavior: Extract<CoachPlanBehavior, { source: 'existing' }>) => void }) {
  if (!activity || !activity.enabled || activity.archivedAt) return <article className="coach-editor invalid"><strong>复用活动已失效</strong><p>它可能已暂停、归档或删除。请返回上一步替换。</p></article>
  return (
    <article className={behavior.confirmed ? 'coach-editor confirmed' : 'coach-editor'}>
      <div className="coach-editor-title"><span className="coach-role-badge">{coachBehaviorRoleLabels[behavior.role]}</span><div><h3>{activity.title}</h3><p>复用现有活动</p></div>{behavior.confirmed && <CheckCircle2 aria-label="已确认" />}</div>
      <dl className="coach-existing-details"><div><dt>成长领域</dt><dd>{activity.domain ? domainLabel(activity.domain) : '旧体系'}</dd></div><div><dt>难度</dt><dd>{activity.difficulty}</dd></div><div><dt>频率</dt><dd>{activityFrequencyLabel(activity)}</dd></div><div><dt>最低标准</dt><dd>{activityGoalLabel(activity)}</dd></div></dl>
      <button className="secondary-action" type="button" onClick={() => onChange({ ...behavior, confirmed: true })}><Check aria-hidden="true" />确认沿用当前标准</button>
    </article>
  )
}

export function CoachNewBehaviorEditor({ behavior, activities, onChange }: { behavior: NewCoachBehavior; activities: Activity[]; onChange: (behavior: NewCoachBehavior) => void }) {
  const [goalMode, setGoalMode] = useState<'tiered' | 'rating'>(behavior.goal.kind === 'rating' ? 'rating' : 'tiered')
  const [goalDraft, setGoalDraft] = useState<TierGoalDraft>(() => behavior.goal.kind === 'tiered' ? tierGoalDraftFromGoal(behavior.goal) : defaultTierGoalDraft())
  const [ratingDraft, setRatingDraft] = useState<RatingGoalDraft>(() => ratingGoalDraftFromGoal(behavior.goal.kind === 'rating' ? behavior.goal : undefined))
  const [localError, setLocalError] = useState('')
  const change = (next: Partial<NewCoachBehavior>) => onChange({ ...behavior, ...next, confirmed: false })
  function confirm() {
    try {
      const goal = goalMode === 'rating'
        ? buildRatingGoal(ratingDraft)
        : TieredGoalSchema.parse(buildTierGoal(goalDraft))
      if (!behavior.title.trim() || !behavior.protocol.trim()) throw new Error('请填写名称和执行协议')
      setLocalError('')
      onChange({
        ...behavior,
        goal,
        schedule: goal.kind === 'rating'
          ? { kind: 'daily' }
          : behavior.schedule.kind === 'weekly' && 'progressMode' in goal && goal.progressMode === 'incremental'
          ? { kind: 'weekly', times: typeof goal.thresholds[1] === 'number' ? goal.thresholds[1] : goal.thresholds[1].count }
          : behavior.schedule,
        confirmed: true,
      })
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
      <div className="field-grid"><label>频率<select value={goalMode === 'rating' ? 'daily' : behavior.schedule.kind} disabled={goalMode === 'rating'} onChange={(event) => change({ schedule: event.target.value === 'daily' ? { kind: 'daily' } : { kind: 'weekly', times: 3 } })}><option value="daily">每天</option><option value="weekly">每周 N 次</option></select></label>{behavior.schedule.kind === 'weekly' && goalMode !== 'rating' && <label>每周次数<input type="number" min={1} max={draftUsesIncremental(goalDraft, true) ? 999 : 7} value={draftUsesIncremental(goalDraft, true) ? draftStandardCount(goalDraft) : behavior.schedule.times} disabled={draftUsesIncremental(goalDraft, true)} onChange={(event) => change({ schedule: { kind: 'weekly', times: Number(event.target.value) } })} /></label>}</div>
      {behavior.schedule.kind === 'daily' && <HabitFormationFields anchor={behavior.habitAnchor} activities={activities} onChange={(habitAnchor) => change({ habitAnchor, scheduledTime: undefined })} />}
      <label className="full-field">补充场景说明（可选）<input aria-label="触发条件" maxLength={80} value={behavior.cue} onChange={(event) => change({ cue: event.target.value })} placeholder="例如：准备开始工作时" /></label>
      <label className="full-field">执行协议<textarea maxLength={280} value={behavior.protocol} onChange={(event) => change({ protocol: event.target.value })} placeholder="具体做什么，走神或中断后怎样返回" /></label>
      <div className="coach-goal-box">
        <strong>完成标准</strong>
        <div className="segmented-control" aria-label="完成标准类型">
          <button type="button" className={goalMode === 'tiered' ? 'selected' : ''} onClick={() => { setGoalMode('tiered'); change({}) }}>分层目标</button>
          <button type="button" className={goalMode === 'rating' ? 'selected' : ''} onClick={() => { setGoalMode('rating'); change({ schedule: { kind: 'daily' } }) }}>评分体验</button>
        </div>
        {goalMode === 'tiered'
          ? <TierGoalFields value={goalDraft} weekly={behavior.schedule.kind === 'weekly'} onChange={(next) => { setGoalDraft(next); change({}) }} />
          : <RatingGoalFields value={ratingDraft} onChange={(next) => { setRatingDraft(next); change({}) }} />}
      </div>
      {localError && <p className="coach-inline-error" role="alert">{localError}</p>}
      <button className="secondary-action" type="button" onClick={confirm}><Check aria-hidden="true" />确认这个行为</button>
    </article>
  )
}
