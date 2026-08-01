import { formatClock } from '../game/engine'
import type { GameState } from '../game/types'

type Props = {
  state: GameState
  completed: number
  accuracy: number
  elapsed: number
}

export function Hud({ state, completed, accuracy, elapsed }: Props) {
  const timed = state.config.mode === 'timeattack'
  return (
    <dl className="hud">
      <div className="hud-cell">
        <dt>Found</dt>
        <dd>
          {completed}
          <span className="hud-of">/{state.queue.length}</span>
        </dd>
      </div>
      <div className="hud-cell">
        <dt>{timed ? 'Clock' : 'Score'}</dt>
        <dd>{timed ? formatClock(elapsed) : state.score.toLocaleString()}</dd>
      </div>
      <div className="hud-cell">
        <dt>First try</dt>
        <dd>
          {accuracy}
          <span className="hud-of">%</span>
        </dd>
      </div>
      <div className="hud-cell" data-hot={state.streak >= 3 || undefined}>
        <dt>Streak</dt>
        <dd>×{state.streak}</dd>
      </div>
    </dl>
  )
}
