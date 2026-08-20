import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronRight, ClipboardCheck, Plus, RotateCcw, X } from 'lucide-react'
import { getCharacterStage, getCharacterStageName, getLevel, type TravelerAppearance } from '../../domain'
import { travelerAssetUrl } from '../../traveler'
import { getV5FeedbackDisplay } from './selectors'
import type { V5DailyRewardSummary, V5FeedbackView } from './types'

export function V5PageHeader({
  eyebrow,
  title,
  description,
  onCreate,
}: {
  eyebrow: string
  title: string
  description?: string
  onCreate?: () => void
}) {
  return (
    <header className="v5-page-header">
      <div><span>{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {onCreate && <button type="button" onClick={onCreate} title="创建行动" aria-label="创建行动"><Plus size={24} /></button>}
    </header>
  )
}

export function V5SectionHeading({ title, description }: { title: string; description?: string }) {
  return <div className="v5-section-heading"><h2>{title}</h2>{description && <p>{description}</p>}</div>
}

export function V5StatusStrip({
  level,
  coins,
  dailyRewardSummary,
}: {
  level: ReturnType<typeof getLevel>
  coins: number
  dailyRewardSummary: V5DailyRewardSummary
}) {
  return (
    <section className="v5-status-strip" aria-label="今日状态">
      <div><strong>Lv.{level.level}</strong><span>{level.current} / {level.needed} XP</span></div>
      <div><strong>今日 +{dailyRewardSummary.xp} XP · +{dailyRewardSummary.coins} 金币</strong><span>已达标 {dailyRewardSummary.actionCount} 项</span></div>
      <div><strong>{coins}</strong><span>金币</span></div>
    </section>
  )
}

export function V5PlanEntry({
  seasonTitle,
  coachPlanLabel,
  onOpenSeason,
  onOpenCoach,
}: {
  seasonTitle?: string
  coachPlanLabel: string
  onOpenSeason: () => void
  onOpenCoach: () => void
}) {
  const managingSeason = Boolean(seasonTitle)
  return (
    <button
      className="v5-plan-entry"
      type="button"
      aria-label={managingSeason ? '管理当前成长赛季' : coachPlanLabel}
      onClick={managingSeason ? onOpenSeason : onOpenCoach}
    >
      <ClipboardCheck size={20} />
      <span>
        <small>{managingSeason ? '本赛季' : '28 天目标'}</small>
        <strong>{seasonTitle ?? coachPlanLabel}</strong>
      </span>
      <ChevronRight size={18} />
    </button>
  )
}

export function V5Feedback({
  feedback,
  onUndo,
  onFollowUp,
}: {
  feedback: V5FeedbackView
  onUndo: () => void
  onFollowUp: () => void
}) {
  const [condensed, setCondensed] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setCondensed(true), 1_200)
    return () => window.clearTimeout(timer)
  }, [])

  const display = getV5FeedbackDisplay(feedback, condensed)
  return (
    <div
      className={`v5-feedback${condensed ? ' condensed' : ''}${display.showFollowUp ? ' follow-up' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="v5-feedback-icon">{display.showFollowUp ? <ClipboardCheck size={18} /> : <Check size={18} />}</span>
      <div className="v5-feedback-copy">
        <strong>{display.title}</strong>
        <span>{display.detail}</span>
        {!condensed && (
          <span className="v5-feedback-reward">
            {feedback.xp > 0 && <b>+{feedback.xp} XP</b>}
            {feedback.coins > 0 && <b>+{feedback.coins} 金币</b>}
          </span>
        )}
      </div>
      <div className="v5-feedback-actions">
        {display.showFollowUp && <button className="primary" type="button" onClick={onFollowUp}>{feedback.followUp?.kind === 'rating-note' ? '补充影响因素' : '记录状态'}</button>}
        <button type="button" onClick={onUndo}><RotateCcw size={16} />撤销</button>
      </div>
    </div>
  )
}


export function V5ModalSurface({
  title,
  kicker = '完整清单',
  onClose,
  children,
}: {
  title: string
  kicker?: string
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const panel = panelRef.current
    window.setTimeout(() => panel?.querySelector<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])')?.focus(), 0)
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
      openerRef.current?.focus()
    }
  }, [])

  function trapFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return
    const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? [])]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable.at(-1)!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="v5-list-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={panelRef} className="v5-list-dialog" role="dialog" aria-modal="true" aria-labelledby="v5-list-dialog-title" onKeyDown={trapFocus}>
        <header>
          <div><span>{kicker}</span><h2 id="v5-list-dialog-title">{title}</h2></div>
          <button type="button" title="关闭" aria-label={`关闭${title}`} onClick={onClose}><X size={21} /></button>
        </header>
        {children}
      </section>
    </div>
  )
}


export function V5TravelerSummary({ level, totalXp, appearance = 'masculine' }: { level: ReturnType<typeof getLevel>; totalXp: number; appearance?: TravelerAppearance }) {
  const stage = getCharacterStage(level.level)
  return (
    <div className="v5-traveler-summary">
      <img src={travelerAssetUrl(stage, appearance)} alt={`${getCharacterStageName(level.level)}阶段旅者`} />
      <div><span>{getCharacterStageName(level.level)} · 阶段 {stage}</span><strong>Lv.{level.level}</strong><small>{totalXp} XP</small></div>
    </div>
  )
}
