import type { Activity, HabitAnchor } from '../domain'

export function HabitFormationFields({
  anchor,
  activities,
  excludeId,
  onChange,
}: {
  anchor?: HabitAnchor
  activities: Activity[]
  excludeId?: string
  onChange: (anchor?: HabitAnchor) => void
}) {
  const dailyActivities = activities.filter((activity) => (
    activity.id !== excludeId
    && activity.type === 'habit'
    && activity.schedule.kind === 'daily'
    && activity.enabled
    && !activity.archivedAt
  ))
  const kind = anchor?.kind ?? 'none'
  const chooseKind = (next: HabitAnchor['kind'] | 'none') => {
    if (next === 'none') onChange(undefined)
    else if (next === 'time') onChange({ kind: 'time', time: '07:30' })
    else if (next === 'event') onChange({ kind: 'event', label: '' })
    else {
      const target = dailyActivities[0]
      onChange(target ? { kind: 'after_activity', activityId: target.id, titleSnapshot: target.title } : undefined)
    }
  }
  return (
    <fieldset className="habit-anchor-fields">
      <legend>什么时候开始 <span>推荐设置，不是强制条件</span></legend>
      <div className="segmented-control habit-anchor-kinds" aria-label="习惯启动锚点">
        <button type="button" className={kind === 'time' ? 'selected' : ''} onClick={() => chooseKind('time')}>固定时间</button>
        <button type="button" className={kind === 'event' ? 'selected' : ''} onClick={() => chooseKind('event')}>某件事后</button>
        <button type="button" className={kind === 'after_activity' ? 'selected' : ''} disabled={dailyActivities.length === 0} onClick={() => chooseKind('after_activity')}>另一行动后</button>
        <button type="button" className={kind === 'none' ? 'selected' : ''} onClick={() => chooseKind('none')}>暂不设置</button>
      </div>
      {anchor?.kind === 'time' && (
        <label className="full-field">建议执行时间<input type="time" required value={anchor.time} onChange={(event) => onChange({ kind: 'time', time: event.target.value })} /></label>
      )}
      {anchor?.kind === 'event' && (
        <label className="full-field">现实中的触发事件<input required maxLength={80} value={anchor.label} onChange={(event) => onChange({ kind: 'event', label: event.target.value })} placeholder="例如：刷牙后、吃完午饭后" /></label>
      )}
      {anchor?.kind === 'after_activity' && (
        <label className="full-field">完成这项行动后
          <select value={anchor.activityId} onChange={(event) => {
            const target = dailyActivities.find((activity) => activity.id === event.target.value)!
            onChange({ kind: 'after_activity', activityId: target.id, titleSnapshot: target.title })
          }}>
            {dailyActivities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}
          </select>
        </label>
      )}
      <p>锚点只帮助应用推荐下一步。即使没有到点或前一项未打卡，你仍然可以直接完成。</p>
    </fieldset>
  )
}
