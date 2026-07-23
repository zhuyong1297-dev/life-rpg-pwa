import { useMemo, useState, type FormEvent } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  Gift,
  ImagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  TicketCheck,
  X,
} from 'lucide-react'
import {
  addDays,
  getRewardCooldownUntil,
  getRewardPriceSuggestions,
  isRewardConfigured,
  type LedgerEvent,
  type LevelSystem,
  type Reward,
  type RewardClaim,
  type RewardHorizon,
  type RewardRepeatPolicy,
  type RewardSystem,
} from './domain'
import type { RewardInput } from './db'
import { compressRewardImage } from './reward-image'

type View = 'target' | 'wishes' | 'claims'
type ReserveSource = { kind: 'coins' } | { kind: 'milestone'; level: number }

interface RewardExperienceProps {
  rewards: Reward[]
  claims: RewardClaim[]
  system?: RewardSystem
  levelSystem?: LevelSystem
  ledgerEvents: LedgerEvent[]
  coins: number
  today: string
  onBack: () => void
  onCreate: (input: RewardInput) => Promise<void>
  onUpdate: (id: string, input: RewardInput) => Promise<void>
  onEnabled: (id: string, enabled: boolean) => Promise<void>
  onQueue: (activeId: string | undefined, queueIds: string[]) => Promise<void>
  onReserve: (rewardId: string, plannedFor: string, source: ReserveSource) => Promise<void>
  onFulfill: (claimId: string, satisfaction: number, repeatAgain: boolean) => Promise<void>
  onCancel: (claimId: string) => Promise<void>
  onNotice: (message: string) => void
}

const horizonLabels: Record<RewardHorizon, string> = { near: '近期', medium: '中期', far: '远期' }
const inspiration = [
  ['体验', '去一次真正期待的展览、演出或短途体验'],
  ['身体恢复', '按摩、温泉、理疗或一段不被打扰的恢复时间'],
  ['空间升级', '改善桌面、灯光、床品或收纳体验'],
  ['创作工具', '真正会持续使用的书、软件或制作工具'],
  ['长期愿望', '旅行、设备或值得积累数月的大目标'],
] as const

function formatMoney(cents: number) {
  return `¥${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}

function nextWeekend(today: string) {
  const date = new Date(`${today}T12:00:00`)
  const days = date.getDay() === 0 ? 6 : 6 - date.getDay()
  return addDays(today, days)
}

function rewardImage(reward: Reward) {
  return reward.imageDataUrl
    ? <img src={reward.imageDataUrl} alt="" />
    : <span className="wish-placeholder"><Gift aria-hidden="true" /></span>
}

export function RewardExperience(props: RewardExperienceProps) {
  const [view, setView] = useState<View>('target')
  const [editor, setEditor] = useState<Reward | 'new' | null>(null)
  const [reserveReward, setReserveReward] = useState<Reward | null>(null)
  const [reviewClaim, setReviewClaim] = useState<RewardClaim | null>(null)
  const [satisfaction, setSatisfaction] = useState<number>()
  const [wishQuery, setWishQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const system = props.system
  const activeReward = props.rewards.find((reward) => reward.id === system?.activeRewardId)
  const queuedRewards = system?.queueIds
    .map((id) => props.rewards.find((reward) => reward.id === id))
    .filter((reward): reward is Reward => Boolean(reward)) ?? []
  const configured = props.rewards.filter(isRewardConfigured)
  const pendingSetup = props.rewards.filter((reward) => reward.enabled && !isRewardConfigured(reward))
  const normalizedWishQuery = wishQuery.trim().toLocaleLowerCase()
  const visibleConfigured = normalizedWishQuery
    ? configured.filter((reward) => reward.title.toLocaleLowerCase().includes(normalizedWishQuery))
    : configured
  const visiblePendingSetup = normalizedWishQuery
    ? pendingSetup.filter((reward) => reward.title.toLocaleLowerCase().includes(normalizedWishQuery))
    : pendingSetup
  const reservedClaims = props.claims.filter((claim) => claim.status === 'reserved').sort((a, b) => a.plannedFor.localeCompare(b.plannedFor))
  const pastClaims = props.claims.filter((claim) => claim.status !== 'reserved').sort((a, b) => b.reservedAt.localeCompare(a.reservedAt))
  const suggestions = useMemo(
    () => getRewardPriceSuggestions(props.ledgerEvents, props.today),
    [props.ledgerEvents, props.today],
  )

  async function run(action: () => Promise<void>) {
    if (busy) return false
    setBusy(true)
    try {
      await action()
      return true
    } catch (error) {
      props.onNotice(error instanceof Error ? error.message : '操作失败')
      return false
    } finally {
      setBusy(false)
    }
  }

  function queueReward(reward: Reward) {
    if (!system) return
    const ids = queuedRewards.map((item) => item.id).filter((id) => id !== reward.id)
    if (!activeReward) void run(() => props.onQueue(reward.id, ids))
    else if (activeReward.id !== reward.id) void run(() => props.onQueue(activeReward.id, [...ids, reward.id]))
  }

  function makePrimary(reward: Reward) {
    if (!system) return
    const queueIds = [
      ...(activeReward && activeReward.id !== reward.id ? [activeReward.id] : []),
      ...queuedRewards.map((item) => item.id),
    ].filter((id, index, ids) => id !== reward.id && ids.indexOf(id) === index)
    void run(() => props.onQueue(reward.id, queueIds))
  }

  function moveQueue(index: number, offset: number) {
    if (!system?.activeRewardId) return
    const queueIds = [...system.queueIds]
    const next = index + offset
    if (next < 0 || next >= queueIds.length) return
    ;[queueIds[index], queueIds[next]] = [queueIds[next], queueIds[index]]
    void run(() => props.onQueue(system.activeRewardId, queueIds))
  }

  return (
    <div className="reward-page">
      <header className="secondary-header reward-header">
        <button className="back-button" type="button" onClick={props.onBack}><ArrowLeft aria-hidden="true" />返回</button>
        <div><p className="eyebrow">把成长兑现成真正期待的生活</p><h1>奖励愿望</h1></div>
        <button className="icon-button" type="button" title="新增愿望" onClick={() => setEditor('new')}><Plus aria-hidden="true" /></button>
      </header>

      <section className="reward-fund-strip" aria-label="奖励基金">
        <div><span>奖励基金</span><strong>{formatMoney(system?.availableCents ?? 0)}</strong></div>
        <div><span>每个游戏月</span><b>+¥400</b></div>
        <div><span>累计上限</span><b>¥1,200</b></div>
      </section>

      <nav className="reward-tabs" aria-label="奖励商店视图">
        <button className={view === 'target' ? 'selected' : ''} type="button" onClick={() => setView('target')}><Target aria-hidden="true" />目标</button>
        <button className={view === 'wishes' ? 'selected' : ''} type="button" onClick={() => setView('wishes')}><Sparkles aria-hidden="true" />愿望</button>
        <button className={view === 'claims' ? 'selected' : ''} type="button" onClick={() => setView('claims')}><TicketCheck aria-hidden="true" />奖励券{reservedClaims.length > 0 && <b>{reservedClaims.length}</b>}</button>
      </nav>

      {view === 'target' && (
        <div className="reward-view">
          {reservedClaims.length > 0 && (
            <button className={reservedClaims.some((claim) => claim.plannedFor < props.today) ? 'claim-alert overdue' : 'claim-alert'} type="button" onClick={() => setView('claims')}>
              <TicketCheck aria-hidden="true" />
              <span><strong>{reservedClaims.some((claim) => claim.plannedFor < props.today) ? '有奖励已经到兑现日' : `${reservedClaims.length} 张奖励券待兑现`}</strong><small>享用后用两次点击完成轻复盘</small></span>
              <ChevronRight aria-hidden="true" />
            </button>
          )}
          {activeReward && isRewardConfigured(activeReward) ? (
            <article className="primary-wish">
              <div className="primary-wish-media">{rewardImage(activeReward)}</div>
              <div className="primary-wish-copy">
                <span className="wish-kicker">当前主目标 · {horizonLabels[activeReward.horizon]}</span>
                <h2>{activeReward.title}</h2>
                <p>{activeReward.reason}</p>
                <div className="wish-progress-copy"><span>{props.coins} / {activeReward.cost} 金币</span><b>{props.coins >= activeReward.cost ? '已经可以锁定' : `还差 ${activeReward.cost - props.coins}`}</b></div>
                <div className="wish-progress"><i style={{ width: `${Math.min(100, props.coins / activeReward.cost * 100)}%` }} /></div>
                <div className="wish-meta"><span>{formatMoney(activeReward.cashCostCents)}</span><span>{suggestions.dailyCoins ? `预计约 ${Math.ceil(Math.max(0, activeReward.cost - props.coins) / suggestions.dailyCoins)} 天` : '继续积累后估算日期'}</span></div>
                <button className="primary-action" type="button" disabled={busy || props.coins < activeReward.cost || system!.availableCents < activeReward.cashCostCents} onClick={() => setReserveReward(activeReward)}><Gift aria-hidden="true" />锁定奖励</button>
              </div>
            </article>
          ) : (
            <section className="reward-empty-goal">
              <Target aria-hidden="true" />
              <h2>{activeReward ? '先整理这个旧奖励' : '选择一个真正期待的愿望'}</h2>
              <p>{activeReward ? '补充期待理由、现实成本和重复方式后，才能将它锁定。' : '主目标一次只保留一个，金币会有清晰去向。'}</p>
              <button type="button" onClick={() => activeReward ? setEditor(activeReward) : setView('wishes')}>{activeReward ? '整理奖励' : '浏览愿望'}</button>
            </section>
          )}
          {queuedRewards.length > 0 && (
            <section className="reward-queue">
              <div className="reward-section-title"><div><span>接下来</span><h2>候选队列</h2></div><b>{queuedRewards.length}</b></div>
              {queuedRewards.map((reward, index) => (
                <article className="queue-row" key={reward.id}>
                  <span className="queue-order">{index + 1}</span>
                  <div><strong>{reward.title}</strong><span>{reward.cost} 金币 · {reward.cashCostCents !== undefined ? formatMoney(reward.cashCostCents) : '待整理'}</span></div>
                  <div className="queue-actions">
                    <button className="icon-button" type="button" title="上移" disabled={index === 0} onClick={() => moveQueue(index, -1)}><ArrowUp aria-hidden="true" /></button>
                    <button className="icon-button" type="button" title="下移" disabled={index === queuedRewards.length - 1} onClick={() => moveQueue(index, 1)}><ArrowDown aria-hidden="true" /></button>
                    <button type="button" onClick={() => makePrimary(reward)}>设为主目标</button>
                  </div>
                </article>
              ))}
            </section>
          )}
        </div>
      )}

      {view === 'wishes' && (
        <div className="reward-view">
          {configured.length + pendingSetup.length > 8 && (
            <label className="reward-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                value={wishQuery}
                onChange={(event) => setWishQuery(event.target.value)}
                placeholder="搜索愿望"
              />
            </label>
          )}
          {visiblePendingSetup.length > 0 && (
            <section className="legacy-wishes">
              <div className="reward-section-title"><div><span>旧商店迁移</span><h2>待整理</h2></div><b>{pendingSetup.length}</b></div>
              <p>这些商品不会丢失，但补全现实成本和愿望类型前不能锁定。</p>
              {visiblePendingSetup.map((reward) => <WishRow key={reward.id} reward={reward} status="待整理" onEdit={() => setEditor(reward)} onPrimary={() => {}} onQueue={() => {}} onToggle={() => void run(() => props.onEnabled(reward.id, false))} />)}
            </section>
          )}
          <section>
            <div className="reward-section-title"><div><span>真正想要的现实体验</span><h2>愿望清单</h2></div><button type="button" onClick={() => setEditor('new')}><Plus aria-hidden="true" />新增</button></div>
            <div className="wish-list">
              {configured.length === 0 && <p className="empty-state">还没有愿望。先从一件你真的期待、完成后会记得的事开始。</p>}
              {configured.length > 0 && visibleConfigured.length === 0 && visiblePendingSetup.length === 0 && <p className="empty-state">没有匹配的愿望。</p>}
              {visibleConfigured.map((reward) => {
                const cooldown = getRewardCooldownUntil(reward, props.claims)
                const reserved = reservedClaims.some((claim) => claim.rewardId === reward.id)
                const status = !reward.enabled ? '已停用' : reserved ? '待兑现' : cooldown && cooldown > props.today ? `冷却至 ${cooldown}` : reward.id === activeReward?.id ? '主目标' : queuedRewards.some((item) => item.id === reward.id) ? '候选' : '可规划'
                return <WishRow key={reward.id} reward={reward} status={status} onEdit={() => setEditor(reward)} onPrimary={() => makePrimary(reward)} onQueue={() => queueReward(reward)} onToggle={() => void run(() => props.onEnabled(reward.id, !reward.enabled))} />
              })}
            </div>
          </section>
          <details className="inspiration-library">
            <summary><Sparkles aria-hidden="true" />打开本地灵感库</summary>
            <p>灵感不会自动加入清单。选择后仍由你确认成本和价格。</p>
            {inspiration.map(([name, example]) => <button type="button" key={name} onClick={() => setEditor('new')}><strong>{name}</strong><span>{example}</span><ChevronRight aria-hidden="true" /></button>)}
          </details>
        </div>
      )}

      {view === 'claims' && (
        <div className="reward-view">
          <section>
            <div className="reward-section-title"><div><span>已经为自己留出的奖励</span><h2>待兑现</h2></div><b>{reservedClaims.length}</b></div>
            {reservedClaims.length === 0 && <p className="empty-state">还没有待兑现奖励券。</p>}
            <div className="claim-list">
              {reservedClaims.map((claim) => (
                <article className={claim.plannedFor < props.today ? 'claim-card overdue' : 'claim-card'} key={claim.id}>
                  <div><span>{claim.source === 'milestone' ? `Lv.${claim.milestoneLevel} 礼券` : `${claim.coinCostSnapshot} 金币`}</span><h3>{claim.titleSnapshot}</h3><p><CalendarDays aria-hidden="true" />计划 {claim.plannedFor}{claim.plannedFor < props.today ? ' · 已到兑现日' : ''}</p></div>
                  <div className="claim-card-actions"><button type="button" onClick={() => { setSatisfaction(undefined); setReviewClaim(claim) }}><Check aria-hidden="true" />已经享用</button><button className="danger-text" type="button" onClick={() => void run(() => props.onCancel(claim.id))}>取消并退款</button></div>
                </article>
              ))}
            </div>
          </section>
          {pastClaims.length > 0 && (
            <details className="claim-history">
              <summary>历史奖励券 · {pastClaims.length}</summary>
              {pastClaims.map((claim) => <p key={claim.id}><span>{claim.titleSnapshot}</span><b>{claim.status === 'fulfilled' ? `满足感 ${claim.satisfaction}/5` : '已取消'}</b></p>)}
            </details>
          )}
        </div>
      )}

      {editor && (
        <WishEditor
          reward={editor === 'new' ? undefined : editor}
          target={editor !== 'new' && editor.id === activeReward?.id}
          suggestions={suggestions}
          onClose={() => setEditor(null)}
          onSave={async (input) => {
            if (await run(() => editor === 'new' ? props.onCreate(input) : props.onUpdate(editor.id, input))) {
              setEditor(null)
            }
          }}
          onNotice={props.onNotice}
        />
      )}
      {reserveReward && isRewardConfigured(reserveReward) && (
        <ReserveModal
          reward={reserveReward}
          today={props.today}
          coins={props.coins}
          milestones={props.levelSystem?.milestones ?? []}
          busy={busy}
          onClose={() => setReserveReward(null)}
          onReserve={(plannedFor, source) => void run(async () => {
            await props.onReserve(reserveReward.id, plannedFor, source)
            setReserveReward(null)
            setView('claims')
          })}
        />
      )}
      {reviewClaim && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal compact-modal claim-review" role="dialog" aria-modal="true" aria-labelledby="claim-review-title">
            <div className="modal-header"><div><span className="modal-kicker">轻复盘 · 第 {satisfaction ? 2 : 1} 步</span><h2 id="claim-review-title">{reviewClaim.titleSnapshot}</h2></div><button className="icon-button" type="button" title="关闭" onClick={() => setReviewClaim(null)}><X aria-hidden="true" /></button></div>
            {!satisfaction ? (
              <><p>这次奖励带来的满足感怎么样？</p><div className="satisfaction-grid">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} onClick={() => setSatisfaction(value)}>{value}<small>{value === 1 ? '很低' : value === 5 ? '很高' : ''}</small></button>)}</div></>
            ) : (
              <><p>它值得以后再次兑换吗？</p><div className="repeat-choice"><button type="button" onClick={() => void run(async () => { await props.onFulfill(reviewClaim.id, satisfaction, true); setReviewClaim(null) })}>值得再次兑换</button><button type="button" onClick={() => void run(async () => { await props.onFulfill(reviewClaim.id, satisfaction, false); setReviewClaim(null) })}>仅此一次</button></div></>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function WishRow({ reward, status, onEdit, onPrimary, onQueue, onToggle }: { reward: Reward; status: string; onEdit: () => void; onPrimary: () => void; onQueue: () => void; onToggle: () => void }) {
  const ready = isRewardConfigured(reward)
  return (
    <article className="wish-row">
      <div className="wish-thumb">{rewardImage(reward)}</div>
      <div className="wish-row-copy"><span>{status}{ready ? ` · ${horizonLabels[reward.horizon]}` : ''}</span><strong>{reward.title}</strong><small>{reward.cost} 金币{ready ? ` · ${formatMoney(reward.cashCostCents)}` : ''}</small></div>
      <div className="wish-row-actions">
        {ready && reward.enabled && status !== '待兑现' && <button className="icon-button" type="button" title="设为主目标" onClick={onPrimary}><Target aria-hidden="true" /></button>}
        {ready && reward.enabled && status === '可规划' && <button type="button" onClick={onQueue}>加入候选</button>}
        <button className="icon-button" type="button" title="编辑愿望" onClick={onEdit}><Pencil aria-hidden="true" /></button>
        <button className="icon-button" type="button" title={reward.enabled ? '停用愿望' : '恢复愿望'} onClick={onToggle}>{reward.enabled ? <X aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}</button>
      </div>
    </article>
  )
}

function WishEditor({ reward, target, suggestions, onClose, onSave, onNotice }: { reward?: Reward; target: boolean; suggestions: ReturnType<typeof getRewardPriceSuggestions>; onClose: () => void; onSave: (input: RewardInput) => Promise<void>; onNotice: (message: string) => void }) {
  const [title, setTitle] = useState(reward?.title ?? '')
  const [reason, setReason] = useState(reward?.reason ?? '')
  const [cost, setCost] = useState(String(reward?.cost ?? suggestions.near))
  const [cash, setCash] = useState(reward?.cashCostCents === undefined ? '' : String(reward.cashCostCents / 100))
  const [horizon, setHorizon] = useState<RewardHorizon>(reward?.horizon ?? 'near')
  const [repeatKind, setRepeatKind] = useState<RewardRepeatPolicy['kind']>(reward?.repeatPolicy?.kind ?? 'one_time')
  const [cooldown, setCooldown] = useState(reward?.repeatPolicy?.kind === 'repeatable' ? String(reward.repeatPolicy.cooldownDays) : '30')
  const [imageDataUrl, setImageDataUrl] = useState(reward?.imageDataUrl)
  const [isTarget, setIsTarget] = useState(target)
  const [imageBusy, setImageBusy] = useState(false)
  const coinCost = Number(cost)
  const cashCostCents = Math.round(Number(cash) * 100)
  const cooldownDays = Number(cooldown)
  const valid = title.trim().length > 0 && reason.trim().length > 0 && Number.isSafeInteger(coinCost) && coinCost > 0 && Number.isSafeInteger(cashCostCents) && cashCostCents >= 0 && (repeatKind === 'one_time' || Number.isSafeInteger(cooldownDays) && cooldownDays >= 1 && cooldownDays <= 365)

  async function selectImage(file?: File) {
    if (!file) return
    setImageBusy(true)
    try {
      setImageDataUrl(await compressRewardImage(file))
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '图片处理失败')
    } finally {
      setImageBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    void onSave({
      title: title.trim(),
      reason: reason.trim(),
      cost: coinCost,
      cashCostCents,
      horizon,
      imageDataUrl,
      repeatPolicy: repeatKind === 'one_time' ? { kind: 'one_time' } : { kind: 'repeatable', cooldownDays },
      target: isTarget,
    })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal wish-editor" onSubmit={submit} aria-labelledby="wish-editor-title">
        <div className="modal-header"><div><span className="modal-kicker">愿望不是日常许可</span><h2 id="wish-editor-title">{reward ? '整理愿望' : '建立愿望'}</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <label className="wish-image-field">
          {imageDataUrl ? <img src={imageDataUrl} alt="愿望预览" /> : <span><ImagePlus aria-hidden="true" />添加图片<small>可选 · 离线保存</small></span>}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={imageBusy} onChange={(event) => void selectImage(event.target.files?.[0])} />
        </label>
        <label className="full-field">名称<input required maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="full-field">为什么期待它<textarea required maxLength={100} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="它会怎样改善真实生活？" /></label>
        <fieldset className="choice-field"><legend>愿望距离</legend><div className="segmented-control">{(['near', 'medium', 'far'] as const).map((value) => <button className={horizon === value ? 'selected' : ''} type="button" key={value} onClick={() => { setHorizon(value); setCost(String(suggestions[value])) }}>{horizonLabels[value]} · 建议 {suggestions[value]}</button>)}</div></fieldset>
        <div className="two-column-fields"><label>金币价格<input type="number" min={1} step={1} value={cost} onChange={(event) => setCost(event.target.value)} /></label><label>预计成本（元）<input type="number" min={0} max={1200} step="0.01" value={cash} onChange={(event) => setCash(event.target.value)} /></label></div>
        <fieldset className="choice-field"><legend>重复方式</legend><div className="segmented-control"><button className={repeatKind === 'one_time' ? 'selected' : ''} type="button" onClick={() => setRepeatKind('one_time')}>一次性</button><button className={repeatKind === 'repeatable' ? 'selected' : ''} type="button" onClick={() => setRepeatKind('repeatable')}>可以重复</button></div></fieldset>
        {repeatKind === 'repeatable' && <label className="full-field">兑现后冷却天数<input type="number" min={1} max={365} step={1} value={cooldown} onChange={(event) => setCooldown(event.target.value)} /></label>}
        <label className="checkbox-field"><input type="checkbox" checked={isTarget} onChange={(event) => setIsTarget(event.target.checked)} /><Target aria-hidden="true" />设为主目标</label>
        <p className="form-detail-note">{suggestions.observedDays >= 14 ? `价格建议来自最近 28 个游戏日，日均约 ${suggestions.dailyCoins?.toFixed(1)} 金币。` : '数据不足 14 天，暂用 30 / 80 / 200 金币建议。保存后价格不会自动变化。'}</p>
        <button className="primary-action" type="submit" disabled={!valid || imageBusy}><Check aria-hidden="true" />保存愿望</button>
      </form>
    </div>
  )
}

function ReserveModal({ reward, today, coins, milestones, busy, onClose, onReserve }: { reward: Reward & Required<Pick<Reward, 'cashCostCents'>>; today: string; coins: number; milestones: LevelSystem['milestones']; busy: boolean; onClose: () => void; onReserve: (plannedFor: string, source: ReserveSource) => void }) {
  const eligibleMilestone = milestones.find((milestone) => milestone.voucherMaxCost && !milestone.claimedAt && !milestone.reservedClaimId && reward.cost <= milestone.voucherMaxCost)
  const [dateChoice, setDateChoice] = useState<'today' | 'weekend' | 'custom'>('today')
  const [customDate, setCustomDate] = useState(today)
  const [source, setSource] = useState<ReserveSource>({ kind: 'coins' })
  const plannedFor = dateChoice === 'today' ? today : dateChoice === 'weekend' ? nextWeekend(today) : customDate
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal compact-modal reserve-modal" role="dialog" aria-modal="true" aria-labelledby="reserve-title">
        <div className="modal-header"><div><span className="modal-kicker">预留预算并安排兑现</span><h2 id="reserve-title">锁定“{reward.title}”</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>
        <div className="reserve-summary"><span><Coins aria-hidden="true" />{reward.cost} 金币</span><span>{formatMoney(reward.cashCostCents)}</span><small>当前余额 {coins} 金币</small></div>
        {eligibleMilestone && <fieldset className="choice-field"><legend>支付方式</legend><div className="segmented-control"><button className={source.kind === 'coins' ? 'selected' : ''} type="button" onClick={() => setSource({ kind: 'coins' })}>使用金币</button><button className={source.kind === 'milestone' ? 'selected' : ''} type="button" onClick={() => setSource({ kind: 'milestone', level: eligibleMilestone.level })}>Lv.{eligibleMilestone.level} 礼券</button></div></fieldset>}
        <fieldset className="choice-field"><legend>计划兑现</legend><div className="segmented-control"><button className={dateChoice === 'today' ? 'selected' : ''} type="button" onClick={() => setDateChoice('today')}>今天</button><button className={dateChoice === 'weekend' ? 'selected' : ''} type="button" onClick={() => setDateChoice('weekend')}>本周末</button><button className={dateChoice === 'custom' ? 'selected' : ''} type="button" onClick={() => setDateChoice('custom')}>自定义</button></div></fieldset>
        {dateChoice === 'custom' && <label className="full-field">日期<input type="date" min={today} value={customDate} onChange={(event) => setCustomDate(event.target.value)} /></label>}
        <p className="form-detail-note"><Clock3 aria-hidden="true" />逾期只提醒，不没收奖励，也不会自动退款。</p>
        <button className="primary-action" type="button" disabled={busy || !plannedFor || (source.kind === 'coins' && coins < reward.cost)} onClick={() => onReserve(plannedFor, source)}><TicketCheck aria-hidden="true" />确认锁定</button>
      </section>
    </div>
  )
}
