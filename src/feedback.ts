import { tierLabels, type Attribute, type Preferences, type TierLevel } from './domain'

let completionAudioContext: AudioContext | undefined

export async function prepareCompletionAudio() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return false
    if (!completionAudioContext || completionAudioContext.state === 'closed') completionAudioContext = new AudioContextClass()
    if (completionAudioContext.state === 'suspended') await completionAudioContext.resume()
    return completionAudioContext.state === 'running'
  } catch {
    return false
  }
}

export async function playCompletionChime(kind: 'completion' | 'level-up' = 'completion', prepared?: Promise<boolean>) {
  const ready = prepared ? await prepared : await prepareCompletionAudio()
  const context = completionAudioContext
  if (!ready || !context) return false
  try {
    const notes = kind === 'level-up' ? [523, 659, 784] : [523, 659]
    const start = context.currentTime
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const noteStart = start + index * 0.085
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, noteStart)
      gain.gain.setValueAtTime(0.0001, noteStart)
      gain.gain.linearRampToValueAtTime(kind === 'level-up' ? 0.1 : 0.085, noteStart + 0.018)
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.19)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(noteStart)
      oscillator.stop(noteStart + 0.2)
    })
    return true
  } catch {
    return false
  }
}

export async function sendCompletionFeedback(
  preferences: Preferences,
  detail: { title: string; xp: number; coins: number; attribute: Attribute; durationMinutes?: number; tier?: TierLevel; upgraded?: boolean; leveledUp?: boolean },
  preparedAudio?: Promise<boolean>,
) {
  if (preferences.vibration && 'vibrate' in navigator) navigator.vibrate([35, 30, 55])
  if (preferences.sound) void playCompletionChime(detail.leveledUp ? 'level-up' : 'completion', preparedAudio)
  if (!preferences.notifications || !('Notification' in window) || Notification.permission !== 'granted') return 'unavailable'
  try {
    const registration = await navigator.serviceWorker.ready
    const rewards = [`+${detail.xp} XP`, detail.coins > 0 ? `+${detail.coins} 金币` : '', detail.attribute].filter(Boolean).join(' · ')
    await registration.showNotification(detail.upgraded ? '习惯层次已升级' : '行动已完成', {
      body: `${rewards}${detail.tier ? ` · ${tierLabels[detail.tier]}层` : ''}${detail.durationMinutes ? ` · ${detail.durationMinutes} 分钟` : ''}`,
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
