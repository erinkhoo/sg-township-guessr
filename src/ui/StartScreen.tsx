import { useState } from 'react'
import { AREAS, IDS_BY_REGION, REGIONS } from '../data/areas'
import { formatClock } from '../game/engine'
import { recordKey, weakIds, type Save } from '../game/storage'
import type { Config, Mode, Scope } from '../game/types'

const MODES: { id: Mode; name: string; line: string }[] = [
  { id: 'classic', name: 'Classic', line: 'Three tries an area. Points for finding it fast.' },
  { id: 'timeattack', name: 'Time attack', line: 'Clear the board against the clock. Each miss costs ten seconds.' },
  { id: 'sudden', name: 'Sudden death', line: 'One wrong click and the run is finished.' },
  { id: 'learn', name: 'Field notes', line: 'No score. Tap anything and read what it is known for.' },
]

const SCOPES: { id: Scope; name: string }[] = [
  { id: 'all', name: 'Whole island' },
  ...REGIONS.map((r) => ({ id: r as Scope, name: r })),
  { id: 'weak', name: 'Weak spots' },
]

type Props = {
  save: Save
  onStart: (c: Config) => void
  onReset: () => void
}

export function StartScreen({ save, onStart, onReset }: Props) {
  const [mode, setMode] = useState<Mode>('classic')
  const [scope, setScope] = useState<Scope>('all')

  const count =
    scope === 'all' ? AREAS.length : scope === 'weak' ? weakIds(save).length : IDS_BY_REGION[scope].length
  const rec = save.records[recordKey({ mode, scope })]
  const seen = Object.keys(save.mastery).length

  return (
    <div className="start">
      <div className="start-inner">
        <p className="start-eyebrow">Urban Redevelopment Authority · Master Plan 2019</p>
        <h1 className="wordmark">
          <span>Township</span>
          <span className="wordmark-2">Guessr</span>
        </h1>
        <p className="start-lede">
          Fifty-five planning areas. Real boundaries, straight off the Master Plan. We name one, you
          find it on the island.
        </p>

        <fieldset className="picker">
          <legend>Mode</legend>
          <div className="mode-grid">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`mode-card${mode === m.id ? ' is-on' : ''}`}
                onClick={() => setMode(m.id)}
                aria-pressed={mode === m.id}
              >
                <span className="mode-name">{m.name}</span>
                <span className="mode-line">{m.line}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="picker">
          <legend>Where</legend>
          <div className="chips">
            {SCOPES.map((s) => {
              const n = s.id === 'all' ? AREAS.length : s.id === 'weak' ? weakIds(save).length : IDS_BY_REGION[s.id].length
              const dead = s.id === 'weak' && seen === 0
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`chip${scope === s.id ? ' is-on' : ''}`}
                  onClick={() => setScope(s.id)}
                  aria-pressed={scope === s.id}
                  title={dead ? 'Play a round first and this fills with the ones you miss' : undefined}
                >
                  {s.name}
                  <span className="chip-n">{n}</span>
                </button>
              )
            })}
          </div>
          {scope === 'weak' && (
            <p className="picker-note">
              {seen === 0
                ? 'Nothing tracked yet. This starts as a fifteen-area sampler and re-sorts itself around whatever you keep missing.'
                : 'The fifteen you get wrong most often, worst first.'}
            </p>
          )}
        </fieldset>

        <div className="start-go">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => onStart({ mode, scope })}>
            Start · {count} areas
          </button>
          {rec && mode !== 'learn' && (
            <p className="start-record">
              Best {mode === 'timeattack' && rec.bestTimeMs ? formatClock(rec.bestTimeMs) : `${rec.bestScore.toLocaleString()} pts`}
              <span className="dot" />
              {rec.plays} {rec.plays === 1 ? 'run' : 'runs'}
            </p>
          )}
        </div>

        <footer className="start-foot">
          <p>
            Drag to pan, scroll or pinch to zoom. The city core is magnified in the corner plate, the
            way a street directory would do it.
          </p>
          {seen > 0 && (
            <button type="button" className="linkish" onClick={onReset}>
              Clear saved progress
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
