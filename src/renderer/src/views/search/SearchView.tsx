/**
 * Search view (story 2.4, upgraded epic22 / D1 amendment 7 §B). Beyond substring:
 * a client-side operator parser (project:/topic:/type:/status:/tag:/from:/to:/
 * before:/after:/on: + bare terms) drives ONE query string that is the source of
 * truth. Parsed filters render as removable chips AND sync to the existing facet
 * selects (both mutate the query). Ranked results carry a project tint dot,
 * humanized title, matched-term-highlighted snippet, meta, count, keyboard nav,
 * and a group-by-project toggle. Recent + saved searches chip in when idle. Same
 * vault.search backend as the ⌘K palette.
 */
import { useEffect, useRef, useState } from 'react'
import type { SearchHit } from '../../../../shared/ipc-contract'
import { BrandMark } from '../../components/BrandMark'
import { humanizeTitle } from '../../humanize'
import { openSearchResult, useSearch } from '../../stores/search'
import { sectionTint } from '../reader/sectionTint'
import { clampSelection, moveSelection, splitForHighlight } from './palette-nav'
import {
  activeFilters,
  groupHitsByProject,
  type OperatorKey,
  type ParsedFilters,
} from './query-parser'

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

/** A parsed operator as a removable chip; × clears it from the query string. */
function FilterChip({ opKey, value }: { opKey: OperatorKey; value: string }): React.JSX.Element {
  const setFilter = useSearch((s) => s.setFilter)
  return (
    <span className="search-chip">
      <span className="search-chip-key">{opKey}:</span>
      <span className="search-chip-val">{value}</span>
      <button
        type="button"
        className="search-chip-x"
        aria-label={`Remove ${opKey} filter`}
        onClick={() => setFilter(opKey, '')}
      >
        ×
      </button>
    </span>
  )
}

/** Facet select mirrors the parsed operator and writes back to the query. */
function FacetSelect({
  label,
  facetKey,
  filters,
  options,
}: {
  label: string
  facetKey: OperatorKey
  filters: ParsedFilters
  options: string[]
}): React.JSX.Element | null {
  const setFilter = useSearch((s) => s.setFilter)
  if (options.length === 0) return null
  return (
    <label className="facet">
      <span>{label}</span>
      <select value={filters[facetKey] ?? ''} onChange={(e) => setFilter(facetKey, e.target.value)}>
        <option value="">Any</option>
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
  onOpen,
}: {
  hit: SearchHit
  query: string
  selected: boolean
  onOpen: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="search-row"
      aria-current={selected}
      title={hit.path}
      onClick={onOpen}
    >
      <span className="search-row-title">
        {/* project tint dot (deterministic, shared with the tree) */}
        <span
          className="file-search-dot"
          aria-hidden
          style={{ '--section-color': sectionTint(hit.project) } as React.CSSProperties}
        />
        {/* story 17.1: humanized title; the real filename rides the tooltip */}
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

/** Recent + saved query chips, shown on the idle (empty-result) state. */
function QuickChips(): React.JSX.Element | null {
  const recent = useSearch((s) => s.recentSearches)
  const saved = useSearch((s) => s.savedSearches)
  const setQuery = useSearch((s) => s.setQuery)
  if (recent.length === 0 && saved.length === 0) return null
  return (
    <div className="search-quick">
      {saved.length > 0 && (
        <div className="search-quick-group">
          <span className="search-quick-label">Saved</span>
          {saved.map((q) => (
            <button
              key={q}
              type="button"
              className="search-quick-chip is-saved"
              onClick={() => setQuery(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <div className="search-quick-group">
          <span className="search-quick-label">Recent</span>
          {recent.map((q) => (
            <button
              key={q}
              type="button"
              className="search-quick-chip"
              onClick={() => setQuery(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The operator vocabulary, shown as a compact legend on the idle state. */
const OPERATORS: [string, string][] = [
  ['project', 'scope to a project'],
  ['type', 'note · handoff · brief'],
  ['status', 'open · active · consumed'],
  ['from', 'handoff sender'],
  ['to', 'handoff recipient'],
  ['before', 'dated before'],
  ['after', 'dated after'],
  ['tag', 'a frontmatter tag'],
]

/** Example queries seeded from THIS vault's real facet values, so the idle
 *  state teaches the operators the placeholder hints at — and each one runs. */
function buildExamples(values: ReturnType<typeof useSearch.getState>['values']): string[] {
  const ex: string[] = []
  const proj = values?.projects?.[0]
  if (proj) ex.push(`project:${proj}`)
  if (values?.types?.includes('handoff')) ex.push('type:handoff status:open')
  const topic = values?.topics?.[0]
  if (topic) ex.push(`topic:${topic}`)
  if (proj && values?.projects?.[1]) ex.push(`from:${values.projects[1]} to:${proj}`)
  return ex.slice(0, 4)
}

/** Idle state (no query yet): brand icon, lede, runnable examples, operator
 *  legend, then recent/saved chips — the Reader empty-state pattern, richer. */
function IdleEmpty(): React.JSX.Element {
  const values = useSearch((s) => s.values)
  const setQuery = useSearch((s) => s.setQuery)
  const examples = buildExamples(values)
  return (
    <div className="search-idle">
      <div className="empty-state search-empty">
        <div className="empty-state-icon">
          <BrandMark size={40} />
        </div>
        <p>Search everything in the vault.</p>
        <span className="empty-state-hint">
          Notes, briefs, and handoffs — combine operators and facets, no grep required.
        </span>
        {examples.length > 0 && (
          <div className="search-examples" aria-label="Example searches">
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                className="search-example"
                onClick={() => setQuery(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
        )}
        <div className="search-operators" aria-label="Search operators">
          {OPERATORS.map(([key, desc]) => (
            <span key={key} className="search-op">
              <code>{key}:</code>
              <span>{desc}</span>
            </span>
          ))}
        </div>
      </div>
      <QuickChips />
    </div>
  )
}

export function SearchView(): React.JSX.Element {
  const q = useSearch((s) => s.q)
  const parsed = useSearch((s) => s.parsed)
  const hits = useSearch((s) => s.hits)
  const values = useSearch((s) => s.values)
  const searching = useSearch((s) => s.searching)
  const error = useSearch((s) => s.error)
  const groupBy = useSearch((s) => s.groupByProject)
  const setQuery = useSearch((s) => s.setQuery)
  const setFilter = useSearch((s) => s.setFilter)
  const toggleGroup = useSearch((s) => s.toggleGroupByProject)
  const recordSearch = useSearch((s) => s.recordSearch)
  const toggleSaved = useSearch((s) => s.toggleSaved)
  const saved = useSearch((s) => s.savedSearches)
  const loadFacetValues = useSearch((s) => s.loadFacetValues)
  const [sel, setSel] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!values) void loadFacetValues()
    inputRef.current?.focus()
  }, [values, loadFacetValues])

  const list = hits ?? []
  const selected = clampSelection(sel, list.length)
  const filters = parsed.filters
  const chips = activeFilters(filters)

  function open(hit: SearchHit): void {
    recordSearch()
    openSearchResult(hit.path)
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setSel(moveSelection(selected, list.length, e.key))
    } else if (e.key === 'Enter' && list.length > 0) {
      const hit = list[selected === -1 ? 0 : selected]
      if (hit) open(hit)
    }
  }

  // flat, rank-ordered index so keyboard nav is stable whether grouped or not
  const flat = groupBy ? groupHitsByProject(list).flatMap((g) => g.hits) : list
  const indexOf = new Map(flat.map((h, i) => [h.path, i]))
  const groups = groupBy ? groupHitsByProject(list) : [{ project: '', hits: list }]

  return (
    <div className="search">
      <div className="board-header">
        <span className="pane-list-title">Search</span>
        {list.length > 0 && (
          <span className="search-count">
            {list.length} result{list.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="search-controls">
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search the vault — try project:nimbus-backend before:2026-07-01 auth…"
          value={q}
          onChange={(e) => {
            setSel(-1)
            setQuery(e.target.value)
          }}
          onKeyDown={onKeyDown}
        />
        {chips.length > 0 && (
          <div className="search-chips">
            {chips.map(([opKey, value]) => (
              <FilterChip key={opKey} opKey={opKey} value={value} />
            ))}
          </div>
        )}
        <div className="facet-row">
          <FacetSelect
            label="project"
            facetKey="project"
            filters={filters}
            options={values?.projects ?? []}
          />
          <FacetSelect
            label="topic"
            facetKey="topic"
            filters={filters}
            options={values?.topics ?? []}
          />
          <FacetSelect label="type" facetKey="type" filters={filters} options={values?.types ?? []} />
          <FacetSelect
            label="status"
            facetKey="status"
            filters={filters}
            options={values?.statuses ?? []}
          />
          <FacetSelect
            label="from"
            facetKey="from"
            filters={filters}
            options={values?.projects ?? []}
          />
          <FacetSelect label="to" facetKey="to" filters={filters} options={values?.projects ?? []} />
          <div className="facet-spacer" />
          {list.length > 0 && (
            <button
              type="button"
              className={`facet-toggle${groupBy ? ' is-on' : ''}`}
              aria-pressed={groupBy}
              onClick={toggleGroup}
            >
              Group by project
            </button>
          )}
          {q.trim() && (
            <button
              type="button"
              className={`facet-toggle${saved.includes(q.trim()) ? ' is-on' : ''}`}
              onClick={() => toggleSaved(q)}
            >
              Save search
            </button>
          )}
        </div>
      </div>
      {error && <div className="note-error">{error}</div>}
      {hits === null ? (
        <IdleEmpty />
      ) : hits.length === 0 && !searching ? (
        <div className="empty-state search-empty">
          <div className="empty-state-icon">
            <BrandMark size={40} />
          </div>
          <p>No notes match this search.</p>
          <span className="empty-state-hint">
            Loosen a facet, drop an operator, or check the spelling.
          </span>
        </div>
      ) : (
        <div className="search-results" role="listbox" aria-label="Search results">
          {groups.map((group) => (
            <div key={group.project || '_all'} className="search-group">
              {groupBy && (
                <div className="search-group-head">
                  <span
                    className="file-search-dot"
                    aria-hidden
                    style={{ '--section-color': sectionTint(group.project) } as React.CSSProperties}
                  />
                  {group.project} · {group.hits.length}
                </div>
              )}
              {group.hits.map((hit) => {
                const i = indexOf.get(hit.path) ?? -1
                return (
                  <ResultRow
                    key={hit.path}
                    hit={hit}
                    query={parsed.terms}
                    selected={i === selected}
                    onOpen={() => open(hit)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
