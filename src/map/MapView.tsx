import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react'
import { INSET_BBOX, INSET_IDS, VIEW_H, VIEW_W, type Area } from '../data/areas'
import type { Miss, Outcome } from '../game/types'
import { GRID, formatKm, compass, viewDistanceKm } from '../lib/geo'
import { toScreen, useCamera, type Box, type CameraApi } from './useCamera'

export type MapHandle = { fit: (box?: Box, animate?: boolean) => void }

type Props = {
  areas: Area[]
  /** ids that belong to the current run; everything else is drawn but inert */
  inScope: Set<string>
  results: Record<string, Outcome>
  misses: Miss[]
  /** drawn with the answer treatment while the reveal card is up */
  revealId?: string | null
  /** Singlish exclamation to throw at the latest miss, e.g. "Alamak lah!" */
  shout?: string | null
  interactive: boolean
  labelAll?: boolean
  onPick: (id: string | null, world: { x: number; y: number }) => void
  onHover?: (id: string | null) => void
}

const INSET_MIN = 132
const LABEL_MIN_R = 15 // on-screen radius below which a label would just collide
const ASSIST_PX = 15 // half a comfortable touch target

/** ground distance of one view unit, measured across the middle of the island */
const KM_PER_UNIT = viewDistanceKm({ x: 400, y: 325 }, { x: 500, y: 325 }) / 100
const NICE_KM = [0.25, 0.5, 1, 2, 5, 10, 20, 50]

function scaleBar(k: number) {
  const kmPerPx = KM_PER_UNIT / k
  const km = NICE_KM.find((v) => v / kmPerPx >= 62) ?? NICE_KM[NICE_KM.length - 1]
  return { km, px: Math.round(km / kmPerPx), label: km < 1 ? `${km * 1000} m` : `${km} km` }
}

function stateClass(
  id: string,
  results: Record<string, Outcome>,
  inScope: Set<string>,
  tried: Set<string>,
) {
  const o = results[id]
  if (o) return `is-${o}`
  if (tried.has(id)) return 'is-tried'
  return inScope.has(id) ? 'is-open' : 'is-out'
}

export const MapView = forwardRef<MapHandle, Props>(function MapView(
  { areas, inScope, results, misses, revealId, shout, interactive, labelAll, onPick, onHover },
  ref,
) {
  const [hover, setHover] = useState<string | null>(null)

  const camera: CameraApi = useCamera((world, clientX, clientY) => {
    if (!interactive) return
    const el = document.elementFromPoint(clientX, clientY)
    const hit = el?.closest('[data-area]') as HTMLElement | null
    onPick(hit?.dataset.area ?? null, world)
  })

  useImperativeHandle(ref, () => ({ fit: camera.fit }), [camera.fit])

  const { cam, size, baseK } = camera
  const { w, h } = size

  const byId = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a])), [areas])

  // --- city-core inset ------------------------------------------------------
  const insetSize = Math.max(INSET_MIN, Math.min(212, Math.round(Math.min(w, h) * 0.34)))
  const insetPad = 10
  // Pointless in a region drill that never touches the core.
  const insetRelevant = INSET_IDS.some((id) => inScope.has(id))
  const showInset = w > 320 && h > 300 && cam.k < baseK * 3 && insetRelevant
  const insetK = (insetSize - insetPad * 2) / Math.max(INSET_BBOX[2], INSET_BBOX[3])
  const insetOrigin = { x: w - insetSize - 12, y: h - insetSize - 12 }
  const insetCam = {
    k: insetK,
    x: insetOrigin.x + insetSize / 2 - insetK * (INSET_BBOX[0] + INSET_BBOX[2] / 2),
    y: insetOrigin.y + insetSize / 2 - insetK * (INSET_BBOX[1] + INSET_BBOX[3] / 2),
  }
  const insetAreas = useMemo(
    () => areas.filter((a) => INSET_IDS.includes(a.id)),
    [areas],
  )

  // --- graticule ------------------------------------------------------------
  const grid = useMemo(() => {
    const vs: number[] = []
    const hs: number[] = []
    for (let i = 0; i <= GRID.cols; i++) vs.push((i * VIEW_W) / GRID.cols)
    for (let i = 0; i <= GRID.rows; i++) hs.push((i * VIEW_H) / GRID.rows)
    return { vs, hs }
  }, [])

  const setH = (id: string | null) => {
    setHover(id)
    onHover?.(id)
  }

  const lastMiss = misses[misses.length - 1]
  const target = revealId ? byId[revealId] : null
  const tried = useMemo(
    () => new Set(misses.map((m) => m.id).filter(Boolean) as string[]),
    [misses],
  )
  // While the round is live the chord would point straight at the answer, so
  // only the distance is released. Bearing unlocks once the round is nearly
  // lost, and the full chord is drawn after it resolves.
  const probing = misses.length > 0 && !target
  const showBearing = misses.length >= 2
  const bar = scaleBar(cam.k)

  const layout = useCallback(
    (pool: Area[], c: typeof cam, opts: { minR: number; charW: number; bounds?: [number, number, number, number] }) => {
      const out: { id: string; name: string; x: number; y: number; cls: string }[] = []
      const placed: [number, number, number, number][] = []
      // the answer is laid out first so it can never be culled by a neighbour
      const candidates = revealId ? [byId[revealId], ...pool.filter((a) => a.id !== revealId)] : pool

      for (const a of candidates) {
        if (!a || !pool.includes(a)) continue
        if (!(labelAll || results[a.id] || a.id === revealId)) continue
        if (a.r * c.k < opts.minR && a.id !== revealId) continue

        const p = toScreen(c, a.cx, a.cy)
        const half = (a.name.length * opts.charW + 8) / 2
        const box: [number, number, number, number] = [p.x - half, p.y - 7, p.x + half, p.y + 7]
        if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue
        placed.push(box)

        const [x0, y0, x1, y1] = opts.bounds ?? [0, 0, w, h]
        if (p.x < x0 - half || p.x > x1 + half || p.y < y0 - 14 || p.y > y1 + 14) continue
        out.push({ id: a.id, name: a.name, x: p.x, y: p.y, cls: results[a.id] ? `lbl-${results[a.id]}` : '' })
      }
      return out
    },
    [byId, labelAll, results, revealId, w, h],
  )

  /**
   * Fifty-five names over a map this dense will always overlap somewhere, so
   * labels are laid out greedily by descending area and anything whose box hits
   * an already-placed one is dropped. Zooming in frees room and the smaller
   * names come back, which is how a paper map behaves.
   */
  const labels = useMemo(() => layout(areas, cam, { minR: LABEL_MIN_R, charW: 5.4 }), [layout, areas, cam])

  const insetLabels = useMemo(
    () =>
      showInset
        ? layout(insetAreas, insetCam, {
            minR: 0,
            charW: 4.6,
            bounds: [insetOrigin.x, insetOrigin.y, insetOrigin.x + insetSize, insetOrigin.y + insetSize],
          })
        : [],
    // insetCam is derived from insetOrigin/insetK, which are derived from w/h
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, insetAreas, showInset, insetOrigin.x, insetOrigin.y, insetSize, insetK],
  )

  return (
    <div className="map" ref={camera.ref} data-panning={camera.isPanning || undefined}>
      {w > 0 && (
        <svg
          className="map-svg"
          viewBox={`0 0 ${w} ${h}`}
          width={w}
          height={h}
          role="img"
          aria-label="Map of Singapore's planning areas"
          {...camera.bind}
        >
          <defs>
            <clipPath id="inset-clip">
              <rect x={insetOrigin.x} y={insetOrigin.y} width={insetSize} height={insetSize} rx="4" />
            </clipPath>
          </defs>

          <rect className="sea" x={0} y={0} width={w} height={h} />

          {/* survey graticule, drawn in screen space so it tracks the camera */}
          <g className="graticule" aria-hidden>
            {grid.vs.map((x, i) => {
              const sx = cam.k * x + cam.x
              return <line key={`v${i}`} x1={sx} y1={0} x2={sx} y2={h} />
            })}
            {grid.hs.map((y, i) => {
              const sy = cam.k * y + cam.y
              return <line key={`h${i}`} x1={0} y1={sy} x2={w} y2={sy} />
            })}
          </g>
          <g className="graticule-labels" aria-hidden>
            {grid.vs.slice(0, -1).map((x, i) => {
              const sx = cam.k * (x + VIEW_W / GRID.cols / 2) + cam.x
              return sx > 12 && sx < w - 12 ? (
                <text key={`gl${i}`} x={sx} y={14}>
                  {String.fromCharCode(65 + i)}
                </text>
              ) : null
            })}
            {grid.hs.slice(0, -1).map((y, i) => {
              const sy = cam.k * (y + VIEW_H / GRID.rows / 2) + cam.y
              return sy > 18 && sy < h - 8 ? (
                <text key={`gn${i}`} x={10} y={sy}>
                  {i + 1}
                </text>
              ) : null
            })}
          </g>

          {/* land */}
          <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.k})`}>
            {areas.map((a) => (
              <path
                key={a.id}
                d={a.d}
                data-area={interactive || labelAll ? a.id : undefined}
                className={`land ${stateClass(a.id, results, inScope, tried)}${hover === a.id ? ' is-hover' : ''}`}
                onPointerEnter={() => setH(a.id)}
                onPointerLeave={() => setH(null)}
              />
            ))}

            {target && <path className="land-answer" d={target.d} />}
            {lastMiss?.id && byId[lastMiss.id] && (
              <path key={`miss${misses.length}`} className="land-miss" d={byId[lastMiss.id].d} />
            )}
          </g>

          {/* inset locator on the main plate */}
          {showInset && (
            <rect
              className="inset-locator"
              x={cam.k * INSET_BBOX[0] + cam.x}
              y={cam.k * INSET_BBOX[1] + cam.y}
              width={cam.k * INSET_BBOX[2]}
              height={cam.k * INSET_BBOX[3]}
            />
          )}

          {/* live probes: how far off that click was, without pointing at the answer */}
          {probing && (
            <g className="probes" aria-hidden>
              {misses.map((m, i) => {
                const p = toScreen(cam, m.x, m.y)
                return (
                  <g key={i} className="probe" style={{ animationDelay: `${i * 60}ms` }}>
                    <circle cx={p.x} cy={p.y} r={4} />
                    <circle className="probe-ring" cx={p.x} cy={p.y} r={11} />
                    <text x={p.x} y={p.y - 17}>
                      {formatKm(m.km)}
                      {showBearing ? ` ${compass(m.bearing)}` : ''}
                    </text>
                  </g>
                )
              })}
            </g>
          )}

          {/* the shout, thrown at the exact spot you fumbled */}
          {lastMiss && shout && (
            <g className="shout" key={`shout-${misses.length}-${lastMiss.x}`} aria-hidden>
              <text
                x={toScreen(cam, lastMiss.x, lastMiss.y).x}
                y={toScreen(cam, lastMiss.x, lastMiss.y).y - 34}
              >
                {shout}
              </text>
            </g>
          )}

          {/* the chord: drawn once the round resolves, from each click to the truth */}
          <g className="chords" aria-hidden>
            {target &&
              misses.map((m, i) => {
                const from = toScreen(cam, m.x, m.y)
                const to = toScreen(cam, target.cx, target.cy)
                const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
                return (
                  <g key={i} className="chord" style={{ animationDelay: `${i * 90}ms` }}>
                    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
                    <circle cx={from.x} cy={from.y} r={3.5} />
                    <text x={mid.x} y={mid.y - 6}>
                      {formatKm(m.km)} {compass(m.bearing)}
                    </text>
                  </g>
                )
              })}
          </g>

          {/* labels, de-cluttered largest-area-first so the big towns win ties */}
          <g className="labels" aria-hidden>
            {labels.map((l) => (
              <text key={l.id} x={l.x} y={l.y} className={l.cls}>
                {l.name}
              </text>
            ))}
          </g>

          {/* Tap assist: grows sub-thumb shapes up to a finger, but never past
              45% of the way to a neighbour, so it can't swallow their clicks. */}
          {interactive && (
            <g className="assist">
              {areas
                .filter((a) => inScope.has(a.id) && !results[a.id] && !tried.has(a.id))
                .map((a) => ({ a, r: Math.min(ASSIST_PX, a.gap * 0.45 * cam.k) }))
                .filter(({ a, r }) => r > a.hit * cam.k + 2)
                .sort((x, y) => y.a.hit - x.a.hit)
                .map(({ a, r }) => {
                  const p = toScreen(cam, a.cx, a.cy)
                  if (p.x < -r || p.x > w + r || p.y < -r || p.y > h + r) return null
                  return <circle key={a.id} data-area={a.id} cx={p.x} cy={p.y} r={r} />
                })}
            </g>
          )}

          {/* chart furniture: the open sea is where a real plate puts these */}
          <g className="furniture" aria-hidden transform={`translate(18 ${h - 22})`}>
            <g className="rose" transform="translate(0 -34)">
              <path d="M0 -13 L4.6 3 L0 -0.6 L-4.6 3 Z" />
              <text y="14">N</text>
            </g>
            <g className="scalebar" transform="translate(30 0)">
              <line x1="0" y1="0" x2={bar.px} y2="0" />
              <line x1="0" y1="-4" x2="0" y2="4" />
              <line x1={bar.px} y1="-4" x2={bar.px} y2="4" />
              <line x1={bar.px / 2} y1="-2.5" x2={bar.px / 2} y2="2.5" />
              <text x={bar.px / 2} y="-8">
                {bar.label}
              </text>
            </g>
          </g>

          {/* city-core inset plate */}
          {showInset && (
            <g className="inset">
              <rect
                className="inset-bg"
                x={insetOrigin.x}
                y={insetOrigin.y}
                width={insetSize}
                height={insetSize}
                rx="4"
              />
              <g clipPath="url(#inset-clip)">
                <g transform={`translate(${insetCam.x} ${insetCam.y}) scale(${insetCam.k})`}>
                  {insetAreas.map((a) => (
                    <path
                      key={a.id}
                      d={a.d}
                      data-area={interactive || labelAll ? a.id : undefined}
                      className={`land ${stateClass(a.id, results, inScope, tried)}${hover === a.id ? ' is-hover' : ''}`}
                      onPointerEnter={() => setH(a.id)}
                      onPointerLeave={() => setH(null)}
                    />
                  ))}
                  {target && INSET_IDS.includes(target.id) && (
                    <path className="land-answer" d={target.d} />
                  )}
                </g>
                <g className="labels inset-labels">
                  {insetLabels.map((l) => (
                    <text key={l.id} x={l.x} y={l.y}>
                      {l.name}
                    </text>
                  ))}
                </g>
              </g>
              <rect
                className="inset-frame"
                x={insetOrigin.x}
                y={insetOrigin.y}
                width={insetSize}
                height={insetSize}
                rx="4"
              />
              <text className="inset-title" x={insetOrigin.x} y={insetOrigin.y - 7}>
                {insetSize < 170 ? 'CITY CORE' : 'CITY CORE · MAGNIFIED'}
              </text>
            </g>
          )}
        </svg>
      )}

      <div className="map-tools">
        <button type="button" onClick={() => camera.zoomBy(1.6)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => camera.zoomBy(1 / 1.6)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => camera.fit()} aria-label="Fit whole island" title="Fit island">
          ⤢
        </button>
      </div>

      <div className="map-attrib">
        Boundaries: URA Master Plan 2019 · data.gov.sg
      </div>
    </div>
  )
})
