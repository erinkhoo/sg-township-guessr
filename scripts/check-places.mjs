/**
 * Verify that every place named in the copy actually sits in the planning area
 * that names it.
 *
 * This is the failure mode that survives a normal fact-check: "Bedok Reservoir"
 * is a real place, the sentence about it is true, and it is still in the wrong
 * entry. A reviewer without the boundaries in front of them cannot catch it, and
 * in a game whose whole subject is which area is which, it is the worst possible
 * error. So it gets checked against the URA polygons themselves.
 *
 *   node scripts/check-places.mjs            # verify, exit 1 on mismatch
 *   node scripts/check-places.mjs --refresh  # re-geocode via OneMap, rewrite cache
 *
 * Geocodes come from OneMap's public search endpoint and are cached in
 * data/places.json so the check runs offline and stays deterministic.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'))

const REFRESH = process.argv.includes('--refresh')
const CACHE = 'data/places.json'

/**
 * Place names to check live in data/place-claims.json so the vitest suite can
 * read the same list without shelling out to this script.
 *
 * Only names specific enough for OneMap to resolve to one point belong there.
 * Generic nouns ("three malls", "the reservoir"), things that are genuinely
 * adjacent rather than inside, and names that straddle a boundary are left out:
 * a claim of "nearby" is not a claim of containment.
 */
const CLAIMS = read('data/place-claims.json')

// --- geometry ---------------------------------------------------------------
const ringsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)

function pointInRing([x, y], ring) {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

const pa = read('data/pa.geojson').features
const sub = read('data/subzone.geojson').features

function locate(lon, lat, features, key) {
  for (const f of features) {
    for (const poly of ringsOf(f.geometry)) {
      if (pointInRing([lon, lat], poly[0]) && !poly.slice(1).some((h) => pointInRing([lon, lat], h))) {
        return f.properties[key]
      }
    }
  }
  return null
}

// --- geocoding --------------------------------------------------------------
const cache = existsSync(join(root, CACHE)) ? read(CACHE) : {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** OneMap's free tier throttles hard and answers with an HTML error page, so
 *  a non-JSON body means back off rather than give up on the name. */
async function geocode(name, attempt = 0) {
  const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(
    name,
  )}&returnGeom=Y&getAddrDetails=Y&pageNum=1`
  const res = await fetch(url)
  const body = await res.text()
  let json
  try {
    json = JSON.parse(body)
  } catch {
    if (attempt >= 4) throw new Error('throttled')
    await sleep(2500 * (attempt + 1))
    return geocode(name, attempt + 1)
  }
  const hit = json.results?.[0]
  if (!hit) return null
  return {
    lon: +hit.LONGITUDE,
    lat: +hit.LATITUDE,
    matched: hit.SEARCHVAL,
    address: hit.ADDRESS,
  }
}

const areaName = new Map(
  sub.map((f) => [f.properties.PLN_AREA_C.toLowerCase(), f.properties.PLN_AREA_N]),
)

const flat = Object.entries(CLAIMS).flatMap(([id, names]) => names.map((n) => ({ id, name: n })))

if (REFRESH) {
  console.log(`geocoding ${flat.length} places via OneMap`)
  for (const { name } of flat) {
    if (cache[name] && !process.argv.includes('--force')) continue
    try {
      const g = await geocode(name)
      if (g) cache[name] = g
      else console.warn(`  no result: ${name}`)
    } catch (e) {
      console.warn(`  failed: ${name} (${e.message})`)
    }
    await sleep(900) // be polite to a free endpoint
  }
  writeFileSync(join(root, CACHE), JSON.stringify(cache, null, 1))
  console.log(`cached ${Object.keys(cache).length} places -> ${CACHE}`)
}

// --- verify -----------------------------------------------------------------
let checked = 0
const problems = []
const skipped = []

for (const { id, name } of flat) {
  const g = cache[name]
  if (!g) {
    skipped.push(name)
    continue
  }
  checked++
  const expected = areaName.get(id)
  const actual = locate(g.lon, g.lat, pa, 'PLN_AREA_N')
  if (actual !== expected) {
    problems.push({
      id,
      name,
      expected,
      actual: actual ?? 'offshore / outside every area',
      subzone: locate(g.lon, g.lat, sub, 'SUBZONE_N'),
      matched: g.matched,
    })
  }
}

console.log(`\nchecked ${checked} place claims across ${Object.keys(CLAIMS).length} areas`)
if (skipped.length) console.log(`skipped ${skipped.length} without a cached geocode: ${skipped.join(', ')}`)

if (problems.length) {
  console.error(`\n${problems.length} place(s) named in the wrong planning area:\n`)
  for (const p of problems) {
    console.error(`  ${p.id}: "${p.name}" is credited to ${p.expected}`)
    console.error(`      actually ${p.actual}${p.subzone ? ` / ${p.subzone}` : ''}  (matched "${p.matched}")`)
  }
  process.exit(1)
}
console.log('every named place sits inside the area that claims it')
