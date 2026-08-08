import { ClipboardCheck, Compass, Gift, ListChecks, Plus, Sparkles, UserRound } from 'lucide-react'
import type { V5Page } from './types'

const navItems = [
  { page: 'today' as const, label: '行动', icon: ListChecks },
  { page: 'growth' as const, label: '成长', icon: Compass },
  { page: 'review' as const, label: '复盘', icon: ClipboardCheck },
  { page: 'rewards' as const, label: '愿望', icon: Gift },
  { page: 'profile' as const, label: '我的', icon: UserRound },
]


export function V5Navigation({
  active,
  preview,
  onNavigate,
  onCreate,
}: {
  active: V5Page
  preview: boolean
  onNavigate: (page: V5Page) => void
  onCreate: () => void
}) {
  return (
    <>
      <aside className="v5-desktop-rail">
        <div className="v5-brand">
          <Sparkles size={22} />
          <div><strong>地球 Online</strong><span>{preview ? 'V5.5.1 预览版' : 'V5.5.1'}</span></div>
        </div>
        <nav aria-label="主要导航">
          {navItems.map(({ page, label, icon: Icon }) => (
            <button className={page === active ? 'active' : ''} key={page} type="button" onClick={() => onNavigate(page)}>
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>
        <button className="v5-primary-button v5-wide" type="button" onClick={onCreate}>
          <Plus size={18} />
          创建行动
        </button>
        {preview && <div className="v5-data-note"><strong>真实预览数据</strong><span>与正式版完全分开</span></div>}
      </aside>
      <nav className="v5-mobile-navigation" aria-label="主要导航">
        {navItems.map(({ page, label, icon: Icon }) => (
          <button className={page === active ? 'active' : ''} key={page} type="button" onClick={() => onNavigate(page)}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </>
  )
}
