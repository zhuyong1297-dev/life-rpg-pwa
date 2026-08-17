import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, Database, Download, ExternalLink, FileDown, MessageCircle, ShieldCheck, Smartphone, X } from 'lucide-react'

import type { BrowserEnvironment } from './browser'
import { copyText, OFFICIAL_APP_URL } from './browser'
import type { InstallPromptOutcome } from './usePwaInstall'
import type { NewcomerProgressData } from './progress'

function OnboardingDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose?: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else {
        dialog.setAttribute('open', '')
        dialog.querySelector<HTMLElement>('button, [href], input')?.focus()
      }
    }
    return () => {
      if (dialog?.open) {
        if (typeof dialog.close === 'function') dialog.close()
        else dialog.removeAttribute('open')
      }
    }
  }, [])

  return (
    <dialog
      className="v5-onboarding-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        onClose?.()
      }}
      onClick={(event) => {
        if (onClose && event.target === event.currentTarget) onClose()
      }}
    >
      <section>
        <header>
          <h2 id={titleId}>{title}</h2>
          {onClose && <button type="button" aria-label={`关闭${title}`} title="关闭" onClick={onClose}><X size={21} /></button>}
        </header>
        {children}
      </section>
    </dialog>
  )
}

export function WeChatLaunchGuide({
  officialUrl = OFFICIAL_APP_URL,
  onContinue,
}: {
  officialUrl?: string
  onContinue: () => void
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copyOfficialUrl() {
    try {
      await copyText(officialUrl)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <OnboardingDialog title="先用系统浏览器打开">
      <div className="v5-onboarding-lead"><MessageCircle size={22} /><p>微信浏览器和 Chrome / Safari 会各自保存一份本地数据，二者不会自动迁移。</p></div>
      <ol className="v5-onboarding-steps">
        <li>复制下面的正式版地址。</li>
        <li>点微信右上角菜单，选择“在浏览器打开”。</li>
        <li>在系统浏览器中安装并开始记录。</li>
      </ol>
      <button className="v5-onboarding-primary" type="button" onClick={() => void copyOfficialUrl()}>
        {copyState === 'copied' ? <Check size={18} /> : <Copy size={18} />}
        {copyState === 'copied' ? '地址已复制' : '复制正式版地址'}
      </button>
      {copyState === 'failed' && <p className="v5-onboarding-error" role="alert">复制失败，请长按链接：<span>{officialUrl}</span></p>}
      <button className="v5-onboarding-secondary" type="button" onClick={onContinue}>仍在微信中临时体验</button>
      <p className="v5-onboarding-footnote">临时体验产生的数据只留在微信浏览器中，以后不会自动进入已安装应用。</p>
    </OnboardingDialog>
  )
}

export function InstallInstructions({
  environment,
  officialUrl = OFFICIAL_APP_URL,
  onInstall,
}: {
  environment: BrowserEnvironment
  officialUrl?: string
  onInstall?: () => Promise<InstallPromptOutcome>
}) {
  const [result, setResult] = useState<InstallPromptOutcome>()
  const [copied, setCopied] = useState(false)

  async function install() {
    if (!onInstall) return
    setResult(await onInstall())
  }

  async function copyUrl() {
    try {
      await copyText(officialUrl)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (environment.standalone) {
    return <section className="v5-install-guide compact"><Check size={20} /><div><strong>已经安装</strong><p>以后可以直接从手机桌面打开。</p></div></section>
  }

  if (environment.wechat) {
    return (
      <section className="v5-install-guide">
        <Smartphone size={22} />
        <div><strong>请先转到系统浏览器</strong><p>点微信右上角菜单，选择“在浏览器打开”，避免数据留在微信浏览器。</p></div>
        <button type="button" onClick={() => void copyUrl()}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? '已复制' : '复制地址'}</button>
      </section>
    )
  }

  if (environment.android && result === 'accepted') {
    return (
      <section className="v5-install-guide compact">
        <Check size={20} />
        <div><strong>安装请求已接受</strong><p>系统正在完成安装，稍后可从手机桌面打开。</p></div>
        <button type="button" disabled>已接受安装</button>
      </section>
    )
  }

  if (environment.android && environment.installPromptSupported && onInstall) {
    return (
      <section className="v5-install-guide">
        <Download size={22} />
        <div><strong>安装到手机</strong><p>同一 Chrome 安装通常会继续使用当前站点数据；安装后请先核对首项行动。</p></div>
        <button type="button" disabled={result === 'accepted'} onClick={() => void install()}>{result === 'accepted' ? '已接受安装' : '安装应用'}</button>
        {result === 'dismissed' && <small>已取消，本页稍后仍可继续使用。</small>}
        {result === 'unavailable' && <small>浏览器暂未提供安装，请使用菜单中的“安装应用”。</small>}
      </section>
    )
  }

  if (environment.ios) {
    return (
      <section className="v5-install-guide">
        <ExternalLink size={22} />
        <div><strong>添加到主屏幕</strong><p>在当前浏览器点击“分享”，再选择“添加到主屏幕”。如果新入口没有原数据，请先从浏览器导出 JSON，再到新入口恢复。</p></div>
      </section>
    )
  }

  return (
    <section className="v5-install-guide">
      <Smartphone size={22} />
      <div><strong>使用浏览器菜单安装</strong><p>打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。</p></div>
    </section>
  )
}

export function DataStorageGuide({
  environment,
  onInstall,
  onClose,
}: {
  environment: BrowserEnvironment
  onInstall?: () => Promise<InstallPromptOutcome>
  onClose: () => void
}) {
  return (
    <OnboardingDialog title="数据保存在这台设备" onClose={onClose}>
      <div className="v5-data-guide-list">
        <div><ShieldCheck size={20} /><span><strong>默认只存在本机</strong><small>应用没有账号、云同步或后台遥测。</small></span></div>
        <div><Database size={20} /><span><strong>不同入口可能彼此隔离</strong><small>是否共享取决于平台。换浏览器或安装后请先核对数据，不一致时使用 JSON 迁移。</small></span></div>
        <div><FileDown size={20} /><span><strong>定期导出 JSON 备份</strong><small>更换手机或清除浏览器数据前，请先到“我的 → 数据中心”导出完整备份。</small></span></div>
      </div>
      <InstallInstructions environment={environment} onInstall={onInstall} />
      <button className="v5-onboarding-secondary" type="button" onClick={onClose}>我知道了</button>
    </OnboardingDialog>
  )
}

export function NewcomerProgress({
  progress,
  onFeedback,
  onDismiss,
}: {
  progress: NewcomerProgressData
  onFeedback: () => void
  onDismiss: () => void
}) {
  return (
    <section className="v5-newcomer-progress" aria-label="七日新手体验">
      <div className="v5-newcomer-progress-copy">
        <span>七日体验 · 第 {progress.day}/7 天</span>
        <strong>第一项行动已完成 {progress.completedDays} 天</strong>
        <p>{progress.feedbackAvailable ? '你已经可以分享这七天的真实体验。' : '下一步只做一件事：今天完成一次最低标准。'}</p>
      </div>
      <div className="v5-newcomer-progress-actions">
        {progress.feedbackAvailable && <button type="button" onClick={onFeedback}>分享体验</button>}
        <button className="icon" type="button" title="关闭七日体验提示" aria-label="关闭七日体验提示" onClick={onDismiss}><X size={18} /></button>
      </div>
    </section>
  )
}
