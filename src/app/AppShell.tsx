import { Activity as ActivityIcon, Award, Bell, BellOff, BookOpen, Brain, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Coins, Crosshair, Download, Dumbbell, FileJson, Gift, Home, History, Leaf, ListTodo, Pause, Pencil, Plus, RotateCcw, Search, Settings as SettingsIcon, ShieldCheck, Star, Target, Trash2, TrendingUp, Upload, UserRound, Vibrate, Volume2, X, Zap, } from 'lucide-react'
import { createBackup, createLedgerMarkdown, previewBackupRestore, restoreBackup, type BackupRestorePreview } from '../backup'
import { archiveActivity as archiveActivityDefinition, activateGrowthDomains, activateCoachPlanDraft, applyRewardBudgetRollover, calibrateSeasonWithStableLife, cancelRewardClaim, cancelTodayCompletion, completeApplicationSeason, completeApplicationTrial, completeSeason, completeActivity, activateApplicationTrialRestart, createSeason, createReward, db, getSnapshot, fulfillRewardClaim, initializeDatabase, acknowledgeLevelMilestone, recordIncrementalProgress, reserveRewardClaim, respondToSeasonSuggestion, permanentlyDeleteActivity, saveWeeklyReview, saveCoachPlanDraft, prepareApplicationTrialRestart, saveSeasonDailySignal, setActivityEnabled, setActivityKey, setRewardEnabled, setRewardQueue, setSeasonDailyFocus, setTodayActionPriority, undoCompletion, undoLatestIncrementalProgress, updateTodayRating, updateHabit, restoreActivity, syncLevelMilestones, updatePreferences, updateReward, updateRewardBudget, type CompletionDetails, type HabitUpdate, type NewActivity, } from '../db'
import { addDays, applicationDecisions, coachBehaviorRoleLabels, CoachPlanDraftSchema, createCoachPlanDraft, domainLabel, calculateStats, calculateIncrementalProgress, difficulties, growthDomainDetails, growthDomains, legacyDomainSuggestions, getCharacterStage, getCharacterStageName, getCompletionTierGoal, getLevel, getLevelReport, getJourneyMonths, getMilestoneVoucherCost, getNextVoucherLevel, getTotalXpForLevel, getTierAchievement, getTierCount, getTierLevels, getTierReward, getIncrementalCycleGoal, identityMessage, formatDurationSeconds, isDurationGoal, isRatingGoal, isTieredGoal, effectiveGameDate, localDate, nextGameDayBoundary, rewardTable, reviewDecisions, startOfWeek, formatTierGoalValue, getRewardPriceSuggestions, tierLabels, tierLevels, TieredGoalSchema, RatingGoalSchema, type Activity, type ApplicationDecision, type ApplicationTrial, type ApplicationTrialRestart, type CoachBehaviorRole, type CoachPlanBehavior, type CoachPlanDraft, type GrowthDomain, type Completion, type Difficulty, type FeedbackIntensity, type CombinedMode, type LedgerEvent, type LevelSystem, type Preferences, type Reward, type RewardClaim, type ReviewDecision, type TierLevel, type TierMetric, type TieredGoal, type RatingGoal, type TimeInputUnit, type WeeklyReview, type JourneyEntry, type JourneyMonth, } from '../domain'
import { playCompletionChime, playCompletionVibration, prepareCompletionAudio, requestNotificationPermission, sendCompletionFeedback } from '../feedback'
import { CoachSuggestionSummary, SeasonHubModal, SeasonTodaySummary } from '../SeasonExperience'
import { RewardExperience } from '../RewardExperience'
import { KnowledgeActionImportModal } from '../KnowledgeActionImportModal'
import { importKnowledgeActionPackage, previewKnowledgeActionPackage, type KnowledgeActionPackagePreview, } from '../knowledge-action-package'
import { applicationResultFilename, createPlanningContextPackage, createSeasonResultPackage, createTrialResultPackage, planningContextFilename, } from '../application-bridge'
import { V5GrowthPage, V5Navigation, V5TodayPage, getV5DailyRewardSummary, type V5Page, } from '../prototype/V5Experience'
import { FeedbackPage } from '../prototype/v5/FeedbackPage'
import { useAppController } from './useAppController'
import { useOnboardingExperience } from './useOnboardingExperience'
import { useReleaseNotes } from './useReleaseNotes'
import { navigateBackTo, navigateTo } from './model'
import { errorMessage } from './shared-ui'
import { GrowthDomainMigration } from './GrowthDomainMigration'
import { CoachPlanScreen } from './CoachPlan'
import { Navigation, TodayPage } from './LegacyToday'
import { CharacterPage } from './LegacyCharacter'
import { DataCenterPage, ReviewPage } from './ReviewData'
import { ActivityManagerModal, SettingsPage } from './SettingsPages'
import { CreateActivityModal } from './ActivityForms'
import { ArchiveActivityModal, CompletionActionsModal, CompletionModal, DeleteActivityModal, EditHabitModal, FeedbackOverlay, IncrementalDurationPickerModal, IncrementalProgressModal, TierPickerModal, WeeklyActivityDetailModal } from './ActivityModals'
const isPreview = import.meta.env.MODE === 'preview'
const useV5Experience = !(navigator.webdriver && new URLSearchParams(window.location.search).has('legacy-test'))
const displayVersion = isPreview ? 'V5.7.0 预览版' : 'V5.7.0'

export function AppShell() {
  const {
    page,
    setPage,
    secondaryPage,
    setSecondaryPage,
    snapshot,
    ready,
    notice,
    setNotice,
    setErrorNotice,
    createOpen,
    setCreateOpen,
    noteActivity,
    setNoteActivity,
    tierActivity,
    setTierActivity,
    goalActivity,
    setGoalActivity,
    completionActivity,
    setCompletionActivity,
    durationActivity,
    setDurationActivity,
    weeklyDetailActivity,
    setWeeklyDetailActivity,
    archiveActivity,
    setArchiveActivity,
    deleteActivity,
    setDeleteActivity,
    activityManagerOpen,
    setActivityManagerOpen,
    seasonHubOpen,
    setSeasonHubOpen,
    seasonHubInitialView,
    setSeasonHubInitialView,
    feedback,
    setFeedback,
    knowledgePackagePreview,
    setKnowledgePackagePreview,
    knowledgePackageImporting,
    openKnowledgePackagePreview,
    confirmKnowledgePackageImport,
    refresh,
    preferences,
    stats,
    level,
    metaSetting,
    levelSystem,
    journeyMonths,
    rewardSystem,
    targetRewardId,
    gameDayBoundaryActivatedAt,
    growthDomainSystem,
    onboarding, onboardingSummary, newcomerEligible,
    coachDraft,
    applicationTrial,
    applicationTrialRestart,
    targetReward,
    pendingRewardClaim,
    rewardPriceSuggestions,
    activeSeason,
    characterNeedsAttention,
    today,
    todayActionPriorityIds,
    currentIncrementalGoal,
    growthDomainCandidates,
    activeCompletion,
    keyActivities,
    dailyHabits,
    weeklyHabits,
    tasks,
    reviewActivities,
    finishActivity,
    finishIncremental,
    requestCompletion,
    undoLast,
  } = useAppController()
  const onboardingExperience = useOnboardingExperience({
    ready,
    activityCount: snapshot.activities.length, newcomerEligible, completionFeedbackActive: Boolean(feedback),
    onboarding,
    summary: onboardingSummary,
    refresh,
    onError: setErrorNotice,
    onNotice: (message) => setNotice(message, 'success'),
    onOpenFullCreate: () => setCreateOpen(true),
    onOpenFeedback: () => navigateTo('profile/feedback'),
    appVersion: displayVersion,
  })
  const releaseNotes = useReleaseNotes({ ready, growthDomainsReady: Boolean(growthDomainSystem), newcomerEligible, autoOpenAllowed: !secondaryPage && !onboardingExperience.blockingOverlayOpen, lastSeenVersion: metaSetting?.key === 'meta' ? metaSetting.value.releaseNotes?.lastSeenVersion : undefined, refresh, onError: setErrorNotice, onOpenRewards: () => navigateTo('rewards') })
  if (!ready) {
    return (
      <main className="loading-screen">
        <ShieldCheck aria-hidden="true" />
        <span>正在读取本地存档…</span>
      </main>
    )
  }
  if (!growthDomainSystem) {
    return (
      <GrowthDomainMigration
        activities={growthDomainCandidates}
        onComplete={async (assignments) => {
          try {
            await activateGrowthDomains(assignments)
            await refresh()
            setNotice('六个成长领域已启用，新领域从 0 XP 开始')
          } catch (error) {
            setErrorNotice(errorMessage(error))
          }
        }}
        notice={notice?.message ?? ''}
      />
    )
  }
  const v5Page: V5Page = secondaryPage === 'rewards'
    ? 'rewards'
    : page === 'character'
      ? 'growth'
      : page === 'settings'
        ? 'profile'
        : page
  const useSecondaryLayout = secondaryPage === 'coach-plan' || secondaryPage === 'data' || secondaryPage === 'feedback'
  const shellClassName = ['app-shell', useSecondaryLayout ? 'secondary-route' : '', useV5Experience ? 'v5-preview-shell' : ''].filter(Boolean).join(' ')

  return (
    <div className={shellClassName}>
      {useV5Experience && !useSecondaryLayout ? (
        <V5Navigation
          active={v5Page}
          preview={isPreview}
          onNavigate={(nextPage) => {
            navigateTo(nextPage)
            if (nextPage === 'growth') void syncLevelMilestones().then(refresh)
          }}
          onCreate={() => setCreateOpen(true)}
        />
      ) : !secondaryPage && (
        <Navigation
          page={page}
          onChange={(nextPage) => {
            navigateTo(nextPage)
            if (nextPage === 'character') void syncLevelMilestones().then(refresh)
          }}
          onCreate={() => setCreateOpen(true)}
          characterNeedsAttention={characterNeedsAttention}
        />
      )}
      <main className="main-content">
        {isPreview && (
          <div className="preview-banner" role="status">
            <ShieldCheck aria-hidden="true" />
            <span><strong>预览版</strong> · 测试数据与正式版完全分开</span>
          </div>
        )}
        {notice && (
          <div className={`notice notice-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
            <span>{notice.message}</span>
            <button className="icon-button" type="button" title="关闭提示" onClick={() => setNotice('')}>
              <X aria-hidden="true" />
            </button>
          </div>
        )}
        {secondaryPage === 'coach-plan' ? (
          <CoachPlanScreen
            storedDraft={coachDraft}
            activities={snapshot.activities}
            activeSeason={activeSeason}
            activeTrial={applicationTrial?.status === 'active'}
            onBack={() => navigateTo(page)}
            onSave={async (draft) => {
              await saveCoachPlanDraft(draft)
              await refresh()
            }}
            onFinish={async (draft) => {
              const readyDraft = { ...draft, currentStep: 4 as const, status: 'ready' as const }
              await saveCoachPlanDraft(readyDraft)
              if (activeSeason || applicationTrial?.status === 'active') {
                await refresh()
                setNotice(
                  draft.knowledgeSource && draft.knowledgeSource.schemaVersion !== 1 && draft.knowledgeSource.phase === 'trial'
                    ? '7 天试跑方案已保存，当前阶段结束后再回来启动'
                    : '下个赛季方案已保存，当前阶段和关键行为没有改变',
                )
              } else {
                await activateCoachPlanDraft(readyDraft.id, today)
                await refresh()
                setNotice(
                  draft.knowledgeSource && draft.knowledgeSource.schemaVersion !== 1 && draft.knowledgeSource.phase === 'trial'
                    ? '7 天知识应用试跑已启动，原关键行为会在试跑结束后恢复'
                    : '28 天成长赛季已启动，规划行为已设为关键行动',
                )
              }
              navigateTo('today')
            }}
          />
        ) : secondaryPage === 'data' ? (
          <DataCenterPage
            snapshot={snapshot}
            applicationTrial={applicationTrial}
            onBack={() => navigateBackTo('profile')}
            onKnowledgePackageFile={(file) => void openKnowledgePackagePreview(file)}
            onRefresh={refresh}
            onNotice={setNotice}
          />
        ) : secondaryPage === 'feedback' ? (
          <FeedbackPage
            summary={onboardingExperience.feedbackSummary}
            onBack={() => navigateBackTo('profile')}
            onFeedbackAction={onboardingExperience.markFeedbackCompleted}
          />
        ) : secondaryPage === 'rewards' ? (
          <RewardExperience
            rewards={snapshot.rewards}
            claims={snapshot.rewardClaims}
            system={rewardSystem}
            levelSystem={levelSystem}
            ledgerEvents={snapshot.ledgerEvents}
            coins={stats.coins}
            today={today}
            onBack={() => navigateTo('growth')}
            onCreate={async (input) => {
              await createReward(input)
              await refresh()
              setNotice('愿望已加入清单')
            }}
            onUpdate={async (rewardId, input) => {
              await updateReward(rewardId, input)
              await refresh()
              setNotice('愿望已更新，历史奖励券保持不变')
            }}
            onEnabled={async (rewardId, enabled) => {
              await setRewardEnabled(rewardId, enabled)
              await refresh()
              setNotice(enabled ? '愿望已恢复' : '愿望已停用')
            }}
            onBudget={async (input) => { await updateRewardBudget(input); await refresh(); setNotice('奖励基金额度已更新，将从下个游戏月起生效') }}
            onQueue={async (activeRewardId, queueIds) => {
              await setRewardQueue(activeRewardId, queueIds)
              await refresh()
              setNotice('奖励目标与候选顺序已更新')
            }}
            onReserve={async (rewardId, plannedFor, source) => {
              await reserveRewardClaim(rewardId, {
                plannedFor,
                requestId: crypto.randomUUID(),
                milestoneLevel: source.kind === 'milestone' ? source.level : undefined,
              })
              await refresh()
              setNotice('奖励已锁定，预算和金币已原子预留')
            }}
            onFulfill={async (claimId, satisfaction, repeatAgain) => {
              const result = await fulfillRewardClaim(claimId, satisfaction, repeatAgain)
              await refresh()
              setNotice(
                result.suggestDisable ? '奖励已兑现；这次评价较低，可考虑停用该愿望' : '奖励已兑现，轻复盘已保存',
                result.suggestDisable ? 'warning' : 'success',
              )
            }}
            onCancel={async (claimId) => {
              await cancelRewardClaim(claimId)
              await refresh()
              setNotice('奖励券已取消，金币与奖励基金已退回')
            }}
            onNotice={setNotice}
          />
        ) : page === 'today' && (
          useV5Experience ? (
            <V5TodayPage
              today={today}
              stats={stats}
              level={level}
              keyActivities={keyActivities}
              dailyHabits={dailyHabits}
              weeklyHabits={weeklyHabits}
              tasks={tasks}
              completions={snapshot.completions}
              todayPriorityIds={todayActionPriorityIds}
              dailyRewardSummary={getV5DailyRewardSummary(journeyMonths, today)}
              activeRewardGoal={targetReward ? { title: targetReward.title, cost: targetReward.cost } : undefined}
              feedback={feedback}
              activeCompletion={activeCompletion}
              seasonTitle={activeSeason?.title ?? (applicationTrial?.status === 'active' ? `7 天试跑 · ${applicationTrial.title}` : undefined)}
              coachPlanLabel={coachDraft ? '继续规划' : '规划一个 28 天目标'}
              quickStart={createOpen ? undefined : onboardingExperience.quickStart}
              newcomerProgress={onboardingExperience.newcomerProgress}
              onComplete={requestCompletion}
              onCompleteTier={(activity, tier) => void finishActivity(activity, { tier })}
              onCompleted={setCompletionActivity}
              onWeeklyDetails={setWeeklyDetailActivity}
              onCreate={() => setCreateOpen(true)}
              onUndo={() => void undoLast()}
              onOpenSeason={() => {
                if (activeSeason) {
                  setSeasonHubInitialView('overview')
                  setSeasonHubOpen(true)
                } else {
                  navigateTo('settings')
                }
              }}
              onRecordDailySignal={(seasonId) => {
                setFeedback(null)
                if (activeSeason?.id !== seasonId) {
                  setNotice('当前赛季已经变化，请从赛季总览继续', 'warning')
                  setSeasonHubInitialView('overview')
                } else {
                  setSeasonHubInitialView('signal')
                }
                setSeasonHubOpen(true)
              }}
              onEditRating={(activityId) => {
                const activity = snapshot.activities.find((item) => item.id === activityId)
                if (activity) {
                  setFeedback(null)
                  setCompletionActivity(activity)
                }
              }}
              onOpenCoach={() => navigateTo('coach/plan')}
              onSetTodayPriority={async (activity, prioritized) => {
                try {
                  const result = await setTodayActionPriority(activity.id, prioritized, today)
                  await refresh()
                  const replaced = result.replacedActivityId
                    ? snapshot.activities.find((item) => item.id === result.replacedActivityId)
                    : undefined
                  setNotice(prioritized
                    ? replaced
                      ? `${activity.title}已设为今天优先，${replaced.title}已退回普通顺序`
                      : `${activity.title}已设为今天优先`
                    : `${activity.title}已取消今天优先`)
                } catch (error) {
                  setErrorNotice(errorMessage(error))
                }
              }}
            />
          ) : (
            <TodayPage
              today={today}
              totalXp={stats.totalXp}
              level={level}
              levelSystem={levelSystem}
              coins={stats.coins}
              keyActivities={keyActivities}
              dailyHabits={dailyHabits}
              weeklyHabits={weeklyHabits}
              tasks={tasks}
              season={activeSeason}
              activities={snapshot.activities}
              completions={snapshot.completions}
              activeCompletion={activeCompletion}
              onComplete={requestCompletion}
              onCompleted={setCompletionActivity}
              onWeeklyDetails={setWeeklyDetailActivity}
              onCreate={() => setCreateOpen(true)}
              onOpenSeason={() => setSeasonHubOpen(true)}
              coachDraft={coachDraft}
              onOpenCoach={() => navigateTo('coach/plan')}
              activeReward={targetReward}
              pendingRewardClaim={pendingRewardClaim}
              rewardDailyCoins={rewardPriceSuggestions.dailyCoins}
              onOpenRewards={() => navigateTo('rewards')}
            />
          )
        )}
        {!secondaryPage && page === 'character' && (
          useV5Experience ? (
            <V5GrowthPage
              stats={stats}
              level={level}
              levelSystem={levelSystem}
              journeyMonths={journeyMonths}
              today={today}
              onCreate={() => setCreateOpen(true)}
              onOpenRewards={() => navigateTo('rewards')}
            />
          ) : (
            <CharacterPage
              stats={stats}
              level={level}
              ledgerEvents={snapshot.ledgerEvents}
              completions={snapshot.completions}
              today={today}
              levelSystem={levelSystem}
              rewards={snapshot.rewards}
              targetRewardId={targetRewardId}
              onAcknowledge={async (milestoneLevel, focusDomain) => {
                try {
                  await acknowledgeLevelMilestone(milestoneLevel, focusDomain)
                  await refresh()
                  setNotice(`下一阶段重点领域已设为${domainLabel(focusDomain)}`)
                } catch (error) {
                  setErrorNotice(errorMessage(error))
                }
              }}
              onOpenRewards={() => navigateTo('rewards')}
            />
          )
        )}
        {!secondaryPage && page === 'review' && (
          <ReviewPage
            activities={reviewActivities}
            completions={snapshot.completions}
            reviews={snapshot.weeklyReviews}
            today={today}
            season={activeSeason}
            applicationTrial={applicationTrial}
            applicationTrialRestart={applicationTrialRestart}
            onOpenSeason={() => setSeasonHubOpen(true)}
            onCompleteTrial={async (trial, observedOutcome, decision, decisionReason) => {
              await completeApplicationTrial(trial.applicationId, observedOutcome, decision, decisionReason, today)
              await refresh()
              setNotice('7 天试跑已由你完成判断，原关键行为已恢复')
            }}
            onPrepareTrialRestart={async (trial, activityId, goal) => {
              const replacements = trial.focusActivities.map((activity) => ({
                sourceActivityId: activity.activityId,
                title: activity.title,
                scheduledTime: activity.scheduledTime,
                cue: activity.cue,
                protocol: activity.protocol,
                domain: activity.domain,
                difficulty: activity.difficulty,
                goal: activity.activityId === activityId ? goal : activity.goal,
                schedule: activity.activityId === activityId ? { kind: 'daily' as const } : activity.schedule,
              }))
              await prepareApplicationTrialRestart(trial.id, replacements)
              await refresh()
              setNotice('修正方案已保存；下一个游戏日 04:00 后由你明确启动')
            }}
            onActivateTrialRestart={async () => {
              await activateApplicationTrialRestart()
              await refresh()
              setNotice('新的 7 天试跑已启动；旧成长与奖励全部保留')
            }}
            onSave={async (review) => {
              try {
                const result = await saveWeeklyReview(review)
                await refresh()
                setNotice(result.suggestions.length > 0
                  ? `本周复盘已保存，生成 ${result.suggestions.length} 条透明建议`
                  : '本周复盘已保存，请导出 JSON 备份与 Markdown 账本')
              } catch (error) {
                setErrorNotice(errorMessage(error))
                throw error
              }
            }}
          />
        )}
        {!secondaryPage && page === 'settings' && (
          <SettingsPage
            preferences={preferences}
            activities={snapshot.activities}
            completions={snapshot.completions}
            lastBackupAt={metaSetting?.key === 'meta' ? metaSetting.value.lastBackupAt : undefined}
            onManage={() => setActivityManagerOpen(true)}
            onPreferences={async (value) => {
              await updatePreferences(value)
              await refresh()
            }}
            onOpenData={() => navigateTo('profile/data')}
            onOpenInstallHelp={onboardingExperience.openDataGuide}
            onOpenReleaseNotes={releaseNotes.open}
            onOpenFeedback={() => navigateTo('profile/feedback')}
            onNotice={setNotice}
          />
        )}
      </main>
      {releaseNotes.modal}
      {knowledgePackagePreview && (
        <KnowledgeActionImportModal
          preview={knowledgePackagePreview}
          submitting={knowledgePackageImporting}
          onClose={() => setKnowledgePackagePreview(null)}
          onConfirm={() => void confirmKnowledgePackageImport()}
        />
      )}
      {createOpen && (
        <CreateActivityModal
          today={today} initialIsKey={useV5Experience && newcomerEligible && !onboarding?.startedOn}
          onClose={() => setCreateOpen(false)}
          onCreate={async (activity) => {
            try {
              await onboardingExperience.createConfiguredActivity(activity)
              await refresh()
              setCreateOpen(false)
            } catch (error) {
              setErrorNotice(errorMessage(error))
            }
          }}
        />
      )}
      {noteActivity && (
        <CompletionModal
          activity={noteActivity}
          onClose={() => setNoteActivity(null)}
          onComplete={(details) => void finishActivity(noteActivity, details)}
        />
      )}
      {tierActivity && (
        <TierPickerModal
          activity={tierActivity}
          completion={activeCompletion(tierActivity)}
          onClose={() => setTierActivity(null)}
          onComplete={(tier) => {
            setTierActivity(null)
            void finishActivity(tierActivity, { tier })
          }}
        />
      )}
      {goalActivity && (
        <EditHabitModal
          activity={goalActivity}
          onClose={() => setGoalActivity(null)}
          onSave={async (input) => {
            try {
              await updateHabit(goalActivity.id, input)
              setGoalActivity(null)
              await refresh()
              setNotice('习惯已更新，历史完成和账本保持不变')
            } catch (error) {
              setErrorNotice(errorMessage(error))
            }
          }}
        />
      )}
      {completionActivity && currentIncrementalGoal(completionActivity) && (
        <IncrementalProgressModal
          activity={completionActivity}
          completions={snapshot.completions}
          today={today}
          onClose={() => setCompletionActivity(null)}
          onUndo={async () => {
            try {
              await undoLatestIncrementalProgress(completionActivity.id)
              await refresh()
              setNotice('已撤销本周最近一次记录；如涉及层次奖励，修正流水已同步追加')
            } catch (error) {
              setErrorNotice(errorMessage(error))
            }
          }}
        />
      )}
      {durationActivity && currentIncrementalGoal(durationActivity)?.metric === 'combined' && (
        <IncrementalDurationPickerModal
          activity={durationActivity}
          goal={currentIncrementalGoal(durationActivity)!}
          completions={snapshot.completions}
          today={today}
          onClose={() => setDurationActivity(null)}
          onSelect={(seconds) => {
            const activity = durationActivity
            setDurationActivity(null)
            void finishIncremental(activity, seconds)
          }}
        />
      )}
      {weeklyDetailActivity && (
        currentIncrementalGoal(weeklyDetailActivity) ? (
          <IncrementalProgressModal
            activity={weeklyDetailActivity}
            completions={snapshot.completions}
            today={today}
            onClose={() => setWeeklyDetailActivity(null)}
            onUndo={async () => {
              try {
                await undoLatestIncrementalProgress(weeklyDetailActivity.id)
                await refresh()
                setNotice('已撤销本周最近一次记录；如涉及层次奖励，修正流水已同步追加')
              } catch (error) {
                setErrorNotice(errorMessage(error))
              }
            }}
          />
        ) : (
          <WeeklyActivityDetailModal
            activity={weeklyDetailActivity}
            completions={snapshot.completions}
            today={today}
            onClose={() => setWeeklyDetailActivity(null)}
            onViewToday={() => {
              const activity = weeklyDetailActivity
              setWeeklyDetailActivity(null)
              setCompletionActivity(activity)
            }}
          />
        )
      )}
      {completionActivity && !currentIncrementalGoal(completionActivity) && activeCompletion(completionActivity) && (
        <CompletionActionsModal
          activity={completionActivity}
          completion={activeCompletion(completionActivity)!}
          onClose={() => setCompletionActivity(null)}
          onUpgrade={(tier) => {
            setCompletionActivity(null)
            void finishActivity(completionActivity, { tier })
          }}
          onUpdateRating={async (ratingValue, note) => {
            try {
              await updateTodayRating(completionActivity.id, ratingValue, note, today)
              await refresh()
              setNotice('今天的评分已更新，XP 和金币没有变化')
            } catch (error) {
              setErrorNotice(errorMessage(error))
              throw error
            }
          }}
          onCancel={async () => {
            const completion = activeCompletion(completionActivity)
            if (!completion) return
            try {
              await cancelTodayCompletion(completion.id)
              setCompletionActivity(null)
              await refresh()
              setNotice('今天的完成已取消，奖励已用修正流水抵消')
            } catch (error) {
              setErrorNotice(errorMessage(error))
            }
          }}
        />
      )}
      {archiveActivity && (
        <ArchiveActivityModal
          activity={archiveActivity}
          onClose={() => setArchiveActivity(null)}
          onConfirm={async () => {
            try {
              await archiveActivityDefinition(archiveActivity.id)
              setArchiveActivity(null)
              await refresh()
              setNotice('活动已归档，历史记录仍然保留')
            } catch (error) {
              setErrorNotice(errorMessage(error))
            }
          }}
        />
      )}
      {activityManagerOpen && (
        <ActivityManagerModal
          activities={snapshot.activities}
          completions={snapshot.completions}
          today={today}
          onClose={() => setActivityManagerOpen(false)}
          onEdit={(activity) => {
            setActivityManagerOpen(false)
            setGoalActivity(activity)
          }}
          onArchive={setArchiveActivity}
          onDelete={setDeleteActivity}
          onRestore={async (activityId) => {
            try {
              await restoreActivity(activityId)
              await refresh()
              setNotice('活动已恢复')
            } catch (error) {
              setErrorNotice(errorMessage(error))
            }
          }}
          onRefresh={refresh}
          onNotice={setNotice}
        />
      )}
      {deleteActivity && (
        <DeleteActivityModal
          activity={deleteActivity}
          onClose={() => setDeleteActivity(null)}
          onConfirm={async () => {
            try {
              await permanentlyDeleteActivity(deleteActivity.id)
              setDeleteActivity(null)
              await refresh()
              setNotice('活动定义已删除，成长历史和角色数值保持不变')
            } catch (error) {
              setErrorNotice(errorMessage(error))
            }
          }}
        />
      )}
      {seasonHubOpen && (
        <SeasonHubModal
          initialView={seasonHubInitialView}
          seasons={snapshot.seasons}
          activities={snapshot.activities}
          completions={snapshot.completions}
          reviews={snapshot.weeklyReviews}
          today={today}
          onClose={() => {
            setSeasonHubOpen(false)
            setSeasonHubInitialView('overview')
          }}
          onCreate={async (input) => {
            try {
              await createSeason(input, today)
              await refresh()
              setNotice('28 天成长赛季已开始，现实结果是唯一成功标准')
            } catch (error) {
              setErrorNotice(errorMessage(error))
              throw error
            }
          }}
          onSetDailyFocus={async (seasonId, activityIds) => {
            try {
              await setSeasonDailyFocus(seasonId, activityIds, today)
              await refresh()
              setNotice('今日重点已更新，不会修改赛季核心行为')
            } catch (error) {
              setErrorNotice(errorMessage(error))
              throw error
            }
          }}
          onCalibrate={async (seasonId) => {
            try {
              await calibrateSeasonWithStableLife(seasonId, today)
              await refresh()
              setNotice('稳定生活方案已启用，今天重新作为第 1 天')
            } catch (error) {
              setErrorNotice(errorMessage(error))
              throw error
            }
          }}
          onSaveSignal={async (seasonId, signal) => {
            try {
              await saveSeasonDailySignal(seasonId, signal, today)
              await refresh()
              setNotice('今日现实状态已保存，不影响 XP 或金币')
            } catch (error) {
              setErrorNotice(errorMessage(error))
              throw error
            }
          }}
          onRespond={async (seasonId, suggestionId, status, note) => {
            try {
              await respondToSeasonSuggestion(seasonId, suggestionId, status, note)
              await refresh()
              setNotice(status === 'ignored' ? '建议已忽略，活动没有改变' : '建议已记录，活动仍需由你手动调整')
            } catch (error) {
              setErrorNotice(errorMessage(error))
              throw error
            }
          }}
          onComplete={async (seasonId, result, evidence, applicationReview, earlyConclusionReason) => {
            try {
              if (applicationReview) {
                await completeApplicationSeason(
                  seasonId,
                  result,
                  evidence,
                  applicationReview.observedOutcome,
                  applicationReview.decision,
                  applicationReview.decisionReason,
                  { occurredOn: today, earlyConclusionReason },
                )
              } else {
                await completeSeason(seasonId, result, evidence, { occurredOn: today, earlyConclusionReason })
              }
              await refresh()
              setNotice(today < (snapshot.seasons.find((season) => season.id === seasonId)?.endsOn ?? today)
                ? '赛季已提前结项，并按实际运行天数进入个人策略库'
                : '赛季结论已进入个人策略库')
            } catch (error) {
              setErrorNotice(errorMessage(error))
              throw error
            }
          }}
        />
      )}
      {onboardingExperience.overlays}
      {feedback && (!useV5Experience || page !== 'today' || secondaryPage) && <FeedbackOverlay feedback={feedback} onUndo={() => void undoLast()} />}
    </div>
  )
}
