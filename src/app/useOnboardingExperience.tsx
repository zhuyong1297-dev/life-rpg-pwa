import { useEffect, useState } from 'react'

import {
  createActivity,
  createFirstOnboardingConfiguredActivity,
  updateOnboardingMarkers,
  type NewActivity,
} from '../db'
import type { OnboardingState, OnboardingSummary } from '../domain'
import {
  DataStorageGuide,
  NewcomerProgress,
  QuickStart,
  WeChatLaunchGuide,
  usePwaInstall,
} from '../features/onboarding'
import type { FeedbackSafeSummary } from '../prototype/v5/FeedbackPage'

interface UseOnboardingExperienceInput {
  ready: boolean
  activityCount: number
  newcomerEligible: boolean
  completionFeedbackActive: boolean
  onboarding?: OnboardingState
  summary?: OnboardingSummary
  refresh: () => Promise<void>
  onError: (message: string) => void
  onNotice: (message: string) => void
  onOpenFullCreate: (initial?: NewActivity) => void
  onOpenLibrary: () => void
  onOpenFeedback: () => void
  appVersion: string
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : '新手体验暂时无法更新'
}

export function useOnboardingExperience({
  ready,
  activityCount,
  newcomerEligible,
  completionFeedbackActive,
  onboarding,
  summary,
  refresh,
  onError,
  onNotice,
  onOpenFullCreate,
  onOpenLibrary,
  onOpenFeedback,
  appVersion,
}: UseOnboardingExperienceInput) {
  const install = usePwaInstall()
  const [showDataGuide, setShowDataGuide] = useState(false)
  const [progressHidden, setProgressHidden] = useState(false)
  const [wechatGuideDismissed, setWechatGuideDismissed] = useState(false)
  const canStartOnboarding = newcomerEligible && !onboarding?.startedOn
  const shouldShowWechatGuide = install.environment.wechat
    && activityCount === 0
    && canStartOnboarding
    && !onboarding?.installHintDismissedAt
    && !wechatGuideDismissed
  const shouldAutoOpenDataGuide = Boolean(
    ready
    && summary?.primaryCompletionDays
    && !completionFeedbackActive
    && !onboarding?.installHintDismissedAt
    && !install.environment.standalone
    && !install.environment.wechat,
  )

  useEffect(() => {
    if (!shouldAutoOpenDataGuide) return
    setShowDataGuide(true)
  }, [shouldAutoOpenDataGuide])

  const saveMarker = async (markers: Parameters<typeof updateOnboardingMarkers>[0]) => {
    await updateOnboardingMarkers(markers)
    await refresh()
  }

  const dismissDataGuide = () => {
    setShowDataGuide(false)
    void saveMarker({ installHintDismissedAt: new Date().toISOString() }).catch((error) => onError(messageFrom(error)))
  }

  const quickStart = activityCount === 0 && canStartOnboarding ? (
    <QuickStart
      onSubmit={async (activity) => {
        if (!activity.domain) throw new Error('请选择成长领域')
        await createFirstOnboardingConfiguredActivity(activity)
        await refresh()
        onNotice('第一条行动已创建，现在完成一次最低标准')
      }}
      onOpenFullSettings={onOpenFullCreate}
      onOpenLibrary={onOpenLibrary}
      onLearnDataStorage={() => setShowDataGuide(true)}
    />
  ) : undefined

  const showProgress = summary
    && !progressHidden
    && (summary.currentDay <= 7 || (!onboarding?.feedbackPromptedAt && !onboarding?.feedbackCompletedAt))
    && !(summary.currentDay >= 7 && onboarding?.feedbackPromptedAt)
  const newcomerProgress = showProgress ? (
    <NewcomerProgress
      progress={{
        day: Math.min(7, summary.currentDay),
        completedDays: summary.primaryCompletionDays,
        feedbackAvailable: summary.currentDay >= 7,
      }}
      onFeedback={() => {
        void saveMarker({ feedbackPromptedAt: new Date().toISOString() })
          .then(onOpenFeedback)
          .catch((error) => onError(messageFrom(error)))
      }}
      onOpenPlans={onOpenLibrary}
      onDismiss={() => {
        setProgressHidden(true)
        if (summary.currentDay >= 7) {
          void saveMarker({ feedbackPromptedAt: new Date().toISOString() }).catch((error) => onError(messageFrom(error)))
        }
      }}
    />
  ) : undefined

  const feedbackSummary: FeedbackSafeSummary = {
    appVersion,
    surface: install.environment.wechat ? 'wechat' : install.environment.standalone ? 'standalone' : 'browser',
    activeDays: summary?.activeDays ?? 0,
    primaryCompletionDays: summary?.primaryCompletionDays ?? 0,
  }

  return {
    quickStart,
    newcomerProgress,
    feedbackSummary,
    blockingOverlayOpen: shouldShowWechatGuide || showDataGuide || shouldAutoOpenDataGuide,
    openDataGuide: () => setShowDataGuide(true),
    markFeedbackCompleted: () => saveMarker({ feedbackCompletedAt: new Date().toISOString() }),
    createConfiguredActivity: (activity: NewActivity) => activityCount === 0
      && canStartOnboarding
      && activity.type === 'habit'
      && activity.schedule.kind === 'daily'
      && activity.enabled
      && activity.isKey
      ? createFirstOnboardingConfiguredActivity(activity)
      : createActivity(activity),
    overlays: (
      <>
        {shouldShowWechatGuide && (
          <WeChatLaunchGuide
            onContinue={() => {
              setWechatGuideDismissed(true)
              void saveMarker({ installHintDismissedAt: new Date().toISOString() }).catch((error) => onError(messageFrom(error)))
            }}
          />
        )}
        {showDataGuide && (
          <DataStorageGuide
            environment={install.environment}
            onInstall={install.promptInstall}
            onClose={dismissDataGuide}
          />
        )}
      </>
    ),
  }
}
