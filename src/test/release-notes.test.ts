import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  CURRENT_RELEASE_NOTES,
  CURRENT_RELEASE_NOTES_VERSION,
  ReleaseNotesModal,
} from '../features/release-notes'

describe('V5.8.0 更新说明', () => {
  it('提供稳定版本号和三项用户可见更新', () => {
    expect(CURRENT_RELEASE_NOTES_VERSION).toBe('5.8.0')
    expect(CURRENT_RELEASE_NOTES.items).toHaveLength(3)
    expect(CURRENT_RELEASE_NOTES.items.map((item) => item.title)).toEqual([
      '十二项推荐习惯',
      '四套 28 天计划',
      '推荐不会替你做决定',
    ])
  })

  it('渲染完整内容和三个明确操作', () => {
    const markup = renderToStaticMarkup(createElement(ReleaseNotesModal, {
      onLater: vi.fn(),
      onAcknowledge: vi.fn(),
      onOpenLibrary: vi.fn(),
    }))

    expect(markup).toContain('V5.8.0 更新内容')
    expect(markup).toContain('六个成长领域')
    expect(markup).toContain('直接进入规划器')
    expect(markup).toContain('不会创建活动')
    expect(markup).toContain('稍后')
    expect(markup).toContain('知道了')
    expect(markup).toContain('查看推荐库')
    expect(markup).toContain('aria-modal="true"')
  })
})
