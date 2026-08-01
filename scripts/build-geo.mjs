/**
 * Build SVG geometry for the 55 URA planning areas.
 *
 * Source: data.gov.sg "Master Plan 2019 Subzone Boundary (No Sea)"
 *         dataset d_8594ae9ff96d0c708bc2af633048edfb (Singapore Open Data Licence v1.0)
 *
 * Pipeline (see scripts/fetch-geo.sh for steps 1-3):
 *   1. download subzone GeoJSON (WGS84, 332 features)
 *   2. mapshaper -dissolve2 PLN_AREA_N   -> 55 planning areas
 *   3. mapshaper -simplify 10% keep-shapes + -points inner
 *   4. this script: Web Mercator -> SVG viewBox, emit src/data/geo.generated.ts
 *
 * Everything downstream is pure geometry, so re-running with a finer/coarser
 * simplify percentage needs no other change.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'))

const VIEW_W = 1000 // SVG user units across Singapore's full bbox
const PAD = 6 // breathing room so coastlines aren't flush to the edge
const DP = 1 // coordinate decimals (~0.5 m at this scale)

// --- Web Mercator ------------------------------------------------------------
const merc = ([lon, lat]) => [
  (lon * Math.PI) / 180,
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
]

// --- gather ------------------------------------------------------------------
const areas = read('data/pa.geojson').features
const inner = new Map(
  read('data/inner.geojson').features.map((f) => [
    f.properties.PLN_AREA_N,
    f.geometry.coordinates,
  ]),
)

// region + official area code come from the un-dissolved subzone file
const meta = new Map()
for (const f of read('data/subzone.geojson').features) {
  const p = f.properties
  if (!meta.has(p.PLN_AREA_N)) {
    meta.set(p.PLN_AREA_N, { code: p.PLN_AREA_C, region: p.REGION_N })
  }
}

// --- fit projected coords into the viewBox -----------------------------------
const rings = (geom) =>
  geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates

let minX = Infinity,
  minY = Infinity,
  maxX = -Infinity,
  maxY = -Infinity
for (const f of areas) {
  for (const poly of rings(f.geometry)) {
    for (const ring of poly) {
      for (const c of ring) {
        const [x, y] = merc(c)
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
}

const scale = (VIEW_W - PAD * 2) / (maxX - minX)
const VIEW_H = +((maxY - minY) * scale + PAD * 2).toFixed(2)
const project = (c) => {
  const [x, y] = merc(c)
  return [
    +((x - minX) * scale + PAD).toFixed(DP),
    +((maxY - y) * scale + PAD).toFixed(DP), // SVG y grows downward
  ]
}

// --- path emission -----------------------------------------------------------
// Absolute coords are rounded first, then deltas are taken between the *rounded*
// values, so relative commands cannot accumulate drift.
const num = (n) => {
  const s = n.toFixed(DP)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

function ringToPath(ring) {
  const pts = ring.map(project)
  // drop the closing duplicate vertex; `z` re-closes it
  if (pts.length > 1) {
    const a = pts[0]
    const b = pts[pts.length - 1]
    if (a[0] === b[0] && a[1] === b[1]) pts.pop()
  }
  if (pts.length < 3) return ''
  let d = `M${num(pts[0][0])} ${num(pts[0][1])}`
  let [px, py] = pts[0]
  const seg = []
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i]
    const dx = +(x - px).toFixed(DP)
    const dy = +(y - py).toFixed(DP)
    if (dx === 0 && dy === 0) continue
    seg.push(`${num(dx)} ${num(dy)}`)
    px = x
    py = y
  }
  if (seg.length < 2) return ''
  return `${d}l${seg.join(' ')}z`
}

// shoelace on projected coords, used for tap-target sizing and label weighting
function ringArea(ring) {
  const pts = ring.map(project)
  let s = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    s += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
  }
  return Math.abs(s) / 2
}

const titleCase = (s) =>
  s
    .toLowerCase()
    .replace(/\b[a-z]/g, (m) => m.toUpperCase())
    .replace(/\bNorth-eastern\b/, 'North-Eastern')

const out = []
for (const f of areas) {
  const name = f.properties.PLN_AREA_N
  const polys = rings(f.geometry)

  const d = polys
    .map((poly) => poly.map(ringToPath).filter(Boolean).join(''))
    .filter(Boolean)
    .join('')

  // outer rings only for area; inner rings (holes) subtract
  let area = 0
  for (const poly of polys) {
    poly.forEach((ring, i) => (area += i === 0 ? ringArea(ring) : -ringArea(ring)))
  }

  let bx0 = Infinity,
    by0 = Infinity,
    bx1 = -Infinity,
    by1 = -Infinity
  for (const poly of polys)
    for (const ring of poly)
      for (const c of ring) {
        const [x, y] = project(c)
        if (x < bx0) bx0 = x
        if (x > bx1) bx1 = x
        if (y < by0) by0 = y
        if (y > by1) by1 = y
      }

  const [cx, cy] = project(inner.get(name))
  const m = meta.get(name)

  out.push({
    id: m.code.toLowerCase(),
    name: titleCase(name),
    region: titleCase(m.region).replace(' Region', ''),
    d,
    cx,
    cy,
    bbox: [bx0, by0, +(bx1 - bx0).toFixed(DP), +(by1 - by0).toFixed(DP)],
    area: +area.toFixed(1),
  })
}

out.sort((a, b) => b.area - a.area) // paint big first so small areas stay clickable

// Distance from each label anchor to the nearest other anchor. The tap-assist
// circles are capped at a fraction of this so they can never reach far enough to
// swallow a click that belonged to a neighbour.
for (const a of out) {
  let best = Infinity
  for (const b of out) {
    if (a === b) continue
    const d = Math.hypot(a.cx - b.cx, a.cy - b.cy)
    if (d < best) best = d
  }
  a.gap = +best.toFixed(1)
}

// --- derived camera targets --------------------------------------------------
const union = (ids) => {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity
  for (const a of out) {
    if (!ids.includes(a.id)) continue
    x0 = Math.min(x0, a.bbox[0])
    y0 = Math.min(y0, a.bbox[1])
    x1 = Math.max(x1, a.bbox[0] + a.bbox[2])
    y1 = Math.max(y1, a.bbox[1] + a.bbox[3])
  }
  return [x0, y0, +(x1 - x0).toFixed(2), +(y1 - y0).toFixed(2)]
}

// The dense city core: every planning area packed between Orchard and the bay.
// Street directories print this as a separate magnified plate, and so does the
// game, because at island zoom several of these are only a few pixels across.
const INSET_IDS = ['dt', 'mu', 'nt', 'or', 'ot', 'rv', 'rc', 'sr', 'sv', 'me', 'ms']

const regionBoxes = {}
for (const r of [...new Set(out.map((a) => a.region))]) {
  regionBoxes[r] = union(out.filter((a) => a.region === r).map((a) => a.id))
}

const ts = `// GENERATED by scripts/build-geo.mjs — do not edit by hand.
// Source: URA Master Plan 2019 Subzone Boundary (No Sea), data.gov.sg,
// dissolved to the 55 official planning areas. Singapore Open Data Licence v1.0.

export type AreaGeo = {
  /** URA planning-area code, lowercased (e.g. "bm" for Bukit Merah) */
  id: string
  name: string
  region: string
  /** SVG path data in VIEW_BOX space */
  d: string
  /** pole-of-inaccessibility label anchor */
  cx: number
  cy: number
  /** [x, y, w, h] */
  bbox: [number, number, number, number]
  /** projected area in squared view units — used for tap-target sizing */
  area: number
  /** distance to the nearest other label anchor; caps how far tap-assist may reach */
  gap: number
}

export const VIEW_W = ${VIEW_W}
export const VIEW_H = ${VIEW_H}

/** Inverse of the Web Mercator fit, so view units can be turned back into lon/lat. */
export const PROJ = {
  minX: ${minX},
  maxY: ${maxY},
  scale: ${scale},
  pad: ${PAD},
} as const

/** City-core plate, drawn as a magnified inset the way a street directory would. */
export const INSET_IDS = ${JSON.stringify(INSET_IDS)}
export const INSET_BBOX: [number, number, number, number] = ${JSON.stringify(union(INSET_IDS))}

/** [x, y, w, h] per planning region, for the region-drill camera. */
export const REGION_BBOX: Record<string, [number, number, number, number]> = ${JSON.stringify(regionBoxes)}

/** Sorted largest-first: painting order keeps small areas hit-testable on top. */
export const GEO: AreaGeo[] = ${JSON.stringify(out, null, 0)
  .replace(/^\[/, '[\n  ')
  .replace(/\},\{/g, '},\n  {')
  .replace(/\]$/, ',\n]')}
`

writeFileSync(join(root, 'src/data/geo.generated.ts'), ts)
// sidecar for scripts and content tooling that shouldn't have to parse TS
writeFileSync(
  join(root, 'data/areas.json'),
  JSON.stringify(out.map(({ d: _d, ...rest }) => rest), null, 1),
)

const bytes = Buffer.byteLength(ts)
console.log(`geo.generated.ts  ${out.length} areas  ${(bytes / 1024).toFixed(1)} KB`)
console.log(`viewBox 0 0 ${VIEW_W} ${VIEW_H}`)
console.log(
  'smallest:',
  out
    .slice(-5)
    .map((a) => `${a.name}(${a.area})`)
    .join(' '),
)
