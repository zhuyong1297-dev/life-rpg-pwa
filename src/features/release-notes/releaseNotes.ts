export const CURRENT_RELEASE_NOTES_VERSION = '5.7.0' as const

export const CURRENT_RELEASE_NOTES = {
  title: '奖励商店更灵活',
  summary: '奖励目标和现实预算现在都可以由你决定。',
  items: [
    {
      id: 'custom-budget',
      title: '自定义奖励基金',
      description: '可以分别设置每个游戏月的补充额度和基金累计上限。',
    },
    {
      id: 'custom-prices',
      title: '愿望价格由你决定',
      description: '金币价格和现实成本都可手动填写；切换近、中、远档位不会覆盖你的输入。',
    },
    {
      id: 'safe-effective-date',
      title: '调整不会改写本月',
      description: '旧配置先结算本月，新额度从下个游戏月生效；当前基金和已预留金额不会追溯调整。',
    },
  ],
} as const

