import { useState } from 'react'
import { Check, ChevronRight, History, Medal, Search } from 'lucide-react'
import { domainLabel, type Activity, type Completion } from '../../domain'
import { getV5WeeklyRewardPreview, weeklyViewState } from './selectors'
import { V5ModalSurface } from './shared'

export function V5WeeklySection({
  activities,
  completions,
  today,
  activeCompletion,
  onRecord,
  onCompleted,
  onDetails,
}: {
  activities: Activity[]
  completions: Completion[]
  today: string
  activeCompletion: (activity: Activity) => Completion | undefined
  onRecord: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  onDetails: (activity: Activity) => void
}) {
  const [drawerTab, setDrawerTab] = useState<'pending' | 'completed'>()
  if (activities.length === 0) return null
  const pending = activities.filter((activity) => !weeklyViewState(activity, completions, today).complete)
  const completed = activities.filter((activity) => weeklyViewState(activity, completions, today).complete)
  const visible = pending.slice(0, 3)
  return (
    <section className="v5-section v5-weekly-section">
      <div className="v5-section-count"><div><span>周一 04:00 更新</span><h2>本周灵活</h2></div><b>{activities.length}</b></div>
      {visible.map((activity) => (
        <V5WeeklyRow
          activity={activity}
          completions={completions}
          today={today}
          activeCompletion={activeCompletion(activity)}
          key={activity.id}
          onRecord={() => onRecord(activity)}
          onCompleted={() => onCompleted(activity)}
          onDetails={() => onDetails(activity)}
        />
      ))}
      {pending.length > 3 && (
        <button className="v5-text-button" type="button" onClick={() => setDrawerTab('pending')}>
          查看全部 {pending.length} 项待推进
        </button>
      )}
      {completed.length > 0 && (
        <button className="v5-completed-summary" type="button" onClick={() => setDrawerTab('completed')}>
          <Check size={17} />
          <span>本周已完成 {completed.length} 项</span>
          <ChevronRight size={17} />
        </button>
      )}
      {drawerTab && (
        <V5WeeklyDrawer
          activities={activities}
          completions={completions}
          today={today}
          activeCompletion={activeCompletion}
          initialTab={drawerTab}
          onClose={() => setDrawerTab(undefined)}
          onRecord={(activity) => {
            setDrawerTab(undefined)
            onRecord(activity)
          }}
          onCompleted={(activity) => {
            setDrawerTab(undefined)
            onCompleted(activity)
          }}
          onDetails={(activity) => {
            setDrawerTab(undefined)
            onDetails(activity)
          }}
        />
      )}
    </section>
  )
}

function V5WeeklyDrawer({
  activities,
  completions,
  today,
  activeCompletion,
  initialTab,
  onClose,
  onRecord,
  onCompleted,
  onDetails,
}: {
  activities: Activity[]
  completions: Completion[]
  today: string
  activeCompletion: (activity: Activity) => Completion | undefined
  initialTab: 'pending' | 'completed'
  onClose: () => void
  onRecord: (activity: Activity) => void
  onCompleted: (activity: Activity) => void
  onDetails: (activity: Activity) => void
}) {
  const [tab, setTab] = useState(initialTab)
  const [query, setQuery] = useState('')
  const pending = activities.filter((activity) => !weeklyViewState(activity, completions, today).complete)
  const completed = activities.filter((activity) => weeklyViewState(activity, completions, today).complete)
  const source = tab === 'pending' ? pending : completed
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visible = normalizedQuery
    ? source.filter((activity) => [
        activity.title,
        activity.domain ? domainLabel(activity.domain) : '旧体系',
        activity.difficulty,
      ].some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery)))
    : source
  return (
    <V5ModalSurface title="本周行动" onClose={onClose}>
      <div className="v5-drawer-tabs" role="tablist" aria-label="本周行动状态">
        <button type="button" role="tab" aria-selected={tab === 'pending'} className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>待推进 {pending.length}</button>
        <button type="button" role="tab" aria-selected={tab === 'completed'} className={tab === 'completed' ? 'active' : ''} onClick={() => setTab('completed')}>本周完成 {completed.length}</button>
      </div>
      {activities.length > 12 && (
        <label className="v5-drawer-search">
          <Search size={17} />
          <span className="sr-only">搜索本周行动</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、领域或难度" />
        </label>
      )}
      <div className="v5-drawer-list">
        {visible.map((activity) => (
          <V5WeeklyRow
            activity={activity}
            completions={completions}
            today={today}
            activeCompletion={activeCompletion(activity)}
            key={activity.id}
            onRecord={() => onRecord(activity)}
            onCompleted={() => onCompleted(activity)}
            onDetails={() => onDetails(activity)}
          />
        ))}
        {visible.length === 0 && <p className="v5-drawer-empty">{query ? '没有匹配的行动' : tab === 'pending' ? '本周行动已经全部完成' : '本周还没有完成的行动'}</p>}
      </div>
    </V5ModalSurface>
  )
}

function V5WeeklyRow({
  activity,
  completions,
  today,
  activeCompletion,
  onRecord,
  onCompleted,
  onDetails,
}: {
  activity: Activity
  completions: Completion[]
  today: string
  activeCompletion?: Completion
  onRecord: () => void
  onCompleted: () => void
  onDetails: () => void
}) {
  const { complete, summary, next, progress } = weeklyViewState(activity, completions, today)
  const rewardPreview = getV5WeeklyRewardPreview(activity, completions, today, activeCompletion)
  return (
    <article className={`v5-weekly-row${complete ? ' completed' : ''}`}>
      <div>
        <span>{activity.isKey ? '关键 · ' : ''}{activity.domain ? domainLabel(activity.domain) : '旧体系'}</span>
        <strong>{activity.title}</strong>
        <small>{summary} · {next}</small>
        <small className="v5-action-reward"><Medal size={13} />{rewardPreview.label}</small>
      </div>
      <div className="v5-weekly-actions">
        <button type="button" onClick={onDetails} title="查看本周详情" aria-label={`查看 ${activity.title} 本周详情`}><History size={17} /></button>
        <button type="button" disabled={complete} onClick={() => activeCompletion && !progress ? onCompleted() : onRecord()}>
          {complete ? '本周完成' : progress?.goal.metric === 'combined' ? '选择时长' : progress ? '记录一次' : activeCompletion ? '查看今天' : '记录'}
        </button>
      </div>
    </article>
  )
}
