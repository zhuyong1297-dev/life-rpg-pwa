import { useRef, useState } from 'react'
import { BookOpen, Check, ChevronLeft, ChevronRight, Clock3, Coins, Compass, Sparkles, Star, Target } from 'lucide-react'

import { formatTierGoalValue, getTierCount, getTierLevels, getTierReward, growthDomainDetails, growthDomains, type GrowthDomain } from '../../domain'
import { V5ModalSurface } from '../../prototype/v5/shared'
import {
  buildStarterActivity,
  getStarterHabitsForDomain,
  starterPlanTemplates,
  type StarterHabitTemplate,
  type StarterPlanTemplate,
} from './templates'

function rewardLabel(template: StarterHabitTemplate) {
  const goal = template.goal
  if (goal.kind !== 'tiered') return ''
  const levels = getTierLevels(goal)
  const first = getTierReward(template.difficulty, levels[0], getTierCount(goal))
  const last = getTierReward(template.difficulty, levels.at(-1)!, getTierCount(goal))
  return `+${first.xp}～${last.xp} XP · +${first.coins} 金币`
}

function goalLabel(template: StarterHabitTemplate) {
  const goal = template.goal
  if (goal.kind !== 'tiered') return ''
  return getTierLevels(goal)
    .map((tier) => `${tier === 1 ? '基础' : '标准'} ${formatTierGoalValue(goal, tier)}`)
    .join(' · ')
}

export function StarterHabitCard({ template, onSelect }: { template: StarterHabitTemplate; onSelect: () => void }) {
  return (
    <button className="starter-habit-card" type="button" onClick={onSelect}>
      <span className="starter-card-domain">{growthDomainDetails[template.domain!].label} · {template.difficulty}</span>
      <strong>{template.title}</strong>
      <p>{template.summary}</p>
      <small>{goalLabel(template)}</small>
      <b>{rewardLabel(template)}</b>
      <ChevronRight aria-hidden="true" />
    </button>
  )
}

export function StarterHabitPreview({
  template,
  firstActivity,
  submitting,
  error,
  onClose,
  onConfirm,
  onCustomize,
}: {
  template: StarterHabitTemplate
  firstActivity: boolean
  submitting?: boolean
  error?: string
  onClose: () => void
  onConfirm: () => void
  onCustomize: () => void
}) {
  const goal = template.goal
  return (
    <V5ModalSurface title={template.title} kicker="推荐习惯预览" onClose={onClose}>
      <div className="starter-preview">
        <p className="starter-preview-summary">{template.summary}</p>
        <dl>
          <div><dt>成长领域</dt><dd>{growthDomainDetails[template.domain!].label}</dd></div>
          <div><dt>计划</dt><dd>{template.schedule.kind === 'daily' ? '每天' : template.schedule.kind === 'weekly' ? `每周 ${template.schedule.times} 次` : '仅一次'}</dd></div>
          <div><dt>触发条件</dt><dd>{template.cue}</dd></div>
          <div><dt>难度与奖励</dt><dd>{template.difficulty} · {rewardLabel(template)}</dd></div>
        </dl>
        {goal.kind === 'tiered' && (
          <div className="starter-preview-levels">
            {getTierLevels(goal).map((tier) => {
              const reward = getTierReward(template.difficulty, tier, getTierCount(goal))
              return (
                <div key={tier}>
                  <span>{tier === 1 ? '基础层' : '标准层'}</span>
                  <strong>{formatTierGoalValue(goal, tier)}</strong>
                  <small>+{reward.xp} XP{tier === 1 ? ` · +${reward.coins} 金币` : ' · 金币不重复'}</small>
                </div>
              )
            })}
          </div>
        )}
        <div className="starter-preview-protocol"><Target aria-hidden="true" /><span><strong>怎样执行</strong><p>{template.protocol}</p></span></div>
        {firstActivity && <p className="starter-first-note"><Star aria-hidden="true" />这将成为第一条关键行动，并开始无惩罚的七日体验。</p>}
        {error && <p className="starter-error" role="alert">{error}</p>}
        <div className="starter-preview-actions">
          <button className="secondary-action" type="button" disabled={submitting} onClick={onCustomize}>调整后使用</button>
          <button className="primary-action" type="button" disabled={submitting} onClick={onConfirm}><Check aria-hidden="true" />{submitting ? '创建中…' : '确认创建'}</button>
        </div>
      </div>
    </V5ModalSurface>
  )
}

function StarterPlanPreview({
  template,
  replacingDraft,
  submitting,
  error,
  onClose,
  onConfirm,
}: {
  template: StarterPlanTemplate
  replacingDraft: boolean
  submitting: boolean
  error?: string
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <V5ModalSurface title={template.title} kicker="28 天计划预览" onClose={onClose}>
      <div className="starter-preview starter-plan-preview">
        <p className="starter-preview-summary">{template.summary}</p>
        <section><span>建议成功标准</span><p>{template.successCriterion}</p></section>
        <div className="starter-plan-behaviors">
          {template.behaviors.map((behavior) => (
            <div key={behavior.id}>
              <span>{behavior.role === 'start' ? '启动' : behavior.role === 'progress' ? '推进' : '维护/收尾'}</span>
              <strong>{behavior.title}</strong>
              <small>{growthDomainDetails[behavior.domain!].label} · {goalLabel(behavior)}</small>
            </div>
          ))}
        </div>
        <p className="starter-plan-safety"><Compass aria-hidden="true" />下一步会进入目标规划器。你仍需填写个人基线、逐项确认行为并通过现实检查。</p>
        {replacingDraft && <p className="starter-replace-note" role="alert">当前已有一份规划草稿。继续将替换它，不会修改活动或赛季。</p>}
        {error && <p className="starter-error" role="alert">{error}</p>}
        <div className="starter-preview-actions">
          <button className="secondary-action" type="button" disabled={submitting} onClick={onClose}>返回</button>
          <button className="primary-action" type="button" disabled={submitting} onClick={onConfirm}><ChevronRight aria-hidden="true" />{submitting ? '保存中…' : replacingDraft ? '确认替换并继续' : '生成规划草稿'}</button>
        </div>
      </div>
    </V5ModalSurface>
  )
}

export function StarterLibraryPage({
  firstActivity,
  hasDraft,
  onBack,
  onCreateHabit,
  onCustomizeHabit,
  onUsePlan,
}: {
  firstActivity: boolean
  hasDraft: boolean
  onBack: () => void
  onCreateHabit: (template: StarterHabitTemplate) => Promise<void>
  onCustomizeHabit: (template: StarterHabitTemplate) => void
  onUsePlan: (template: StarterPlanTemplate) => Promise<void>
}) {
  const [domain, setDomain] = useState<GrowthDomain>('health')
  const [habit, setHabit] = useState<StarterHabitTemplate>()
  const [plan, setPlan] = useState<StarterPlanTemplate>()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const submittingRef = useRef(false)

  async function run(action: () => Promise<void>) {
    if (submittingRef.current) return
    submittingRef.current = true
    setError('')
    setSubmitting(true)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '暂时无法保存，请稍后重试')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <main className="starter-library-page">
      <header className="starter-library-header">
        <button type="button" onClick={onBack}><ChevronLeft aria-hidden="true" />返回</button>
        <div><span>个人成长教练</span><h1>习惯与计划库</h1><p>推荐只负责降低开始阻力，确认前不会修改你的数据。</p></div>
      </header>

      <section className="starter-library-section" aria-labelledby="starter-habits-title">
        <div className="starter-library-heading"><div><span>先做一件小事</span><h2 id="starter-habits-title">推荐习惯</h2></div><small>选一个最想改善的现实领域</small></div>
        <div className="starter-domain-tabs" role="tablist" aria-label="成长领域">
          {growthDomains.map((value) => (
            <button key={value} role="tab" aria-selected={domain === value} className={domain === value ? 'selected' : ''} type="button" onClick={() => setDomain(value)}>{growthDomainDetails[value].label}</button>
          ))}
        </div>
        <div className="starter-habit-grid">
          {getStarterHabitsForDomain(domain).map((template) => <StarterHabitCard key={template.id} template={template} onSelect={() => { setError(''); setHabit(template) }} />)}
        </div>
      </section>

      <section className="starter-library-section" aria-labelledby="starter-plans-title">
        <div className="starter-library-heading"><div><span>再建立完整系统</span><h2 id="starter-plans-title">28 天计划</h2></div><small>每套方案最多三项行为</small></div>
        <div className="starter-plan-grid">
          {starterPlanTemplates.map((template) => (
            <button key={template.id} className="starter-plan-card" type="button" onClick={() => { setError(''); setPlan(template) }}>
              <span><Sparkles aria-hidden="true" />28 天</span>
              <strong>{template.title}</strong>
              <p>{template.summary}</p>
              <small>{template.behaviors.map((behavior) => behavior.title).join(' · ')}</small>
              <b>预览方案<ChevronRight aria-hidden="true" /></b>
            </button>
          ))}
        </div>
      </section>

      <p className="starter-library-footnote"><BookOpen aria-hidden="true" />这些是通用起点，不会自动判断什么适合你。你可以在确认前调整，也可以完全自己创建。</p>

      {habit && (
        <StarterHabitPreview
          template={habit}
          firstActivity={firstActivity}
          submitting={submitting}
          error={error}
          onClose={() => setHabit(undefined)}
          onCustomize={() => {
            setHabit(undefined)
            onCustomizeHabit(habit)
          }}
          onConfirm={() => void run(() => onCreateHabit(habit))}
        />
      )}
      {plan && (
        <StarterPlanPreview
          template={plan}
          replacingDraft={hasDraft}
          submitting={submitting}
          error={error}
          onClose={() => setPlan(undefined)}
          onConfirm={() => void run(() => onUsePlan(plan))}
        />
      )}
    </main>
  )
}

export { buildStarterActivity }
