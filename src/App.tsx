import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Activity as ActivityIcon,
  Award,
  Bell,
  BellOff,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  Crosshair,
  Download,
  Dumbbell,
  Gift,
  Home,
  Leaf,
  ListTodo,
  Pause,
  Pencil,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldCheck,
  Star,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  UsersRound,
  Vibrate,
  Volume2,
  X,
  Zap,
} from 'lucide-react'
import { createBackup, createLedgerMarkdown, restoreBackup } from './backup'
import {
  archiveHabit,
  cancelTodayCompletion,
  completeActivity,
  createActivity,
  db,
  getSnapshot,
  initializeDatabase,
  redeemReward,
  saveWeeklyReview,
  setActivityEnabled,
  setActivityKey,
  undoCompletion,
  updateHabit,
  restoreHabit,
  updatePreferences,
  type CompletionDetails,
  type HabitUpdate,
  type NewActivity,
} from './db'
import {
  addDays,
  attributes,
  calculateStats,
  difficulties,
  getCharacterStage,
  getCompletionTierGoal,
  getLevel,
  getTierAchievement,
  getTierReward,
  identityMessage,
  formatDurationSeconds,
  isDurationGoal,
  isTieredGoal,
  localDate,
  rewardTable,
  reviewDecisions,
  startOfWeek,
  formatTierGoalValue,
  tierLabels,
  tierLevels,
  type Activity,
  type Attribute,
  type Completion,
  type Difficulty,
  type CombinedMode,
  type LedgerEvent,
  type Preferences,
  type ReviewDecision,
  type TierLevel,
  type TierMetric,
  type TieredGoal,
  type TimeInputUnit,
  type WeeklyReview,
} from './domain'
import { requestNotificationPermission, sendCompletionFeedback } from './feedback'

type Page = 'today' | 'character' | 'review' | 'settings'
type Snapshot = Awaited<ReturnType<typeof getSnapshot>>

const emptySnapshot: Snapshot = {
  activities: [],
  completions: [],
  ledgerEvents: [],
  rewards: [],
  weeklyReviews: [],
  settings: [],
}

const defaultPreferences: Preferences = { notifications: false, vibration: true, sound: false }

interface AwardFeedback {
  completionId: string
  title: string
  attribute: Attribute
  xp: number
  coins: number
  durationMinutes?: number
  tier?: TierLevel
  achievedLabel?: string
  upgraded?: boolean
  level: ReturnType<typeof getLevel>
}

interface ReviewDraft {
  impact: number
  friction: number
  decision: ReviewDecision
  note: string
}

type StringTriple = [string, string, string]
type CombinedThresholdDraft = { count: string; durationSeconds: string }

interface TierGoalDraft {
  advanced: boolean
  metric: TierMetric
  durationSeconds: StringTriple
  countThresholds: StringTriple
  countUnit: string
  timeUnit: TimeInputUnit
  combinedMode: CombinedMode
  combinedTimeUnit: TimeInputUnit
  combinedThresholds: [CombinedThresholdDraft, CombinedThresholdDraft, CombinedThresholdDraft]
}

function defaultTierGoalDraft(): TierGoalDraft {
  return {
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
  }
}

function tierGoalDraftFromGoal(goal: TieredGoal): TierGoalDraft {
  const draft = defaultTierGoalDraft()
  if (goal.metric === 'count') {
    return { ...draft, metric: 'count', countUnit: goal.unit, countThresholds: goal.thresholds.map(String) as StringTriple }
  }
  if (goal.metric === 'duration') {
    const multiplier = goal.unit === '分钟' ? 60 : 1
    return {
      ...draft,
      metric: 'duration',
      timeUnit: 'inputUnit' in goal ? goal.inputUnit : '分钟',
      durationSeconds: goal.thresholds.map((value) => String(value * multiplier)) as StringTriple,
    }
  }
  return {
    ...draft,
    advanced: true,
    combinedMode: goal.mode,
    combinedTimeUnit: goal.inputUnit,
    countUnit: goal.countUnit,
    combinedThresholds: goal.thresholds.map((value) => ({ count: String(value.count), durationSeconds: String(value.durationSeconds) })) as TierGoalDraft['combinedThresholds'],
  }
}

function tierGoalDraftFromLegacy(activity: Activity): TierGoalDraft {
  const draft = defaultTierGoalDraft()
  if (activity.goal.kind === 'tiered') return tierGoalDraftFromGoal(activity.goal)
  if (isDurationGoal(activity)) return { ...draft, durationSeconds: ['', String(activity.goal.count * 60), ''] }
  return { ...draft, metric: 'count', countUnit: activity.goal.unit, countThresholds: ['', String(activity.goal.count), ''] }
}

function buildTierGoal(draft: TierGoalDraft): TieredGoal {
  if (draft.advanced) {
    return {
      kind: 'tiered',
      metric: 'combined',
      mode: draft.combinedMode,
      countUnit: draft.countUnit,
      inputUnit: draft.combinedTimeUnit,
      thresholds: draft.combinedThresholds.map((value) => ({
        count: Number(value.count),
        durationSeconds: Number(value.durationSeconds),
      })) as [
        { count: number; durationSeconds: number },
        { count: number; durationSeconds: number },
        { count: number; durationSeconds: number },
      ],
    }
  }
  if (draft.metric === 'count') {
    return { kind: 'tiered', metric: 'count', unit: draft.countUnit, thresholds: draft.countThresholds.map(Number) as [number, number, number] }
  }
  return {
    kind: 'tiered',
    metric: 'duration',
    unit: '秒',
    inputUnit: draft.timeUnit,
    thresholds: draft.durationSeconds.map(Number) as [number, number, number],
  }
}

function timeInputValue(seconds: string, unit: TimeInputUnit) {
  if (!seconds) return ''
  return String(Number(seconds) / (unit === '分钟' ? 60 : 1))
}

function timeInputSeconds(value: string, unit: TimeInputUnit) {
  if (!value) return ''
  return String(Number(value) * (unit === '分钟' ? 60 : 1))
}

const assetUrl = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`

function App() {
  const [page, setPage] = useState<Page>('today')
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [noteActivity, setNoteActivity] = useState<Activity | null>(null)
  const [tierActivity, setTierActivity] = useState<Activity | null>(null)
  const [goalActivity, setGoalActivity] = useState<Activity | null>(null)
  const [completionActivity, setCompletionActivity] = useState<Activity | null>(null)
  const [archiveActivity, setArchiveActivity] = useState<Activity | null>(null)
  const [feedback, setFeedback] = useState<AwardFeedback | null>(null)

  const refresh = useCallback(async () => {
    setSnapshot(await getSnapshot())
  }, [])

  useEffect(() => {
    initializeDatabase()
      .then(refresh)
      .then(() => setReady(true))
      .catch((error: unknown) => setNotice(errorMessage(error)))
  }, [refresh])

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(null), 10_000)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const preferences = useMemo(() => {
    const setting = snapshot.settings.find((item) => item.key === 'preferences')
    return setting?.key === 'preferences' ? setting.value : defaultPreferences
  }, [snapshot.settings])

  const stats = useMemo(() => calculateStats(snapshot.ledgerEvents), [snapshot.ledgerEvents])
  const level = getLevel(stats.totalXp)
  const today = localDate()

  const activeCompletion = useCallback(
    (activity: Activity) =>
      snapshot.completions.find(
        (completion) =>
          completion.activityId === activity.id &&
          completion.status === 'active' &&
          (activity.type === 'task' || completion.occurredOn === today),
      ),
    [snapshot.completions, today],
  )

  const enabledActivities = snapshot.activities.filter((activity) => activity.enabled)
  const isDue = (activity: Activity) => activity.type === 'habit' || !activity.plannedOn || activity.plannedOn <= today
  const keyActivities = enabledActivities.filter((activity) => activity.isKey && isDue(activity))
  const otherHabits = enabledActivities.filter((activity) => activity.type === 'habit' && !activity.isKey)
  const tasks = enabledActivities.filter((activity) => activity.type === 'task' && !activity.isKey && isDue(activity))

  async function finishActivity(activity: Activity, details?: CompletionDetails) {
    try {
      const result = await completeActivity(activity.id, today, details)
      setNoteActivity(null)
      if (!result.awarded) return
      const nextStats = calculateStats([...snapshot.ledgerEvents, result.event])
      const completedTierGoal = getCompletionTierGoal(result.completion, result.activity)
      setFeedback({
        completionId: result.completion.id,
        title: activity.title,
        attribute: activity.attribute,
        xp: result.event.xpDelta,
        coins: result.event.coinDelta,
        durationMinutes: result.completion.durationMinutes,
        tier: result.completion.tier,
        achievedLabel: result.completion.tier && completedTierGoal
          ? formatTierGoalValue(completedTierGoal, result.completion.tier)
          : undefined,
        upgraded: result.upgraded,
        level: getLevel(nextStats.totalXp),
      })
      await refresh()
      void sendCompletionFeedback(preferences, {
        title: activity.title,
        xp: result.event.xpDelta,
        coins: result.event.coinDelta,
        attribute: activity.attribute,
        durationMinutes: result.completion.durationMinutes,
        tier: result.completion.tier,
        upgraded: result.upgraded,
      })
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  function requestCompletion(activity: Activity) {
    if (isTieredGoal(activity)) setTierActivity(activity)
    else if (isDurationGoal(activity) || activity.difficulty === '困难' || activity.difficulty === 'Boss') setNoteActivity(activity)
    else void finishActivity(activity)
  }

  async function undoLast() {
    if (!feedback) return
    try {
      await undoCompletion(feedback.completionId)
      setFeedback(null)
      await refresh()
      setNotice('已撤销，本次成长已用修正流水抵消')
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  if (!ready) {
    return (
      <main className="loading-screen">
        <ShieldCheck aria-hidden="true" />
        <span>正在读取本地存档…</span>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <Navigation page={page} onChange={setPage} />
      <main className="main-content">
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button className="icon-button" type="button" title="关闭提示" onClick={() => setNotice('')}>
              <X aria-hidden="true" />
            </button>
          </div>
        )}
        {page === 'today' && (
          <TodayPage
            today={today}
            level={level}
            coins={stats.coins}
            keyActivities={keyActivities}
            otherHabits={otherHabits}
            tasks={tasks}
            activeCompletion={activeCompletion}
            onComplete={requestCompletion}
            onCompleted={setCompletionActivity}
            onCreate={() => setCreateOpen(true)}
          />
        )}
        {page === 'character' && (
          <CharacterPage
            stats={stats}
            level={level}
            ledgerEvents={snapshot.ledgerEvents}
            rewards={snapshot.rewards.filter((reward) => reward.enabled)}
            onRedeem={async (rewardId) => {
              try {
                await redeemReward(rewardId)
                await refresh()
                setNotice('奖励兑换成功，已写入金币流水')
              } catch (error) {
                setNotice(errorMessage(error))
              }
            }}
          />
        )}
        {page === 'review' && (
          <ReviewPage
            activities={keyActivities}
            completions={snapshot.completions}
            reviews={snapshot.weeklyReviews}
            onSave={async (review) => {
              try {
                await saveWeeklyReview(review)
                await refresh()
                setNotice('本周复盘已保存，请导出 JSON 备份与 Markdown 账本')
              } catch (error) {
                setNotice(errorMessage(error))
              }
            }}
          />
        )}
        {page === 'settings' && (
          <SettingsPage
            preferences={preferences}
            activities={snapshot.activities}
            onEditGoal={setGoalActivity}
            onArchive={setArchiveActivity}
            onRestore={async (activityId) => {
              try {
                await restoreHabit(activityId)
                await refresh()
                setNotice('习惯已恢复')
              } catch (error) {
                setNotice(errorMessage(error))
              }
            }}
            onPreferences={async (value) => {
              await updatePreferences(value)
              await refresh()
            }}
            onRefresh={refresh}
            onNotice={setNotice}
          />
        )}
      </main>

      {createOpen && (
        <CreateActivityModal
          onClose={() => setCreateOpen(false)}
          onCreate={async (activity) => {
            try {
              await createActivity(activity)
              await refresh()
              setCreateOpen(false)
            } catch (error) {
              setNotice(errorMessage(error))
            }
          }}
        />
      )}
      {noteActivity && (
        <CompletionModal
          activity={noteActivity}
          onClose={() => setNoteActivity(null)}
          onComplete={(details) => void finishActivity(noteActivity, details)}
        />
      )}
      {tierActivity && (
        <TierPickerModal
          activity={tierActivity}
          completion={activeCompletion(tierActivity)}
          onClose={() => setTierActivity(null)}
          onComplete={(tier) => {
            setTierActivity(null)
            void finishActivity(tierActivity, { tier })
          }}
        />
      )}
      {goalActivity && (
        <EditHabitModal
          activity={goalActivity}
          onClose={() => setGoalActivity(null)}
          onSave={async (input) => {
            try {
              await updateHabit(goalActivity.id, input)
              setGoalActivity(null)
              await refresh()
              setNotice('习惯已更新，历史完成和账本保持不变')
            } catch (error) {
              setNotice(errorMessage(error))
            }
          }}
        />
      )}
      {completionActivity && activeCompletion(completionActivity) && (
        <CompletionActionsModal
          activity={completionActivity}
          completion={activeCompletion(completionActivity)!}
          onClose={() => setCompletionActivity(null)}
          onUpgrade={(tier) => {
            setCompletionActivity(null)
            void finishActivity(completionActivity, { tier })
          }}
          onCancel={async () => {
            const completion = activeCompletion(completionActivity)
            if (!completion) return
            try {
              await cancelTodayCompletion(completion.id, today)
              setCompletionActivity(null)
              await refresh()
              setNotice('今天的完成已取消，奖励已用修正流水抵消')
            } catch (error) {
              setNotice(errorMessage(error))
            }
          }}
        />
      )}
      {archiveActivity && (
        <ArchiveHabitModal
          activity={archiveActivity}
          onClose={() => setArchiveActivity(null)}
          onConfirm={async () => {
            try {
              await archiveHabit(archiveActivity.id)
              setArchiveActivity(null)
              await refresh()
              setNotice('习惯已归档，历史记录仍然保留')
            } catch (error) {
              setNotice(errorMessage(error))
            }
          }}
        />
      )}
      {feedback && <FeedbackOverlay feedback={feedback} onUndo={() => void undoLast()} />}
    </div>
  )
}

function Navigation({ page, onChange }: { page: Page; onChange: (page: Page) => void }) {
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
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            className={page === item.id ? 'nav-item active' : 'nav-item'}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={page === item.id ? 'page' : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function TodayPage({
  today,
  level,
  coins,
  keyActivities,
  otherHabits,
  tasks,
  activeCompletion,
  onComplete,
  onCompleted,
  onCreate,
}: {
  today: string
  level: ReturnType<typeof getLevel>
  coins: number
  keyActivities: Activity[]
  otherHabits: Activity[]
  tasks: Activity[]
  activeCompletion: (activity: Activity) => Completion | undefined
  onComplete: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  onCreate: () => void
}) {
  const stage = getCharacterStage(level.level)
  const completedKeys = keyActivities.filter((activity) => Boolean(activeCompletion(activity))).length
  return (
    <div className="today-page">
      <div className="today-layout">
        <section className="today-actions" aria-label="今日行动">
          <header className="page-header today-header">
            <div>
              <p className="eyebrow">行动日志 · {formatChineseDate(today)}</p>
              <h1>今天</h1>
              <p className="page-lead">把注意力留给真正重要的行动。</p>
            </div>
          </header>
          <div className="mobile-status">
            <TodayStatusPanel stage={stage} level={level} coins={coins} completed={completedKeys} total={keyActivities.length} />
          </div>
          <ActivitySection
            title="关键行动"
            subtitle="主线委托"
            icon={<Star aria-hidden="true" />}
            variant="key"
            activities={keyActivities}
            activeCompletion={activeCompletion}
            onComplete={onComplete}
            onCompleted={onCompleted}
            empty="还没有关键行动。从一个真正值得坚持的行为开始。"
          />
          <ActivitySection
            title="其他习惯"
            subtitle="日常委托"
            variant="regular"
            activities={otherHabits}
            activeCompletion={activeCompletion}
            onComplete={onComplete}
            onCompleted={onCompleted}
            empty=""
          />
          <ActivitySection
            title="一次性任务"
            subtitle="临时委托"
            variant="regular"
            activities={tasks}
            activeCompletion={activeCompletion}
            onComplete={onComplete}
            onCompleted={onCompleted}
            empty=""
          />
        </section>
        <aside className="today-sidebar" aria-label="角色状态">
          <TodayStatusPanel stage={stage} level={level} coins={coins} completed={completedKeys} total={keyActivities.length} />
          <button className="primary-action sidebar-create" type="button" onClick={onCreate}><Plus aria-hidden="true" />创建行动</button>
          <p className="sidebar-note"><ShieldCheck aria-hidden="true" />成长记录仅保存在本机</p>
        </aside>
      </div>
      <button className="floating-create" type="button" onClick={onCreate} title="创建行动" aria-label="创建行动"><Plus aria-hidden="true" /></button>
    </div>
  )
}

function TodayStatusPanel({
  stage,
  level,
  coins,
  completed,
  total,
}: {
  stage: number
  level: ReturnType<typeof getLevel>
  coins: number
  completed: number
  total: number
}) {
  const keyProgress = total > 0 ? completed / total : 0
  return (
    <section className="status-panel">
      <div className="status-identity">
        <span className="portrait-frame"><TravelerPortrait stage={stage} label={`Lv.${level.level} 像素旅者`} /></span>
        <div><span>旅者状态</span><strong>Lv.{level.level}</strong><small>成长阶段 {stage}</small></div>
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
    </section>
  )
}

function TargetMark() {
  return <Crosshair aria-hidden="true" />
}

function ActivitySection({
  title,
  subtitle,
  icon,
  variant,
  activities,
  activeCompletion,
  onComplete,
  onCompleted,
  empty,
}: {
  title: string
  subtitle: string
  icon?: React.ReactNode
  variant: 'key' | 'regular'
  activities: Activity[]
  activeCompletion: (activity: Activity) => Completion | undefined
  onComplete: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  empty: string
}) {
  if (variant === 'regular' && activities.length === 0) return null
  return (
    <section className={`content-section activity-section activity-section-${variant}`}>
      <div className="section-heading">
        <div><span>{subtitle}</span><h2>{icon}{title}</h2></div>
        <span>{activities.length}</span>
      </div>
      <div className={variant === 'key' ? 'mission-list' : 'activity-list'}>
        {activities.length === 0 && <div className="empty-mission"><TargetMark /><strong>设定第一项主线</strong><p>{empty}</p></div>}
        {activities.map((activity) => {
          const completion = activeCompletion(activity)
          const complete = Boolean(completion)
          const canUpgrade = Boolean(completion?.tier && completion.tier < 3 && (completion.tierGoalSnapshot || completion.tierThresholds))
          const reward = rewardTable[activity.difficulty]
          return (
            <article className={`${variant === 'key' ? 'mission-card' : 'activity-row'}${complete ? ' complete' : ''}`} key={activity.id}>
              <div className="activity-copy">
                {variant === 'key' && <div className="mission-meta"><AttributeMark attribute={activity.attribute} /><span className={`difficulty difficulty-${activity.difficulty}`}>{activity.difficulty}</span></div>}
                <div className="activity-title-line">
                  <strong>{activity.title}</strong>
                  {variant === 'regular' && <span className={`difficulty difficulty-${activity.difficulty}`}>{activity.difficulty}</span>}
                  {completion?.tier && <span className="tier-status">{tierLabels[completion.tier]}</span>}
                </div>
                <span className="activity-schedule">{variant === 'regular' && `${activity.attribute} · `}{scheduleLabel(activity)}</span>
                {variant === 'key' && <div className="mission-reward"><Award aria-hidden="true" /><span>{isTieredGoal(activity) ? '最高 ' : '+'}{reward.xp} XP</span><Coins aria-hidden="true" /><span>+{reward.coins}</span></div>}
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

const attributeIcons: Record<Attribute, typeof Dumbbell> = {
  体魄: Dumbbell,
  智识: BookOpen,
  专注: Crosshair,
  创造: Brain,
  关系: UsersRound,
  心境: Leaf,
}

function AttributeMark({ attribute }: { attribute: Attribute }) {
  const Icon = attributeIcons[attribute]
  return <span className={`attribute-mark attribute-${attribute}`}><Icon aria-hidden="true" />{attribute}</span>
}

function CharacterPage({
  stats,
  level,
  ledgerEvents,
  rewards,
  onRedeem,
}: {
  stats: ReturnType<typeof calculateStats>
  level: ReturnType<typeof getLevel>
  ledgerEvents: LedgerEvent[]
  rewards: Snapshot['rewards']
  onRedeem: (rewardId: string) => void
}) {
  const stage = getCharacterStage(level.level)
  const recentEvents = [...ledgerEvents].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 5)
  return (
    <div className="character-page">
      <header className="page-header"><div><p className="eyebrow">冒险者档案</p><h1>角色</h1><p className="page-lead">现实中的每一次行动，都在这里留下成长。</p></div></header>
      <section className="character-hero">
        <div className="character-portrait-wrap"><span className="stage-badge">阶段 {stage}</span><TravelerPortrait stage={stage} label={`成长阶段 ${stage} 的像素旅者`} /></div>
        <div className="character-progress">
          <div className="character-level-line"><div><span>当前等级</span><strong>Lv.{level.level}</strong></div><div className="coin-balance"><Coins aria-hidden="true" /><span>金币</span><strong>{stats.coins}</strong></div></div>
          <div className="hero-xp"><b>{stats.totalXp} XP</b><span>距离 Lv.{level.level + 1} 还需 {level.needed - level.current} XP</span></div>
          <ProgressBar value={level.progress} label={`${level.current} / ${level.needed} XP`} />
        </div>
      </section>
      <section className="content-section">
        <div className="section-heading"><div><span>成长维度</span><h2>六项属性</h2></div></div>
        <div className="attribute-grid">
          {attributes.map((attribute) => {
            const attributeLevel = getLevel(stats.attributeXp[attribute])
            return (
              <div className="attribute-item" key={attribute}>
                <div><AttributeMark attribute={attribute} /><span>Lv.{attributeLevel.level}</span></div>
                <ProgressBar value={attributeLevel.progress} label={`${stats.attributeXp[attribute]} XP`} compact />
              </div>
            )
          })}
        </div>
      </section>
      <section className="content-section growth-section">
        <div className="section-heading"><div><span>成长轨迹</span><h2><TrendingUp aria-hidden="true" />近期记录</h2></div></div>
        <div className="growth-list">
          {recentEvents.length === 0 && <p className="empty-state">完成行动后，成长记录会出现在这里。</p>}
          {recentEvents.map((event) => (
            <div className={`growth-row growth-${event.kind}`} key={event.id}>
              <span className="growth-icon">{event.kind === 'redemption' ? <Gift aria-hidden="true" /> : event.kind === 'correction' ? <RotateCcw aria-hidden="true" /> : <ActivityIcon aria-hidden="true" />}</span>
              <div><strong>{event.title}</strong><span>{formatShortDate(event.occurredOn)}{event.attribute ? ` · ${event.attribute}` : ''}</span></div>
              <b>{event.xpDelta !== 0 && `${event.xpDelta > 0 ? '+' : ''}${event.xpDelta} XP`}{event.xpDelta !== 0 && event.coinDelta !== 0 ? ' · ' : ''}{event.coinDelta !== 0 && `${event.coinDelta > 0 ? '+' : ''}${event.coinDelta} 金币`}</b>
            </div>
          ))}
        </div>
      </section>
      <section className="content-section">
        <div className="section-heading"><div><span>现实奖励</span><h2><Gift aria-hidden="true" />奖励商店</h2></div></div>
        <div className="reward-list">
          {rewards.map((reward) => (
            <article className="reward-row" key={reward.id}>
              <strong>{reward.title}</strong>
              <button type="button" disabled={stats.coins < reward.cost} onClick={() => onRedeem(reward.id)}>
                <Coins aria-hidden="true" />{reward.cost}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function ReviewPage({
  activities,
  completions,
  reviews,
  onSave,
}: {
  activities: Activity[]
  completions: Snapshot['completions']
  reviews: Snapshot['weeklyReviews']
  onSave: (review: WeeklyReview) => void
}) {
  const weekStart = startOfWeek()
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
    const completed = new Set(matchingCompletions.map((completion) => completion.occurredOn)).size
    const planned = activity.schedule.kind === 'daily' ? 7 : activity.schedule.kind === 'weekly' ? activity.schedule.times : 1
    const actualDurationMinutes = matchingCompletions.reduce((total, completion) => total + (completion.durationMinutes ?? 0), 0)
    const plannedDurationMinutes = isDurationGoal(activity) ? planned * activity.goal.count : undefined
    const tierCounts = tierLevels.map((tier) => matchingCompletions.filter((completion) => completion.tier === tier).length) as [number, number, number]
    const achievement = matchingCompletions.reduce(
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
    return { activity, completed, planned, adherence: Math.min(completed / planned, 1), actualDurationMinutes, plannedDurationMinutes, tierCounts, achievement }
  })
  const overallAdherence = progress.length > 0 ? progress.reduce((total, item) => total + item.adherence, 0) / progress.length : 0

  function submit(event: FormEvent) {
    event.preventDefault()
    if (progress.length === 0) return
    onSave({
      id: `review:${weekStart}`,
      weekStart,
      items: progress.map(({ activity, completed, planned, adherence, actualDurationMinutes, plannedDurationMinutes, tierCounts, achievement }) => ({
        activityId: activity.id,
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
    })
  }

  return (
    <div className="review-page">
      <header className="page-header"><div><p className="eyebrow">冒险日志 · {formatShortDate(weekStart)} — {formatShortDate(weekEnd)}</p><h1>每周复盘</h1><p className="page-lead">判断行动是否真的有帮助，而不是只看获得了多少 XP。</p></div></header>
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
          {progress.map(({ activity, completed, planned, adherence, actualDurationMinutes, plannedDurationMinutes, tierCounts, achievement }) => {
            const draft = drafts[activity.id] ?? { impact: 3, friction: 3, decision: '保留' as const, note: '' }
            const update = (next: Partial<ReviewDraft>) => setDrafts((current) => ({ ...current, [activity.id]: { ...draft, ...next } }))
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
                    <span>基础 {tierCounts[0]}</span><span>标准 {tierCounts[1]}</span><span>突破 {tierCounts[2]}</span>
                    {achievement.count > 0 && <strong>最低次数：{achievement.count}{achievement.countUnit ?? '次'}</strong>}
                    {achievement.durationSeconds > 0 && <strong>最低时间：{formatDurationSeconds(achievement.durationSeconds)}</strong>}
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

function RatingControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
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

function SettingsPage({
  preferences,
  activities,
  onPreferences,
  onRefresh,
  onNotice,
  onEditGoal,
  onArchive,
  onRestore,
}: {
  preferences: Preferences
  activities: Activity[]
  onPreferences: (value: Preferences) => Promise<void>
  onRefresh: () => Promise<void>
  onNotice: (message: string) => void
  onEditGoal: (activity: Activity) => void
  onArchive: (activity: Activity) => void
  onRestore: (activityId: string) => Promise<void>
}) {
  const activeActivities = activities.filter((activity) => !activity.archivedAt)
  const archivedActivities = activities.filter((activity) => Boolean(activity.archivedAt))

  async function toggleNotifications() {
    if (!preferences.notifications) {
      const permission = await requestNotificationPermission()
      if (permission !== 'granted') {
        onNotice(permission === 'unsupported' ? '当前浏览器不支持系统通知' : '通知未获授权，界面反馈仍会正常显示')
        return
      }
    }
    await onPreferences({ ...preferences, notifications: !preferences.notifications })
  }

  async function exportJson() {
    const meta = await db.settings.get('meta')
    await db.settings.put({ key: 'meta', value: { ...(meta?.key === 'meta' ? meta.value : {}), lastBackupAt: new Date().toISOString() } })
    const backup = await createBackup()
    downloadFile(`earth-online-backup-${localDate()}.json`, JSON.stringify(backup, null, 2), 'application/json')
    await onRefresh()
    onNotice('JSON 全量备份已导出')
  }

  async function exportMarkdown() {
    downloadFile(`earth-online-ledger-${localDate()}.md`, await createLedgerMarkdown(), 'text/markdown')
    onNotice('Markdown 账本已导出')
  }

  async function importJson(file?: File) {
    if (!file) return
    try {
      await restoreBackup(JSON.parse(await file.text()))
      await onRefresh()
      onNotice('备份已校验并完整恢复')
    } catch (error) {
      onNotice(`导入失败：${errorMessage(error)}`)
    }
  }

  return (
    <div className="settings-page">
      <header className="page-header"><div><p className="eyebrow">系统与存档</p><h1>设置</h1><p className="page-lead">管理反馈方式、行动和本机数据。</p></div><SettingsIcon aria-hidden="true" className="header-icon" /></header>
      <section className="content-section settings-section">
        <div className="section-heading"><div><span>体验偏好</span><h2>即时反馈</h2></div></div>
        <SettingToggle
          icon={preferences.notifications ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}
          label="系统通知"
          checked={preferences.notifications}
          onChange={() => void toggleNotifications()}
        />
        <SettingToggle
          icon={<Vibrate aria-hidden="true" />}
          label="轻微振动"
          checked={preferences.vibration}
          onChange={() => void onPreferences({ ...preferences, vibration: !preferences.vibration })}
        />
        <SettingToggle
          icon={<Volume2 aria-hidden="true" />}
          label="完成声音"
          checked={preferences.sound}
          onChange={() => void onPreferences({ ...preferences, sound: !preferences.sound })}
        />
      </section>

      <section className="content-section settings-section">
        <div className="section-heading"><div><span>行动编排</span><h2>活动管理</h2></div></div>
        {activeActivities.length === 0 && <p className="empty-state">还没有活动</p>}
        {activeActivities.map((activity) => (
          <div className="manage-row" key={activity.id}>
            <div><strong>{activity.title}</strong><span>{activity.attribute} · {activity.difficulty}</span></div>
            <div className="manage-actions">
              {activity.type === 'habit' && (
                <button className="icon-button" type="button" title="编辑习惯" onClick={() => onEditGoal(activity)}>
                  <Pencil aria-hidden="true" />
                </button>
              )}
              <button
                className={activity.isKey ? 'icon-button selected' : 'icon-button'}
                type="button"
                title={activity.isKey ? '取消关键行为' : '设为关键行为'}
                aria-pressed={activity.isKey}
                onClick={async () => {
                  try { await setActivityKey(activity.id, !activity.isKey); await onRefresh() } catch (error) { onNotice(errorMessage(error)) }
                }}
              ><Star aria-hidden="true" /></button>
              <button
                className={activity.enabled ? 'icon-button' : 'icon-button paused'}
                type="button"
                title={activity.enabled ? '暂停活动' : '启用活动'}
                onClick={async () => {
                  try { await setActivityEnabled(activity.id, !activity.enabled); await onRefresh() } catch (error) { onNotice(errorMessage(error)) }
                }}
              >{activity.enabled ? <Pause aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}</button>
              {activity.type === 'habit' && (
                <button className="icon-button danger-icon" type="button" title="归档习惯" onClick={() => onArchive(activity)}>
                  <Trash2 aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        ))}
        {archivedActivities.length > 0 && (
          <details className="archive-section">
            <summary>已归档（{archivedActivities.length}）</summary>
            <div className="archive-list">
              {archivedActivities.map((activity) => (
                <div className="manage-row archived-row" key={activity.id}>
                  <div><strong>{activity.title}</strong><span>{activity.attribute} · {activity.difficulty}</span></div>
                  <button className="restore-button" type="button" onClick={() => void onRestore(activity.id)}>
                    <RotateCcw aria-hidden="true" />恢复
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="content-section settings-section">
        <div className="section-heading"><div><span>存档与恢复</span><h2>本地数据</h2></div></div>
        <div className="data-actions">
          <button type="button" onClick={() => void exportJson()}><Download aria-hidden="true" />导出 JSON</button>
          <button type="button" onClick={() => void exportMarkdown()}><Download aria-hidden="true" />导出账本</button>
          <label className="file-button"><Upload aria-hidden="true" />恢复 JSON
            <input type="file" accept="application/json,.json" onChange={(event) => void importJson(event.target.files?.[0])} />
          </label>
        </div>
      </section>
      <footer className="version-footer"><ShieldCheck aria-hidden="true" />数据仅保存在本机 · V2.4.0</footer>
    </div>
  )
}

function CreateActivityModal({ onClose, onCreate }: { onClose: () => void; onCreate: (activity: NewActivity) => void }) {
  const [type, setType] = useState<'habit' | 'task'>('habit')
  const [title, setTitle] = useState('')
  const [attribute, setAttribute] = useState<Attribute>('体魄')
  const [difficulty, setDifficulty] = useState<Difficulty>('简单')
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily')
  const [weeklyTimes, setWeeklyTimes] = useState(3)
  const [goalMode, setGoalMode] = useState<'single' | 'tiered'>('single')
  const [tierDraft, setTierDraft] = useState<TierGoalDraft>(defaultTierGoalDraft)
  const [plannedOn, setPlannedOn] = useState(localDate())
  const [isKey, setIsKey] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    const goal: Activity['goal'] = type === 'habit' && goalMode === 'tiered'
      ? buildTierGoal(tierDraft)
      : { kind: 'count', count: 1, unit: '次' }
    onCreate({
      title,
      type,
      attribute,
      difficulty,
      goal,
      schedule: type === 'task' ? { kind: 'once' } : frequency === 'daily' ? { kind: 'daily' } : { kind: 'weekly', times: weeklyTimes },
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
              <label>频率<select value={frequency} onChange={(event) => setFrequency(event.target.value as 'daily' | 'weekly')}><option value="daily">每天</option><option value="weekly">每周</option></select></label>
              {frequency === 'weekly' && <label>每周次数<input type="number" min={1} max={7} value={weeklyTimes} onChange={(event) => setWeeklyTimes(Number(event.target.value))} /></label>}
            </div>
            <div className="goal-type-block">
              <span>目标类型</span>
              <div className="segmented-control" aria-label="目标类型">
                <button type="button" className={goalMode === 'single' ? 'selected' : ''} onClick={() => setGoalMode('single')}>单次完成</button>
                <button type="button" className={goalMode === 'tiered' ? 'selected' : ''} onClick={() => setGoalMode('tiered')}>三层目标</button>
              </div>
            </div>
            {goalMode === 'tiered' && (
              <TierGoalFields value={tierDraft} onChange={setTierDraft} />
            )}
          </>
        ) : <label className="full-field">计划日期<input type="date" required value={plannedOn} onChange={(event) => setPlannedOn(event.target.value)} /></label>}
        <label className="checkbox-field"><input type="checkbox" checked={isKey} onChange={(event) => setIsKey(event.target.checked)} /><Star aria-hidden="true" />关键行为</label>
        <details className="form-details">
          <summary><span><strong>奖励与分类</strong><small>{attribute} · {difficulty}</small></span><ListTodo aria-hidden="true" /></summary>
          <div className="field-grid">
            <label>属性<select value={attribute} onChange={(event) => setAttribute(event.target.value as Attribute)}>{attributes.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>难度<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>{difficulties.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
          <p className="form-detail-note">奖励由难度决定；目标次数和时长不会放大奖励。</p>
        </details>
        <button className="primary-action" type="submit"><Plus aria-hidden="true" />创建</button>
      </form>
    </div>
  )
}

function TierGoalFields({ value, onChange }: { value: TierGoalDraft; onChange: (value: TierGoalDraft) => void }) {
  const set = (next: Partial<TierGoalDraft>) => onChange({ ...value, ...next })
  return (
    <div className="tier-goal-fields">
      <label className="advanced-toggle">
        <span><strong>高级设置</strong><small>组合次数和时间</small></span>
        <input type="checkbox" role="switch" checked={value.advanced} onChange={(event) => set({ advanced: event.target.checked })} />
      </label>
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
              <div className="tier-threshold-grid">
                {tierLevels.map((tier, index) => (
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
              <div className="tier-threshold-grid">
                {tierLevels.map((tier, index) => (
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
          <span className="field-hint">基础、标准、突破必须依次增加</span>
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
            {tierLevels.map((tier, index) => (
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
        </>
      )}
    </div>
  )
}

function TimeUnitControl({ value, seconds, onChange }: { value: TimeInputUnit; seconds: string[]; onChange: (value: TimeInputUnit) => void }) {
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

function TierPickerModal({
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
  const currentXp = currentTier ? getTierReward(activity.difficulty, currentTier).xp : 0
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal compact-modal" aria-labelledby="tier-title">
        <div className="modal-header"><div><span className={`difficulty difficulty-${activity.difficulty}`}>{activity.difficulty}</span><h2 id="tier-title">{currentTier ? '升级层次' : activity.title}</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <div className="tier-choice-list">
          {tierLevels.filter((tier) => !currentTier || tier > currentTier).map((tier) => {
            const reward = getTierReward(activity.difficulty, tier)
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

function EditHabitModal({ activity, onClose, onSave }: { activity: Activity; onClose: () => void; onSave: (input: HabitUpdate) => void }) {
  const tiered = isTieredGoal(activity)
  const legacy = activity.goal.kind !== 'tiered' && (isDurationGoal(activity) || activity.goal.count !== 1 || activity.goal.unit !== '次')
  const [title, setTitle] = useState(activity.title)
  const [attribute, setAttribute] = useState<Attribute>(activity.attribute)
  const [difficulty, setDifficulty] = useState<Difficulty>(activity.difficulty)
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>(activity.schedule.kind === 'weekly' ? 'weekly' : 'daily')
  const [weeklyTimes, setWeeklyTimes] = useState(activity.schedule.kind === 'weekly' ? activity.schedule.times : 3)
  const [isKey, setIsKey] = useState(activity.isKey)
  const [mode, setMode] = useState<'legacy' | 'single' | 'tiered'>(tiered ? 'tiered' : legacy ? 'legacy' : 'single')
  const [tierDraft, setTierDraft] = useState<TierGoalDraft>(() => tierGoalDraftFromLegacy(activity))

  function submit(event: FormEvent) {
    event.preventDefault()
    const goal: Activity['goal'] = mode === 'legacy'
      ? activity.goal
      : mode === 'single'
        ? { kind: 'count', count: 1, unit: '次' }
        : buildTierGoal(tierDraft)
    onSave({
      title: title.trim(),
      attribute,
      difficulty,
      schedule: frequency === 'daily' ? { kind: 'daily' } : { kind: 'weekly', times: weeklyTimes },
      goal,
      isKey,
    })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={submit} aria-labelledby="edit-habit-title">
        <div className="modal-header"><h2 id="edit-habit-title">编辑习惯</h2><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <label className="full-field">习惯名称<input required maxLength={40} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <div className="field-grid">
          <label>属性<select value={attribute} onChange={(event) => setAttribute(event.target.value as Attribute)}>{attributes.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>难度<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>{difficulties.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <div className="field-grid">
          <label>频率<select value={frequency} onChange={(event) => setFrequency(event.target.value as 'daily' | 'weekly')}><option value="daily">每天</option><option value="weekly">每周 N 次</option></select></label>
          {frequency === 'weekly' && <label>每周次数<input type="number" min={1} max={7} required value={weeklyTimes} onChange={(event) => setWeeklyTimes(Number(event.target.value))} /></label>}
        </div>
        <span className="form-section-label">目标设置</span>
        <div className="segmented-control" aria-label="目标设置">
          {legacy && <button type="button" className={mode === 'legacy' ? 'selected' : ''} onClick={() => setMode('legacy')}>保留原目标</button>}
          <button type="button" className={mode === 'single' ? 'selected' : ''} onClick={() => setMode('single')}>单次完成</button>
          <button type="button" className={mode === 'tiered' ? 'selected' : ''} onClick={() => setMode('tiered')}>三层目标</button>
        </div>
        {mode === 'legacy' && activity.goal.kind !== 'tiered' && <p className="legacy-goal">当前目标：{activity.goal.count}{activity.goal.unit}</p>}
        {mode === 'tiered' && (
          <TierGoalFields value={tierDraft} onChange={setTierDraft} />
        )}
        <label className="checkbox-field"><input type="checkbox" checked={isKey} onChange={(event) => setIsKey(event.target.checked)} /><Star aria-hidden="true" />设为关键行为</label>
        <button className="primary-action" type="submit"><Check aria-hidden="true" />保存修改</button>
      </form>
    </div>
  )
}

function CompletionActionsModal({
  activity,
  completion,
  onClose,
  onUpgrade,
  onCancel,
}: {
  activity: Activity
  completion: Completion
  onClose: () => void
  onUpgrade: (tier: TierLevel) => void
  onCancel: () => Promise<void>
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const difficulty = completion.difficultySnapshot ?? activity.difficulty
  const goal = getCompletionTierGoal(completion, activity)
  const currentTier = completion.tier
  const canUpgrade = Boolean(currentTier && currentTier < 3 && goal)
  const canCancel = completion.occurredOn === localDate()
  const currentReward = currentTier ? getTierReward(difficulty, currentTier) : rewardTable[difficulty]

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal compact-modal" aria-labelledby="completion-actions-title">
        <div className="modal-header">
          <div><span className={`difficulty difficulty-${difficulty}`}>{difficulty}</span><h2 id="completion-actions-title">完成记录</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button>
        </div>
        <div className="completion-summary">
          <CheckCircle2 aria-hidden="true" />
          <div><strong>{completion.titleSnapshot ?? activity.title}</strong><span>{currentTier ? `${tierLabels[currentTier]}层 · ` : ''}+{currentReward.xp} XP / +{currentReward.coins} 金币</span></div>
        </div>
        {canUpgrade && (
          <div className="completion-upgrades">
            <span className="form-section-label">升级到更高层</span>
            <div className="tier-choice-list">
              {tierLevels.filter((tier) => tier > currentTier!).map((tier) => {
                const reward = getTierReward(difficulty, tier)
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

function ArchiveHabitModal({ activity, onClose, onConfirm }: { activity: Activity; onClose: () => void; onConfirm: () => Promise<void> }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal compact-modal" aria-labelledby="archive-habit-title">
        <div className="modal-header"><h2 id="archive-habit-title">归档习惯</h2><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <p className="modal-description">“{activity.title}”将从今天和默认管理列表隐藏，历史完成、奖励流水和复盘记录会保留，之后可以恢复。</p>
        <div className="confirmation-actions">
          <button type="button" onClick={onClose}>返回</button>
          <button className="danger-action" type="button" onClick={() => void onConfirm()}><Trash2 aria-hidden="true" />确认归档</button>
        </div>
      </section>
    </div>
  )
}

function CompletionModal({ activity, onClose, onComplete }: { activity: Activity; onClose: () => void; onComplete: (details: CompletionDetails) => void }) {
  const [note, setNote] = useState('')
  const [duration, setDuration] = useState('')
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

function FeedbackOverlay({ feedback, onUndo }: { feedback: AwardFeedback; onUndo: () => void }) {
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
        <span>{feedback.upgraded ? '委托升级' : '委托完成'}</span>
        <strong>{feedback.title}</strong>
        <div className="reward-gains"><b>+{feedback.xp} XP</b>{feedback.coins > 0 && <b>+{feedback.coins} 金币</b>}<b>{feedback.attribute}</b></div>
        <div className="feedback-detail">
          {feedback.durationMinutes && <p className="feedback-duration">本次持续 {feedback.durationMinutes} 分钟</p>}
          {feedback.tier && <p className="feedback-duration">{tierLabels[feedback.tier]}层 · 至少 {feedback.achievedLabel}</p>}
          <p>{identityMessage(feedback.attribute)}</p>
          <ProgressBar value={feedback.level.progress} label={`Lv.${feedback.level.level} · ${feedback.level.current}/${feedback.level.needed} XP`} compact />
        </div>
      </div>
      <button type="button" className="undo-button" onClick={onUndo}><RotateCcw aria-hidden="true" />撤销</button>
    </aside>
  )
}

function ProgressBar({ value, label, compact = false }: { value: number; label: string; compact?: boolean }) {
  const percent = Math.max(0, Math.min(100, value * 100))
  return (
    <div className={compact ? 'progress-wrap compact' : 'progress-wrap'}>
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{ width: `${percent}%` }} /></div>
      <span>{label}</span>
    </div>
  )
}

function TravelerPortrait({ stage, label }: { stage: number; label: string }) {
  return (
    <span
      className={`traveler-portrait traveler-stage-${stage}`}
      style={{ backgroundImage: `url("${assetUrl('traveler-stages.png')}")` }}
      role="img"
      aria-label={label}
    />
  )
}

function SettingToggle({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: () => void }) {
  return <label className="setting-toggle"><span>{icon}<strong>{label}</strong></span><input type="checkbox" role="switch" checked={checked} onChange={onChange} /></label>
}

function scheduleLabel(activity: Activity) {
  const goal = activity.goal
  if (goal.kind === 'tiered') {
    const tiers = tierLevels.map((tier) => `${tierLabels[tier]} ${formatTierGoalValue(goal, tier)}`).join(' · ')
    return activity.schedule.kind === 'weekly' ? `每周 ${activity.schedule.times} 次 · ${tiers}` : `每天 · ${tiers}`
  }
  const duration = goal.kind === 'duration' || goal.unit === '分钟'
  if (activity.schedule.kind === 'daily') return duration ? `每天 · 目标 ${goal.count} 分钟` : `每天 ${goal.count}${goal.unit}`
  if (activity.schedule.kind === 'weekly') return duration ? `每周 ${activity.schedule.times} 次 · 每次 ${goal.count} 分钟` : `每周 ${activity.schedule.times} 次`
  return activity.plannedOn ? formatShortDate(activity.plannedOn) : '单次'
}

function formatChineseDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00`))
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试'
}

export default App
