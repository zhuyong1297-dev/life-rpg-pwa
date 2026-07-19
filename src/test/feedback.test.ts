// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playCompletionVibration, requestNotificationPermission, sendCompletionFeedback } from '../feedback'

const detail = { title: '示例行动', xp: 5, coins: 2, attribute: '体魄' as const }
const preferences = { notifications: true, vibration: false, sound: false, feedbackIntensity: 'clear' as const }

beforeEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vi.fn(() => true) })
})

describe('完成反馈降级', () => {
  it('通知不支持时仍执行振动并返回 unavailable', async () => {
    Reflect.deleteProperty(window, 'Notification')
    expect(await sendCompletionFeedback({ ...preferences, vibration: true }, detail)).toMatchObject({ notification: 'unavailable', vibration: true })
    expect(navigator.vibrate).toHaveBeenCalled()
    expect(await requestNotificationPermission()).toBe('unsupported')
  })

  it('权限拒绝时不尝试发送通知', async () => {
    const requestPermission = vi.fn().mockResolvedValue('denied')
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'denied', requestPermission },
    })
    expect(await sendCompletionFeedback(preferences, detail)).toMatchObject({ notification: 'unavailable' })
    expect(await requestNotificationPermission()).toBe('denied')
  })

  it('权限允许时通过 service worker 发送通知', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') },
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ showNotification }) },
    })
    expect(await sendCompletionFeedback(preferences, detail)).toMatchObject({ notification: 'sent' })
    expect(showNotification).toHaveBeenCalledWith('行动已完成', expect.objectContaining({ body: '+5 XP · +2 金币 · 体魄' }))
  })

  it('音频不支持时返回 false', async () => {
    vi.resetModules()
    Reflect.deleteProperty(window, 'AudioContext')
    Reflect.deleteProperty(window, 'webkitAudioContext')
    const { prepareCompletionAudio } = await import('../feedback')
    expect(await prepareCompletionAudio()).toBe(false)
  })

  it('复用挂起的 AudioContext，并区分普通完成、层次升级和角色升级音效', async () => {
    vi.resetModules()
    const starts: number[] = []
    const frequencies: number[] = []
    const peaks: number[] = []
    const oscillatorTypes: string[] = []
    const resume = vi.fn(async function (this: { state: string }) { this.state = 'running' })
    const context = {
      state: 'suspended',
      currentTime: 1,
      destination: {},
      resume,
      createOscillator: () => {
        let type = 'sine'
        return {
          get type() { return type },
          set type(value: string) { type = value; oscillatorTypes.push(value) },
          frequency: { setValueAtTime: (value: number) => frequencies.push(value) },
          connect: (target: unknown) => target,
          start: (at: number) => starts.push(at),
          stop: vi.fn(),
        }
      },
      createGain: () => ({
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: (value: number) => peaks.push(value), exponentialRampToValueAtTime: vi.fn() },
        connect() { return this },
      }),
    }
    const AudioContextMock = vi.fn(function () { return context })
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: AudioContextMock })
    const { playCompletionChime, prepareCompletionAudio } = await import('../feedback')

    expect(await prepareCompletionAudio()).toBe(true)
    expect(resume).toHaveBeenCalledOnce()
    expect(await playCompletionChime('completion', 'gentle')).toBe(true)
    expect(starts).toHaveLength(2)
    expect(await playCompletionChime('tier-up', 'clear')).toBe(true)
    expect(starts).toHaveLength(5)
    expect(await playCompletionChime('level-up', 'strong')).toBe(true)
    expect(starts).toHaveLength(9)
    expect(frequencies).toEqual([659, 880, 659, 880, 1047, 523, 659, 784, 1047])
    expect(peaks).toEqual([0.09, 0.09, 0.17, 0.17, 0.17, 0.24, 0.24, 0.24, 0.24])
    expect(oscillatorTypes).toEqual(Array(9).fill('triangle'))
    expect(AudioContextMock).toHaveBeenCalledOnce()
  })

  it('三档强度为三种成长事件提供九种振动组合', () => {
    const cases = [
      ['gentle', 'completion', [25]], ['gentle', 'tier-up', [25, 35, 45]], ['gentle', 'level-up', [35, 35, 60]],
      ['clear', 'completion', [45]], ['clear', 'tier-up', [40, 30, 70]], ['clear', 'level-up', [55, 35, 70, 35, 110]],
      ['strong', 'completion', [70]], ['strong', 'tier-up', [65, 35, 100]], ['strong', 'level-up', [80, 40, 100, 40, 160]],
    ] as const
    for (const [intensity, kind, pattern] of cases) {
      expect(playCompletionVibration(kind, intensity)).toBe(true)
      expect(navigator.vibrate).toHaveBeenLastCalledWith(pattern)
    }
  })

  it('振动 API 拒绝请求时返回 false', () => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vi.fn(() => false) })
    expect(playCompletionVibration('completion', 'clear')).toBe(false)
  })
})
