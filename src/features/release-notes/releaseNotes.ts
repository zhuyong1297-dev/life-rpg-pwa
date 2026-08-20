export const CURRENT_RELEASE_NOTES_VERSION = '5.9.0' as const

export const CURRENT_RELEASE_NOTES = {
  title: '让旅者更像你，让行动更容易开始',
  summary: '选择旅者外观，并用时间、现实事件或上一项行动为习惯建立启动锚点。',
  items: [
    {
      id: 'dual-travelers',
      title: '男性与女性旅者',
      description: '新用户先选择旅者；老用户保留现有外观，也可以随时在“我的”中免费切换。',
    },
    {
      id: 'habit-anchors',
      title: '为习惯指定开始时机',
      description: '可选择固定时间、某件现实事件之后，或接在另一项每日行动之后；锚点只影响推荐，不会限制打卡。',
    },
    {
      id: 'anchor-review',
      title: '七天后检查锚点是否合适',
      description: '坚持率偏低时会展示依据和调整建议。系统不会自动修改习惯，也不会因错过而惩罚。',
    },
  ],
} as const
