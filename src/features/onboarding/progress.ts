const DAY_MS = 86_400_000

function dateNumber(value: string) {
  return Date.parse(`${value}T00:00:00.000Z`)
}

export interface NewcomerProgressData {
  day: number
  completedDays: number
  feedbackAvailable: boolean
}

export function deriveNewcomerProgress(
  startedOn: string,
  today: string,
  completionDates: readonly string[],
): NewcomerProgressData {
  const elapsed = Math.floor((dateNumber(today) - dateNumber(startedOn)) / DAY_MS)
  const day = Math.min(7, Math.max(1, elapsed + 1))
  const end = dateNumber(startedOn) + 6 * DAY_MS
  const completedDays = new Set(completionDates.filter((date) => {
    const value = dateNumber(date)
    return value >= dateNumber(startedOn) && value <= end
  })).size

  return {
    day,
    completedDays,
    feedbackAvailable: elapsed >= 6,
  }
}
