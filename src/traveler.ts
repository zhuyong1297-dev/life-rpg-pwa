import type { TravelerAppearance } from './domain'

export function travelerAssetUrl(stage: number, appearance: TravelerAppearance = 'masculine') {
  const suffix = appearance === 'feminine' ? '-feminine' : ''
  return `${import.meta.env.BASE_URL}assets/v5/traveler${suffix}-stage-${stage}.png`
}
