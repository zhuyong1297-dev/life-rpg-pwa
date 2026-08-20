import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Activity as ActivityIcon,
  Award,
  Bell,
  BellOff,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Coins,
  Compass,
  Crosshair,
  Download,
  Dumbbell,
  FileJson,
  Gift,
  Home,
  History,
  Leaf,
  ListTodo,
  Mail,
  Pause,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Smartphone,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  Vibrate,
  Volume2,
  X,
  Zap,
} from 'lucide-react'
import { createBackup, createLedgerMarkdown, previewBackupRestore, restoreBackup, type BackupRestorePreview } from '../backup'
import {
  archiveActivity as archiveActivityDefinition,
  activateGrowthDomains,
  activateCoachPlanDraft,
  applyRewardBudgetRollover,
  calibrateSeasonWithStableLife,
  cancelRewardClaim,
  cancelTodayCompletion,
  completeApplicationSeason,
  completeApplicationTrial,
  completeSeason,
  completeActivity,
  activateApplicationTrialRestart,
  createActivity,
  createSeason,
  createReward,
  db,
  getSnapshot,
  fulfillRewardClaim,
  initializeDatabase,
  acknowledgeLevelMilestone,
  recordIncrementalProgress,
  reserveRewardClaim,
  respondToSeasonSuggestion,
  permanentlyDeleteActivity,
  saveWeeklyReview,
  saveCoachPlanDraft,
  prepareApplicationTrialRestart,
  saveSeasonDailySignal,
  setActivityEnabled,
  setActivityKey,
  setRewardEnabled,
  setRewardQueue,
  setSeasonDailyFocus,
  setTodayActionPriority,
  undoCompletion,
  undoLatestIncrementalProgress,
  updateTodayRating,
  updateHabit,
  restoreActivity,
  syncLevelMilestones,
  updatePreferences,
  updateReward,
  type CompletionDetails,
  type HabitUpdate,
  type NewActivity,
} from '../db'
import {
  addDays,
  applicationDecisions,
  coachBehaviorRoleLabels,
  CoachPlanDraftSchema,
  createCoachPlanDraft,
  domainLabel,
  calculateStats,
  calculateIncrementalProgress,
  difficulties,
  growthDomainDetails,
  growthDomains,
  legacyDomainSuggestions,
  getCharacterStage,
  getCharacterStageName,
  getCompletionTierGoal,
  getLevel,
  getLevelReport,
  getJourneyMonths,
  getMilestoneVoucherCost,
  getNextVoucherLevel,
  getTotalXpForLevel,
  getTierAchievement,
  getTierCount,
  getTierLevels,
  getTierReward,
  getIncrementalCycleGoal,
  identityMessage,
  formatDurationSeconds,
  isDurationGoal,
  isRatingGoal,
  isTieredGoal,
  effectiveGameDate,
  localDate,
  nextGameDayBoundary,
  rewardTable,
  reviewDecisions,
  startOfWeek,
  formatTierGoalValue,
  getRewardPriceSuggestions,
  tierLabels,
  tierLevels,
  TieredGoalSchema,
  RatingGoalSchema,
  type Activity,
  type ApplicationDecision,
  type ApplicationTrial,
  type ApplicationTrialRestart,
  type CoachBehaviorRole,
  type CoachPlanBehavior,
  type CoachPlanDraft,
  type GrowthDomain,
  type Completion,
  type Difficulty,
  type FeedbackIntensity,
  type CombinedMode,
  type LedgerEvent,
  type LevelSystem,
  type Preferences,
  type Reward,
  type RewardClaim,
  type ReviewDecision,
  type TierLevel,
  type TierMetric,
  type TieredGoal,
  type RatingGoal,
  type TimeInputUnit,
  type WeeklyReview,
  type JourneyEntry,
  type JourneyMonth,
} from '../domain'
import { playCompletionChime, playCompletionVibration, prepareCompletionAudio, requestNotificationPermission, sendCompletionFeedback } from '../feedback'
import { CoachSuggestionSummary, SeasonHubModal, SeasonTodaySummary } from '../SeasonExperience'
import { RewardExperience } from '../RewardExperience'
import { KnowledgeActionImportModal } from '../KnowledgeActionImportModal'
import {
  importKnowledgeActionPackage,
  previewKnowledgeActionPackage,
  type KnowledgeActionPackagePreview,
} from '../knowledge-action-package'
import {
  applicationResultFilename,
  createPlanningContextPackage,
  createSeasonResultPackage,
  createTrialResultPackage,
  planningContextFilename,
} from '../application-bridge'
import {
  V5GrowthPage,
  V5Navigation,
  V5TodayPage,
  getV5DailyRewardSummary,
  type V5Page,
} from '../prototype/V5Experience'

import { activityDomainLabel, displayVersion } from './model'
import { errorMessage, formatShortDate, scheduleLabel, SettingToggle } from './shared-ui'
export function SettingsPage({
  preferences,
  activities,
  completions,
  lastBackupAt,
  onPreferences,
  onOpenData,
  onOpenInstallHelp,
  onOpenReleaseNotes,
  onOpenFeedback,
  onOpenLibrary,
  onNotice,
  onManage,
}: {
  preferences: Preferences
  activities: Activity[]
  completions: Completion[]
  lastBackupAt?: string
  onPreferences: (value: Preferences) => Promise<void>
  onOpenData: () => void
  onOpenInstallHelp: () => void
  onOpenReleaseNotes: () => void
  onOpenFeedback: () => void
  onOpenLibrary: () => void
  onNotice: (message: string) => void
  onManage: () => void
}) {
  const activityGroups = groupManagedActivities(activities, completions)

  async function toggleNotifications() {
    if (!preferences.notifications) {
      const permission = await requestNotificationPermission()
      if (permission !== 'granted') {
        onNotice(permission === 'unsupported' ? '当前浏览器不支持系统通知' : '通知未获授权，界面反馈仍会正常显示')
        return
      }
    }
    await onPreferences({ ...preferences, notifications: !preferences.notifications })
  }

  async function toggleSound() {
    if (preferences.sound) {
      await onPreferences({ ...preferences, sound: false })
      return
    }
    const supported = await playCompletionChime('completion', preferences.feedbackIntensity)
    if (!supported) {
      await onPreferences({ ...preferences, sound: false })
      onNotice('当前设备无法启用完成声音，已保持关闭')
      return
    }
    await onPreferences({ ...preferences, sound: true })
    onNotice('完成声音已开启，刚才播放的是试听音')
  }

  async function toggleVibration() {
    if (preferences.vibration) {
      await onPreferences({ ...preferences, vibration: false })
      return
    }
    if (!playCompletionVibration('completion', preferences.feedbackIntensity)) {
      await onPreferences({ ...preferences, vibration: false })
      onNotice('当前设备或系统设置没有接受振动请求，已保持关闭')
      return
    }
    await onPreferences({ ...preferences, vibration: true })
    onNotice('振动反馈已开启，刚才触发的是测试振动')
  }

  async function setFeedbackIntensity(feedbackIntensity: FeedbackIntensity) {
    const next = { ...preferences, feedbackIntensity }
    await onPreferences(next)
    if (next.vibration) playCompletionVibration('completion', feedbackIntensity)
    if (next.sound) await playCompletionChime('completion', feedbackIntensity)
  }

  async function testImmediateFeedback() {
    if (!preferences.sound && !preferences.vibration) {
      onNotice('请先开启声音或振动')
      return
    }
    let sound = preferences.sound
    let vibration = preferences.vibration
    if (sound && !(await playCompletionChime('completion', preferences.feedbackIntensity))) sound = false
    if (vibration && !playCompletionVibration('completion', preferences.feedbackIntensity)) vibration = false
    if (sound !== preferences.sound || vibration !== preferences.vibration) {
      await onPreferences({ ...preferences, sound, vibration })
      onNotice('部分反馈在当前设备不可用，已自动关闭对应开关')
      return
    }
    onNotice('已播放当前强度的完成反馈')
  }

  return (
    <div className="settings-page">
      <header className="page-header"><div><p className="eyebrow">系统与存档</p><h1>设置</h1><p className="page-lead">管理反馈方式、行动和本机数据。</p></div><SettingsIcon aria-hidden="true" className="header-icon" /></header>
      <section className="content-section settings-section">
        <div className="section-heading"><div><span>体验偏好</span><h2>即时反馈</h2></div></div>
        <SettingToggle
          icon={preferences.notifications ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}
          label="系统通知"
          checked={preferences.notifications}
          onChange={() => void toggleNotifications()}
        />
        <SettingToggle
          icon={<Vibrate aria-hidden="true" />}
          label="完成振动"
          checked={preferences.vibration}
          onChange={() => void toggleVibration()}
        />
        <SettingToggle
          icon={<Volume2 aria-hidden="true" />}
          label="完成声音"
          checked={preferences.sound}
          onChange={() => void toggleSound()}
        />
        <div className="feedback-intensity-control">
          <div><strong>反馈强度</strong><span>声音和振动使用同一档位</span></div>
          <div className="segmented-control" aria-label="反馈强度">
            {([
              ['gentle', '柔和'],
              ['clear', '清晰'],
              ['strong', '强烈'],
            ] as const).map(([value, label]) => (
              <button type="button" key={value} className={preferences.feedbackIntensity === value ? 'selected' : ''} aria-pressed={preferences.feedbackIntensity === value} onClick={() => void setFeedbackIntensity(value)}>{label}</button>
            ))}
          </div>
        </div>
        <button className="secondary-action feedback-test" type="button" onClick={() => void testImmediateFeedback()}><Zap aria-hidden="true" />测试反馈</button>
      </section>

      <section className="content-section settings-section">
        <div className="section-heading"><div><span>行动编排</span><h2>活动管理</h2></div></div>
        <button className="activity-management-summary" type="button" onClick={onManage} aria-label="管理全部活动">
          <span className="feature-summary-icon"><ListTodo aria-hidden="true" /></span>
          <span className="activity-management-copy">
            <strong>{activities.length === 0 ? '还没有活动' : `共 ${activities.length} 项活动`}</strong>
            <small>进行中 {activityGroups.running.length} · 已暂停 {activityGroups.paused.length} · 已归档 {activityGroups.archived.length} · 已完成 {activityGroups.completed.length}</small>
          </span>
          <span className="activity-management-action">管理全部<ChevronRight aria-hidden="true" /></span>
        </button>
        <button className="data-center-summary" type="button" onClick={onOpenLibrary}>
          <span className="feature-summary-icon"><Compass aria-hidden="true" /></span>
          <span><strong>习惯与计划库</strong><small>从通用起点中选习惯，或预填一套 28 天计划</small></span>
          <span>浏览推荐<ChevronRight aria-hidden="true" /></span>
        </button>
      </section>

      <section className="content-section settings-section">
        <div className="section-heading"><div><span>共同改进</span><h2>帮助与反馈</h2></div></div>
        <button className="data-center-summary" type="button" onClick={onOpenReleaseNotes}>
          <span className="feature-summary-icon"><History aria-hidden="true" /></span>
          <span><strong>本次更新 · V5.8.0</strong><small>十二项推荐习惯与四套 28 天计划</small></span>
          <span>查看内容<ChevronRight aria-hidden="true" /></span>
        </button>
        <button className="data-center-summary" type="button" onClick={onOpenInstallHelp}>
          <span className="feature-summary-icon"><Smartphone aria-hidden="true" /></span>
          <span><strong>安装与数据保存</strong><small>查看安装步骤、浏览器数据隔离和完整备份说明</small></span>
          <span>查看说明<ChevronRight aria-hidden="true" /></span>
        </button>
        <button className="data-center-summary" type="button" onClick={onOpenFeedback}>
          <span className="feature-summary-icon"><Mail aria-hidden="true" /></span>
          <span><strong>告诉我哪里阻碍了行动</strong><small>由你确认后使用本机邮件应用发送，应用不会后台上传数据</small></span>
          <span>填写反馈<ChevronRight aria-hidden="true" /></span>
        </button>
      </section>

      <section className="content-section settings-section">
        <div className="section-heading"><div><span>存档与恢复</span><h2>本地数据</h2></div></div>
        <button className="data-center-summary" type="button" onClick={onOpenData}>
          <span className="feature-summary-icon"><FileJson aria-hidden="true" /></span>
          <span><strong>数据中心</strong><small>{lastBackupAt ? `上次完整备份：${new Date(lastBackupAt).toLocaleString('zh-CN')}` : '尚未导出完整 JSON 备份'} · 数据仅保存在本机</small></span>
          <span>管理备份与交换<ChevronRight aria-hidden="true" /></span>
        </button>
      </section>
      <footer className="version-footer"><ShieldCheck aria-hidden="true" />数据仅保存在本机 · {displayVersion}</footer>
    </div>
  )
}
export type ActivityManagerTab = 'running' | 'paused' | 'archived' | 'completed'

export function groupManagedActivities(activities: Activity[], completions: Completion[]) {
  const completedTaskById = new Map(
    completions
      .filter((completion) => completion.status === 'active')
      .map((completion) => [completion.activityId, completion]),
  )
  const available = activities.filter((activity) => !activity.archivedAt && !(activity.type === 'task' && completedTaskById.has(activity.id)))
  return {
    running: available.filter((activity) => activity.enabled),
    paused: available.filter((activity) => !activity.enabled),
    archived: activities.filter((activity) => Boolean(activity.archivedAt)),
    completed: activities
      .filter((activity) => !activity.archivedAt && activity.type === 'task' && completedTaskById.has(activity.id))
      .sort((left, right) => completedTaskById.get(right.id)!.occurredOn.localeCompare(completedTaskById.get(left.id)!.occurredOn)),
    completedTaskById,
  }
}

export function ActivityManagerModal({
  activities,
  completions,
  today,
  onClose,
  onEdit,
  onArchive,
  onDelete,
  onRestore,
  onRefresh,
  onNotice,
}: {
  activities: Activity[]
  completions: Completion[]
  today: string
  onClose: () => void
  onEdit: (activity: Activity) => void
  onArchive: (activity: Activity) => void
  onDelete: (activity: Activity) => void
  onRestore: (activityId: string) => Promise<void>
  onRefresh: () => Promise<void>
  onNotice: (message: string) => void
}) {
  const [tab, setTab] = useState<ActivityManagerTab>('running')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string>()
  const groups = groupManagedActivities(activities, completions)
  const tabs: Array<{ id: ActivityManagerTab; label: string }> = [
    { id: 'running', label: '进行中' },
    { id: 'paused', label: '已暂停' },
    { id: 'archived', label: '已归档' },
    { id: 'completed', label: '已完成' },
  ]
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visible = groups[tab].filter((activity) => (
    !normalizedQuery || `${activity.title} ${activityDomainLabel(activity)} ${activity.difficulty}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
  ))

  async function updateActivity(action: () => Promise<unknown>) {
    try {
      await action()
      await onRefresh()
    } catch (error) {
      onNotice(errorMessage(error))
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal activity-manager-modal" role="dialog" aria-modal="true" aria-labelledby="activity-manager-title">
        <div className="modal-header">
          <div><span className="modal-kicker">行动编排</span><h2 id="activity-manager-title">活动管理</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button>
        </div>
        <div className="segmented-control activity-manager-tabs" aria-label="活动状态">
          {tabs.map((item) => (
            <button
              type="button"
              key={item.id}
              className={tab === item.id ? 'selected' : ''}
              onClick={() => { setTab(item.id); setExpandedId(undefined) }}
            >{item.label}<small>{groups[item.id].length}</small></button>
          ))}
        </div>
        {activities.length > 8 && (
          <label className="activity-manager-search"><Search aria-hidden="true" /><span className="sr-only">搜索活动</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、成长领域或难度" /></label>
        )}
        <div className="activity-manager-list">
          {visible.length === 0 && <p className="empty-state">{normalizedQuery ? '没有匹配的活动' : '这里还没有活动'}</p>}
          {visible.map((activity) => {
            const expanded = expandedId === activity.id
            const completion = groups.completedTaskById.get(activity.id)
            const completedToday = completions.some((item) => item.activityId === activity.id && item.status === 'active' && item.occurredOn === today)
            return (
              <div className={expanded ? 'activity-manager-row expanded' : 'activity-manager-row'} key={activity.id}>
                <button className="activity-manager-row-summary" type="button" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? undefined : activity.id)}>
                  <span><strong>{activity.title}</strong><small>{activity.type === 'habit' ? '习惯' : '一次性任务'} · {activityDomainLabel(activity)} · {activity.difficulty}</small></span>
                  <ChevronRight aria-hidden="true" />
                </button>
                {expanded && (
                  <div className="activity-manager-row-details">
                    <p>{completion ? `${formatShortDate(completion.occurredOn)} 完成` : scheduleLabel(activity)}</p>
                    <div className="activity-manager-actions">
                      {(tab === 'running' || tab === 'paused') && (
                        <>
                          {activity.type === 'habit' && <button type="button" onClick={() => onEdit(activity)}><Pencil aria-hidden="true" />编辑</button>}
                          <button type="button" aria-pressed={activity.isKey} onClick={() => void updateActivity(() => setActivityKey(activity.id, !activity.isKey))}><Star aria-hidden="true" />{activity.isKey ? '取消关键' : '设为关键'}</button>
                          <button type="button" onClick={() => void updateActivity(() => setActivityEnabled(activity.id, !activity.enabled))}>{activity.enabled ? <Pause aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}{activity.enabled ? '暂停' : '启用'}</button>
                          <button className="danger-action" type="button" onClick={() => onArchive(activity)}><Trash2 aria-hidden="true" />归档</button>
                        </>
                      )}
                      {tab === 'archived' && (
                        <>
                          <button type="button" onClick={() => void onRestore(activity.id)}><RotateCcw aria-hidden="true" />恢复</button>
                          <button className="danger-action" type="button" disabled={completedToday} onClick={() => onDelete(activity)}><Trash2 aria-hidden="true" />永久删除</button>
                        </>
                      )}
                      {tab === 'completed' && (
                        <button className="danger-action" type="button" disabled={completion?.occurredOn === today} onClick={() => onDelete(activity)}><Trash2 aria-hidden="true" />永久删除</button>
                      )}
                    </div>
                    {((tab === 'archived' && completedToday) || (tab === 'completed' && completion?.occurredOn === today)) && <small className="delete-wait-note">本日结算后可永久删除</small>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
