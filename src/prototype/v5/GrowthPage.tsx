import { useState } from 'react'
import {
  BriefcaseBusiness,
  ChevronRight,
  CircleDollarSign,
  Coins,
  Dumbbell,
  Gift,
  GraduationCap,
  Leaf,
  Medal,
  Palette,
  Target,
} from 'lucide-react'
import {
  domainLabel,
  getCharacterStage,
  getCharacterStageName,
  getLevel,
  getMilestoneVoucherCost,
  getNextVoucherLevel,
  getTotalXpForLevel,
  growthDomains,
  tierLabels,
  type GrowthDomain,
  type JourneyMonth,
  type LevelSystem,
} from '../../domain'
import { formatCompactDate, getV5DomainGrowthDetail } from './selectors'
import { V5ModalSurface, V5PageHeader, V5SectionHeading } from './shared'
import type { V5DomainGrowthDetail, V5Stats } from './types'

const domainIcons = {
  health: Dumbbell,
  learning: GraduationCap,
  creation: Palette,
  career: BriefcaseBusiness,
  life: CircleDollarSign,
  mindset: Leaf,
}

const domainTones: Record<GrowthDomain, string> = {
  health: 'coral',
  learning: 'blue',
  creation: 'violet',
  career: 'green',
  life: 'gold',
  mindset: 'leaf',
}


export function V5GrowthPage({
  stats,
  level,
  levelSystem,
  journeyMonths,
  today,
  onCreate,
  onOpenRewards,
}: {
  stats: V5Stats
  level: ReturnType<typeof getLevel>
  levelSystem?: LevelSystem
  journeyMonths: JourneyMonth[]
  today: string
  onCreate: () => void
  onOpenRewards: () => void
}) {
  const [selectedDomain, setSelectedDomain] = useState<GrowthDomain>()
  const nextRewardLevel = getNextVoucherLevel(level.level)
  const nextRewardCost = getMilestoneVoucherCost(nextRewardLevel) ?? 200
  const remainingXp = Math.max(0, getTotalXpForLevel(nextRewardLevel) - stats.totalXp)
  const selectedDetail = selectedDomain
    ? getV5DomainGrowthDetail(selectedDomain, stats.domainXp[selectedDomain], journeyMonths, today)
    : undefined
  return (
    <div className="v5-page v5-growth-layout">
      <section className="v5-growth-primary">
        <V5PageHeader eyebrow="角色成长" title="成长" description="现实中的每一次行动，都在这里留下成长。" onCreate={onCreate} />
        <div className="v5-growth-overview">
          <V5GrowthHero stats={stats} level={level} focusDomain={levelSystem?.focusDomain} />
          <button className="v5-feature-row" type="button" onClick={onOpenRewards}>
            <Gift size={22} />
            <div><span>下一奖励</span><strong>Lv.{nextRewardLevel} · {nextRewardCost} 金币档礼券</strong><small>还需 {remainingXp} XP</small></div>
            <ChevronRight size={20} />
          </button>
        </div>
        <section className="v5-section">
          <V5SectionHeading title="六个成长领域" description="按现实结果分类，每项行动只归入一个领域。" />
          <div className="v5-domain-grid">
            {growthDomains.map((domain) => {
              const Icon = domainIcons[domain]
              const domainLevel = getLevel(stats.domainXp[domain])
              return (
                <button
                  className={`v5-domain-card tone-${domainTones[domain]}`}
                  key={domain}
                  type="button"
                  aria-label={`查看${domainLabel(domain)}领域详情，当前 Lv.${domainLevel.level}`}
                  onClick={() => setSelectedDomain(domain)}
                >
                  <div><Icon size={20} /><strong>{domainLabel(domain)}</strong><span>Lv.{domainLevel.level}</span><ChevronRight size={17} /></div>
                  <div className="v5-domain-progress"><span style={{ width: `${domainLevel.progress * 100}%` }} /></div>
                  <small>{stats.domainXp[domain]} XP</small>
                </button>
              )
            })}
          </div>
        </section>
      </section>
      {selectedDetail && <V5DomainDetail detail={selectedDetail} onClose={() => setSelectedDomain(undefined)} />}
    </div>
  )
}

function V5GrowthHero({
  stats,
  level,
  focusDomain,
}: {
  stats: V5Stats
  level: ReturnType<typeof getLevel>
  focusDomain?: GrowthDomain
}) {
  const stage = getCharacterStage(level.level)
  return (
    <section className="v5-growth-hero" aria-label="旅者成长状态">
      <div className="v5-growth-identity">
        <img src={`${import.meta.env.BASE_URL}assets/v5/traveler-stage-${stage}.png`} alt={`${getCharacterStageName(level.level)}阶段旅者`} />
        <div>
          <span>{getCharacterStageName(level.level)} · 阶段 {stage}</span>
          <strong>Lv.{level.level}</strong>
          <small>每次现实行动都在塑造现在的你</small>
        </div>
      </div>
      <div className="v5-growth-level-progress">
        <div><span>等级进度</span><strong>{level.current} / {level.needed} XP</strong></div>
        <div className="v5-growth-progress-track" role="progressbar" aria-label="当前等级进度" aria-valuemin={0} aria-valuemax={level.needed} aria-valuenow={level.current}>
          <span style={{ width: `${level.progress * 100}%` }} />
        </div>
        <small>距离 Lv.{level.level + 1} 还需 {Math.max(0, level.needed - level.current)} XP</small>
      </div>
      <div className="v5-growth-metrics">
        <div><Medal size={18} /><span>累计成长<strong>{stats.totalXp} XP</strong></span></div>
        <div><Coins size={18} /><span>持有金币<strong>{stats.coins}</strong></span></div>
      </div>
      <div className="v5-growth-focus">
        <Target size={17} />
        <span>下一阶段重点</span>
        <strong>{focusDomain ? domainLabel(focusDomain) : '完成下一份成长报告后选择'}</strong>
      </div>
    </section>
  )
}

function V5DomainDetail({ detail, onClose }: { detail: V5DomainGrowthDetail; onClose: () => void }) {
  const Icon = domainIcons[detail.domain]
  return (
    <V5ModalSurface title={`${domainLabel(detail.domain)}领域`} kicker="成长领域" onClose={onClose}>
      <div className={`v5-domain-detail tone-${domainTones[detail.domain]}`}>
        <div className="v5-domain-detail-hero">
          <span><Icon size={22} /></span>
          <div><small>现实成长领域</small><strong>{domainLabel(detail.domain)}</strong><p>Lv.{detail.level.level} · 累计 {detail.totalXp} XP</p></div>
        </div>
        <div className="v5-domain-detail-progress">
          <div><span>当前等级进度</span><strong>{detail.level.current} / {detail.level.needed} XP</strong></div>
          <div className="v5-domain-progress"><span style={{ width: `${detail.level.progress * 100}%` }} /></div>
        </div>
        <div className="v5-domain-detail-stats" aria-label="最近 28 个游戏日">
          <div><span>近 28 日 XP</span><strong>+{detail.recentXp}</strong></div>
          <div><span>有效行动</span><strong>{detail.actionCount}</strong></div>
          <div><span>活跃天数</span><strong>{detail.activeDays}</strong></div>
        </div>
        <section className="v5-domain-detail-section">
          <h3>主要贡献行动</h3>
          {detail.topActions.length > 0 ? (
            <div className="v5-domain-top-actions">
              {detail.topActions.map((action, index) => (
                <div key={action.title}><b>{index + 1}</b><span>{action.title}<small>{action.count} 次有效行动</small></span><strong>+{action.xp} XP</strong></div>
              ))}
            </div>
          ) : <p className="v5-domain-empty">最近 28 个游戏日还没有这个领域的有效成长。</p>}
        </section>
        {detail.recentEntries.length > 0 && (
          <section className="v5-domain-detail-section">
            <h3>近期成长记录</h3>
            <div className="v5-domain-recent-list">
              {detail.recentEntries.map((entry) => (
                <article key={entry.id}>
                  <time>{formatCompactDate(entry.occurredOn)}</time>
                  <div><strong>{entry.title}</strong><span>{entry.tier ? `${tierLabels[entry.tier]}层` : entry.progressLabel ?? '已完成'}</span></div>
                  <b>{entry.xp > 0 ? `+${entry.xp} XP` : '已记录'}</b>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </V5ModalSurface>
  )
}
