// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestNotificationPermission, sendCompletionFeedback } from '../feedback'

const detail = { title: '示例行动', xp: 5, coins: 2, attribute: '体魄' as const }

beforeEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vi.fn() })
})

describe('完成反馈降级', () => {
  it('通知不支持时仍执行振动并返回 unavailable', async () => {
    Reflect.deleteProperty(window, 'Notification')
    expect(await sendCompletionFeedback({ notifications: true, vibration: true, sound: false }, detail)).toBe('unavailable')
    expect(navigator.vibrate).toHaveBeenCalled()
    expect(await requestNotificationPermission()).toBe('unsupported')
  })

  it('权限拒绝时不尝试发送通知', async () => {
    const requestPermission = vi.fn().mockResolvedValue('denied')
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'denied', requestPermission },
    })
    expect(await sendCompletionFeedback({ notifications: true, vibration: false, sound: false }, detail)).toBe('unavailable')
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
    expect(await sendCompletionFeedback({ notifications: true, vibration: false, sound: false }, detail)).toBe('sent')
    expect(showNotification).toHaveBeenCalledWith('行动已完成', expect.objectContaining({ body: '+5 XP · +2 金币 · 体魄' }))
  })

  it('音频不支持时返回 false', async () => {
    vi.resetModules()
    Reflect.deleteProperty(window, 'AudioContext')
    Reflect.deleteProperty(window, 'webkitAudioContext')
    const { prepareCompletionAudio } = await import('../feedback')
    expect(await prepareCompletionAudio()).toBe(false)
  })

  it('复用挂起的 AudioContext，并区分普通完成和角色升级音效', async () => {
    vi.resetModules()
    const starts: number[] = []
    const resume = vi.fn(async function (this: { state: string }) { this.state = 'running' })
    const context = {
      state: 'suspended',
      currentTime: 1,
      destination: {},
      resume,
      createOscillator: () => ({
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: (target: unknown) => target,
        start: (at: number) => starts.push(at),
        stop: vi.fn(),
      }),
      createGain: () => ({
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect() { return this },
      }),
    }
    const AudioContextMock = vi.fn(function () { return context })
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: AudioContextMock })
    const { playCompletionChime, prepareCompletionAudio } = await import('../feedback')

    expect(await prepareCompletionAudio()).toBe(true)
    expect(resume).toHaveBeenCalledOnce()
    expect(await playCompletionChime('completion')).toBe(true)
    expect(starts).toHaveLength(2)
    expect(await playCompletionChime('level-up')).toBe(true)
    expect(starts).toHaveLength(5)
    expect(AudioContextMock).toHaveBeenCalledOnce()
  })
})
