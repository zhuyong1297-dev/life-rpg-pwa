export function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function gameDate(date = new Date()) {
  const shifted = new Date(date)
  shifted.setHours(shifted.getHours() - 4)
  return localDate(shifted)
}

export function effectiveGameDate(date = new Date(), activatedAt?: string) {
  if (!activatedAt || date.getTime() < new Date(activatedAt).getTime()) return localDate(date)
  return gameDate(date)
}

export function getGameDayActivation(date = new Date()) {
  if (date.getHours() >= 4) return date.toISOString()
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 4).toISOString()
}

export function nextGameDayBoundary(date = new Date()) {
  const boundary = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 4)
  if (date.getTime() >= boundary.getTime()) boundary.setDate(boundary.getDate() + 1)
  return boundary
}

export function startOfWeek(date = new Date()) {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = value.getDay() || 7
  value.setDate(value.getDate() - day + 1)
  return localDate(value)
}

export function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + amount)
  return localDate(value)
}
