import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ALL_IDS, AREAS, BY_ID, REGION_BBOX, VIEW_H, VIEW_W, type Area } from './data/areas'
import { createGame, currentId, elapsedMs, reduce, stats } from './game/engine'
import { MODE_LABEL, buildQueue, commitRun, load, resetSave, type Save } from './game/storage'
import type { Action, Config, GameState } from './game/types'
import { viewBearing, viewDistanceKm } from './lib/geo'
import { MapView, type MapHandle } from './map/MapView'
import type { Box } from './map/useCamera'
import { Hud } from './ui/Hud'
import { Prompt } from './ui/Prompt'
import { Results } from './ui/Results'
import { RevealCard } from './ui/RevealCard'
import { StartScreen } from './ui/StartScreen'

const FULL_BOX: Box = [0, 0, VIEW_W, VIEW_H]
const scopeBox = (scope: Config['scope']): Box =>
  scope === 'all' || scope === 'weak' ? FULL_BOX : ((REGION_BBOX[scope] as Box) ?? FULL_BOX)

export default function App() {
  const [save, setSave] = useState<Save>(load)
  const [game, setGame] = useState<GameState | null>(null)
  const [inspect, setInspect] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const mapRef = useRef<MapHandle>(null)
  const committed = useRef(false)

  const act = useCallback((a: Action) => setGame((g) => (g ? reduce(g, a) : g)), [])

  const mode = game?.config.mode
  const over = game?.status === 'over'

  // Only time attack needs a running clock; everything else reads it once at the end.
  useEffect(() => {
    if (!game || over || mode !== 'timeattack') return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [game, over, mode])

  const inScope = useMemo(() => new Set(game?.queue ?? ALL_IDS), [game])
  const targetId = game ? currentId(game) : undefined
  const target: Area | undefined = targetId ? BY_ID[targetId] : undefined
  const s = game ? stats(game) : null
  const elapsed = game ? elapsedMs(game, now) : 0
  const finished = over && !game?.card

  useEffect(() => {
    if (game && game.status === 'over' && !committed.current) {
      committed.current = true
      setSave(commitRun(game, elapsedMs(game, Date.now())))
    }
  }, [game])

  // --- flow -----------------------------------------------------------------
  const start = useCallback(
    (config: Config) => {
      const queue = buildQueue(config.scope, save)
      committed.current = false
      setInspect(null)
      setNow(Date.now())
      setGame(createGame(config, queue, Date.now()))
      requestAnimationFrame(() => mapRef.current?.fit(scopeBox(config.scope)))
    },
    [save],
  )

  const toMenu = useCallback(() => {
    setGame(null)
    setInspect(null)
    requestAnimationFrame(() => mapRef.current?.fit(FULL_BOX))
  }, [])

  const onPick = useCallback(
    (id: string | null, world: { x: number; y: number }) => {
      if (!game) return

      if (game.config.mode === 'learn') {
        if (id) setInspect(id)
        return
      }
      // Open water and out-of-scope regions give nothing away, so they cost nothing.
      if (!id || !inScope.has(id) || game.card || game.status === 'over' || !target) return

      act({
        type: 'guess',
        id,
        x: world.x,
        y: world.y,
        now: Date.now(),
        km: viewDistanceKm(world, { x: target.cx, y: target.cy }),
        bearing: viewBearing(world, { x: target.cx, y: target.cy }),
      })
    },
    [game, inScope, target, act],
  )

  const next = useCallback(() => act({ type: 'next', now: Date.now() }), [act])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!game) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'Escape') {
        e.preventDefault()
        if (inspect) setInspect(null)
        else toMenu()
        return
      }
      if (game.config.mode === 'learn') return
      if ((e.key === ' ' || e.key === 'Enter') && game.card) {
        e.preventDefault()
        next()
      } else if (e.key.toLowerCase() === 'h' && !game.card) {
        act({ type: 'hint' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game, inspect, next, act, toMenu])

  const cardArea = game?.card ? BY_ID[game.card.id] : null
  const inspectArea = inspect ? BY_ID[inspect] : null
  const learn = mode === 'learn'

  return (
    <div className="app" data-screen={!game ? 'menu' : finished ? 'results' : 'play'}>
      <div className="stage">
        <MapView
          ref={mapRef}
          areas={AREAS}
          inScope={inScope}
          results={game?.results ?? {}}
          misses={game?.misses ?? []}
          revealId={game?.card?.id ?? inspect}
          interactive={!!game && !finished}
          labelAll={learn}
          onPick={onPick}
        />
      </div>

      {!game && (
        <div className="overlay overlay-menu">
          <StartScreen save={save} onStart={start} onReset={() => setSave(resetSave())} />
        </div>
      )}

      {game && !finished && (
        <>
          <header className="topbar">
            <button type="button" className="crumb" onClick={toMenu}>
              <span aria-hidden>←</span> <span className="crumb-name">Township Guessr</span>
            </button>
            <span className="topbar-mode">
              {MODE_LABEL[game.config.mode]}
              <span className="dot" />
              {game.config.scope === 'all' ? 'whole island' : game.config.scope.toLowerCase()}
            </span>
          </header>

          <div className="rail">
            {learn ? (
              <section className="prompt">
                <div className="prompt-eyebrow">Field notes</div>
                <h2 className="prompt-name">Tap anything</h2>
                <p className="prompt-hint">
                  Nothing is scored here. Work across the island, read what each area is known for,
                  then go back and try Classic.
                </p>
              </section>
            ) : (
              <>
                <Prompt
                  area={target}
                  tries={game.misses.length}
                  hinted={game.hinted}
                  hint={target?.hint ?? ''}
                  onHint={() => act({ type: 'hint' })}
                  onGiveUp={() => act({ type: 'giveup', now: Date.now() })}
                  frozen={!!game.card}
                />
                <Hud state={game} completed={s!.completed} accuracy={s!.accuracy} elapsed={elapsed} />
              </>
            )}

            {cardArea && game.card && (
              <RevealCard
                area={cardArea}
                card={game.card}
                onNext={next}
                last={game.idx + 1 >= game.queue.length || game.status === 'over'}
              />
            )}

            {learn && inspectArea && (
              <aside className="reveal reveal-first" role="status">
                <header className="reveal-head">
                  <span className="reveal-verdict">{inspectArea.region}</span>
                  <span className="reveal-points">grid {inspectArea.ref}</span>
                </header>
                <h3 className="reveal-name">{inspectArea.name}</h3>
                <p className="reveal-blurb">{inspectArea.blurb}</p>
                {inspectArea.fact && <p className="reveal-fact">{inspectArea.fact}</p>}
              </aside>
            )}
          </div>
        </>
      )}

      {game && finished && (
        <div className="overlay overlay-results">
          <Results state={game} elapsed={elapsed} onAgain={() => start(game.config)} onMenu={toMenu} />
        </div>
      )}
    </div>
  )
}
