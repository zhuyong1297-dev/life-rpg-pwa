export const CURRENT_RELEASE_NOTES_VERSION = '5.8.0' as const

export const CURRENT_RELEASE_NOTES = {
  title: '从一条适合你的行动开始',
  summary: '不知道该建立什么习惯时，现在可以先从本地推荐库挑选。',
  items: [
    {
      id: 'starter-habits',
      title: '十二项推荐习惯',
      description: '六个成长领域各有两个低门槛起点，确认前可以完整查看目标、频率和奖励。',
    },
    {
      id: 'starter-plans',
      title: '四套 28 天计划',
      description: '生活、身体、学习和重要项目模板可直接进入规划器，再按你的现实情况逐项确认。',
    },
    {
      id: 'confirmation-first',
      title: '推荐不会替你做决定',
      description: '模板只负责预填；未经确认，不会创建活动、改动赛季或写入个人数据。',
    },
  ],
} as const
