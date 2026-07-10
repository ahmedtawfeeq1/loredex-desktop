/**
 * Properties panel (epic20, D1 amendment 7 §C) — the Notion/Obsidian-style
 * replacement for the flat frontmatter table. Each frontmatter key is a typed
 * row (icon + name + typed value control), inferred from key+value. loredex-
 * managed keys render LOCKED (lock glyph + "managed by loredex" tooltip) — the
 * agents own frontmatter, so they are never user-edited. User fields edit
 * inline and write back through the `note.setFrontmatter` core channel (body
 * untouched, git auto-commit); "+ Add property" and per-row × add/remove user
 * fields; tags are chips that run a `tag:` search. Collapsible, dense, mono.
 */
import { useState } from 'react'
import { invoke } from '../../api'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import {
  emptyValueForType,
  inferPropertyType,
  isManagedKey,
  type PropertyType,
} from '../../../../shared/properties'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { useReader } from '../../stores/reader'
import { useSearch } from '../../stores/search'
import { useApp } from '../../stores/app'
import { useToasts } from '../../stores/toasts'

const TYPE_ICON: Record<PropertyType, string> = {
  date: '◷',
  tags: '#',
  select: '◈',
  url: '↗',
  path: '/',
  text: '¶',
}

const ADD_TYPES: PropertyType[] = ['text', 'date', 'tags', 'select', 'url', 'path']

/** Run a `tag:` search in the Search view (epic22 parses the operator). */
function searchTag(tag: string): void {
  useApp.getState().setView('search')
  useSearch.getState().setQuery(`tag:${tag}`)
}

function asTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function PropertiesPanel({
  meta,
  path,
  defaultCollapsed = false,
}: {
  meta: Record<string, unknown>
  path: string
  /** long notes collapse the panel by default (§C) */
  defaultCollapsed?: boolean
}): React.JSX.Element | null {
  const identity = useIdentity((s) => effectiveIdentity(s))
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [editKey, setEditKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newType, setNewType] = useState<PropertyType>('text')
  const [newVal, setNewVal] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const entries = Object.entries(meta).filter(([, v]) => v !== undefined && v !== null)
  if (entries.length === 0 && !path) return null

  const canEdit = Boolean(identity)

  async function commit(key: string, value: unknown, remove: boolean): Promise<void> {
    if (!identity || busy) return
    setBusy(key)
    setError(null)
    try {
      await invoke('note.setFrontmatter', { path, key, value, remove, identity })
      await useReader.getState().refresh()
      useToasts
        .getState()
        .push(
          remove ? 'Property removed' : 'Property saved',
          `${key} · committed — will push on next sync`,
        )
      setEditKey(null)
      setAdding(false)
      setNewKey('')
      setNewVal('')
    } catch (e) {
      setError(isErrEnvelope(e) ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  function startEdit(key: string, value: unknown): void {
    if (!canEdit) return
    setEditKey(key)
    setDraft(Array.isArray(value) ? value.join(', ') : String(value))
  }

  function addProperty(): void {
    const key = newKey.trim()
    if (!key) return
    if (isManagedKey(key)) {
      setError(`"${key}" is managed by loredex`)
      return
    }
    if (key in meta) {
      setError(`"${key}" already exists`)
      return
    }
    const value =
      newType === 'tags'
        ? asTags(newVal)
        : newVal.trim() === ''
          ? emptyValueForType(newType)
          : newVal
    void commit(key, value, false)
  }

  function renderValue(key: string, value: unknown, type: PropertyType): React.JSX.Element {
    if (type === 'tags') {
      const tags = asTags(value)
      return (
        <span className="prop-tags">
          {tags.map((tag) => (
            <span key={tag} className="prop-tag">
              <button type="button" className="prop-tag-label" onClick={() => searchTag(tag)}>
                {tag}
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="prop-tag-x"
                  title="remove tag"
                  onClick={() =>
                    void commit(
                      key,
                      tags.filter((t) => t !== tag),
                      false,
                    )
                  }
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {canEdit && (
            <input
              className="prop-tag-add"
              placeholder="+ tag"
              onKeyDown={(e) => {
                const v = e.currentTarget.value.trim()
                if (e.key === 'Enter' && v) {
                  e.preventDefault()
                  e.currentTarget.value = ''
                  void commit(key, [...tags, v], false)
                }
              }}
            />
          )}
        </span>
      )
    }
    if (type === 'url') {
      return (
        <a className="prop-link" href={String(value)} target="_blank" rel="noreferrer">
          {String(value)}
        </a>
      )
    }
    if (type === 'select') {
      return <span className={`prop-chip prop-chip-${String(value).toLowerCase()}`}>{String(value)}</span>
    }
    return <span className="prop-value">{String(value)}</span>
  }

  return (
    <div className="properties">
      <button
        type="button"
        className="prop-header"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="prop-caret">{collapsed ? '▸' : '▾'}</span>
        Properties <span className="prop-count">{entries.length}</span>
      </button>
      {!collapsed && (
        <div className="prop-rows">
          {path && (
            <div className="prop-row prop-managed">
              <span className="prop-icon" aria-hidden="true">
                /
              </span>
              <span className="prop-key">file</span>
              <span className="prop-value prop-value-file" title={path}>
                {path}
              </span>
              <span className="prop-lock" title="the note's real path" aria-label="read-only">
                ⚿
              </span>
            </div>
          )}
          {entries.map(([key, value]) => {
            const managed = isManagedKey(key)
            const type = inferPropertyType(key, value)
            const editing = editKey === key
            return (
              <div key={key} className={`prop-row${managed ? ' prop-managed' : ''}`}>
                <span className="prop-icon" aria-hidden="true">
                  {TYPE_ICON[type]}
                </span>
                <span className="prop-key">{key}</span>
                {managed ? (
                  <span className="prop-value">
                    {Array.isArray(value) ? value.join(', ') : String(value)}
                  </span>
                ) : editing ? (
                  <input
                    className="prop-edit"
                    type={type === 'date' ? 'date' : 'text'}
                    autoFocus
                    value={draft}
                    disabled={busy === key}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void commit(key, draft, false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commit(key, draft, false)
                      if (e.key === 'Escape') setEditKey(null)
                    }}
                  />
                ) : type === 'tags' ? (
                  renderValue(key, value, type)
                ) : (
                  <button
                    type="button"
                    className="prop-value-edit"
                    disabled={!canEdit}
                    title={canEdit ? 'click to edit' : 'set an identity in Settings to edit'}
                    onClick={() => startEdit(key, value)}
                  >
                    {renderValue(key, value, type)}
                  </button>
                )}
                {managed ? (
                  <span className="prop-lock" title="managed by loredex" aria-label="locked">
                    ⚿
                  </span>
                ) : (
                  canEdit && (
                    <button
                      type="button"
                      className="prop-remove"
                      title="remove property"
                      disabled={busy === key}
                      onClick={() => void commit(key, undefined, true)}
                    >
                      ×
                    </button>
                  )
                )}
              </div>
            )
          })}
          {error && <div className="prop-error">{error}</div>}
          {adding ? (
            <div className="prop-add-row">
              <input
                className="prop-add-key"
                placeholder="name"
                autoFocus
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              />
              <select
                className="prop-add-type"
                value={newType}
                onChange={(e) => setNewType(e.target.value as PropertyType)}
              >
                {ADD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                className="prop-add-val"
                placeholder={newType === 'tags' ? 'a, b, c' : 'value'}
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addProperty()
                }}
              />
              <button type="button" className="prop-add-go" onClick={addProperty}>
                Add
              </button>
              <button
                type="button"
                className="prop-add-cancel"
                onClick={() => {
                  setAdding(false)
                  setError(null)
                }}
              >
                ×
              </button>
            </div>
          ) : (
            canEdit && (
              <button type="button" className="prop-add" onClick={() => setAdding(true)}>
                + Add property
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
