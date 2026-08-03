import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pointInPolygon } from '../lib/geo'
import claims from '../../data/place-claims.json'
import geocodes from '../../data/places.json'
import { BY_ID } from './areas'

/**
 * The copy names about a hundred real places. Each has to sit inside the
 * planning area whose entry names it, and that is not something a reader can
 * check: "Bedok Reservoir" is real, the sentence about it is true, and it can
 * still be filed under the wrong area.
 *
 * Nine entries shipped wrong for exactly this reason before the boundaries were
 * consulted, including the whole Mandai wildlife precinct (Central Water
 * Catchment, not Mandai) and Bukit Timah Hill (Bukit Panjang, not Bukit Timah).
 *
 * Geocodes are cached in data/places.json; refresh them with
 * `node scripts/check-places.mjs --refresh`.
 */

type Geo = { lon: number; lat: number; matched: string }
type Feature = {
  properties: { PLN_AREA_N: string }
  geometry: { type: string; coordinates: number[][][] | number[][][][] }
}

// .geojson is not a module extension the bundler understands, so it is read
// rather than imported.
const features: Feature[] = JSON.parse(
  readFileSync(new URL('../../data/pa.geojson', import.meta.url), 'utf8'),
).features
const cache = geocodes as Record<string, Geo>
const CLAIMS = claims as Record<string, string[]>

const polygonsOf = (f: Feature) =>
  f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates as number[][][]]
    : (f.geometry.coordinates as number[][][][])

function areaAt(lon: number, lat: number): string | null {
  for (const f of features) {
    for (const poly of polygonsOf(f)) {
      if (pointInPolygon([lon, lat], poly)) return f.properties.PLN_AREA_N
    }
  }
  return null
}

describe('place attribution', () => {
  const entries = Object.entries(CLAIMS).flatMap(([id, names]) =>
    names.map((name) => ({ id, name })),
  )

  it('has claims to check', () => {
    expect(entries.length).toBeGreaterThan(80)
  })

  it('never credits a landmark to the wrong planning area', () => {
    const wrong: string[] = []
    for (const { id, name } of entries) {
      const g = cache[name]
      if (!g) continue // unresolvable name, reported by the refresh script
      const expected = BY_ID[id]?.name?.toUpperCase()
      const actual = areaAt(g.lon, g.lat)
      if (actual !== expected) {
        wrong.push(`${id}: "${name}" credited to ${expected}, actually ${actual ?? 'offshore'}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('checks at least one place for most areas', () => {
    const covered = Object.keys(CLAIMS).length
    expect(covered).toBeGreaterThanOrEqual(45)
  })
})
