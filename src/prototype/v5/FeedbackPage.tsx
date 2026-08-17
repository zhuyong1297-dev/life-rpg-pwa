import { useState, type FormEvent } from 'react'
import { ChevronLeft, Clipboard, Copy, Mail, ShieldCheck } from 'lucide-react'
import './feedback-page.css'

export const feedbackCategories = ['使用困难', '缺陷', '功能建议', '七日体验'] as const

export type FeedbackCategory = (typeof feedbackCategories)[number]
export type FeedbackSurface = 'browser' | 'standalone' | 'wechat'

export interface FeedbackSafeSummary {
  appVersion: string
  surface: FeedbackSurface
  activeDays: number
  primaryCompletionDays: number
}

export interface FeedbackFormValue {
  category: FeedbackCategory
  clarity: number
  realWorldHelp: number
  obstacle: string
  details: string
}

export interface FeedbackPageProps {
  summary: FeedbackSafeSummary
  onBack: () => void
  onOpenMailto?: (mailto: string) => void
  onCopyText?: (text: string) => Promise<void>
  onFeedbackAction?: () => void | Promise<void>
}

const feedbackEmail = 'zhuyong1297@gmail.com'
const surfaceLabels: Record<FeedbackSurface, string> = {
  browser: '浏览器',
  standalone: '已安装应用',
  wechat: '微信浏览器',
}

function safeLine(value: string, maximum: number) {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, maximum)
}

function safeDays(value: number) {
  return Math.min(7, Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0)))
}

function safeRating(value: number) {
  return Math.min(5, Math.max(1, Math.trunc(Number.isFinite(value) ? value : 3)))
}

function safeText(value: string, maximum: number) {
  return value.trim().slice(0, maximum) || '未填写'
}

export function buildFeedbackEmail(value: FeedbackFormValue, summary: FeedbackSafeSummary) {
  const obstacle = safeText(value.obstacle, 280)
  const details = safeText(value.details, 1_000)
  const body = [
    '地球 Online 使用反馈',
    '',
    '【用户主动填写】',
    `反馈类别：${value.category}`,
    `使用清晰度：${safeRating(value.clarity)}/5`,
    `现实帮助：${safeRating(value.realWorldHelp)}/5`,
    `最大阻力：${obstacle}`,
    `补充说明：${details}`,
    '',
    '【安全摘要】',
    `应用版本：${safeLine(summary.appVersion, 32)}`,
    `使用方式：${surfaceLabels[summary.surface]}`,
    ...(value.category === '七日体验' ? [
      `近七日活跃：${safeDays(summary.activeDays)} 天`,
      `第一项行动完成：${safeDays(summary.primaryCompletionDays)} 天`,
    ] : []),
    '',
    `以上摘要由应用在本机生成，仅包含上述${value.category === '七日体验' ? '四' : '两'}项。`,
  ].join('\n')
  const subject = `地球 Online 反馈：${value.category}`
  return {
    subject,
    body,
    mailto: `mailto:${feedbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  }
}

export function FeedbackPage({ summary, onBack, onOpenMailto, onCopyText, onFeedbackAction }: FeedbackPageProps) {
  const [value, setValue] = useState<FeedbackFormValue>({
    category: '使用困难',
    clarity: 3,
    realWorldHelp: 3,
    obstacle: '',
    details: '',
  })
  const [copyStatus, setCopyStatus] = useState('')
  const [manualCopy, setManualCopy] = useState('')
  const email = buildFeedbackEmail(value, summary)

  function markFeedbackAction() {
    void Promise.resolve(onFeedbackAction?.()).catch(() => undefined)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    markFeedbackAction()
    if (onOpenMailto) onOpenMailto(email.mailto)
    else window.location.href = email.mailto
  }

  async function copy(text: string, success: string, markCompleted = false) {
    try {
      if (onCopyText) await onCopyText(text)
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else throw new Error('clipboard unavailable')
      setManualCopy('')
      setCopyStatus(success)
      if (markCompleted) markFeedbackAction()
    } catch {
      setCopyStatus('当前浏览器无法自动复制，请在下方长按选择并复制。')
      setManualCopy(text)
    }
  }

  return (
    <div className="v5-page v5-feedback-page">
      <header className="v5-feedback-page-header">
        <button type="button" onClick={onBack} aria-label="返回我的页面"><ChevronLeft size={20} />返回</button>
        <div><span>共同改进</span><h1>帮助与反馈</h1><p>告诉我哪里阻碍了行动，反馈由你确认后发送。</p></div>
      </header>

      <form className="v5-feedback-form" onSubmit={submit}>
        <label className="v5-feedback-field">
          <span>反馈类别</span>
          <select value={value.category} onChange={(event) => setValue({ ...value, category: event.target.value as FeedbackCategory })}>
            {feedbackCategories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>

        <RatingField label="使用清晰度" value={value.clarity} onChange={(clarity) => setValue({ ...value, clarity })} />
        <RatingField label="现实帮助" value={value.realWorldHelp} onChange={(realWorldHelp) => setValue({ ...value, realWorldHelp })} />

        <label className="v5-feedback-field">
          <span>最大阻力</span>
          <textarea maxLength={280} rows={3} value={value.obstacle} onChange={(event) => setValue({ ...value, obstacle: event.target.value })} placeholder="哪一步最容易让你停下来？" />
        </label>

        <label className="v5-feedback-field">
          <span>补充说明 <small>{value.details.length}/1000</small></span>
          <textarea maxLength={1000} rows={6} value={value.details} onChange={(event) => setValue({ ...value, details: event.target.value })} placeholder="可以写复现步骤、期待的变化或七日体验。" />
        </label>

        <section className="v5-feedback-summary" aria-label="随反馈附带的安全摘要">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <strong>只附带必要的安全摘要</strong>
            <p>
              {safeLine(summary.appVersion, 32)} · {surfaceLabels[summary.surface]}
              {value.category === '七日体验' && ` · 近七日活跃 ${safeDays(summary.activeDays)} 天 · 第一项行动完成 ${safeDays(summary.primaryCompletionDays)} 天`}
            </p>
          </div>
        </section>

        <p className="v5-feedback-privacy">应用不会自动上传任何内容。点击后会打开本机邮件应用，只有你最终发送，内容才会离开本机。</p>

        <button className="v5-feedback-send" type="submit"><Mail size={19} aria-hidden="true" />打开邮件应用</button>
        <div className="v5-feedback-copy-actions">
          <button type="button" onClick={() => void copy(email.body, '反馈内容已复制', true)}><Clipboard size={18} aria-hidden="true" />复制反馈内容</button>
          <button type="button" onClick={() => void copy(feedbackEmail, '反馈邮箱已复制')}><Copy size={18} aria-hidden="true" />复制邮箱</button>
        </div>
        <p className="v5-feedback-copy-status" role="status" aria-live="polite">{copyStatus}</p>
        {manualCopy && <textarea className="v5-feedback-manual-copy" aria-label="手动复制内容" readOnly value={manualCopy} rows={5} />}
      </form>
    </div>
  )
}

function RatingField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <fieldset className="v5-feedback-rating">
      <legend>{label}</legend>
      <div>
        {[1, 2, 3, 4, 5].map((rating) => (
          <label key={rating}>
            <input type="radio" name={label} value={rating} checked={value === rating} onChange={() => onChange(rating)} />
            <span>{rating}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
