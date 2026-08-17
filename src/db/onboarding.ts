import { MetaSchema, OnboardingStateSchema, isNewcomerDataFootprintEmpty, type OnboardingState } from '../domain'
import { db, type LifeRpgDatabase } from './database'

type OnboardingMarkers = Partial<Pick<
  OnboardingState,
  'installHintDismissedAt' | 'feedbackPromptedAt' | 'feedbackCompletedAt'
>>

export async function ensureGrowthDomainsForEmptyDatabase(database = db, now = new Date()) {
  return database.transaction(
    'rw',
    [
      database.activities,
      database.completions,
      database.ledgerEvents,
      database.rewards,
      database.rewardClaims,
      database.weeklyReviews,
      database.seasons,
      database.settings,
    ],
    async () => {
      const storedMeta = await database.settings.get('meta')
      const meta = storedMeta?.key === 'meta' ? storedMeta.value : {}
      const [activityCount, completionCount, ledgerEventCount, rewardCount, rewardClaimCount, weeklyReviewCount, seasonCount, settings] = await Promise.all([
        database.activities.count(),
        database.completions.count(),
        database.ledgerEvents.count(),
        database.rewards.count(),
        database.rewardClaims.count(),
        database.weeklyReviews.count(),
        database.seasons.count(),
        database.settings.toArray(),
      ])
      if (meta.growthDomainSystem || !isNewcomerDataFootprintEmpty({
        activityCount, completionCount, ledgerEventCount, rewardCount, rewardClaimCount, weeklyReviewCount, seasonCount, settings,
      })) return false
      await database.settings.put({
        key: 'meta',
        value: MetaSchema.parse({
          ...meta,
          growthDomainSystem: { version: 1, activatedAt: now.toISOString() },
        }),
      })
      return true
    },
  )
}

export async function updateOnboardingMarkers(
  markers: OnboardingMarkers,
  database = db,
) {
  return database.transaction('rw', database.settings, async () => {
    const definedMarkers = Object.fromEntries(Object.entries(markers).filter(([, value]) => value !== undefined))
    if (!Object.keys(definedMarkers).length) throw new Error('至少需要更新一个新手体验标记')
    const storedMeta = await database.settings.get('meta')
    const meta = storedMeta?.key === 'meta' ? storedMeta.value : {}
    const onboarding = OnboardingStateSchema.parse({ ...meta.onboarding, ...definedMarkers })
    await database.settings.put({ key: 'meta', value: MetaSchema.parse({ ...meta, onboarding }) })
    return onboarding
  })
}
