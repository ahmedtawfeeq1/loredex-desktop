/**
 * Deep Dive self-explanation bar (Atlas reframe WP3, spec §Deep Dive). Sits
 * above the lineage graph: a persistent one-line PURPOSE header + a tiny
 * always-visible inline KEY (arrow = handoff · thickness = volume · dot = open ·
 * dashed = affinity). This is the on-sight explanation the `?` legend modal used
 * to be the only home for. Content is the pure deep-dive-intro model.
 */
import { DEEP_KEY_ITEMS, DEEP_PURPOSE } from './deep-dive-intro'

export function DeepDiveIntro(): React.JSX.Element {
  return (
    <div className="atlas-deep-intro">
      <p className="atlas-deep-purpose">{DEEP_PURPOSE}</p>
      <ul className="atlas-deep-key" aria-label="Map key">
        {DEEP_KEY_ITEMS.map((item) => (
          <li key={item.meaning} className={`atlas-deep-key-item atlas-deep-key-${item.meaning}`}>
            <span className="atlas-deep-key-mark" aria-hidden>
              {item.mark}
            </span>
            <span className="atlas-deep-key-meaning">{item.meaning}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
