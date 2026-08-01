import type { Area } from '../data/areas'
import { MAX_TRIES } from '../game/types'

type Props = {
  area: Area | undefined
  tries: number
  hinted: boolean
  hint: string
  onHint: () => void
  onGiveUp: () => void
  frozen: boolean
}

export function Prompt({ area, tries, hinted, hint, onHint, onGiveUp, frozen }: Props) {
  const left = MAX_TRIES - tries
  return (
    <section className="prompt" aria-live="polite">
      <div className="prompt-eyebrow">Find this planning area</div>
      <h2 className="prompt-name" key={area?.id}>
        {area?.name ?? '—'}
      </h2>

      <div className="prompt-tries" data-warn={tries > 0 || undefined}>
        {Array.from({ length: MAX_TRIES }, (_, i) => (
          <span key={i} className={`pip${i < tries ? ' is-spent' : ''}`} />
        ))}
        <span className="prompt-tries-text">
          {tries === 0
            ? 'Full marks on the first click'
            : left === 0
              ? 'Out of tries'
              : `${left} ${left === 1 ? 'try' : 'tries'} left`}
        </span>
      </div>

      {hinted && hint && <p className="prompt-hint">{hint}</p>}

      <div className="prompt-actions">
        <button type="button" className="btn btn-ghost" onClick={onHint} disabled={hinted || frozen}>
          {hinted ? 'Hint used' : 'Hint · half points'}
        </button>
        <button type="button" className="btn btn-ghost btn-quiet" onClick={onGiveUp} disabled={frozen}>
          Show me
        </button>
      </div>
    </section>
  )
}
