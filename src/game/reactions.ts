/**
 * What the game shouts when you click the wrong area.
 *
 * Three tries, three escalating exclamations, so the ladder itself tells you how
 * much trouble you are in without reading the pips.
 */
export const SHOUTS = ['Aiyo!', 'Alamak lah!', 'Cannot make it sial!'] as const

export function shoutFor(missCount: number): string {
  return SHOUTS[Math.min(Math.max(missCount, 1), SHOUTS.length) - 1]
}
