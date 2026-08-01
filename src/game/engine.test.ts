import { describe, expect, it } from 'vitest'
import { createGame, currentId, gradeFor, maxScore, rating, reduce, shuffle, stats } from './engine'
import { MAX_TRIES, POINTS, STREAK_BONUS_CAP, THIRD_TRY_POINTS, type Config, type GameState } from './types'

const CFG: Config = { mode: 'classic', scope: 'all' }
const QUEUE = ['a', 'b', 'c']
const game = (cfg: Partial<Config> = {}, queue = QUEUE) =>
  createGame({ ...CFG, ...cfg }, queue, 0)

const guess = (s: GameState, id: string | null, now = 0) =>
  reduce(s, { type: 'guess', id, x: 0, y: 0, now, km: 5, bearing: 90 })

describe('scoring', () => {
  it('pays full for a first-click hit', () => {
    const s = guess(game(), 'a')
    expect(s.score).toBe(POINTS.first)
    expect(s.results.a).toBe('first')
    expect(s.streak).toBe(1)
  })

  it('pays less on each retry and zero once revealed', () => {
    let s = guess(game(), 'z')
    expect(s.score).toBe(0)
    s = guess(s, 'a')
    expect(s.score).toBe(POINTS.retry)
    expect(s.results.a).toBe('retry')

    let t = guess(guess(game(), 'z'), 'y')
    t = guess(t, 'a')
    expect(t.score).toBe(THIRD_TRY_POINTS)

    let u = game()
    for (let i = 0; i < MAX_TRIES; i++) u = guess(u, 'z')
    expect(u.results.a).toBe('revealed')
    expect(u.score).toBe(0)
    expect(u.card?.outcome).toBe('revealed')
  })

  it('halves the round for a hint', () => {
    const s = guess(reduce(game(), { type: 'hint' }), 'a')
    expect(s.score).toBe(POINTS.first / 2)
  })

  it('adds a streak bonus that caps', () => {
    let s = createGame(CFG, Array.from({ length: 30 }, (_, i) => `q${i}`), 0)
    let last = 0
    for (let i = 0; i < 30; i++) {
      const before = s.score
      s = guess(s, `q${i}`)
      last = s.score - before
      s = reduce(s, { type: 'next', now: 0 })
    }
    expect(last).toBe(POINTS.first + STREAK_BONUS_CAP)
  })

  it('breaks the streak on a miss', () => {
    let s = guess(game(), 'a')
    s = reduce(s, { type: 'next', now: 0 })
    expect(s.streak).toBe(1)
    s = guess(s, 'zz')
    expect(s.streak).toBe(0)
    expect(s.bestStreak).toBe(1)
  })

  it('never exceeds maxScore on a flawless run', () => {
    let s = createGame(CFG, QUEUE, 0)
    for (const id of QUEUE) {
      s = guess(s, id)
      s = reduce(s, { type: 'next', now: 0 })
    }
    expect(s.score).toBe(maxScore(QUEUE.length))
  })
})

describe('flow', () => {
  it('holds the card until next is dispatched', () => {
    let s = guess(game(), 'a')
    expect(s.card).not.toBeNull()
    expect(currentId(s)).toBe('a')
    // further clicks are ignored while the card is up
    expect(guess(s, 'b')).toBe(s)
    s = reduce(s, { type: 'next', now: 1 })
    expect(s.card).toBeNull()
    expect(currentId(s)).toBe('b')
  })

  it('ends after the last area', () => {
    let s = game()
    for (const id of QUEUE) {
      s = guess(s, id)
      s = reduce(s, { type: 'next', now: 0 })
    }
    expect(s.status).toBe('over')
    expect(stats(s).completed).toBe(3)
    expect(stats(s).accuracy).toBe(100)
  })

  it('sudden death ends on the first miss', () => {
    const s = guess(game({ mode: 'sudden' }), 'zzz')
    expect(s.status).toBe('over')
    expect(s.results.a).toBe('revealed')
    expect(s.card?.outcome).toBe('revealed')
  })

  it('time attack adds a penalty per miss instead of ending', () => {
    const s = guess(game({ mode: 'timeattack' }), 'zzz')
    expect(s.status).toBe('playing')
    expect(s.penaltyMs).toBe(10_000)
  })

  it('give up reveals without charging tries', () => {
    const s = reduce(game(), { type: 'giveup', now: 0 })
    expect(s.results.a).toBe('revealed')
    expect(s.misses).toHaveLength(0)
  })

  it('ignores everything once the run is over', () => {
    let s = game({ mode: 'sudden' })
    s = guess(s, 'zzz')
    const after = guess(s, 'a')
    expect(after).toBe(s)
  })
})

describe('stats', () => {
  it('reports first-try accuracy over completed rounds only', () => {
    let s = guess(game(), 'a') // first
    s = reduce(s, { type: 'next', now: 0 })
    s = guess(s, 'zz')
    s = guess(s, 'b') // retry
    expect(stats(s).completed).toBe(2)
    expect(stats(s).accuracy).toBe(50)
  })
})

describe('shuffle', () => {
  it('keeps every element exactly once', () => {
    const src = Array.from({ length: 55 }, (_, i) => i)
    const out = shuffle(src)
    expect(out).toHaveLength(55)
    expect([...out].sort((a, b) => a - b)).toEqual(src)
  })

  it('does not mutate its input', () => {
    const src = [1, 2, 3]
    shuffle(src)
    expect(src).toEqual([1, 2, 3])
  })
})

describe('rating', () => {
  it('rewards clearing the board even when every area took two clicks', () => {
    let s = createGame(CFG, QUEUE, 0)
    for (const id of QUEUE) {
      s = guess(s, 'wrong')
      s = guess(s, id)
      s = reduce(s, { type: 'next', now: 0 })
    }
    // raw score would read 55%; finding everything should grade better than that
    expect(rating(s)).toBeGreaterThan(60)
  })

  it('is 100 only for a flawless run', () => {
    let s = createGame(CFG, QUEUE, 0)
    for (const id of QUEUE) {
      s = guess(s, id)
      s = reduce(s, { type: 'next', now: 0 })
    }
    expect(rating(s)).toBe(100)
  })

  it('drops sharply when areas go unfound', () => {
    let s = createGame(CFG, QUEUE, 0)
    for (const id of QUEUE) {
      void id
      for (let i = 0; i < MAX_TRIES; i++) s = guess(s, 'wrong')
      s = reduce(s, { type: 'next', now: 0 })
    }
    expect(rating(s)).toBe(0)
  })
})

describe('grades', () => {
  it('is monotonic across the full range', () => {
    const seen = new Set<string>()
    let lastTitle = ''
    for (let p = 0; p <= 100; p++) {
      const g = gradeFor(p)
      if (g.title !== lastTitle) {
        expect(seen.has(g.title)).toBe(false) // never returns to an earlier grade
        seen.add(g.title)
        lastTitle = g.title
      }
    }
    expect(seen.size).toBe(7)
  })
})
