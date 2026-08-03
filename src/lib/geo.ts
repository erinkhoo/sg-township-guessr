import { PROJ } from '../data/geo.generated'

export type Pt = { x: number; y: number }
export type LonLat = { lon: number; lat: number }

const EARTH_KM = 6371.0088
const RAD = Math.PI / 180

/** Undo the Web Mercator fit applied in scripts/build-geo.mjs. */
export function viewToLonLat(x: number, y: number): LonLat {
  const mx = (x - PROJ.pad) / PROJ.scale + PROJ.minX
  const my = PROJ.maxY - (y - PROJ.pad) / PROJ.scale
  return {
    lon: mx / RAD,
    lat: (2 * Math.atan(Math.exp(my)) - Math.PI / 2) / RAD,
  }
}

export function haversineKm(a: LonLat, b: LonLat): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLon = (b.lon - a.lon) * RAD
  const la1 = a.lat * RAD
  const la2 = b.lat * RAD
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial great-circle bearing, degrees clockwise from true north. */
export function bearingDeg(a: LonLat, b: LonLat): number {
  const la1 = a.lat * RAD
  const la2 = b.lat * RAD
  const dLon = (b.lon - a.lon) * RAD
  const y = Math.sin(dLon) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon)
  return (Math.atan2(y, x) / RAD + 360) % 360
}

const POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]

export function compass(deg: number): string {
  return POINTS[Math.round(deg / 22.5) % 16]
}

/** Straight-line ground distance between two points in SVG view space. */
export function viewDistanceKm(a: Pt, b: Pt): number {
  return haversineKm(viewToLonLat(a.x, a.y), viewToLonLat(b.x, b.y))
}

export function viewBearing(a: Pt, b: Pt): number {
  return bearingDeg(viewToLonLat(a.x, a.y), viewToLonLat(b.x, b.y))
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

/**
 * Street-directory grid reference. Singapore's directories index pages by
 * letter-across / number-down; this reproduces the idea over the whole island
 * so every area gets a stable, printable locator.
 */
const GRID_COLS = 12
const GRID_ROWS = 8
export function gridRef(x: number, y: number, w: number, h: number): string {
  const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor((x / w) * GRID_COLS)))
  const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((y / h) * GRID_ROWS)))
  return `${String.fromCharCode(65 + col)}${row + 1}`
}

export const GRID = { cols: GRID_COLS, rows: GRID_ROWS }

/** Ray casting. Ring is [lon, lat] pairs, first vertex repeated or not. */
export function pointInRing(pt: [number, number], ring: number[][]): boolean {
  const [x, y] = pt
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** True when the point is inside the outer ring and outside every hole. */
export function pointInPolygon(pt: [number, number], polygon: number[][][]): boolean {
  return pointInRing(pt, polygon[0]) && !polygon.slice(1).some((h) => pointInRing(pt, h))
}
