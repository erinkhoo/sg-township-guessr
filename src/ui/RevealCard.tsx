import type { Area } from '../data/areas'
import type { Card } from '../game/types'

const HEADLINE: Record<Card['outcome'], string> = {
  first: 'Straight away',
  retry: 'Got there',
  revealed: 'This one',
}

type Props = {
  area: Area
  card: Card
  onNext: () => void
  last: boolean
}

export function RevealCard({ area, card, onNext, last }: Props) {
  return (
    <aside className={`reveal reveal-${card.outcome}`} role="status">
      <header className="reveal-head">
        <span className="reveal-verdict">{HEADLINE[card.outcome]}</span>
        <span className="reveal-points">
          {card.outcome === 'revealed' ? 'no points' : `+${card.points}`}
        </span>
      </header>

      <h3 className="reveal-name">{area.name}</h3>
      <p className="reveal-meta">
        <span>{area.region}</span>
        <span className="dot" />
        <span>grid {area.ref}</span>
      </p>

      <p className="reveal-blurb">{area.blurb}</p>
      {area.fact && <p className="reveal-fact">{area.fact}</p>}

      <button type="button" className="btn btn-primary reveal-next" onClick={onNext} autoFocus>
        {last ? 'See results' : 'Next'}
        <kbd>space</kbd>
      </button>
    </aside>
  )
}
