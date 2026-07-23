import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Coins,
  Compass,
  Dumbbell,
  Gift,
  GraduationCap,
  Leaf,
  ListChecks,
  Medal,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Target,
  UserRound,
  X,
} from 'lucide-react'
import {
  DOMAIN_PROGRESS,
  INITIAL_PROTOTYPE_STATE,
  PAGE_HASH,
  pageFromHash,
  type CompletionKey,
  type PrototypePage,
  type PrototypeState,
} from './prototype-data'

interface Feedback {
  title: string
  detail: string
  xp: number
  coins: number
}

interface LastChange {
  state: PrototypeState
  feedback: Feedback
}

const NAV_ITEMS = [
  { page: 'today' as const, label: '行动', icon: ListChecks },
  { page: 'growth' as const, label: '成长', icon: Compass },
  { page: 'review' as const, label: '复盘', icon: ClipboardCheck },
  { page: 'rewards' as const, label: '愿望', icon: Gift },
  { page: 'profile' as const, label: '我的', icon: UserRound },
]

const DOMAIN_ICONS = {
  health: Dumbbell,
  learning: GraduationCap,
  creation: Palette,
  career: BriefcaseBusiness,
  life: CircleDollarSign,
  mindset: Leaf,
}

function V5Prototype() {
  const [page, setPage] = useState<PrototypePage>(() => pageFromHash(window.location.hash))
  const [state, setState] = useState<PrototypeState>(INITIAL_PROTOTYPE_STATE)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [lastChange, setLastChange] = useState<LastChange | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [weeklyOpen, setWeeklyOpen] = useState(false)

  useEffect(() => {
    document.title = '地球 Online V5 原型'
    document.documentElement.dataset.prototype = 'v5'
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    theme?.setAttribute('content', '#146b50')

    const handleHash = () => setPage(pageFromHash(window.location.hash))
    window.addEventListener('hashchange', handleHash)
    return () => {
      window.removeEventListener('hashchange', handleHash)
      delete document.documentElement.dataset.prototype
    }
  }, [])

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(null), 10_000)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const navigate = (nextPage: PrototypePage) => {
    setPage(nextPage)
    window.location.hash = PAGE_HASH[nextPage]
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const commit = (
    update: (previous: PrototypeState) => PrototypeState,
    nextFeedback: Feedback,
  ) => {
    setState((previous) => {
      setLastChange({ state: previous, feedback: nextFeedback })
      return update(previous)
    })
    setFeedback(nextFeedback)
    navigator.vibrate?.(35)
  }

  const completeAction = (
    key: CompletionKey,
    title: string,
    detail: string,
    xp: number,
    coins: number,
  ) => {
    if (state.completed[key]) return
    commit(
      (previous) => ({
        ...previous,
        xp: previous.xp + xp,
        coins: previous.coins + coins,
        completed: { ...previous.completed, [key]: true },
      }),
      { title, detail, xp, coins },
    )
  }

  const recordWeeklyRun = (duration: number) => {
    if (state.weeklyRuns >= 3) return
    const reachesStandard = state.weeklyRuns + 1 === 3
    commit(
      (previous) => ({
        ...previous,
        xp: previous.xp + (reachesStandard ? 2 : 0),
        weeklyRuns: Math.min(3, previous.weeklyRuns + 1),
      }),
      {
        title: reachesStandard ? '跑步达到标准层' : '已记录本周跑步',
        detail: `${duration} 分钟 · 本周 ${Math.min(3, state.weeklyRuns + 1)}/3 次`,
        xp: reachesStandard ? 2 : 0,
        coins: 0,
      },
    )
    setWeeklyOpen(false)
  }

  const undo = () => {
    if (!lastChange) return
    setState(lastChange.state)
    setFeedback(null)
    setLastChange(null)
  }

  const addCustomAction = (title: string) => {
    setState((previous) => ({
      ...previous,
      customActions: [...previous.customActions, title],
    }))
    setCreateOpen(false)
  }

  return (
    <div className="v5-app">
      <DesktopRail active={page} onNavigate={navigate} onCreate={() => setCreateOpen(true)} />

      <main className="v5-main">
        {page === 'today' && (
          <TodayPage
            state={state}
            feedback={feedback}
            onCreate={() => setCreateOpen(true)}
            onComplete={completeAction}
            onOpenWeekly={() => setWeeklyOpen(true)}
            onUndo={undo}
          />
        )}
        {page === 'growth' && <GrowthPage state={state} onCreate={() => setCreateOpen(true)} />}
        {page === 'review' && <ReviewPreview />}
        {page === 'rewards' && <RewardsPreview />}
        {page === 'profile' && <ProfilePreview />}
      </main>

      <MobileNavigation active={page} onNavigate={navigate} />

      {createOpen && (
        <CreateActionSheet onClose={() => setCreateOpen(false)} onCreate={addCustomAction} />
      )}
      {weeklyOpen && (
        <WeeklyRecordSheet
          runs={state.weeklyRuns}
          onClose={() => setWeeklyOpen(false)}
          onRecord={recordWeeklyRun}
        />
      )}
    </div>
  )
}

function TodayPage({
  state,
  feedback,
  onCreate,
  onComplete,
  onOpenWeekly,
  onUndo,
}: {
  state: PrototypeState
  feedback: Feedback | null
  onCreate: () => void
  onComplete: (
    key: CompletionKey,
    title: string,
    detail: string,
    xp: number,
    coins: number,
  ) => void
  onOpenWeekly: () => void
  onUndo: () => void
}) {
  const completedToday = Object.values(state.completed).filter(Boolean).length

  return (
    <div className="page-shell today-layout">
      <section className="today-primary">
        <PageHeader
          eyebrow="行动日志 · 7月23日星期四"
          title="今天"
          onCreate={onCreate}
        />

        <StatusStrip xp={state.xp} coins={state.coins} completed={completedToday} />

        <section className="section-block">
          <SectionHeading
            title="时间锚点 + 灵活行动"
            description="时间是参考，不是必须。到时间、触发场景或随时行动。"
          />

          {feedback && (
            <FeedbackBar feedback={feedback} onUndo={onUndo} />
          )}

          <TimelineRow
            time="07:00"
            title="晨间唤醒"
            detail="基础层已完成"
            status={state.completed.morning ? 'done' : 'open'}
            onClick={() => onComplete('morning', '晨间唤醒已完成', '你正在改善身体状态', 3, 2)}
          />

          <FocusAction
            completed={state.completed.focus}
            onBasic={() => onComplete('focus', '单点开工达到基础层', '你正在推进现实结果', 6, 5)}
            onStandard={() => onComplete('focus', '单点开工达到标准层', '你完成了一段不切换目标的工作', 10, 5)}
          />

          <TimelineRow
            time="23:00"
            title="夜间收尾"
            detail={state.completed.evening ? '基础层已完成' : '计划执行'}
            icon="clock"
            status={state.completed.evening ? 'done' : 'open'}
            onClick={() => onComplete('evening', '夜间收尾已完成', '你正在恢复生活秩序', 3, 2)}
          />
        </section>

        <FlexibleActions
          state={state}
          onComplete={onComplete}
        />

        <WeeklyProgress
          runs={state.weeklyRuns}
          onOpen={onOpenWeekly}
        />
      </section>

      <aside className="today-aside">
        <TravelerSummary state={state} />
        <div className="aside-card">
          <span className="aside-label">今日节奏</span>
          <strong>{completedToday}/4 项行动</strong>
          <p>先完成当前触发的行动，其他习惯不需要排进时间轴。</p>
        </div>
        <button className="button primary wide" onClick={onCreate}>
          <Plus size={18} />
          创建行动
        </button>
      </aside>
    </div>
  )
}

function PageHeader({
  eyebrow,
  title,
  description,
  onCreate,
}: {
  eyebrow: string
  title: string
  description?: string
  onCreate: () => void
}) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <button className="icon-button create-top" onClick={onCreate} aria-label="创建行动" title="创建行动">
        <Plus size={22} />
      </button>
    </header>
  )
}

function StatusStrip({
  xp,
  coins,
  completed,
}: {
  xp: number
  coins: number
  completed: number
}) {
  const levelProgress = xp % 700
  return (
    <section className="status-strip" aria-label="角色状态">
      <div>
        <strong>Lv.7</strong>
        <span>{levelProgress} / 700 XP</span>
      </div>
      <div>
        <strong>稳定生活状态</strong>
        <span>第 11/28 天 · 今日 {completed}/4</span>
      </div>
      <div className="coins">
        <strong>{coins}</strong>
        <span>金币</span>
      </div>
    </section>
  )
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  )
}

function FeedbackBar({ feedback, onUndo }: { feedback: Feedback; onUndo: () => void }) {
  return (
    <div className="feedback-bar" role="status">
      <div className="feedback-icon">
        <Check size={18} />
      </div>
      <div>
        <strong>{feedback.title}</strong>
        <span>
          {feedback.detail}
          {feedback.xp > 0 && ` · +${feedback.xp} XP`}
          {feedback.coins > 0 && ` · +${feedback.coins} 金币`}
        </span>
      </div>
      <button className="text-button" onClick={onUndo}>
        <RotateCcw size={15} />
        撤销
      </button>
    </div>
  )
}

function TimelineRow({
  time,
  title,
  detail,
  status,
  icon,
  onClick,
}: {
  time: string
  title: string
  detail: string
  status: 'done' | 'open'
  icon?: 'clock'
  onClick: () => void
}) {
  return (
    <div className="timeline-row">
      <time>{time}</time>
      <button
        className={`round-check ${status === 'done' ? 'done' : ''}`}
        onClick={onClick}
        aria-label={`${status === 'done' ? '已完成' : '完成'}${title}`}
      >
        {status === 'done' ? <Check size={20} /> : icon === 'clock' ? <Clock3 size={18} /> : <Check size={18} />}
      </button>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  )
}

function FocusAction({
  completed,
  onBasic,
  onStandard,
}: {
  completed: boolean
  onBasic: () => void
  onStandard: () => void
}) {
  return (
    <article className={`focus-action ${completed ? 'completed' : ''}`}>
      <div className="focus-meta">
        <span>现在 · 第一段正式工作前</span>
        <span className="domain-tag">事业</span>
      </div>
      <h3>单点开工</h3>
      <p>{completed ? '基础层已完成，今天已经启动。' : '写下一个当前结果和一个可立即执行的动作。'}</p>
      {completed ? (
        <div className="completed-line">
          <Check size={18} />
          已记录基础层
        </div>
      ) : (
        <div className="action-buttons">
          <button className="button primary" onClick={onBasic}>记录基础 · 10 分钟</button>
          <button className="button secondary" onClick={onStandard}>标准 25 分钟</button>
        </div>
      )}
    </article>
  )
}

function FlexibleActions({
  state,
  onComplete,
}: {
  state: PrototypeState
  onComplete: (
    key: CompletionKey,
    title: string,
    detail: string,
    xp: number,
    coins: number,
  ) => void
}) {
  return (
    <section className="section-block compact-section">
      <SectionHeading title="今天随时" />
      <CompactAction
        title="阅读 10 分钟"
        meta="学习 · 简单 · 每日"
        done={state.completed.reading}
        onClick={() => onComplete('reading', '阅读已完成', '你正在理解并练习可迁移的知识', 5, 2)}
      />
      {state.customActions.map((title) => (
        <CompactAction key={title} title={title} meta="自定义 · 原型会话" done={false} />
      ))}
    </section>
  )
}

function CompactAction({
  title,
  meta,
  done,
  onClick,
}: {
  title: string
  meta: string
  done: boolean
  onClick?: () => void
}) {
  return (
    <div className="compact-action">
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <button className={`round-check ${done ? 'done' : ''}`} onClick={onClick} aria-label={`完成${title}`}>
        <Check size={18} />
      </button>
    </div>
  )
}

function WeeklyProgress({ runs, onOpen }: { runs: number; onOpen: () => void }) {
  return (
    <section className="weekly-progress">
      <div>
        <span className="eyebrow">本周灵活</span>
        <strong>跑步</strong>
        <small>{runs}/3 次达标 · 累计 40 分钟 · 还差 {Math.max(0, 3 - runs)} 次</small>
      </div>
      <button className="weekly-open" onClick={onOpen} aria-label="记录本周跑步">
        <ChevronRight size={20} />
      </button>
    </section>
  )
}

function TravelerSummary({ state }: { state: PrototypeState }) {
  return (
    <div className="traveler-summary">
      <img src={`${import.meta.env.BASE_URL}assets/v5/traveler-stage-2.png`} alt="行动者阶段旅者" />
      <div>
        <span>行动者 · 阶段 2</span>
        <strong>Lv.7</strong>
        <small>{state.xp % 700} / 700 XP</small>
      </div>
    </div>
  )
}

function GrowthPage({ state, onCreate }: { state: PrototypeState; onCreate: () => void }) {
  return (
    <div className="page-shell growth-layout">
      <section className="growth-primary">
        <PageHeader
          eyebrow="角色成长"
          title="成长"
          description="你正在成为更稳定的行动者。"
          onCreate={onCreate}
        />
        <section className="growth-hero">
          <TravelerSummary state={state} />
          <div className="growth-focus">
            <span>下一阶段重点领域</span>
            <strong>事业</strong>
            <p>完成下一份成长报告后重新选择。</p>
          </div>
        </section>

        <section className="section-block">
          <SectionHeading
            title="六个成长领域"
            description="按现实结果分类，每项行动只归入一个领域。"
          />
          <div className="domain-grid">
            {DOMAIN_PROGRESS.map((domain) => {
              const Icon = DOMAIN_ICONS[domain.id]
              return (
                <article className={`domain-card tone-${domain.tone}`} key={domain.id}>
                  <div>
                    <Icon size={20} />
                    <strong>{domain.label}</strong>
                  </div>
                  <span>{domain.xp} XP</span>
                </article>
              )
            })}
          </div>
        </section>

        <button className="next-reward">
          <Gift size={22} />
          <div>
            <span>下一奖励</span>
            <strong>Lv.10 · 现实愿望礼券</strong>
            <small>还需 1,240 XP</small>
          </div>
          <ChevronRight size={20} />
        </button>

        <button className="plain-row">
          <Medal size={20} />
          查看行动日志与成长轨迹
          <ChevronRight size={19} />
        </button>
      </section>

      <aside className="growth-aside">
        <div className="aside-card">
          <span className="aside-label">本周领域成长</span>
          <strong>事业 +38 XP</strong>
          <p>单点开工贡献最高。继续保持最低标准即可。</p>
        </div>
        <div className="aside-card">
          <span className="aside-label">当前愿望</span>
          <strong>山间温泉一日</strong>
          <p>{state.coins}/180 金币 · 预计还需 9 天</p>
        </div>
      </aside>
    </div>
  )
}

function ReviewPreview() {
  return (
    <SecondaryPreview
      eyebrow="第二阶段"
      title="复盘"
      description="核心原型确认后，这里会加入结论优先的每周复盘。"
      icon={<ClipboardCheck size={26} />}
      points={['先看现实结果', '再判断保留、调整或暂停', '建议必须说明依据']}
    />
  )
}

function RewardsPreview() {
  return (
    <SecondaryPreview
      eyebrow="第二阶段"
      title="愿望"
      description="愿望商店会围绕一个主目标和候选队列展开。"
      icon={<Gift size={26} />}
      points={['主目标金币进度', '奖励基金与兑现日期', '满足感轻复盘']}
    />
  )
}

function ProfilePreview() {
  return (
    <SecondaryPreview
      eyebrow="第二阶段"
      title="我的"
      description="设置、活动管理和数据安全将在核心体验确认后迁移。"
      icon={<Settings size={26} />}
      points={['活动管理', '反馈强度', '备份与恢复']}
    />
  )
}

function SecondaryPreview({
  eyebrow,
  title,
  description,
  icon,
  points,
}: {
  eyebrow: string
  title: string
  description: string
  icon: React.ReactNode
  points: string[]
}) {
  return (
    <div className="page-shell secondary-preview">
      <header>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <section>
        <div className="preview-icon">{icon}</div>
        <strong>先把每天最常用的闭环做好</strong>
        <p>当前页面保留导航位置，不接入真实功能或数据。</p>
        <ul>
          {points.map((point) => <li key={point}><Check size={15} />{point}</li>)}
        </ul>
      </section>
    </div>
  )
}

function MobileNavigation({
  active,
  onNavigate,
}: {
  active: PrototypePage
  onNavigate: (page: PrototypePage) => void
}) {
  return (
    <nav className="mobile-navigation" aria-label="主要导航">
      {NAV_ITEMS.map(({ page, label, icon: Icon }) => (
        <button
          key={page}
          className={page === active ? 'active' : ''}
          onClick={() => onNavigate(page)}
        >
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

function DesktopRail({
  active,
  onNavigate,
  onCreate,
}: {
  active: PrototypePage
  onNavigate: (page: PrototypePage) => void
  onCreate: () => void
}) {
  return (
    <aside className="desktop-rail">
      <div className="brand">
        <Sparkles size={22} />
        <div>
          <strong>地球 Online</strong>
          <span>V5 核心原型</span>
        </div>
      </div>
      <nav>
        {NAV_ITEMS.map(({ page, label, icon: Icon }) => (
          <button
            key={page}
            className={page === active ? 'active' : ''}
            onClick={() => onNavigate(page)}
          >
            <Icon size={20} />
            {label}
          </button>
        ))}
      </nav>
      <button className="button primary wide" onClick={onCreate}>
        <Plus size={18} />
        创建行动
      </button>
      <div className="prototype-notice">
        <strong>匿名设计原型</strong>
        <span>不读取或写入 IndexedDB</span>
      </div>
    </aside>
  )
}

function CreateActionSheet({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (title: string) => void
}) {
  const [title, setTitle] = useState('')
  const [schedule, setSchedule] = useState<'daily' | 'weekly' | 'once'>('daily')

  return (
    <Modal title="创建行动" onClose={onClose}>
      <div className="quick-create">
        <div className="info-banner">
          <strong>快速创建</strong>
          <span>先填写名称和频率，其他设置稍后完善。</span>
        </div>
        <label>
          行动名称
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：晨间阅读"
          />
        </label>
        <div className="segmented">
          {([
            ['daily', '每日'],
            ['weekly', '每周'],
            ['once', '一次性'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={schedule === value ? 'active' : ''}
              onClick={() => setSchedule(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="form-card">
          <span>触发条件</span>
          <strong>{schedule === 'daily' ? '今天随时' : schedule === 'weekly' ? '本周灵活' : '指定日期'}</strong>
        </div>
        <div className="form-card">
          <span>最低标准</span>
          <strong>基础 10 分钟 · 标准 25 分钟</strong>
        </div>
        <button
          className="button primary wide"
          disabled={!title.trim()}
          onClick={() => onCreate(title.trim())}
        >
          创建到匿名原型
        </button>
      </div>
    </Modal>
  )
}

function WeeklyRecordSheet({
  runs,
  onClose,
  onRecord,
}: {
  runs: number
  onClose: () => void
  onRecord: (duration: number) => void
}) {
  const remaining = Math.max(0, 3 - runs)
  return (
    <Modal title="记录本周跑步" onClose={onClose}>
      <div className="weekly-sheet">
        <div className="weekly-summary">
          <strong>本周 {runs}/3 次</strong>
          <span>{remaining > 0 ? `还差 ${remaining} 次到标准层` : '本周标准层已完成'}</span>
          <div className="progress-track">
            <span style={{ width: `${Math.min(100, (runs / 3) * 100)}%` }} />
          </div>
        </div>
        <p>选择这次真实完成的时长，点击后立即记录。</p>
        <div className="duration-grid">
          {[20, 30, 45].map((duration) => (
            <button key={duration} onClick={() => onRecord(duration)}>
              <Clock3 size={18} />
              <strong>{duration} 分钟</strong>
              {duration === 30 && <span>常用</span>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <button className="back-label" onClick={onClose}>
              <ArrowLeft size={17} />
              返回
            </button>
            <h2>{title}</h2>
          </div>
          <button className="icon-button ghost" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

export default V5Prototype
