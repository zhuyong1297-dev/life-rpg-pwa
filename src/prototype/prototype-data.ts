export type PrototypePage = 'today' | 'growth' | 'review' | 'rewards' | 'profile'

export type CompletionKey = 'morning' | 'focus' | 'evening' | 'reading'

export interface PrototypeState {
  xp: number
  coins: number
  completed: Record<CompletionKey, boolean>
  weeklyRuns: number
  customActions: string[]
}

export const INITIAL_PROTOTYPE_STATE: PrototypeState = {
  xp: 460,
  coins: 126,
  completed: {
    morning: true,
    focus: false,
    evening: false,
    reading: false,
  },
  weeklyRuns: 2,
  customActions: [],
}

export const DOMAIN_PROGRESS = [
  { id: 'health', label: '健康', xp: 124, tone: 'coral' },
  { id: 'learning', label: '学习', xp: 86, tone: 'blue' },
  { id: 'creation', label: '创作', xp: 72, tone: 'violet' },
  { id: 'career', label: '事业', xp: 158, tone: 'green' },
  { id: 'life', label: '生活', xp: 64, tone: 'gold' },
  { id: 'mindset', label: '心境', xp: 40, tone: 'leaf' },
] as const

export const PAGE_HASH: Record<PrototypePage, string> = {
  today: '#/today',
  growth: '#/character',
  review: '#/review',
  rewards: '#/rewards',
  profile: '#/settings',
}

export function pageFromHash(hash: string): PrototypePage {
  if (hash.startsWith('#/character')) return 'growth'
  if (hash.startsWith('#/review')) return 'review'
  if (hash.startsWith('#/rewards')) return 'rewards'
  if (hash.startsWith('#/settings')) return 'profile'
  return 'today'
}
