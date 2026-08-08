export const attributes = ['体魄', '智识', '专注', '创造', '关系', '心境'] as const
export const growthDomains = ['health', 'learning', 'creation', 'career', 'life', 'mindset'] as const
export const difficulties = ['简单', '普通', '困难', 'Boss'] as const
export const reviewDecisions = ['保留', '调整', '暂停'] as const
export const tierLevels = [1, 2, 3] as const
export const tierLabels = { 1: '基础', 2: '标准', 3: '突破' } as const
export const timeInputUnits = ['秒', '分钟'] as const
export const combinedModes = ['per_occurrence', 'total'] as const

export type Attribute = (typeof attributes)[number]
export type GrowthDomain = (typeof growthDomains)[number]
export type Difficulty = (typeof difficulties)[number]
export type ReviewDecision = (typeof reviewDecisions)[number]
export type TierLevel = (typeof tierLevels)[number]
export type TierMetric = 'duration' | 'count'
export type TimeInputUnit = (typeof timeInputUnits)[number]
export type CombinedMode = (typeof combinedModes)[number]
export type ProgressMode = 'incremental'

export const growthDomainDetails: Record<GrowthDomain, { label: string; description: string; examples: string; identity: string }> = {
  health: { label: '健康', description: '改善身体状态与恢复能力', examples: '运动、睡眠、饮食、卫生', identity: '你正在照顾并增强自己的身体' },
  learning: { label: '学习', description: '理解知识并练习可迁移的技能', examples: '阅读、课程、复习、技能练习', identity: '你正在把知识变成真正的能力' },
  creation: { label: '创作', description: '把想法转化为可以看见的作品', examples: '写作、绘画、制作内容、个人作品', identity: '你正在把想法变成作品' },
  career: { label: '事业', description: '推进工作交付、职业发展与收入', examples: '完成项目、客户工作、职业规划', identity: '你正在推进长期事业' },
  life: { label: '生活', description: '改善环境、财务、行政和日常秩序', examples: '整理房间、记账、处理事务', identity: '你正在建立更有秩序的生活' },
  mindset: { label: '心境', description: '调节情绪、反思并恢复心理状态', examples: '日记、冥想、呼吸练习', identity: '你正在培养稳定而清醒的内在状态' },
}

export const legacyDomainSuggestions: Record<Attribute, GrowthDomain> = {
  体魄: 'health',
  智识: 'learning',
  专注: 'career',
  创造: 'creation',
  关系: 'life',
  心境: 'mindset',
}

export function domainLabel(domain: GrowthDomain) {
  return growthDomainDetails[domain].label
}

export function identityMessage(domain: GrowthDomain) {
  return growthDomainDetails[domain].identity
}
