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
})
