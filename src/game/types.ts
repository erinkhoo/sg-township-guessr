export type Mode = 'classic' | 'timeattack' | 'sudden' | 'learn'

export type Scope = 'all' | 'weak' | 'Central' | 'East' | 'North-East' | 'North' | 'West'

/** How a round ended. Drives colour, points and the mastery ledger. */
export type Outcome = 'first' | 'retry' | 'revealed'

export type Miss = {
  /** area the player actually clicked, or null if they clicked open water */
  id: string | null
  /** click point in view space, where the chord line starts */
  x: number
  y: number
  km: number
  bearing: number
}

export type Card = {
  id: string
  outcome: Outcome
  points: number
}

export type Config = {
  mode: Mode
  scope: Scope
}

export type GameState = {
  config: Config
  queue: string[]
  idx: number
  /** misses on the current round; index 0 is the oldest */
  misses: Miss[]
  hinted: boolean
  score: number
  streak: number
  bestStreak: number
  /** outcome per area id, only for rounds already finished */
  results: Record<string, Outcome>
  /** non-null while the reveal card is up and input is paused */
  card: Card | null
  lives: number
  penaltyMs: number
  startedAt: number
  /** frozen at the moment the run ends */
  finishedAt: number | null
  status: 'playing' | 'over'
}

export type Action =
  | { type: 'guess'; id: string | null; x: number; y: number; now: number; km: number; bearing: number }
  | { type: 'next'; now: number }
  | { type: 'hint' }
  | { type: 'giveup'; now: number }
  | { type: 'quit'; now: number }

export const MAX_TRIES = 3
export const POINTS: Record<Outcome, number> = { first: 100, retry: 55, revealed: 0 }
/** third try still pays, just badly */
export const THIRD_TRY_POINTS = 25
export const HINT_COST = 0.5
export const STREAK_BONUS = 5
export const STREAK_BONUS_CAP = 50
export const TIME_PENALTY_MS = 10_000
