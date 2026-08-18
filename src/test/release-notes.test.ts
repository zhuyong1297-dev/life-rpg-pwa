import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  CURRENT_RELEASE_NOTES,
  CURRENT_RELEASE_NOTES_VERSION,
  ReleaseNotesModal,
} from '../features/release-notes'

describe('V5.7.0 更新说明', () => {
  it('提供稳定版本号和三项用户可见更新', () => {
    expect(CURRENT_RELEASE_NOTES_VERSION).toBe('5.7.0')
    expect(CURRENT_RELEASE_NOTES.items).toHaveLength(3)
    expect(CURRENT_RELEASE_NOTES.items.map((item) => item.title)).toEqual([
      '自定义奖励基金',
      '愿望价格由你决定',
      '调整不会改写本月',
    ])
  })

  it('渲染完整内容和三个明确操作', () => {
    const markup = renderToStaticMarkup(createElement(ReleaseNotesModal, {
      onLater: vi.fn(),
      onAcknowledge: vi.fn(),
      onOpenRewards: vi.fn(),
    }))

    expect(markup).toContain('V5.7.0 更新内容')
    expect(markup).toContain('每个游戏月的补充额度')
    expect(markup).toContain('不会覆盖你的输入')
    expect(markup).toContain('新额度从下个游戏月生效')
    expect(markup).toContain('稍后')
    expect(markup).toContain('知道了')
    expect(markup).toContain('前往愿望商店')
    expect(markup).toContain('aria-modal="true"')
  })
})
