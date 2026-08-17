import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildFeedbackEmail, FeedbackPage, type FeedbackFormValue, type FeedbackSafeSummary } from '../prototype/v5/FeedbackPage'

const summary: FeedbackSafeSummary = {
  appVersion: 'V5.6.0',
  surface: 'standalone',
  activeDays: 5,
  primaryCompletionDays: 4,
}

const value: FeedbackFormValue = {
  category: '七日体验',
  clarity: 4,
  realWorldHelp: 5,
  obstacle: '安装步骤不够清楚',
  details: '希望首次打开时直接告诉我下一步。',
}

describe('V5 邮件反馈', () => {
  it('只将用户填写内容和四项安全摘要写入邮件', () => {
    const result = buildFeedbackEmail(value, summary)
    expect(result.mailto).toMatch(/^mailto:zhuyong1297@gmail\.com\?/)
    expect(result.body).toContain('反馈类别：七日体验')
    expect(result.body).toContain('使用方式：已安装应用')
    expect(result.body).toContain('近七日活跃：5 天')
    expect(result.body).toContain('第一项行动完成：4 天')
    expect(result.body).not.toMatch(/活动标题|备注|XP|金币|设备 ID|User-Agent|备份/)
  })

  it('限制摘要中的天数与单行版本文本', () => {
    const result = buildFeedbackEmail(value, { appVersion: 'V5.6.0\n伪造字段', surface: 'wechat', activeDays: 99, primaryCompletionDays: -2 })
    expect(result.body).toContain('应用版本：V5.6.0 伪造字段')
    expect(result.body).toContain('使用方式：微信浏览器')
    expect(result.body).toContain('近七日活跃：7 天')
    expect(result.body).toContain('第一项行动完成：0 天')
  })

  it('普通反馈不附带七日行为统计', () => {
    const result = buildFeedbackEmail({ ...value, category: '缺陷' }, summary)
    expect(result.body).toContain('应用版本：V5.6.0')
    expect(result.body).toContain('使用方式：已安装应用')
    expect(result.body).not.toContain('近七日活跃')
    expect(result.body).not.toContain('第一项行动完成')
    expect(result.body).toContain('仅包含上述两项')
  })

  it('渲染完整表单、隐私边界和复制回退入口', () => {
    const markup = renderToStaticMarkup(createElement(FeedbackPage, { summary, onBack: () => undefined }))
    expect(markup).toContain('帮助与反馈')
    expect(markup).toContain('使用困难')
    expect(markup).toContain('功能建议')
    expect(markup).toContain('使用清晰度')
    expect(markup).toContain('现实帮助')
    expect(markup).toContain('maxLength="1000"')
    expect(markup).toContain('应用不会自动上传任何内容')
    expect(markup).toContain('打开邮件应用')
    expect(markup).toContain('复制反馈内容')
    expect(markup).toContain('复制邮箱')
  })
})
