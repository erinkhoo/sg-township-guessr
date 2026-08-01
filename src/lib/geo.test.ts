import { describe, expect, it } from 'vitest'
import { AREAS, BY_ID } from '../data/areas'
import { compass, formatKm, gridRef, viewBearing, viewDistanceKm, viewToLonLat } from './geo'

const at = (id: string) => {
  const a = BY_ID[id]
  return { x: a.cx, y: a.cy }
}

describe('projection', () => {
  it('puts every area inside Singapore', () => {
    for (const a of AREAS) {
      const { lon, lat } = viewToLonLat(a.cx, a.cy)
      expect(lon, a.name).toBeGreaterThan(103.5)
      expect(lon, a.name).toBeLessThan(104.15)
      expect(lat, a.name).toBeGreaterThan(1.14)
      expect(lat, a.name).toBeLessThan(1.5)
    }
  })

  it('places known areas at their real coordinates', () => {
    // spot checks against published centroids, generous tolerance because these
    // are interior points rather than true centroids
    const cases: [string, number, number][] = [
      ['ys', 103.835, 1.429], // Yishun
      ['tm', 103.945, 1.353], // Tampines
      ['ts', 103.65, 1.29], // Tuas
      ['dt', 103.851, 1.283], // Downtown Core
    ]
    for (const [id, lon, lat] of cases) {
      const p = viewToLonLat(BY_ID[id].cx, BY_ID[id].cy)
      expect(Math.abs(p.lon - lon), `${id} lon`).toBeLessThan(0.05)
      expect(Math.abs(p.lat - lat), `${id} lat`).toBeLessThan(0.05)
    }
  })
})

describe('distance and bearing', () => {
  it('measures the island at roughly its real width', () => {
    // Tuas to Changi is about 40 km end to end
    const km = viewDistanceKm(at('ts'), at('ch'))
    expect(km).toBeGreaterThan(30)
    expect(km).toBeLessThan(50)
  })

  it('is symmetric', () => {
    expect(viewDistanceKm(at('ys'), at('bd'))).toBeCloseTo(viewDistanceKm(at('bd'), at('ys')), 6)
  })

  it('reads west to east as an easterly bearing', () => {
    expect(compass(viewBearing(at('jw'), at('tm')))).toMatch(/^E|^ENE|^ESE/)
    expect(compass(viewBearing(at('ys'), at('dt')))).toMatch(/^S/)
  })
})

describe('scale', () => {
  it('spans the real width of the country across the viewBox', () => {
    // Tuas in the west to Pulau Tekong in the east is a shade over 50 km
    const km = viewDistanceKm({ x: 0, y: 325 }, { x: 1000, y: 325 })
    expect(km).toBeGreaterThan(50)
    expect(km).toBeLessThan(58)
  })

  it('keeps one view unit at a constant ground distance across the plate', () => {
    // Mercator stretches with latitude; over Singapore's half-degree the error
    // must stay small enough that a single scale bar is honest.
    const north = viewDistanceKm({ x: 400, y: 40 }, { x: 500, y: 40 })
    const south = viewDistanceKm({ x: 400, y: 600 }, { x: 500, y: 600 })
    expect(Math.abs(north - south) / north).toBeLessThan(0.01)
  })
})

describe('formatting', () => {
  it('switches to metres under a kilometre', () => {
    expect(formatKm(0.42)).toBe('420 m')
    expect(formatKm(4.26)).toBe('4.3 km')
    expect(formatKm(41.6)).toBe('42 km')
  })

  it('gives each area a grid reference in range', () => {
    for (const a of AREAS) {
      expect(a.ref, a.name).toMatch(/^[A-L][1-8]$/)
    }
  })

  it('clamps a point on the far edge into the last cell', () => {
    expect(gridRef(1000, 650, 1000, 650)).toBe('L8')
    expect(gridRef(0, 0, 1000, 650)).toBe('A1')
  })
})
