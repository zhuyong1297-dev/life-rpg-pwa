import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  Download,
  Gift,
  Home,
  Pause,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Upload,
  UserRound,
  Vibrate,
  Volume2,
  X,
  Zap,
} from 'lucide-react'
import { createBackup, createLedgerMarkdown, restoreBackup } from './backup'
import {
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
  updateActivityGoal,
  updatePreferences,
  type CompletionDetails,
  type NewActivity,
} from './db'
import {
  addDays,
  attributes,
  calculateStats,
  difficulties,
  getCharacterStage,
  getLevel,
  getTierReward,
  identityMessage,
  isDurationGoal,
  isTieredGoal,
  localDate,
  rewardTable,
  reviewDecisions,
  startOfWeek,
  formatGoalValue,
  tierLabels,
  tierLevels,
  type Activity,
  type Attribute,
  type Completion,
  type Difficulty,
  type Preferences,
  type ReviewDecision,
  type TierLevel,
  type TierMetric,
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
      setFeedback({
        completionId: result.completion.id,
        title: activity.title,
        attribute: activity.attribute,
        xp: result.event.xpDelta,
        coins: result.event.coinDelta,
        durationMinutes: result.completion.durationMinutes,
        tier: result.completion.tier,
        achievedLabel: result.completion.achievedValue && result.completion.tierMetric && result.completion.tierUnit
          ? formatGoalValue(result.completion.achievedValue, result.completion.tierMetric, result.completion.tierUnit)
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
            onCreate={() => setCreateOpen(true)}
          />
        )}
        {page === 'character' && (
          <CharacterPage
            stats={stats}
            level={level}
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
        <GoalSettingsModal
          activity={goalActivity}
          onClose={() => setGoalActivity(null)}
          onSave={async (goal) => {
            try {
              await updateActivityGoal(goalActivity.id, goal)
              setGoalActivity(null)
              await refresh()
              setNotice('习惯目标已更新，历史记录保持不变')
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
        <Zap aria-hidden="true" />
        <span>地球 Online</span>
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
  onCreate: () => void
}) {
  const stage = getCharacterStage(level.level)
  return (
    <>
      <header className="page-header today-header">
        <div>
          <p className="date-label">{formatChineseDate(today)}</p>
          <h1>今天</h1>
        </div>
        <div className="compact-status">
          <TravelerPortrait stage={stage} label={`Lv.${level.level} 像素旅者`} />
          <div>
            <strong>Lv.{level.level}</strong>
            <span><Coins aria-hidden="true" /> {coins}</span>
          </div>
        </div>
      </header>
      <ProgressBar value={level.progress} label={`${level.current} / ${level.needed} XP`} />

      <ActivitySection
        title="关键行为"
        icon={<Star aria-hidden="true" />}
        activities={keyActivities}
        activeCompletion={activeCompletion}
        onComplete={onComplete}
        empty="还没有关键行为"
      />
      <ActivitySection
        title="其他习惯"
        activities={otherHabits}
        activeCompletion={activeCompletion}
        onComplete={onComplete}
        empty="今天没有其他习惯"
      />
      <ActivitySection
        title="一次性任务"
        activities={tasks}
        activeCompletion={activeCompletion}
        onComplete={onComplete}
        empty="今天没有一次性任务"
      />

      <button className="primary-action create-action" type="button" onClick={onCreate}>
        <Plus aria-hidden="true" />
        创建行动
      </button>
    </>
  )
}

function ActivitySection({
  title,
  icon,
  activities,
  activeCompletion,
  onComplete,
  empty,
}: {
  title: string
  icon?: React.ReactNode
  activities: Activity[]
  activeCompletion: (activity: Activity) => Completion | undefined
  onComplete: (activity: Activity) => void
  empty: string
}) {
  return (
    <section className="content-section">
      <div className="section-heading">
        <h2>{icon}{title}</h2>
        <span>{activities.length}</span>
      </div>
      <div className="activity-list">
        {activities.length === 0 && <p className="empty-state">{empty}</p>}
        {activities.map((activity) => {
          const completion = activeCompletion(activity)
          const complete = Boolean(completion)
          const canUpgrade = isTieredGoal(activity) && Boolean(completion?.tier && completion.tier < 3)
          const disabled = complete && !canUpgrade
          const reward = rewardTable[activity.difficulty]
          return (
            <article className={complete ? 'activity-row complete' : 'activity-row'} key={activity.id}>
              <div className="activity-copy">
                <div className="activity-title-line">
                  <strong>{activity.title}</strong>
                  <span className={`difficulty difficulty-${activity.difficulty}`}>{activity.difficulty}</span>
                  {completion?.tier && <span className="tier-status">{tierLabels[completion.tier]}</span>}
                </div>
                <span>{activity.attribute} · {scheduleLabel(activity)} · {isTieredGoal(activity) ? '最高 ' : '+'}{reward.xp} XP / +{reward.coins} 金币</span>
              </div>
              <button
                className="complete-button"
                type="button"
                title={canUpgrade ? '升级层次' : complete ? '已完成' : `完成 ${activity.title}`}
                aria-label={canUpgrade ? `升级 ${activity.title}` : complete ? `${activity.title} 已完成` : `完成 ${activity.title}`}
                disabled={disabled}
                onClick={() => onComplete(activity)}
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

function CharacterPage({
  stats,
  level,
  rewards,
  onRedeem,
}: {
  stats: ReturnType<typeof calculateStats>
  level: ReturnType<typeof getLevel>
  rewards: Snapshot['rewards']
  onRedeem: (rewardId: string) => void
}) {
  const stage = getCharacterStage(level.level)
  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">角色档案</p><h1>旅者 Lv.{level.level}</h1></div>
        <div className="coin-balance"><Coins aria-hidden="true" /><strong>{stats.coins}</strong></div>
      </header>
      <section className="character-band">
        <TravelerPortrait stage={stage} label={`成长阶段 ${stage} 的像素旅者`} />
        <div className="character-progress">
          <strong>{stats.totalXp} XP</strong>
          <ProgressBar value={level.progress} label={`距 Lv.${level.level + 1}：${level.needed - level.current} XP`} />
        </div>
      </section>
      <section className="content-section">
        <div className="section-heading"><h2>六项属性</h2></div>
        <div className="attribute-grid">
          {attributes.map((attribute) => {
            const attributeLevel = getLevel(stats.attributeXp[attribute])
            return (
              <div className="attribute-item" key={attribute}>
                <div><strong>{attribute}</strong><span>Lv.{attributeLevel.level}</span></div>
                <ProgressBar value={attributeLevel.progress} label={`${stats.attributeXp[attribute]} XP`} compact />
              </div>
            )
          })}
        </div>
      </section>
      <section className="content-section">
        <div className="section-heading"><h2><Gift aria-hidden="true" />奖励商店</h2></div>
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
    </>
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
    const achievedTotal = matchingCompletions.reduce((total, completion) => total + (completion.achievedValue ?? 0), 0)
    const achievedUnit = matchingCompletions.find((completion) => completion.tierUnit)?.tierUnit
      ?? (isTieredGoal(activity) ? activity.goal.unit : undefined)
    return { activity, completed, planned, adherence: Math.min(completed / planned, 1), actualDurationMinutes, plannedDurationMinutes, tierCounts, achievedTotal, achievedUnit }
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (progress.length === 0) return
    onSave({
      id: `review:${weekStart}`,
      weekStart,
      items: progress.map(({ activity, completed, planned, adherence, actualDurationMinutes, plannedDurationMinutes, tierCounts, achievedTotal, achievedUnit }) => ({
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
        achievedTotal: isTieredGoal(activity) ? achievedTotal : undefined,
        achievedUnit: isTieredGoal(activity) ? achievedUnit : undefined,
      })),
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">{formatShortDate(weekStart)} — {formatShortDate(weekEnd)}</p><h1>每周复盘</h1></div>
        <ClipboardCheck aria-hidden="true" className="header-icon" />
      </header>
      {activities.length === 0 ? (
        <div className="empty-panel"><Star aria-hidden="true" /><p>启用关键行为后，这里会生成本周复盘。</p></div>
      ) : (
        <form onSubmit={submit} className="review-form">
          {progress.map(({ activity, completed, planned, adherence, actualDurationMinutes, plannedDurationMinutes, tierCounts, achievedTotal, achievedUnit }) => {
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
                    <strong>累计至少 {formatGoalValue(achievedTotal, activity.goal.metric, achievedUnit ?? activity.goal.unit)}</strong>
                  </div>
                )}
                <div className="review-fields">
                  <label>现实帮助
                    <select value={draft.impact} onChange={(event) => update({ impact: Number(event.target.value) })}>
                      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>执行阻力
                    <select value={draft.friction} onChange={(event) => update({ friction: Number(event.target.value) })}>
                      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                </div>
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
      )}
    </>
  )
}

function SettingsPage({
  preferences,
  activities,
  onPreferences,
  onRefresh,
  onNotice,
  onEditGoal,
}: {
  preferences: Preferences
  activities: Activity[]
  onPreferences: (value: Preferences) => Promise<void>
  onRefresh: () => Promise<void>
  onNotice: (message: string) => void
  onEditGoal: (activity: Activity) => void
}) {
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
    <>
      <header className="page-header"><div><p className="eyebrow">本机设置</p><h1>设置</h1></div><SettingsIcon aria-hidden="true" className="header-icon" /></header>
      <section className="content-section settings-section">
        <div className="section-heading"><h2>即时反馈</h2></div>
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
        <div className="section-heading"><h2>活动管理</h2></div>
        {activities.length === 0 && <p className="empty-state">还没有活动</p>}
        {activities.map((activity) => (
          <div className="manage-row" key={activity.id}>
            <div><strong>{activity.title}</strong><span>{activity.attribute} · {activity.difficulty}</span></div>
            <div className="manage-actions">
              {activity.type === 'habit' && (
                <button className="icon-button" type="button" title="设置习惯目标" onClick={() => onEditGoal(activity)}>
                  <SlidersHorizontal aria-hidden="true" />
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
            </div>
          </div>
        ))}
      </section>

      <section className="content-section settings-section">
        <div className="section-heading"><h2>本地数据</h2></div>
        <div className="data-actions">
          <button type="button" onClick={() => void exportJson()}><Download aria-hidden="true" />导出 JSON</button>
          <button type="button" onClick={() => void exportMarkdown()}><Download aria-hidden="true" />导出账本</button>
          <label className="file-button"><Upload aria-hidden="true" />恢复 JSON
            <input type="file" accept="application/json,.json" onChange={(event) => void importJson(event.target.files?.[0])} />
          </label>
        </div>
      </section>
      <footer className="version-footer"><ShieldCheck aria-hidden="true" />数据仅保存在本机 · V2.1.0</footer>
    </>
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
  const [tierMetric, setTierMetric] = useState<TierMetric>('duration')
  const [thresholds, setThresholds] = useState<[string, string, string]>(['5', '20', '45'])
  const [goalUnit, setGoalUnit] = useState('次')
  const [plannedOn, setPlannedOn] = useState(localDate())
  const [isKey, setIsKey] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    const goal: Activity['goal'] = type === 'habit' && goalMode === 'tiered'
      ? {
          kind: 'tiered',
          metric: tierMetric,
          unit: tierMetric === 'duration' ? '分钟' : goalUnit,
          thresholds: thresholds.map(Number) as [number, number, number],
        }
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
        <div className="modal-header"><h2 id="create-title">创建行动</h2><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <div className="segmented-control">
          <button type="button" className={type === 'habit' ? 'selected' : ''} onClick={() => setType('habit')}>习惯</button>
          <button type="button" className={type === 'task' ? 'selected' : ''} onClick={() => setType('task')}>一次性任务</button>
        </div>
        <label className="full-field">名称<input required maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>
        <div className="field-grid">
          <label>属性<select value={attribute} onChange={(event) => setAttribute(event.target.value as Attribute)}>{attributes.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>难度<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>{difficulties.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
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
              <TierGoalFields
                metric={tierMetric}
                thresholds={thresholds}
                unit={goalUnit}
                onMetric={setTierMetric}
                onThresholds={setThresholds}
                onUnit={setGoalUnit}
              />
            )}
          </>
        ) : <label className="full-field">计划日期<input type="date" required value={plannedOn} onChange={(event) => setPlannedOn(event.target.value)} /></label>}
        <label className="checkbox-field"><input type="checkbox" checked={isKey} onChange={(event) => setIsKey(event.target.checked)} /><Star aria-hidden="true" />关键行为</label>
        <button className="primary-action" type="submit"><Plus aria-hidden="true" />创建</button>
      </form>
    </div>
  )
}

function TierGoalFields({
  metric,
  thresholds,
  unit,
  onMetric,
  onThresholds,
  onUnit,
}: {
  metric: TierMetric
  thresholds: [string, string, string]
  unit: string
  onMetric: (metric: TierMetric) => void
  onThresholds: (thresholds: [string, string, string]) => void
  onUnit: (unit: string) => void
}) {
  const maximum = metric === 'duration' ? 1440 : 999
  return (
    <div className="tier-goal-fields">
      <div className="goal-type-block">
        <span>度量方式</span>
        <div className="segmented-control" aria-label="度量方式">
          <button type="button" className={metric === 'duration' ? 'selected' : ''} onClick={() => { onMetric('duration'); onThresholds(['5', '20', '45']) }}>按时间</button>
          <button type="button" className={metric === 'count' ? 'selected' : ''} onClick={() => { onMetric('count'); onThresholds(['1', '3', '5']) }}>按次数</button>
        </div>
      </div>
      {metric === 'count' && <label className="full-field">次数单位<input required maxLength={12} value={unit} onChange={(event) => onUnit(event.target.value)} /></label>}
      <div className="tier-threshold-grid">
        {tierLevels.map((tier, index) => (
          <label key={tier}>{tierLabels[tier]}层（{metric === 'duration' ? '分钟' : unit || '单位'}）
            <input
              type="number"
              min={1}
              max={maximum}
              step={1}
              required
              value={thresholds[index]}
              onChange={(event) => {
                const next = [...thresholds] as [string, string, string]
                next[index] = event.target.value
                onThresholds(next)
              }}
            />
          </label>
        ))}
      </div>
      <span className="field-hint">基础、标准、突破必须依次增加</span>
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
  const thresholds = completion?.tierThresholds ?? activity.goal.thresholds
  const metric = completion?.tierMetric ?? activity.goal.metric
  const unit = completion?.tierUnit ?? activity.goal.unit
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
                <span><b>{tierLabels[tier]}层</b><small>{formatGoalValue(thresholds[tier - 1], metric, unit)}</small></span>
                <strong>{currentTier ? `再 +${reward.xp - currentXp} XP` : `+${reward.xp} XP · +${reward.coins} 金币`}</strong>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function GoalSettingsModal({ activity, onClose, onSave }: { activity: Activity; onClose: () => void; onSave: (goal: Activity['goal']) => void }) {
  const tiered = isTieredGoal(activity)
  const legacy = activity.goal.kind !== 'tiered' && (isDurationGoal(activity) || activity.goal.count !== 1 || activity.goal.unit !== '次')
  const initialMetric: TierMetric = tiered ? activity.goal.metric : isDurationGoal(activity) ? 'duration' : 'count'
  const [mode, setMode] = useState<'legacy' | 'single' | 'tiered'>(tiered ? 'tiered' : legacy ? 'legacy' : 'single')
  const [metric, setMetric] = useState<TierMetric>(initialMetric)
  const [unit, setUnit] = useState(tiered ? activity.goal.unit : initialMetric === 'count' && activity.goal.kind !== 'tiered' ? activity.goal.unit : '次')
  const [thresholds, setThresholds] = useState<[string, string, string]>(
    tiered
      ? activity.goal.thresholds.map(String) as [string, string, string]
      : legacy && activity.goal.kind !== 'tiered'
        ? ['', String(activity.goal.count), '']
        : ['1', '3', '5'],
  )

  function submit(event: FormEvent) {
    event.preventDefault()
    if (mode === 'legacy') return onSave(activity.goal)
    if (mode === 'single') return onSave({ kind: 'count', count: 1, unit: '次' })
    onSave({
      kind: 'tiered',
      metric,
      unit: metric === 'duration' ? '分钟' : unit,
      thresholds: thresholds.map(Number) as [number, number, number],
    })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={submit} aria-labelledby="goal-settings-title">
        <div className="modal-header"><h2 id="goal-settings-title">{activity.title}</h2><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <div className="segmented-control" aria-label="目标设置">
          {legacy && <button type="button" className={mode === 'legacy' ? 'selected' : ''} onClick={() => setMode('legacy')}>保留原目标</button>}
          <button type="button" className={mode === 'single' ? 'selected' : ''} onClick={() => setMode('single')}>单次完成</button>
          <button type="button" className={mode === 'tiered' ? 'selected' : ''} onClick={() => setMode('tiered')}>三层目标</button>
        </div>
        {mode === 'legacy' && activity.goal.kind !== 'tiered' && <p className="legacy-goal">当前目标：{activity.goal.count}{activity.goal.unit}</p>}
        {mode === 'tiered' && (
          <TierGoalFields metric={metric} thresholds={thresholds} unit={unit} onMetric={setMetric} onThresholds={setThresholds} onUnit={setUnit} />
        )}
        <button className="primary-action" type="submit"><Check aria-hidden="true" />保存目标</button>
      </form>
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
  return (
    <aside className="feedback-overlay" role="status" aria-live="assertive">
      <TravelerPortrait stage={stage} label="像素旅者成长反馈" />
      <div className="feedback-copy">
        <span>{feedback.upgraded ? '层次升级' : '行动完成'}</span>
        <strong>{feedback.title}</strong>
        <div className="reward-gains"><b>+{feedback.xp} XP</b>{feedback.coins > 0 && <b>+{feedback.coins} 金币</b>}<b>{feedback.attribute}</b></div>
        {feedback.durationMinutes && <p className="feedback-duration">本次持续 {feedback.durationMinutes} 分钟</p>}
        {feedback.tier && <p className="feedback-duration">{tierLabels[feedback.tier]}层 · 至少 {feedback.achievedLabel}</p>}
        <p>{identityMessage(feedback.attribute)}</p>
        <ProgressBar value={feedback.level.progress} label={`Lv.${feedback.level.level} · ${feedback.level.current}/${feedback.level.needed} XP`} compact />
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
    const tiers = tierLevels.map((tier) => `${tierLabels[tier]} ${formatGoalValue(goal.thresholds[tier - 1], goal.metric, goal.unit)}`).join(' · ')
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
