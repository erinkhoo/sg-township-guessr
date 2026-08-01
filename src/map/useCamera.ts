import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { VIEW_H, VIEW_W } from '../data/areas'

export type Box = [number, number, number, number]
export type Cam = { k: number; x: number; y: number }

/** screen px = k * world + offset */
export const toScreen = (cam: Cam, wx: number, wy: number) => ({
  x: cam.k * wx + cam.x,
  y: cam.k * wy + cam.y,
})

export const toWorld = (cam: Cam, sx: number, sy: number) => ({
  x: (sx - cam.x) / cam.k,
  y: (sy - cam.y) / cam.k,
})

const FULL: Box = [0, 0, VIEW_W, VIEW_H]
const MAX_ZOOM_FACTOR = 18
const MIN_ZOOM_FACTOR = 1
const TAP_SLOP = 6
const TAP_MS = 700

function fitBox(box: Box, w: number, h: number, pad: number): Cam {
  const [bx, by, bw, bh] = box
  const k = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh)
  return { k, x: w / 2 - k * (bx + bw / 2), y: h / 2 - k * (by + bh / 2) }
}

export type CameraApi = {
  ref: React.RefObject<HTMLDivElement | null>
  size: { w: number; h: number }
  cam: Cam
  /** k at which the whole island exactly fits, used as the zoom floor */
  baseK: number
  fit: (box?: Box, animate?: boolean) => void
  zoomBy: (factor: number) => void
  isPanning: boolean
  /** wire onto the svg element */
  bind: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
    onPointerCancel: (e: React.PointerEvent) => void
  }
}

export function useCamera(onTap: (world: { x: number; y: number }, clientX: number, clientY: number) => void): CameraApi {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [cam, setCam] = useState<Cam>({ k: 1, x: 0, y: 0 })
  const [isPanning, setPanning] = useState(false)

  const baseCam = useRef<Cam>({ k: 1, x: 0, y: 0 })
  /** the box the camera was last asked to frame, re-applied on resize */
  const framedBox = useRef<Box>(FULL)
  /** set once the player pans or zooms, so a resize stops overriding them */
  const touched = useRef(false)
  const pinchRef = useRef<{ dist: number; mid: { x: number; y: number } } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ startX: number; startY: number; t: number; moved: boolean; dist: number } | null>(null)
  const animRef = useRef<number | null>(null)
  const camRef = useRef(cam)
  camRef.current = cam

  // --- sizing ---------------------------------------------------------------
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect
      setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const clamp = useCallback(
    (next: Cam, w: number, h: number): Cam => {
      const base = baseCam.current.k || 1
      const k = Math.min(Math.max(next.k, base * MIN_ZOOM_FACTOR * 0.92), base * MAX_ZOOM_FACTOR)
      const mapW = k * VIEW_W
      const mapH = k * VIEW_H
      const x = mapW <= w ? (w - mapW) / 2 : Math.min(0, Math.max(w - mapW, next.x))
      const y = mapH <= h ? (h - mapH) / 2 : Math.min(0, Math.max(h - mapH, next.y))
      return { k, x, y }
    },
    [],
  )

  // --- animated fit ---------------------------------------------------------
  const animate = useCallback((to: Cam) => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setCam(to)
      return
    }
    const from = camRef.current
    const t0 = performance.now()
    const D = 420
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / D)
      const e = ease(t)
      setCam({
        k: from.k + (to.k - from.k) * e,
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
      })
      if (t < 1) animRef.current = requestAnimationFrame(step)
    }
    animRef.current = requestAnimationFrame(step)
  }, [])

  const fit = useCallback(
    (box: Box = FULL, withAnim = true) => {
      const { w, h } = size
      if (!w || !h) return
      framedBox.current = box
      touched.current = false
      const target = clamp(fitBox(box, w, h, box === FULL ? 8 : 26), w, h)
      if (withAnim) animate(target)
      else setCam(target)
    },
    [size, clamp, animate],
  )

  /**
   * Resizes land at awkward moments: the play layout swaps to a column while the
   * start-of-run fit animation is still running, and mobile browser chrome
   * collapses mid-game. Re-frame the last requested box unless the player has
   * since moved the camera themselves, in which case only re-clamp.
   */
  useEffect(() => {
    const { w, h } = size
    if (!w || !h) return
    baseCam.current = fitBox(FULL, w, h, 8)
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (touched.current) {
      setCam((prev) => clamp(prev, w, h))
    } else {
      const box = framedBox.current
      setCam(clamp(fitBox(box, w, h, box === FULL ? 8 : 26), w, h))
    }
  }, [size, clamp])

  const zoomAt = useCallback(
    (factor: number, sx: number, sy: number) => {
      touched.current = true
      setCam((prev) => {
        const k = prev.k * factor
        const next = { k, x: sx - (sx - prev.x) * (k / prev.k), y: sy - (sy - prev.y) * (k / prev.k) }
        return clamp(next, size.w, size.h)
      })
    },
    [clamp, size],
  )

  const zoomBy = useCallback(
    (factor: number) => zoomAt(factor, size.w / 2, size.h / 2),
    [zoomAt, size],
  )

  // --- wheel (non-passive so preventDefault works) --------------------------
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const scale = e.ctrlKey ? 0.012 : 0.0022 // trackpad pinch reports ctrlKey
      zoomAt(Math.exp(-e.deltaY * scale), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // --- pointers -------------------------------------------------------------
  const local = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    if (pointers.current.size === 1) {
      gesture.current = { startX: p.x, startY: p.y, t: performance.now(), moved: false, dist: 0 }
    } else {
      gesture.current = null // a second finger cancels any pending tap
      setPanning(true)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!
    const p = local(e)
    pointers.current.set(e.pointerId, p)

    if (pointers.current.size === 1) {
      const g = gesture.current
      if (g) {
        g.dist += Math.hypot(p.x - prev.x, p.y - prev.y)
        if (!g.moved && g.dist > TAP_SLOP) {
          g.moved = true
          setPanning(true)
          try {
            // throws if the pointer was already released; the pan still works
            ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
          } catch {
            /* no active pointer */
          }
        }
      }
      if (g?.moved) {
        touched.current = true
        setCam((c) => clamp({ ...c, x: c.x + (p.x - prev.x), y: c.y + (p.y - prev.y) }, size.w, size.h))
      }
      return
    }

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const last = pinchRef.current
      if (last && last.dist > 0) {
        touched.current = true
        const factor = dist / last.dist
        setCam((c) => {
          const k = c.k * factor
          const scaled = { k, x: mid.x - (last.mid.x - c.x) * (k / c.k), y: mid.y - (last.mid.y - c.y) * (k / c.k) }
          return clamp(scaled, size.w, size.h)
        })
      }
      pinchRef.current = { dist, mid }
    }
  }

  const endPointer = (e: React.PointerEvent, cancelled: boolean) => {
    const g = gesture.current
    const wasSingle = pointers.current.size === 1
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchRef.current = null
    if (pointers.current.size === 0) {
      setPanning(false)
      gesture.current = null
      if (!cancelled && wasSingle && g && !g.moved && performance.now() - g.t < TAP_MS) {
        const p = local(e)
        onTap(toWorld(camRef.current, p.x, p.y), e.clientX, e.clientY)
      }
    }
  }

  useEffect(() => () => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
  }, [])

  const baseK = size.w && size.h ? fitBox(FULL, size.w, size.h, 8).k : 1

  return {
    ref,
    size,
    cam,
    baseK,
    fit,
    zoomBy,
    isPanning,
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => endPointer(e, false),
      onPointerCancel: (e) => endPointer(e, true),
    },
  }
}
