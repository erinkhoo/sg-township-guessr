import { describe, expect, it } from 'vitest'
import { AREAS } from '../data/areas'
import { SHOUTS, shoutFor } from './reactions'
import { MAX_TRIES } from './types'

describe('shouts', () => {
  it('escalates once per try and lands the punchline on the last one', () => {
    expect(shoutFor(1)).toBe('Aiyo!')
    expect(shoutFor(2)).toBe('Alamak lah!')
    expect(shoutFor(3)).toBe('Cannot make it sial!')
  })

  it('has exactly one shout per available try', () => {
    expect(SHOUTS).toHaveLength(MAX_TRIES)
  })

  it('clamps rather than returning undefined outside the ladder', () => {
    expect(shoutFor(0)).toBe(SHOUTS[0])
    expect(shoutFor(-4)).toBe(SHOUTS[0])
    expect(shoutFor(99)).toBe(SHOUTS[SHOUTS.length - 1])
  })
})

describe('quips', () => {
  it('gives every area a line to be mocked with', () => {
    for (const a of AREAS) {
      expect(a.quip, a.name).toBeTruthy()
      expect(a.quip.trim().length, a.name).toBeGreaterThan(10)
    }
  })

  it('reads as a sentence following "That one is X."', () => {
    for (const a of AREAS) {
      // the game already shouted, so the quip must not shout again
      expect(a.quip, a.name).not.toContain('!')
      expect(a.quip, a.name).not.toContain('—')
      expect(a.quip.split(/\s+/).length, a.name).toBeLessThanOrEqual(18)
    }
  })

  it('does not reuse the same line twice', () => {
    const seen = new Set(AREAS.map((a) => a.quip.toLowerCase()))
    expect(seen.size).toBe(AREAS.length)
  })
})
