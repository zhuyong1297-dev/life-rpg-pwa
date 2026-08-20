import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  CURRENT_RELEASE_NOTES,
  CURRENT_RELEASE_NOTES_VERSION,
  ReleaseNotesModal,
} from '../features/release-notes'

describe('V5.9.0 更新说明', () => {
  it('提供稳定版本号和三项用户可见更新', () => {
    expect(CURRENT_RELEASE_NOTES_VERSION).toBe('5.9.0')
    expect(CURRENT_RELEASE_NOTES.items).toHaveLength(3)
    expect(CURRENT_RELEASE_NOTES.items.map((item) => item.title)).toEqual([
      '男性与女性旅者',
      '为习惯指定开始时机',
      '七天后检查锚点是否合适',
    ])
  })

  it('渲染完整内容和三个明确操作', () => {
    const markup = renderToStaticMarkup(createElement(ReleaseNotesModal, {
      onLater: vi.fn(),
      onAcknowledge: vi.fn(),
      onOpenFeature: vi.fn(),
    }))

    expect(markup).toContain('V5.9.0 更新内容')
    expect(markup).toContain('免费切换')
    expect(markup).toContain('不会限制打卡')
    expect(markup).toContain('不会因错过而惩罚')
    expect(markup).toContain('稍后')
    expect(markup).toContain('知道了')
    expect(markup).toContain('去选择旅者')
    expect(markup).toContain('aria-modal="true"')
  })
})
