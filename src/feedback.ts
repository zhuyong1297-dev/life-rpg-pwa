import { domainLabel, tierLabels, type FeedbackIntensity, type GrowthDomain, type Preferences, type TierLevel } from './domain'

let completionAudioContext: AudioContext | undefined

export type FeedbackKind = 'completion' | 'tier-up' | 'level-up'

const chimeNotes: Record<FeedbackKind, number[]> = {
  completion: [659, 880],
  'tier-up': [659, 880, 1047],
  'level-up': [523, 659, 784, 1047],
}

const peakGain: Record<FeedbackIntensity, number> = {
  gentle: 0.09,
  clear: 0.17,
  strong: 0.24,
}

const vibrationPatterns: Record<FeedbackIntensity, Record<FeedbackKind, number[]>> = {
  gentle: { completion: [25], 'tier-up': [25, 35, 45], 'level-up': [35, 35, 60] },
  clear: { completion: [45], 'tier-up': [40, 30, 70], 'level-up': [55, 35, 70, 35, 110] },
  strong: { completion: [70], 'tier-up': [65, 35, 100], 'level-up': [80, 40, 100, 40, 160] },
}

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

export async function playCompletionChime(
  kind: FeedbackKind = 'completion',
  intensity: FeedbackIntensity = 'clear',
  prepared?: Promise<boolean>,
) {
  const ready = prepared ? await prepared : await prepareCompletionAudio()
  const context = completionAudioContext
  if (!ready || !context) return false
  try {
    const notes = chimeNotes[kind]
    const start = context.currentTime
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const noteStart = start + index * 0.075
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency, noteStart)
      gain.gain.setValueAtTime(0.0001, noteStart)
      gain.gain.linearRampToValueAtTime(peakGain[intensity], noteStart + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.22)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(noteStart)
      oscillator.stop(noteStart + 0.23)
    })
    return true
  } catch {
    return false
  }
}

export function playCompletionVibration(kind: FeedbackKind = 'completion', intensity: FeedbackIntensity = 'clear') {
  if (!('vibrate' in navigator) || typeof navigator.vibrate !== 'function') return false
  try {
    return navigator.vibrate(vibrationPatterns[intensity][kind])
  } catch {
    return false
  }
}

export async function sendCompletionFeedback(
  preferences: Preferences,
  detail: { title: string; xp: number; coins: number; domain: GrowthDomain; durationMinutes?: number; tier?: TierLevel; upgraded?: boolean; leveledUp?: boolean },
  preparedAudio?: Promise<boolean>,
) {
  const kind: FeedbackKind = detail.leveledUp ? 'level-up' : detail.upgraded ? 'tier-up' : 'completion'
  const vibration = preferences.vibration ? playCompletionVibration(kind, preferences.feedbackIntensity) : undefined
  const sound = preferences.sound ? await playCompletionChime(kind, preferences.feedbackIntensity, preparedAudio) : undefined
  if (!preferences.notifications || !('Notification' in window) || Notification.permission !== 'granted') {
    return { notification: 'unavailable' as const, vibration, sound }
  }
  try {
    const registration = await navigator.serviceWorker.ready
    const rewards = [`+${detail.xp} XP`, detail.coins > 0 ? `+${detail.coins} 金币` : '', domainLabel(detail.domain)].filter(Boolean).join(' · ')
    await registration.showNotification(detail.upgraded ? '习惯层次已升级' : '行动已完成', {
      body: `${rewards}${detail.tier ? ` · ${tierLabels[detail.tier]}层` : ''}${detail.durationMinutes ? ` · ${detail.durationMinutes} 分钟` : ''}`,
      icon: `${import.meta.env.BASE_URL}app-icon.png`,
      badge: `${import.meta.env.BASE_URL}app-icon.png`,
      tag: `completion-${Date.now()}`,
    })
    return { notification: 'sent' as const, vibration, sound }
  } catch {
    return { notification: 'failed' as const, vibration, sound }
  }
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported' as const
  return Notification.requestPermission()
}
