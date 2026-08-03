import { GEO, INSET_BBOX, INSET_IDS, REGION_BBOX, VIEW_H, VIEW_W, type AreaGeo } from './geo.generated'
import { CONTENT, type AreaContent } from './content'
import { gridRef } from '../lib/geo'

export type Area = AreaGeo &
  AreaContent & {
    /** street-directory style locator, e.g. "H5" */
    ref: string
    /** radius in view units of a circle with the same area, used for labelling */
    r: number
    /**
     * How hard this shape is to hit, in view units. Equivalent radius alone lies
     * about slivers: Changi Bay covers a 141x142 bbox with 665 units of area, so
     * it reads as comfortably large while being about five units thick. Taking
     * the smaller of radius and mean thickness catches both failure modes.
     */
    hit: number
  }

const FALLBACK: AreaContent = {
  quip: '',
  blurb: 'One of Singapore’s 55 URA planning areas.',
  hint: 'Look for it on the outline map.',
  fact: '',
}

export const AREAS: Area[] = GEO.map((g) => {
  const r = Math.sqrt(g.area / Math.PI)
  const thickness = g.area / Math.max(g.bbox[2], g.bbox[3])
  return {
    ...g,
    ...(CONTENT[g.id] ?? FALLBACK),
    ref: gridRef(g.cx, g.cy, VIEW_W, VIEW_H),
    r,
    hit: Math.min(r, thickness),
  }
})

export const BY_ID: Record<string, Area> = Object.fromEntries(
  AREAS.map((a) => [a.id, a]),
)

export const ALL_IDS = AREAS.map((a) => a.id)

/** Order matches how Singaporeans say it, not alphabetical. */
export const REGIONS = ['Central', 'East', 'North-East', 'North', 'West'] as const
export type RegionName = (typeof REGIONS)[number]

export const IDS_BY_REGION: Record<string, string[]> = Object.fromEntries(
  REGIONS.map((r) => [r, AREAS.filter((a) => a.region === r).map((a) => a.id)]),
)

export { INSET_BBOX, INSET_IDS, REGION_BBOX, VIEW_H, VIEW_W }
