/**
 * Breadcrumb bar (story 10.3): vault › project › topic — click navigates
 * back up; back/forward walk the bounded node-history stack.
 */
import { useAtlas } from '../../stores/atlas'
import { breadcrumbsFor } from './atlas-visibility'

export function AtlasBreadcrumbs(): React.JSX.Element | null {
  const level = useAtlas((s) => s.level)
  const scope = useAtlas((s) => s.scope)
  const history = useAtlas((s) => s.history)
  const historyIndex = useAtlas((s) => s.historyIndex)
  const navigate = useAtlas((s) => s.navigate)
  const back = useAtlas((s) => s.back)
  const forward = useAtlas((s) => s.forward)

  const crumbs = breadcrumbsFor({ level, scope })
  return (
    <nav className="atlas-breadcrumbs" aria-label="Atlas position">
      <button
        type="button"
        className="atlas-history-button"
        title="Back (⌘[)"
        aria-label="Back"
        disabled={historyIndex <= 0}
        onClick={() => void back()}
      >
        ‹
      </button>
      <button
        type="button"
        className="atlas-history-button"
        title="Forward (⌘])"
        aria-label="Forward"
        disabled={historyIndex >= history.length - 1}
        onClick={() => void forward()}
      >
        ›
      </button>
      {crumbs.map((crumb, i) => (
        <span key={crumb.label} className="atlas-crumb-wrap">
          {i > 0 && <span className="atlas-crumb-sep">›</span>}
          {crumb.target ? (
            <button
              type="button"
              className="atlas-crumb"
              onClick={() => {
                const t = crumb.target
                if (t) void navigate(t.level, t.project ? { project: t.project } : {})
              }}
            >
              {crumb.label}
            </button>
          ) : (
            <span className="atlas-crumb atlas-crumb-current" aria-current="location">
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}
