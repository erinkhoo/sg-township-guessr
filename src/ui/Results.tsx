import { useMemo, useState } from 'react'
import { BY_ID, type Area } from '../data/areas'
import { formatClock, gradeFor, rating, stats } from '../game/engine'
import { MODE_LABEL } from '../game/storage'
import type { GameState, Outcome } from '../game/types'

const SQUARE: Record<Outcome, string> = { first: '🟩', retry: '🟨', revealed: '🟥' }
const MARK: Record<Outcome, string> = { first: 'first click', retry: 'found', revealed: 'missed' }

type Props = {
  state: GameState
  elapsed: number
  onAgain: () => void
  onMenu: () => void
}

export function Results({ state, elapsed, onAgain, onMenu }: Props) {
  const [copied, setCopied] = useState(false)
  const s = stats(state)
  const timed = state.config.mode === 'timeattack'
  const grade = gradeFor(rating(state))

  const rows = useMemo(
    () =>
      state.queue
        .map((id) => BY_ID[id])
        .filter(Boolean)
        .sort((a: Area, b: Area) => a.ref.localeCompare(b.ref) || a.name.localeCompare(b.name)),
    [state.queue],
  )

  const share = () => {
    const grid = state.queue
      .map((id) => (state.results[id] ? SQUARE[state.results[id]] : '⬜'))
      .reduce<string[]>((acc, sq, i) => {
        const r = Math.floor(i / 11)
        acc[r] = (acc[r] ?? '') + sq
        return acc
      }, [])
      .join('\n')

    const scopeLabel = state.config.scope === 'all' ? 'whole island' : state.config.scope.toLowerCase()
    const head = `Singapore Township Guessr — ${MODE_LABEL[state.config.mode]}, ${scopeLabel}`
    const line = timed
      ? `${s.completed}/${state.queue.length} in ${formatClock(elapsed)} · ${s.accuracy}% first click`
      : `${state.score.toLocaleString()} pts · ${s.completed}/${state.queue.length} · ${s.accuracy}% first click`

    navigator.clipboard
      ?.writeText(`${head}\n${line}\n\n${grid}\n\n${window.location.origin}`)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2200)
      })
      .catch(() => setCopied(false))
  }

  return (
    <div className="results">
      <div className="results-inner">
        <div className="plate-stamp">
          <span>Survey complete</span>
        </div>

        <h2 className="results-grade">{grade.title}</h2>
        <p className="results-note">{grade.note}</p>

        <dl className="results-stats">
          <div>
            <dt>{timed ? 'Time' : 'Score'}</dt>
            <dd>{timed ? formatClock(elapsed) : state.score.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Found</dt>
            <dd>
              {s.completed - s.revealed}
              <span className="hud-of">/{state.queue.length}</span>
            </dd>
          </div>
          <div>
            <dt>First click</dt>
            <dd>
              {s.accuracy}
              <span className="hud-of">%</span>
            </dd>
          </div>
          <div>
            <dt>Best streak</dt>
            <dd>×{state.bestStreak}</dd>
          </div>
        </dl>

        <div className="results-actions">
          <button type="button" className="btn btn-primary" onClick={onAgain}>
            Run it again
          </button>
          <button type="button" className="btn btn-ghost" onClick={share}>
            {copied ? 'Copied' : 'Copy result'}
          </button>
          <button type="button" className="btn btn-ghost btn-quiet" onClick={onMenu}>
            Change mode
          </button>
        </div>

        <h3 className="sheet-title">The sheet</h3>
        <ul className="sheet">
          {rows.map((a) => {
            const o = state.results[a.id]
            return (
              <li key={a.id} className={o ? `sheet-${o}` : 'sheet-skipped'}>
                <span className="sheet-ref">{a.ref}</span>
                <span className="sheet-name">{a.name}</span>
                <span className="sheet-mark">{o ? MARK[o] : 'not reached'}</span>
                <p className="sheet-blurb">{a.blurb}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
