/**
 * Faceted search view (story 2.4): full-text via the lib's searchVault, facet
 * dropdowns aggregated from vault frontmatter, highlighted snippets, Enter →
 * reader. Same vault.search backend as the Cmd+K palette.
 */
import { useEffect, useRef, useState } from 'react'
import type { SearchHit } from '../../../../shared/ipc-contract'
import type { Facets } from '../../../../shared/types'
import { humanizeTitle } from '../../humanize'
import { openSearchResult, useSearch } from '../../stores/search'
import { clampSelection, moveSelection, splitForHighlight } from './palette-nav'

export function Highlight({ text, query }: { text: string; query: string }): React.JSX.Element {
  return (
    <>
      {splitForHighlight(text, query).map((part, i) =>
        part.hit ? (
          // biome-ignore lint: order is stable per text
          <mark key={i}>{part.text}</mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  )
}

function FacetSelect({
  label,
  facetKey,
  options,
}: {
  label: string
  facetKey: keyof Facets
  options: string[]
}): React.JSX.Element | null {
  const value = useSearch((s) => s.facets[facetKey] ?? '')
  const setFacet = useSearch((s) => s.setFacet)
  if (options.length === 0) return null
  return (
    <label className="facet">
      <span>{label}</span>
      <select value={value} onChange={(e) => setFacet(facetKey, e.target.value)}>
        <option value="">any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

function ResultRow({
  hit,
  query,
  selected,
}: {
  hit: SearchHit
  query: string
  selected: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="search-row"
      aria-current={selected}
      title={hit.path}
      onClick={() => openSearchResult(hit.path)}
    >
      {/* story 17.1: humanized title; the real filename rides the tooltip
          and the date already renders in the meta line below */}
      <span className="search-row-title">
        <Highlight text={humanizeTitle(hit.name)} query={query} />
      </span>
      <span className="search-row-meta">
        {hit.project || 'product'} · {hit.kind}
        {hit.topic ? ` · ${hit.topic}` : ''}
        {hit.date ? ` · ${hit.date}` : ''} · {hit.status}
      </span>
      <span className="search-row-snippet">
        <Highlight text={hit.excerpt} query={query} />
      </span>
    </button>
  )
}

export function SearchView(): React.JSX.Element {
  const q = useSearch((s) => s.q)
  const hits = useSearch((s) => s.hits)
  const values = useSearch((s) => s.values)
  const searching = useSearch((s) => s.searching)
  const error = useSearch((s) => s.error)
  const setQuery = useSearch((s) => s.setQuery)
  const loadFacetValues = useSearch((s) => s.loadFacetValues)
  const [sel, setSel] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!values) void loadFacetValues()
    inputRef.current?.focus()
  }, [values, loadFacetValues])

  const list = hits ?? []
  const selected = clampSelection(sel, list.length)

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setSel(moveSelection(selected, list.length, e.key))
    } else if (e.key === 'Enter' && list.length > 0) {
      const hit = list[selected === -1 ? 0 : selected]
      if (hit) openSearchResult(hit.path)
    }
  }

  return (
    <div className="search">
      <div className="board-header">
        <span className="pane-list-title">Search</span>
      </div>
      <div className="search-controls">
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search the vault…"
          value={q}
          onChange={(e) => {
            setSel(-1)
            setQuery(e.target.value)
          }}
          onKeyDown={onKeyDown}
        />
        <div className="facet-row">
          <FacetSelect label="project" facetKey="project" options={values?.projects ?? []} />
          <FacetSelect label="topic" facetKey="topic" options={values?.topics ?? []} />
          <FacetSelect label="type" facetKey="type" options={values?.types ?? []} />
          <FacetSelect label="status" facetKey="status" options={values?.statuses ?? []} />
          <FacetSelect label="from" facetKey="from" options={values?.projects ?? []} />
          <FacetSelect label="to" facetKey="to" options={values?.projects ?? []} />
        </div>
      </div>
      {error && <div className="note-error">{error}</div>}
      {hits === null ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>Ask the vault anything — no grep required.</p>
        </div>
      ) : hits.length === 0 && !searching ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>No notes match this search.</p>
        </div>
      ) : (
        <div className="search-results" role="listbox" aria-label="Search results">
          {list.map((hit, i) => (
            <ResultRow key={hit.path} hit={hit} query={q} selected={i === selected} />
          ))}
        </div>
      )}
    </div>
  )
}
