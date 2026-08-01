import {
  HINT_COST,
  MAX_TRIES,
  POINTS,
  STREAK_BONUS,
  STREAK_BONUS_CAP,
  THIRD_TRY_POINTS,
  TIME_PENALTY_MS,
  type Action,
  type Config,
  type GameState,
  type Outcome,
} from './types'

/** Fisher-Yates. Takes the RNG so tests can pin the order. */
export function shuffle<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function createGame(config: Config, queue: string[], now: number): GameState {
  return {
    config,
    queue,
    idx: 0,
    misses: [],
    hinted: false,
    score: 0,
    streak: 0,
    bestStreak: 0,
    results: {},
    card: null,
    lives: config.mode === 'sudden' ? 1 : Infinity,
    penaltyMs: 0,
    startedAt: now,
    finishedAt: null,
    status: 'playing',
  }
}

export const currentId = (s: GameState): string | undefined => s.queue[s.idx]

function roundPoints(outcome: Outcome, tries: number, hinted: boolean): number {
  let base = outcome === 'revealed' ? 0 : tries === 0 ? POINTS.first : tries === 1 ? POINTS.retry : THIRD_TRY_POINTS
  if (hinted) base = Math.round(base * HINT_COST)
  return base
}

/**
 * Advancing is a separate action from guessing so the reveal card can hold the
 * screen for as long as the player wants to read it.
 */
function advance(s: GameState, now: number): GameState {
  const idx = s.idx + 1
  const over = idx >= s.queue.length
  return {
    ...s,
    idx,
    misses: [],
    hinted: false,
    card: null,
    status: over ? 'over' : s.status,
    finishedAt: over ? now : s.finishedAt,
  }
}

export function reduce(s: GameState, a: Action): GameState {
  if (s.status === 'over' && a.type !== 'quit') return s

  switch (a.type) {
    case 'guess': {
      if (s.card) return s
      const target = currentId(s)
      if (!target) return s

      if (a.id === target) {
        const tries = s.misses.length
        const outcome: Outcome = tries === 0 ? 'first' : 'retry'
        const streak = outcome === 'first' ? s.streak + 1 : 0
        const bonus =
          outcome === 'first' ? Math.min(STREAK_BONUS * s.streak, STREAK_BONUS_CAP) : 0
        const points = roundPoints(outcome, tries, s.hinted) + bonus

        return {
          ...s,
          score: s.score + points,
          streak,
          bestStreak: Math.max(s.bestStreak, streak),
          results: { ...s.results, [target]: outcome },
          card: { id: target, outcome, points },
        }
      }

      // A miss. Water clicks still count as a try, otherwise you could sweep the
      // sea to eliminate nothing and pay nothing.
      const misses = [...s.misses, { id: a.id, x: a.x, y: a.y, km: a.km, bearing: a.bearing }]
      const lives = s.lives - 1
      const penaltyMs =
        s.config.mode === 'timeattack' ? s.penaltyMs + TIME_PENALTY_MS : s.penaltyMs

      if (s.config.mode === 'sudden' && lives <= 0) {
        return {
          ...s,
          misses,
          lives,
          streak: 0,
          results: { ...s.results, [target]: 'revealed' },
          card: { id: target, outcome: 'revealed', points: 0 },
          status: 'over',
          finishedAt: a.now,
        }
      }

      if (misses.length >= MAX_TRIES) {
        return {
          ...s,
          misses,
          lives,
          penaltyMs,
          streak: 0,
          results: { ...s.results, [target]: 'revealed' },
          card: { id: target, outcome: 'revealed', points: 0 },
        }
      }

      return { ...s, misses, lives, penaltyMs, streak: 0 }
    }

    case 'hint':
      return s.card || s.hinted ? s : { ...s, hinted: true }

    case 'giveup': {
      const target = currentId(s)
      if (!target || s.card) return s
      return {
        ...s,
        streak: 0,
        results: { ...s.results, [target]: 'revealed' },
        card: { id: target, outcome: 'revealed', points: 0 },
      }
    }

    case 'next':
      return s.card ? advance(s, a.now) : s

    case 'quit':
      return { ...s, status: 'over', card: null, finishedAt: s.finishedAt ?? a.now }
  }
}

// --- derived ----------------------------------------------------------------

export function stats(s: GameState) {
  const done = Object.values(s.results)
  const first = done.filter((o) => o === 'first').length
  return {
    completed: done.length,
    total: s.queue.length,
    first,
    revealed: done.filter((o) => o === 'revealed').length,
    accuracy: done.length ? Math.round((first / done.length) * 100) : 0,
  }
}

export function elapsedMs(s: GameState, now: number): number {
  return (s.finishedAt ?? now) - s.startedAt + s.penaltyMs
}

export function formatClock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/** A flawless run: every area first try, streak bonus compounding to its cap. */
export function maxScore(n: number): number {
  let total = 0
  for (let i = 0; i < n; i++) {
    total += POINTS.first + Math.min(STREAK_BONUS * i, STREAK_BONUS_CAP)
  }
  return total
}

/**
 * Rating out of 100 for the end-of-run grade.
 *
 * Raw score over a perfect score reads far too harshly: clear the whole island
 * on the second click every time and you land at 55, which is not what "found
 * every single area" should feel like. Weight coverage over crispness instead.
 */
export function rating(s: GameState): number {
  const done = Object.values(s.results)
  const found = done.filter((o) => o !== 'revealed').length
  const first = done.filter((o) => o === 'first').length
  const coverage = found / Math.max(1, s.queue.length)
  const crispness = done.length ? first / done.length : 0
  return Math.round((coverage * 0.65 + crispness * 0.35) * 100)
}

export type Grade = { title: string; note: string }

export function gradeFor(pct: number): Grade {
  if (pct >= 95)
    return {
      title: 'Chief Surveyor',
      note: 'You could redraw the Master Plan from memory. URA should be paying you.',
    }
  if (pct >= 85)
    return {
      title: 'True Blue Heartlander',
      note: 'Steady. You have queued at enough hawker centres to earn this one.',
    }
  if (pct >= 70)
    return {
      title: 'Confirm Got PR Already',
      note: 'Solid island knowledge. Only the ulu corners caught you out.',
    }
  if (pct >= 55)
    return {
      title: 'Weekend Explorer',
      note: 'You know your side of the island very well and everyone else’s vaguely.',
    }
  if (pct >= 40)
    return {
      title: 'Ah, You Stay In Condo Is It',
      note: 'Orchard and the CBD, no problem. Anything past the PIE, problem.',
    }
  if (pct >= 22)
    return {
      title: 'Newly Arrived Expat',
      note: 'You can find the office and the brunch place. Go take a bus somewhere.',
    }
  return {
    title: 'Still At The Merlion',
    note: 'You have seen the postcard. Now go ride the MRT to the end of a line.',
  }
}
