import { useState, type FormEvent } from 'react'
import { ChevronRight, Compass, Database, Sparkles } from 'lucide-react'

import type { NewActivity } from '../../db'
import { growthDomainDetails, growthDomains, type GrowthDomain } from '../../domain'
import { buildStarterActivity, getStarterHabitsForDomain, StarterHabitCard, StarterHabitPreview, type StarterHabitTemplate } from '../starter-library'

export function buildQuickStartActivity(title: string, domain: GrowthDomain): NewActivity {
  const normalizedTitle = title.trim()
  if (!normalizedTitle || normalizedTitle.length > 60) throw new Error('行动名称需要填写 1～60 个字')
  if (!growthDomains.includes(domain)) throw new Error('请选择成长领域')

  return {
    title: normalizedTitle,
    type: 'habit',
    domain,
    difficulty: '简单',
    goal: { count: 1, unit: '次' },
    schedule: { kind: 'daily' },
    isKey: true,
    enabled: true,
  }
}

export function QuickStart({
  onSubmit,
  onOpenFullSettings,
  onOpenLibrary,
  onLearnDataStorage,
}: {
  onSubmit: (activity: NewActivity) => void | Promise<void>
  onOpenFullSettings: (initial?: NewActivity) => void
  onOpenLibrary: () => void
  onLearnDataStorage: () => void
}) {
  const [title, setTitle] = useState('')
  const [domain, setDomain] = useState<GrowthDomain | ''>('')
  const [customOpen, setCustomOpen] = useState(false)
  const [selectedHabit, setSelectedHabit] = useState<StarterHabitTemplate>()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!domain || submitting) return
    setError('')
    setSubmitting(true)
    try {
      await onSubmit(buildQuickStartActivity(title, domain))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '暂时无法创建，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmRecommended() {
    if (!selectedHabit || submitting) return
    setError('')
    setSubmitting(true)
    try {
      await onSubmit(buildStarterActivity(selectedHabit, true))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '暂时无法创建，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="v5-quick-start" aria-labelledby="v5-quick-start-title">
      <header>
        <span><Sparkles size={18} />地球 Online · 第一次行动</span>
        <h2 id="v5-quick-start-title">先完成一件真正重要的小事</h2>
        <p>把现实行动变成即时反馈，再用七天判断它是否真的有帮助。</p>
      </header>
      <fieldset className="v5-domain-choice">
          <legend>你现在最想改善什么？</legend>
          {growthDomains.map((item) => (
            <label className={domain === item ? 'selected' : ''} key={item}>
              <input
                checked={domain === item}
                name="quick-start-domain"
                required
                type="radio"
                value={item}
                onChange={() => setDomain(item)}
              />
              <strong>{growthDomainDetails[item].label}</strong>
            </label>
          ))}
      </fieldset>
      <p className="v5-domain-choice-description" aria-live="polite">
        {domain ? growthDomainDetails[domain].description : '先选一个现实领域，再从两个低门槛习惯中挑一个。'}
      </p>
      {domain && (
        <div className="v5-quick-recommendations" aria-label={`${growthDomainDetails[domain].label}推荐习惯`}>
          {getStarterHabitsForDomain(domain).map((template) => (
            <StarterHabitCard key={template.id} template={template} onSelect={() => { setError(''); setSelectedHabit(template) }} />
          ))}
        </div>
      )}
      <button className="v5-onboarding-secondary v5-library-link" type="button" onClick={onOpenLibrary}><Compass size={17} />浏览全部习惯和计划</button>
      <button className="v5-custom-toggle" type="button" onClick={() => setCustomOpen((value) => !value)}>{customOpen ? '收起自定义' : '我想自己定义行动'}</button>
      {customOpen && (
        <form onSubmit={submit}>
          <label className="v5-onboarding-field">
            <span>行动名称</span>
            <input autoComplete="off" maxLength={60} placeholder="例如：阅读 10 分钟" required value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="v5-quick-start-summary" aria-label="行动设置摘要">
            <strong>每天 · 1 次 · 简单 · 关键行动</strong>
            <span>以后可以在活动管理中调整。</span>
          </div>
          {error && <p className="v5-onboarding-error" role="alert">{error}</p>}
          <button className="v5-onboarding-primary" disabled={!title.trim() || !domain || submitting} type="submit">
            {submitting ? '正在创建…' : '创建并开始'}{!submitting && <ChevronRight size={18} />}
          </button>
        </form>
      )}
      <div className="v5-quick-start-links">
        <button type="button" onClick={() => onOpenFullSettings()}>完整设置</button>
        <button type="button" onClick={onLearnDataStorage}><Database size={16} />了解数据保存方式</button>
      </div>
      {selectedHabit && (
        <StarterHabitPreview
          template={selectedHabit}
          firstActivity
          submitting={submitting}
          error={error}
          onClose={() => setSelectedHabit(undefined)}
          onCustomize={() => onOpenFullSettings(buildStarterActivity(selectedHabit, true))}
          onConfirm={() => void confirmRecommended()}
        />
      )}
    </section>
  )
}
