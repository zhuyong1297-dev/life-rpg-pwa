import type { Attribute, Preferences } from './domain'

export async function sendCompletionFeedback(
  preferences: Preferences,
  detail: { title: string; xp: number; coins: number; attribute: Attribute; durationMinutes?: number },
) {
  if (preferences.vibration && 'vibrate' in navigator) navigator.vibrate([35, 30, 55])
  if (preferences.sound) playSoftTone()
  if (!preferences.notifications || !('Notification' in window) || Notification.permission !== 'granted') return 'unavailable'
  try {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification('行动已完成', {
      body: `+${detail.xp} XP · +${detail.coins} 金币 · ${detail.attribute}${detail.durationMinutes ? ` · ${detail.durationMinutes} 分钟` : ''}`,
      icon: `${import.meta.env.BASE_URL}app-icon.png`,
      badge: `${import.meta.env.BASE_URL}app-icon.png`,
      tag: `completion-${Date.now()}`,
    })
    return 'sent'
  } catch {
    return 'failed'
  }
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported' as const
  return Notification.requestPermission()
}

function playSoftTone() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 520
    gain.gain.setValueAtTime(0.04, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.16)
  } catch {
    // 声音是附加反馈，不影响完成事务。
  }
}
