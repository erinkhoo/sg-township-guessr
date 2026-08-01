import { ALL_IDS, IDS_BY_REGION } from '../data/areas'
import { shuffle } from './engine'
import type { Config, GameState, Mode, Outcome, Scope } from './types'

const KEY = 'sg-guessr:v1'

export type AreaStat = { seen: number; first: number; miss: number }
export type Record_ = { bestScore: number; bestTimeMs: number | null; bestFound: number; plays: number }

export type Save = {
  mastery: Record<string, AreaStat>
  records: Record<string, Record_>
}

const EMPTY: Save = { mastery: {}, records: {} }

export function load(): Save {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<Save>
    return { mastery: parsed.mastery ?? {}, records: parsed.records ?? {} }
  } catch {
    return EMPTY
  }
}

function write(save: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    /* private mode, quota, whatever: the game still plays, it just forgets */
  }
}

export const recordKey = (c: Config) => `${c.mode}:${c.scope}`

/**
 * Read-modify-write on one key. Always re-reads immediately before writing so a
 * second tab cannot be silently clobbered by a stale in-memory copy.
 */
export function commitRun(state: GameState, elapsed: number): Save {
  const save = load()

  for (const [id, outcome] of Object.entries(state.results) as [string, Outcome][]) {
    const cur = save.mastery[id] ?? { seen: 0, first: 0, miss: 0 }
    save.mastery[id] = {
      seen: cur.seen + 1,
      first: cur.first + (outcome === 'first' ? 1 : 0),
      miss: cur.miss + (outcome === 'first' ? 0 : 1),
    }
  }

  if (state.config.mode !== 'learn') {
    const key = recordKey(state.config)
    const cur = save.records[key] ?? { bestScore: 0, bestTimeMs: null, bestFound: 0, plays: 0 }
    const cleared = Object.values(state.results).length === state.queue.length
    const found = Object.values(state.results).filter((o) => o !== 'revealed').length
    save.records[key] = {
      plays: cur.plays + 1,
      bestScore: Math.max(cur.bestScore, state.score),
      bestFound: Math.max(cur.bestFound, found),
      bestTimeMs:
        state.config.mode === 'timeattack' && cleared
          ? Math.min(cur.bestTimeMs ?? Infinity, elapsed)
          : cur.bestTimeMs,
    }
  }

  write(save)
  return save
}

export function resetSave(): Save {
  write(EMPTY)
  return EMPTY
}

// --- queue building ---------------------------------------------------------

const WEAK_SIZE = 15

/**
 * Areas you keep getting wrong, worst first. Anything never seen counts as
 * unknown and sorts in ahead of things you have already nailed, so a fresh
 * player gets a sensible starter set rather than an empty drill.
 */
export function weakIds(save: Save, limit = WEAK_SIZE): string[] {
  const scored = ALL_IDS.map((id) => {
    const m = save.mastery[id]
    if (!m || m.seen === 0) return { id, rate: 0.35, seen: 0 }
    return { id, rate: m.first / m.seen, seen: m.seen }
  })
  scored.sort((a, b) => a.rate - b.rate || b.seen - a.seen || a.id.localeCompare(b.id))
  return scored.slice(0, limit).map((s) => s.id)
}

export function buildQueue(scope: Scope, save: Save): string[] {
  if (scope === 'all') return shuffle(ALL_IDS)
  if (scope === 'weak') return shuffle(weakIds(save))
  return shuffle(IDS_BY_REGION[scope] ?? ALL_IDS)
}

export const MODE_LABEL: Record<Mode, string> = {
  classic: 'Classic',
  timeattack: 'Time attack',
  sudden: 'Sudden death',
  learn: 'Field notes',
}
