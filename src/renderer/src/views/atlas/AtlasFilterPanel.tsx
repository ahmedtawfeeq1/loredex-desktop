/**
 * Filter panel (story 10.6 AC2): node type, handoff status, topic, edge
 * category, confidence tier — AND-composed, live, with an active count and
 * one-click clear. Facet vocabulary comes from the graph itself.
 */
import { useMemo } from 'react'
import type { AtlasEdgeCategory, AtlasNodeType } from '../../../../shared/types'
import { useAtlas } from '../../stores/atlas'
import { activeFilterCount } from './atlas-filters'

const NODE_TYPES: AtlasNodeType[] = ['project', 'note', 'handoff', 'contract', 'source', 'commit']
const STATUSES = ['open', 'accepted', 'declined', 'snoozed', 'consumed']
const EDGE_CATEGORIES: AtlasEdgeCategory[] = [
  'route',
  'thread',
  'wikilink',
  'provenance',
  'contract-link',
  'affinity',
]

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}): React.JSX.Element {
  return (
    <label className="atlas-filter-check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  )
}

export function AtlasFilterPanel(): React.JSX.Element {
  const graph = useAtlas((s) => s.graph)
  const filters = useAtlas((s) => s.filters)
  const setFilters = useAtlas((s) => s.setFilters)
  const clearFilters = useAtlas((s) => s.clearFilters)
  const setPanel = useAtlas((s) => s.setPanel)

  const topics = useMemo(() => {
    const names = new Set<string>()
    for (const c of graph?.clusters ?? []) {
      for (const t of c.topics) names.add(t.name)
    }
    return [...names].sort()
  }, [graph])

  const active = activeFilterCount(filters)
  return (
    <aside className="atlas-side" aria-label="Atlas filters">
      <div className="atlas-side-head">
        <span className="atlas-side-title">
          Filters{active > 0 ? ` · ${active} active` : ''}
        </span>
        <button type="button" className="atlas-side-close" onClick={() => setPanel(null)} aria-label="Close panel">
          ×
        </button>
      </div>
      {active > 0 && (
        <button type="button" className="atlas-filter-clear" onClick={clearFilters}>
          Clear all filters
        </button>
      )}
      <div className="atlas-filter-group">
        <span className="atlas-filter-title">Node type</span>
        {NODE_TYPES.map((t) => (
          <CheckRow
            key={t}
            label={t}
            checked={filters.nodeTypes.includes(t)}
            onChange={() => setFilters({ nodeTypes: toggle(filters.nodeTypes, t) })}
          />
        ))}
      </div>
      <div className="atlas-filter-group">
        <span className="atlas-filter-title">Handoff status</span>
        {STATUSES.map((s) => (
          <CheckRow
            key={s}
            label={s}
            checked={filters.statuses.includes(s)}
            onChange={() => setFilters({ statuses: toggle(filters.statuses, s) })}
          />
        ))}
      </div>
      {topics.length > 0 && (
        <div className="atlas-filter-group">
          <span className="atlas-filter-title">Topic</span>
          {topics.map((t) => (
            <CheckRow
              key={t}
              label={t}
              checked={filters.topics.includes(t)}
              onChange={() => setFilters({ topics: toggle(filters.topics, t) })}
            />
          ))}
        </div>
      )}
      <div className="atlas-filter-group">
        <span className="atlas-filter-title">Edge category</span>
        {EDGE_CATEGORIES.map((c) => (
          <CheckRow
            key={c}
            label={c}
            checked={filters.edgeCategories.includes(c)}
            onChange={() => setFilters({ edgeCategories: toggle(filters.edgeCategories, c) })}
          />
        ))}
      </div>
      <div className="atlas-filter-group">
        <span className="atlas-filter-title">Contract-link confidence</span>
        <select
          className="atlas-filter-select"
          value={filters.confidence}
          aria-label="Confidence tier"
          onChange={(e) =>
            setFilters({ confidence: e.target.value as '' | 'mentioned' | 'heuristic' })
          }
        >
          <option value="">both tiers</option>
          <option value="mentioned">mentioned only</option>
          <option value="heuristic">heuristic only</option>
        </select>
      </div>
    </aside>
  )
}
