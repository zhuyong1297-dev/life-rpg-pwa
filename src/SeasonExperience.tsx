import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  CalendarRange,
  Check,
  ChevronRight,
  ClipboardCheck,
  Compass,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { addDays, domainLabel, formatTierGoalValue, type Activity, type CoachPlanDraft, type Completion, type WeeklyReview } from './domain'
import {
  canCalibrateSeason,
  getSeasonDailyActivityIds,
  getSeasonDay,
  getSeasonEvidence,
  getSeasonStrategy,
  seasonResults,
  type CoachSuggestion,
  type Season,
  type SeasonResult,
  type SuggestionStatus,
} from './season'
import { stableLifeBlueprint, type CreateSeasonInput } from './db'

const responseLabels: Record<Exclude<SuggestionStatus, 'pending'>, string> = {
  accepted: '已接受',
  modified: '调整后接受',
  ignored: '已忽略',
}

const kindLabels: Record<CoachSuggestion['kind'], string> = {
  adjust: '降低阻力',
  pause: '重新评估',
  keep: '保持节奏',
  observe: '继续观察',
}

export function SeasonTodaySummary({
  season,
  today,
  activities,
  completions,
  draft,
  onOpen,
  onPlan,
}: {
  season?: Season
  today: string
  activities: Activity[]
  completions: Completion[]
  draft?: CoachPlanDraft
  onOpen: () => void
  onPlan: () => void
}) {
  if (!season) {
    return (
      <div className="season-plan-entry">
        <button className="season-summary season-summary-empty" type="button" onClick={onPlan} aria-label={draft ? '继续规划 28 天目标' : '规划一个 28 天目标'}>
          <span className="season-summary-icon"><Compass aria-hidden="true" /></span>
          <span><small>个人成长教练</small><strong>{draft ? '继续规划' : '规划一个 28 天目标'}</strong><b>{draft ? `已完成第 ${draft.currentStep} 步 · 草稿自动保存在本机` : '把模糊目标转成可验证结果和 1～3 项核心行为。'}</b></span>
          <ChevronRight aria-hidden="true" />
        </button>
        <button className="season-direct-link" type="button" aria-label="开始 28 天成长赛季" onClick={onOpen}>直接选择现有行为创建赛季</button>
      </div>
    )
  }
  const ids = getSeasonDailyActivityIds(season, today)
  const activityById = new Map(activities.map((activity) => [activity.id, activity]))
  const completedIds = new Set(completions.filter((completion) => completion.status === 'active' && completion.occurredOn === today).map((completion) => completion.activityId))
  const completed = ids.filter((id) => completedIds.has(id)).length
  const signalRecorded = season.dailySignals.some((signal) => signal.date === today)
  const labels = ids.map((id) => activityById.get(id)?.title ?? season.focusActivities.find((activity) => activity.activityId === id)?.title ?? '已移除行动')
  return (
    <div className="season-plan-entry">
      <button className="season-summary" type="button" onClick={onOpen} aria-label="管理当前成长赛季">
        <span className="season-summary-icon"><CalendarRange aria-hidden="true" /></span>
        <span className="season-summary-copy">
          <small>第 {getSeasonDay(season, today)} / 28 天 · 今日重点 {completed}/{ids.length} · 状态{signalRecorded ? '已记录' : '待记录'}</small>
          <strong>{season.title}</strong>
          <b>{labels.join(' · ')}</b>
        </span>
        <ChevronRight aria-hidden="true" />
      </button>
      <button className="next-season-plan" type="button" onClick={onPlan}>
        <Target aria-hidden="true" />
        <span><small>个人成长教练</small><strong>{draft ? draft.status === 'ready' ? '下个赛季已规划' : '继续规划下个赛季' : '规划下个赛季'}</strong></span>
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  )
}

export function CoachSuggestionSummary({ season, onOpen }: { season?: Season; onOpen: () => void }) {
  if (!season) return null
  const latestWeek = [...season.suggestions].sort((left, right) => right.weekStart.localeCompare(left.weekStart))[0]?.weekStart
  const latest = season.suggestions.filter((suggestion) => suggestion.weekStart === latestWeek)
  const pending = season.suggestions.filter((suggestion) => suggestion.status === 'pending').length
  if (latest.length === 0) return null
  return (
    <section className="coach-summary" aria-label="成长建议">
      <div><Lightbulb aria-hidden="true" /><span><small>本地成长教练</small><strong>{pending > 0 ? `${pending} 条建议待处理` : '本周建议已处理'}</strong></span></div>
      <p>{latest.map((suggestion) => kindLabels[suggestion.kind]).join(' · ')}</p>
      <button className="secondary-action" type="button" onClick={onOpen}>查看依据<ChevronRight aria-hidden="true" /></button>
    </section>
  )
}

interface SeasonHubProps {
  initialView?: 'overview' | 'signal'
  seasons: Season[]
  activities: Activity[]
  completions: Completion[]
  reviews: WeeklyReview[]
  today: string
  onClose: () => void
  onCreate: (input: CreateSeasonInput) => Promise<void>
  onSetDailyFocus: (seasonId: string, activityIds: string[]) => Promise<void>
  onCalibrate: (seasonId: string) => Promise<void>
  onSaveSignal: (seasonId: string, signal: { wakeWindowMet: boolean; morningEnergy: number; control: number }) => Promise<void>
  onRespond: (seasonId: string, suggestionId: string, status: Exclude<SuggestionStatus, 'pending'>, note?: string) => Promise<void>
  onComplete: (seasonId: string, result: SeasonResult, evidence: string) => Promise<void>
}

export function SeasonHubModal(props: SeasonHubProps) {
  const activeSeason = props.seasons.find((season) => season.status === 'active')
  const completed = [...props.seasons].filter((season) => season.status === 'completed').sort((left, right) => right.endsOn.localeCompare(left.endsOn))
  const [view, setView] = useState<'overview' | 'create' | 'focus' | 'calibrate' | 'signal' | 'complete'>(
    activeSeason ? props.initialView ?? 'overview' : 'create',
  )
  const [template, setTemplate] = useState<Season>()

  useEffect(() => {
    if (activeSeason && view === 'create') setView('overview')
  }, [activeSeason, view])

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal feature-modal season-hub-modal" role="dialog" aria-modal="true" aria-labelledby="season-hub-title">
        <div className="modal-header">
          <div><span className="modal-kicker">个人成长教练</span><h2 id="season-hub-title">{view === 'create' ? '创建成长赛季' : activeSeason?.title ?? '成长赛季'}</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={props.onClose}><X aria-hidden="true" /></button>
        </div>
        {view === 'create' ? (
          <CreateSeasonForm
            activities={props.activities}
            today={props.today}
            template={template}
            onCancel={() => activeSeason ? setView('overview') : props.onClose()}
            onCreate={props.onCreate}
          />
        ) : activeSeason ? (
          <>
            <SeasonOverview season={activeSeason} today={props.today} completions={props.completions} />
            <div className="season-hub-actions">
              <button type="button" onClick={() => setView('signal')}><ShieldCheck aria-hidden="true" />记录今日状态</button>
              <button type="button" onClick={() => setView('focus')}><SlidersHorizontal aria-hidden="true" />调整今日重点</button>
              {canCalibrateSeason(activeSeason, props.today) && <button type="button" onClick={() => setView('calibrate')}><Sparkles aria-hidden="true" />校准这个赛季</button>}
              <button type="button" disabled={props.today < activeSeason.endsOn} onClick={() => setView('complete')}><ClipboardCheck aria-hidden="true" />结束赛季</button>
            </div>
            {view === 'focus' && <DailyFocusEditor season={activeSeason} activities={props.activities} today={props.today} onSave={async (ids) => { await props.onSetDailyFocus(activeSeason.id, ids); setView('overview') }} />}
            {view === 'signal' && <DailySignalEditor season={activeSeason} today={props.today} onSave={async (signal) => { await props.onSaveSignal(activeSeason.id, signal); setView('overview') }} />}
            {view === 'calibrate' && <StableLifeCalibration onCancel={() => setView('overview')} onConfirm={async () => { await props.onCalibrate(activeSeason.id); setView('overview') }} />}
            {view === 'complete' && <CompleteSeasonForm season={activeSeason} onComplete={props.onComplete} />}
            <SuggestionList season={activeSeason} onRespond={props.onRespond} />
          </>
        ) : null}
        {view !== 'create' && (
          <StrategyLibrary
            seasons={completed}
            reviews={props.reviews}
            completions={props.completions}
            onReuse={(season) => { setTemplate(season); setView('create') }}
          />
        )}
        {!activeSeason && view !== 'create' && <button className="primary-action" type="button" onClick={() => setView('create')}><Compass aria-hidden="true" />开始新赛季</button>}
      </section>
    </div>
  )
}

function SeasonOverview({ season, today, completions }: { season: Season; today: string; completions: Completion[] }) {
  const day = getSeasonDay(season, today)
  const pending = season.suggestions.filter((suggestion) => suggestion.status === 'pending').length
  const evidence = getSeasonEvidence(season, completions, today)
  return (
    <section className="season-overview">
      <div className="season-progress-line"><span>第 {day} / 28 天</span><b>{Math.round(day / 28 * 100)}%</b></div>
      <div className="season-progress-track"><span style={{ width: `${day / 28 * 100}%` }} /></div>
      <dl><div><dt>成功标准</dt><dd>{season.successCriterion}</dd></div><div><dt>开始状态</dt><dd>{season.baseline}</dd></div><div><dt>期望结果</dt><dd>{season.targetOutcome}</dd></div></dl>
      <div className="season-focus-snapshots">{season.focusActivities.map((activity) => <span key={activity.activityId}>{activity.title}</span>)}</div>
      <div className="season-evidence-grid">
        <span><small>起床达标</small><b>{evidence.wakeWindowDays}/{evidence.recentSignalCount || 7}</b></span>
        <span><small>晨间精力</small><b>{evidence.recentSignalCount ? evidence.morningEnergyAverage.toFixed(1) : '-'}/5</b></span>
        <span><small>掌控感</small><b>{evidence.recentSignalCount ? evidence.controlAverage.toFixed(1) : '-'}/5</b></span>
      </div>
      <div className="season-behavior-progress">{evidence.behaviorDays.map((behavior) => <span key={behavior.activityId}><small>{behavior.title}</small><b>{behavior.completedDays}/20 天</b></span>)}</div>
      <small>{season.startsOn} 至 {season.endsOn} · {pending} 条建议待处理</small>
    </section>
  )
}

function CreateSeasonForm({
  activities,
  today,
  template,
  onCancel,
  onCreate,
}: {
  activities: Activity[]
  today: string
  template?: Season
  onCancel: () => void
  onCreate: (input: CreateSeasonInput) => Promise<void>
}) {
  const [title, setTitle] = useState(template?.title ?? '')
  const [criterion, setCriterion] = useState(template?.successCriterion ?? '')
  const [baseline, setBaseline] = useState(template?.finalEvidence ?? template?.targetOutcome ?? '')
  const [target, setTarget] = useState(template?.targetOutcome ?? '')
  const [focusIds, setFocusIds] = useState<string[]>([])
  const eligible = activities.filter((activity) => activity.type === 'habit' && activity.enabled && !activity.archivedAt)

  useEffect(() => {
    setTitle(template?.title ?? '')
    setCriterion(template?.successCriterion ?? '')
    setBaseline(template?.finalEvidence ?? template?.targetOutcome ?? '')
    setTarget(template?.targetOutcome ?? '')
    setFocusIds([])
  }, [template])

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      await onCreate({ title, successCriterion: criterion, baseline, targetOutcome: target, focusActivityIds: focusIds })
    } catch {
      // The parent surfaces the validation error without closing this form.
    }
  }

  return (
    <form className="season-form" onSubmit={(event) => void submit(event)}>
      {template && <p className="season-template-note"><RefreshCw aria-hidden="true" />已复用上次的目标结构；核心行为需要重新选择，不会自动复制。</p>}
      <label>成长主题<input required maxLength={40} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：恢复体能" autoFocus /></label>
      <label>可验证的成功标准<textarea required maxLength={180} value={criterion} onChange={(event) => setCriterion(event.target.value)} placeholder="28 天后，什么证据能说明这个赛季有价值？" /></label>
      <label>开始状态<textarea required maxLength={280} value={baseline} onChange={(event) => setBaseline(event.target.value)} placeholder="如实描述现在的状态，不需要包装。" /></label>
      <label>期望结果<textarea required maxLength={280} value={target} onChange={(event) => setTarget(event.target.value)} placeholder="希望现实中发生什么变化？" /></label>
      <fieldset className="season-focus-picker"><legend>核心行为（1～3 项）</legend><p>只选择真正服务于本赛季结果的习惯。</p>
        {eligible.length === 0 ? <span className="empty-state">请先创建并启用至少一项习惯。</span> : eligible.map((activity) => {
          const checked = focusIds.includes(activity.id)
          const scheduleLabel = activity.schedule.kind === 'daily' ? '每天' : activity.schedule.kind === 'weekly' ? `每周 ${activity.schedule.times} 次` : '单次'
          return <label key={activity.id}><input type="checkbox" checked={checked} disabled={!checked && focusIds.length >= 3} onChange={() => setFocusIds((current) => checked ? current.filter((id) => id !== activity.id) : [...current, activity.id])} /><span><strong>{activity.title}</strong><small>{activity.domain ? domainLabel(activity.domain) : `${activity.attribute} · 旧体系`} · {scheduleLabel}</small></span></label>
        })}
      </fieldset>
      <p className="form-detail-note">赛季从 {today} 到 {addDays(today, 27)}，共 28 个游戏日。XP 只反馈投入，不判断赛季是否成功。</p>
      <div className="confirmation-actions"><button type="button" onClick={onCancel}>返回</button><button className="primary-action" type="submit" disabled={focusIds.length === 0}><Compass aria-hidden="true" />开始赛季</button></div>
    </form>
  )
}

function DailyFocusEditor({ season, activities, today, onSave }: { season: Season; activities: Activity[]; today: string; onSave: (ids: string[]) => Promise<void> }) {
  const [selected, setSelected] = useState(() => getSeasonDailyActivityIds(season, today))
  const eligible = activities.filter((activity) => activity.enabled && !activity.archivedAt)
  return (
    <section className="season-inline-editor">
      <h3>调整今日重点</h3><p>默认来自赛季核心行为，也可以为今天临时替换，不会改变赛季定义。</p>
      <div className="daily-focus-options">{eligible.map((activity) => {
        const checked = selected.includes(activity.id)
        return <label key={activity.id}><input type="checkbox" checked={checked} disabled={!checked && selected.length >= 3} onChange={() => setSelected((current) => checked ? current.filter((id) => id !== activity.id) : [...current, activity.id])} />{activity.title}</label>
      })}</div>
      <button className="secondary-action" type="button" disabled={selected.length === 0} onClick={() => void onSave(selected).catch(() => undefined)}><Check aria-hidden="true" />保存今日重点</button>
    </section>
  )
}

function StableLifeCalibration({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  return (
    <section className="season-inline-editor season-calibration">
      <div><span className="modal-kicker">第 1～3 天校准期</span><h3>用现实结果重新对齐核心行为</h3></div>
      <p>旧完成、XP、金币和流水会完整保留；现有关键行为降为普通行为，今天重新作为第 1 天。</p>
      <div className="blueprint-list">{stableLifeBlueprint.map((activity) => (
        <article key={activity.title}>
          <div><strong>{activity.title}</strong><span>{activity.cue}</span></div>
          {activity.goal.kind === 'tiered' && <small>基础 {formatTierGoalValue(activity.goal, 1)} · 标准 {formatTierGoalValue(activity.goal, 2)}</small>}
          <p>{activity.protocol}</p>
        </article>
      ))}</div>
      <div className="calibration-rules">
        <span>目标作息：23:30–07:30</span>
        <span>思绪停车使用纸张，不打开新的应用</span>
        <span>完成基础层就是有效行动，不追求每天满档</span>
      </div>
      <div className="confirmation-actions">
        <button type="button" onClick={onCancel}>返回</button>
        <button className="primary-action" type="button" aria-busy={saving} disabled={saving} onClick={() => { setSaving(true); void onConfirm().catch(() => setSaving(false)) }}><Sparkles aria-hidden="true" />{saving ? '正在校准…' : '启用稳定生活方案'}</button>
      </div>
    </section>
  )
}

function DailySignalEditor({
  season,
  today,
  onSave,
}: {
  season: Season
  today: string
  onSave: (signal: { wakeWindowMet: boolean; morningEnergy: number; control: number }) => Promise<void>
}) {
  const existing = season.dailySignals.find((signal) => signal.date === today)
  const [wakeWindowMet, setWakeWindowMet] = useState<boolean | undefined>(existing?.wakeWindowMet)
  const [morningEnergy, setMorningEnergy] = useState(existing?.morningEnergy ?? 0)
  const [control, setControl] = useState(existing?.control ?? 0)
  const [saving, setSaving] = useState(false)
  const valid = wakeWindowMet !== undefined && morningEnergy > 0 && control > 0
  const scale = (value: number, setValue: (value: number) => void, label: string) => (
    <div className="signal-scale" role="group" aria-label={label}>{[1, 2, 3, 4, 5].map((item) => <button type="button" className={value === item ? 'selected' : ''} key={item} onClick={() => setValue(item)}>{item}</button>)}</div>
  )
  return (
    <section className="season-inline-editor daily-signal-editor">
      <div><span className="modal-kicker">约 15 秒</span><h3>记录今天的现实状态</h3></div>
      <p>这三项只用于判断生活是否真的变稳定，不影响 XP 或金币。</p>
      <div className="signal-field"><strong>是否在 07:00–08:00 起床？</strong><div className="signal-binary" role="group" aria-label="起床时间是否达标"><button type="button" className={wakeWindowMet === true ? 'selected' : ''} onClick={() => setWakeWindowMet(true)}>是</button><button type="button" className={wakeWindowMet === false ? 'selected' : ''} onClick={() => setWakeWindowMet(false)}>否</button></div></div>
      <div className="signal-field"><strong>今天上午的精力</strong><small>1 很低 · 5 很好</small>{scale(morningEnergy, setMorningEnergy, '晨间精力')}</div>
      <div className="signal-field"><strong>今天的生活掌控感</strong><small>1 被推着走 · 5 主动选择</small>{scale(control, setControl, '生活掌控感')}</div>
      <button className="primary-action" type="button" aria-busy={saving} disabled={!valid || saving} onClick={() => {
        if (wakeWindowMet === undefined) return
        setSaving(true)
        void onSave({ wakeWindowMet, morningEnergy, control }).catch(() => setSaving(false))
      }}><Check aria-hidden="true" />{saving ? '正在保存…' : existing ? '更新今日状态' : '保存今日状态'}</button>
    </section>
  )
}

function SuggestionList({ season, onRespond }: { season: Season; onRespond: SeasonHubProps['onRespond'] }) {
  const suggestions = [...season.suggestions].sort((left, right) => right.weekStart.localeCompare(left.weekStart))
  const [editingId, setEditingId] = useState<string>()
  const [note, setNote] = useState('')
  return (
    <section className="season-suggestions">
      <div className="section-heading"><div><span>规则透明</span><h3><Lightbulb aria-hidden="true" />成长建议</h3></div><span>{suggestions.filter((item) => item.status === 'pending').length} 待处理</span></div>
      {suggestions.length === 0 ? <p className="empty-state">完成每周复盘后，这里会生成最多三条本地建议。</p> : suggestions.map((suggestion) => (
        <article className={`suggestion-card suggestion-${suggestion.kind}`} key={suggestion.id}>
          <div><span>{kindLabels[suggestion.kind]} · {suggestion.weekStart}</span><strong>{suggestion.title}</strong></div>
          <p>{suggestion.reason}</p><small>{suggestion.expectedBenefit}</small>
          {suggestion.status === 'pending' ? (
            editingId === suggestion.id ? (
              <div className="suggestion-response"><label>你准备怎样调整？<textarea maxLength={140} value={note} onChange={(event) => setNote(event.target.value)} autoFocus /></label><button type="button" disabled={!note.trim()} onClick={() => void onRespond(season.id, suggestion.id, 'modified', note).then(() => { setEditingId(undefined); setNote('') }).catch(() => undefined)}>确认调整后接受</button></div>
            ) : (
              <div className="suggestion-actions"><button type="button" onClick={() => void onRespond(season.id, suggestion.id, 'accepted').catch(() => undefined)}>接受</button><button type="button" onClick={() => setEditingId(suggestion.id)}>修改后接受</button><button type="button" onClick={() => void onRespond(season.id, suggestion.id, 'ignored').catch(() => undefined)}>忽略</button></div>
            )
          ) : <b className="suggestion-status">{responseLabels[suggestion.status]}{suggestion.responseNote ? `：${suggestion.responseNote}` : ''}</b>}
        </article>
      ))}
    </section>
  )
}

function CompleteSeasonForm({ season, onComplete }: { season: Season; onComplete: SeasonHubProps['onComplete'] }) {
  const [result, setResult] = useState<SeasonResult>('部分达成')
  const [evidence, setEvidence] = useState('')
  return (
    <section className="season-inline-editor season-complete-form">
      <h3>结束 28 天赛季</h3><p>只根据现实证据判断结果，不使用 XP 代替成果。</p>
      <div className="segmented-control" aria-label="赛季结果">{seasonResults.map((item) => <button type="button" className={result === item ? 'selected' : ''} key={item} onClick={() => setResult(item)}>{item}</button>)}</div>
      <label>现实证据<textarea required maxLength={500} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="发生了什么变化？哪些证据支持你的判断？" /></label>
      <button className="primary-action" type="button" disabled={!evidence.trim()} onClick={() => void onComplete(season.id, result, evidence).catch(() => undefined)}><ClipboardCheck aria-hidden="true" />保存赛季结论</button>
    </section>
  )
}

function StrategyLibrary({ seasons, reviews, completions, onReuse }: { seasons: Season[]; reviews: WeeklyReview[]; completions: Completion[]; onReuse: (season: Season) => void }) {
  const strategies = useMemo(() => seasons.map((season) => getSeasonStrategy(season, reviews, completions)), [seasons, reviews, completions])
  const effective = [...new Set(strategies.flatMap((strategy) => strategy.effectiveBehaviors.map((behavior) => behavior.title)))]
  return (
    <section className="strategy-library">
      <div className="section-heading"><div><span>按现实结果沉淀</span><h3><Target aria-hidden="true" />个人策略库</h3></div><span>{strategies.length}</span></div>
      {strategies.length > 0 && <p className="strategy-pattern">已完成 {strategies.length} 个赛季{effective.length > 0 ? ` · 已验证有效：${effective.slice(0, 3).join('、')}` : ' · 继续积累现实帮助数据'}</p>}
      {strategies.length === 0 ? <p className="empty-state">结束第一个赛季后，这里会形成可复用的个人策略。</p> : strategies.map((strategy) => (
        <details className="strategy-card" key={strategy.season.id}>
          <summary><span><strong>{strategy.season.title}</strong><small>{strategy.season.finalResult} · 坚持率 {Math.round(strategy.averageAdherence * 100)}%</small></span><ChevronRight aria-hidden="true" /></summary>
          <div><p><b>成功标准：</b>{strategy.season.successCriterion}</p><p><b>现实结果：</b>{strategy.season.finalEvidence}</p><p><b>有效行为：</b>{strategy.effectiveBehaviors.map((item) => `${item.title}（${item.cadence}，基础 ${item.baseLayer}）`).join('、') || '尚未识别'}</p><p><b>主要阻力：</b>{strategy.mainFriction ? `${strategy.mainFriction.title}（${strategy.mainFriction.friction.toFixed(1)}/5）` : '数据不足'}</p><p><b>下次建议：</b>{strategy.nextSuggestion}</p><p><b>行动记录：</b>{strategy.activeDays} 个活跃日 · {strategy.completionCount} 次有效完成</p><button className="secondary-action" type="button" onClick={() => onReuse(strategy.season)}><RefreshCw aria-hidden="true" />复用目标结构</button></div>
        </details>
      ))}
    </section>
  )
}
