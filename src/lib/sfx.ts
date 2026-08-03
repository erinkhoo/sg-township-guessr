/**
 * Sound effects, synthesised at runtime.
 *
 * Everything here is oscillators and envelopes rather than audio files: the game
 * already ships with zero external assets and zero network calls, and a handful
 * of blips do not justify breaking that. Nothing is created until the player's
 * first real gesture, because browsers will not let an AudioContext start before
 * one and a suspended context wastes a handle.
 */

const KEY = 'sg-guessr:muted'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = read()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function isMuted() {
  return muted
}

export function setMuted(next: boolean) {
  muted = next
  try {
    localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    /* private mode: the setting just won't survive a reload */
  }
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 1, ctx.currentTime, 0.01)
}

function audio(): AudioContext | null {
  if (muted) return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
    master = ctx.createGain()
    master.gain.value = 1
    master.connect(ctx.destination)
  }
  // Safari and Chrome both park the context until a gesture unlocks it.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

type ToneOpts = {
  /** start frequency in Hz */
  from: number
  /** end frequency, for slides; defaults to `from` */
  to?: number
  /** seconds */
  dur: number
  /** seconds from now */
  at?: number
  gain?: number
  type?: OscillatorType
  /** exponential sweeps read as cartoonish, linear ones as electronic */
  slide?: 'exp' | 'lin'
}

function tone(c: AudioContext, o: ToneOpts) {
  const t0 = c.currentTime + (o.at ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  const peak = o.gain ?? 0.16

  osc.type = o.type ?? 'triangle'
  osc.frequency.setValueAtTime(o.from, t0)
  if (o.to && o.to !== o.from) {
    if (o.slide === 'lin') osc.frequency.linearRampToValueAtTime(o.to, t0 + o.dur)
    else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + o.dur)
  }

  // short attack, exponential tail: no clicks, no ringing
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)

  osc.connect(g).connect(master!)
  osc.start(t0)
  osc.stop(t0 + o.dur + 0.02)
}

/** First miss: a short rubbery boink. */
export function playMiss() {
  const c = audio()
  if (!c) return
  tone(c, { from: 340, to: 150, dur: 0.19, type: 'triangle', gain: 0.17 })
  tone(c, { from: 170, to: 74, dur: 0.22, at: 0.02, type: 'sine', gain: 0.12 })
}

/** Second miss: the same idea, lower and more exasperated. */
export function playMiss2() {
  const c = audio()
  if (!c) return
  tone(c, { from: 300, to: 120, dur: 0.22, type: 'triangle', gain: 0.17 })
  tone(c, { from: 150, to: 58, dur: 0.26, at: 0.03, type: 'sine', gain: 0.13 })
}

/** Out of tries: four falling notes, the sad-trombone shape. */
export function playFail() {
  const c = audio()
  if (!c) return
  const notes = [233.08, 220, 207.65, 174.61] // Bb3 A3 Ab3 F3
  notes.forEach((f, i) =>
    tone(c, {
      from: f,
      to: f * 0.985,
      dur: i === notes.length - 1 ? 0.42 : 0.16,
      at: i * 0.13,
      type: 'sawtooth',
      gain: 0.09,
      slide: 'lin',
    }),
  )
}

/** Correct, first click: a bright rising third. */
export function playHit(streak = 0) {
  const c = audio()
  if (!c) return
  // each streak step nudges the pair up a semitone, capped so it stays musical
  const step = Math.pow(2, Math.min(streak, 8) / 12)
  tone(c, { from: 587.33 * step, dur: 0.1, type: 'triangle', gain: 0.13 })
  tone(c, { from: 880 * step, dur: 0.24, at: 0.07, type: 'triangle', gain: 0.12 })
}

/** Correct, but it took a few goes. */
export function playHitLate() {
  const c = audio()
  if (!c) return
  tone(c, { from: 440, dur: 0.11, type: 'triangle', gain: 0.12 })
  tone(c, { from: 587.33, dur: 0.2, at: 0.08, type: 'triangle', gain: 0.11 })
}

/** End of a run. */
export function playFinish() {
  const c = audio()
  if (!c) return
  const notes = [523.25, 659.25, 783.99, 1046.5] // C E G C
  notes.forEach((f, i) =>
    tone(c, { from: f, dur: i === 3 ? 0.5 : 0.16, at: i * 0.11, type: 'triangle', gain: 0.12 }),
  )
}

/** Field notes: a soft tick when you open an area. */
export function playTick() {
  const c = audio()
  if (!c) return
  tone(c, { from: 720, to: 880, dur: 0.07, type: 'sine', gain: 0.07 })
}
