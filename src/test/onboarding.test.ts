import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  buildQuickStartActivity,
  deriveNewcomerProgress,
  detectBrowserEnvironment,
  TravelerChoice,
} from '../features/onboarding'

describe('新用户承接', () => {
  it('识别微信、Android 与安装提示能力', () => {
    expect(detectBrowserEnvironment({
      userAgent: 'Mozilla/5.0 (Linux; Android 15) MicroMessenger/8.0',
      installPromptSupported: true,
    })).toEqual({
      wechat: true,
      android: true,
      ios: false,
      standalone: false,
      installPromptSupported: true,
    })
  })

  it('识别 iPhone、iPad 桌面 UA 与独立模式', () => {
    expect(detectBrowserEnvironment({ userAgent: 'Mozilla/5.0 (iPhone)' }).ios).toBe(true)
    expect(detectBrowserEnvironment({ platform: 'MacIntel', maxTouchPoints: 5 }).ios).toBe(true)
    expect(detectBrowserEnvironment({ standalone: true }).standalone).toBe(true)
  })

  it('生成固定且可由现有事务创建的第一项行动', () => {
    expect(buildQuickStartActivity('  阅读十分钟  ', 'learning')).toEqual({
      title: '阅读十分钟',
      type: 'habit',
      domain: 'learning',
      difficulty: '简单',
      goal: { count: 1, unit: '次' },
      schedule: { kind: 'daily' },
      isKey: true,
      enabled: true,
    })
    expect(() => buildQuickStartActivity(' ', 'learning')).toThrow('1～60')
  })

  it('按游戏日统计七日体验且合并同日重复完成', () => {
    expect(deriveNewcomerProgress('2026-08-01', '2026-08-07', [
      '2026-08-01',
      '2026-08-01',
      '2026-08-03',
      '2026-08-07',
      '2026-08-08',
    ])).toEqual({ day: 7, completedDays: 3, feedbackAvailable: true })
  })

  it('七日后保持第七天，不把窗口外完成计入体验', () => {
    expect(deriveNewcomerProgress('2026-08-01', '2026-08-15', ['2026-08-10'])).toEqual({
      day: 7,
      completedDays: 0,
      feedbackAvailable: true,
    })
  })

  it('新用户旅者选择同时展示男女形象且不预选', () => {
    const markup = renderToStaticMarkup(createElement(TravelerChoice, { onChoose: async () => undefined }))
    expect(markup).toContain('男性旅者')
    expect(markup).toContain('女性旅者')
    expect(markup).not.toContain('aria-pressed="true"')
  })
})
