import { SeasonSchema, type Season } from '../season'
import { db } from './database'

export async function getSnapshot(database = db) {
  const [activities, completions, ledgerEvents, rewards, rewardClaims, weeklyReviews, seasons, settings] = await Promise.all([
    database.activities.toArray(),
    database.completions.toArray(),
    database.ledgerEvents.toArray(),
    database.rewards.toArray(),
    database.rewardClaims.toArray(),
    database.weeklyReviews.toArray(),
    database.seasons.toArray(),
    database.settings.toArray(),
  ])
  return {
    activities,
    completions,
    ledgerEvents,
    rewards,
    rewardClaims,
    weeklyReviews,
    seasons: seasons.map((season) => SeasonSchema.parse(season)),
    settings,
  }
}
