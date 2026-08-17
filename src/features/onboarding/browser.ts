export const OFFICIAL_APP_URL = 'https://zhuyong1297-dev.github.io/life-rpg-pwa/'

export interface BrowserEnvironmentInput {
  userAgent?: string
  platform?: string
  maxTouchPoints?: number
  standalone?: boolean
  installPromptSupported?: boolean
}

export interface BrowserEnvironment {
  wechat: boolean
  android: boolean
  ios: boolean
  standalone: boolean
  installPromptSupported: boolean
}

export function detectBrowserEnvironment(input: BrowserEnvironmentInput = {}): BrowserEnvironment {
  const userAgent = input.userAgent ?? ''
  const platform = input.platform ?? ''
  const maxTouchPoints = input.maxTouchPoints ?? 0
  const ipadDesktopMode = /Mac/i.test(platform) && maxTouchPoints > 1

  return {
    wechat: /MicroMessenger/i.test(userAgent),
    android: /Android/i.test(userAgent),
    ios: /iPad|iPhone|iPod/i.test(userAgent) || ipadDesktopMode,
    standalone: Boolean(input.standalone),
    installPromptSupported: Boolean(input.installPromptSupported),
  }
}

export function getRuntimeBrowserEnvironment(installPromptSupported = false, standaloneOverride?: boolean) {
  const navigatorStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  return detectBrowserEnvironment({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: standaloneOverride ?? (navigatorStandalone || displayModeStandalone),
    installPromptSupported,
  })
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // 微信 WebView 可能暴露 Clipboard API 却拒绝权限，继续使用本地复制回退。
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('无法复制，请长按选择链接')
}
