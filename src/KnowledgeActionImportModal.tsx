import { useEffect } from 'react'
import { BookOpen, Check, ChevronRight, ShieldCheck, X } from 'lucide-react'
import {
  coachBehaviorRoleLabels,
  domainLabel,
  formatTierGoalValue,
  getTierLevels,
} from './domain'
import type { KnowledgeActionPackagePreview } from './knowledge-action-package'
import { packagePrimaryKnowledge } from './knowledge-action-package'

function behaviorScheduleLabel(preview: KnowledgeActionPackagePreview, index: number) {
  const behavior = preview.actionPackage.behaviors[index]
  const frequency = behavior.schedule.kind === 'daily' ? '每天' : `每周 ${behavior.schedule.times} 次`
  return behavior.scheduledTime ? `${frequency} · ${behavior.scheduledTime}` : frequency
}

function behaviorGoalLabel(preview: KnowledgeActionPackagePreview, index: number) {
  const goal = preview.actionPackage.behaviors[index].goal
  return getTierLevels(goal)
    .map((tier) => `${tier === 1 ? '基础' : tier === 2 ? '标准' : '突破'} ${formatTierGoalValue(goal, tier)}`)
    .join(' · ')
}

export function KnowledgeActionImportModal({
  preview,
  submitting,
  onClose,
  onConfirm,
}: {
  preview: KnowledgeActionPackagePreview
  submitting: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const blocked = preview.blockingIssues.length > 0
  const primaryKnowledge = packagePrimaryKnowledge(preview.actionPackage)
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, submitting])

  return (
    <div className="modal-backdrop knowledge-package-backdrop" role="presentation">
      <section className="modal knowledge-package-modal" role="dialog" aria-modal="true" aria-labelledby="knowledge-package-title">
        <header className="modal-header">
          <div>
            <span className="modal-kicker">Obsidian 知识行动包</span>
            <h2 id="knowledge-package-title">导入预览</h2>
            <p>这里只生成规划草稿；确认完成后才会启动 7 天试跑或 28 天赛季。</p>
          </div>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button>
        </header>

        <div className="knowledge-package-scroll">
          <section className="knowledge-source-preview">
            <BookOpen aria-hidden="true" />
            <div>
              <small>知识来源</small>
              <h3>{primaryKnowledge.title}</h3>
              <code>{primaryKnowledge.reference}</code>
              <p>{primaryKnowledge.principle}</p>
              {preview.actionPackage.schemaVersion === 2 && (
                <>
                  <small>{preview.actionPackage.phase === 'trial' ? '7 天试跑' : '28 天正式赛季'} · {preview.actionPackage.applicationId}</small>
                  {preview.actionPackage.knowledge.supporting.map((item) => (
                    <p key={item.reference}><b>辅助：{item.title}</b> — {item.contribution}</p>
                  ))}
                </>
              )}
            </div>
          </section>

          <section className="knowledge-package-section">
            <h3>应用目标</h3>
            <dl className="knowledge-application-grid">
              <div><dt>成长主题</dt><dd>{preview.actionPackage.application.goal}</dd></div>
              <div><dt>成功标准</dt><dd>{preview.actionPackage.application.successCriterion}</dd></div>
              <div><dt>当前基线</dt><dd>{preview.actionPackage.application.baseline}</dd></div>
              <div><dt>期望结果</dt><dd>{preview.actionPackage.application.targetOutcome}</dd></div>
              {preview.actionPackage.schemaVersion === 2 && <div><dt>现实指标</dt><dd>{preview.actionPackage.application.outcomeIndicator}</dd></div>}
            </dl>
          </section>

          <section className="knowledge-package-section">
            <div className="knowledge-package-section-heading">
              <h3>候选行为</h3>
              <span>{preview.actionPackage.behaviors.length} 项</span>
            </div>
            <div className="knowledge-behavior-list">
              {preview.actionPackage.behaviors.map((behavior, index) => (
                <article key={`${behavior.title}-${index}`}>
                  <header>
                    <span>{coachBehaviorRoleLabels[behavior.role]}</span>
                    <h4>{behavior.title}</h4>
                  </header>
                  <p>{domainLabel(behavior.domain)} · {behavior.difficulty} · {behaviorScheduleLabel(preview, index)}</p>
                  <dl>
                    <div><dt>触发</dt><dd>{behavior.cue}</dd></div>
                    <div><dt>执行</dt><dd>{behavior.protocol}</dd></div>
                    <div><dt>分层</dt><dd>{behaviorGoalLabel(preview, index)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          {preview.duplicateActivities.length > 0 && (
            <section className="knowledge-package-issues warning">
              <h3>发现同名活动</h3>
              {preview.duplicateActivities.map((match) => (
                <p key={`${match.behaviorIndex}-${match.activityId}`}>
                  “{match.behaviorTitle}”与{match.state}活动“{match.activityTitle}”同名
                </p>
              ))}
              <small>进入规划器后可改为复用现有活动，或修改候选行为，避免重复创建。</small>
            </section>
          )}

          {preview.warnings.length > 0 && (
            <section className="knowledge-package-issues warning">
              <h3>确认前注意</h3>
              {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </section>
          )}

          {blocked && (
            <section className="knowledge-package-issues error" role="alert">
              <h3>暂时不能导入</h3>
              {preview.blockingIssues.map((issue) => <p key={issue}>{issue}</p>)}
            </section>
          )}

          <div className="knowledge-change-grid">
            <section>
              <h3>{preview.replacesCurrentDraft ? '将替换' : '将新增'}</h3>
              <p><Check aria-hidden="true" />{preview.replacesCurrentDraft ? '当前本地目标规划草稿' : '1 份本地目标规划草稿'}</p>
              <p><Check aria-hidden="true" />{preview.resultingKeyCount} 项待逐项确认的候选行为</p>
              <p><Check aria-hidden="true" />知识标题与稳定引用</p>
            </section>
            <section>
              <h3>不会修改</h3>
              {preview.unchanged.map((item) => <p key={item}><ShieldCheck aria-hidden="true" />{item}</p>)}
            </section>
          </div>
        </div>

        <footer className="knowledge-package-footer">
          <span>{blocked ? '请先解决以上问题' : '下一步仍需完成四步规划和现实检查；不会按打卡自动升级阶段'}</span>
          <button className="primary-action" type="button" disabled={blocked || submitting} onClick={onConfirm}>
            {submitting ? '正在生成草稿…' : '进入规划确认'}<ChevronRight aria-hidden="true" />
          </button>
        </footer>
      </section>
    </div>
  )
}
