/**
 * Reader store: vault tree, current note selection + parsed doc (stories
 * 1.4/2.1). `refresh()` is the manual-invalidate seam — story 2.3's
 * `vault.changed` watcher plugs into it (v0.1 scope cut: manual refresh only).
 */
import { startTransition } from 'react'
import { create } from 'zustand'
import type { Doc } from '../../../shared/ipc-contract'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { TreeNode } from '../../../shared/types'
import { invoke, onEvent } from '../api'
import { clearLinkCaches } from '../markdown/resolveCache'
import { useDiagnostics } from './diagnostics'

interface ReaderState {
  tree: TreeNode[] | null
  treeError: string | null
  /** vault-relative path of the open note */
  selected: string | null
  doc: Doc | null
  /** raw data file (agent-ops yaml/json/csv) — mutually exclusive with doc */
  raw: { raw: string; fileType: 'yaml' | 'json' | 'csv' } | null
  /** WP-F: a binary/document file (pdf/xlsx/png/…) that renders in the OS app,
   *  not the in-app reader — shown as a reveal/open card. Mutually exclusive. */
  unsupported: { path: string } | null
  docError: string | null
  /** wikilink targets to render inline beneath the note — set when a handoff
   *  brief is opened from the board (story 3.2, F5 reading order) */
  readingOrder: string[]
  loadTree(retried?: boolean): Promise<void>
  open(path: string, readingOrder?: string[], retriedStale?: boolean): Promise<void>
  /** manual refresh action: re-walk the tree and re-read the open note */
  refresh(): Promise<void>
  reset(): void
}

const errText = (e: unknown): string => (isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e))

/** A note the tree still lists but disk no longer has (e.g. a remote pull moved
 *  or removed it after the tree was walked) — the lib rejects it as outside the
 *  vault or unreadable. We recover by re-walking, not by showing the raw code. */
const isStalePathError = (e: unknown): boolean =>
  isErrEnvelope(e) && e.code === 'VAULT_OUTSIDE_PATH'

export const useReader = create<ReaderState>((set, get) => ({
  tree: null,
  treeError: null,
  selected: null,
  doc: null,
  raw: null,
  unsupported: null,
  docError: null,
  readingOrder: [],

  async loadTree(retried = false) {
    try {
      const tree = await invoke('vault.tree', undefined)
      set({ tree, treeError: null })
    } catch (e) {
      // first-attach port swap drops early invokes — retry once (app.init pattern)
      if (!retried && isErrEnvelope(e) && e.code === 'PORT_SWAPPED') return get().loadTree(true)
      set({ tree: [], treeError: errText(e) })
    }
  },

  async open(path, readingOrder = [], retriedStale = false) {
    set({ selected: path, docError: null, unsupported: null, readingOrder })
    useDiagnostics.getState().clearNote(path) // re-fed as the note re-renders
    try {
      // agent-ops data files (yaml/json/csv) render read-only via vault.readRaw
      if (/\.(ya?ml|json|csv)$/.test(path)) {
        const raw = await invoke('vault.readRaw', { path })
        startTransition(() => set({ raw, doc: null, unsupported: null }))
        return
      }
      // WP-F: a non-note, non-data file (pdf/xlsx/png/…) can't render here —
      // offer Reveal / Open in the OS default app instead of failing to parse it
      if (!/\.md$/.test(path)) {
        set({ unsupported: { path }, doc: null, raw: null })
        return
      }
      const doc = await invoke('vault.readNote', { path })
      // keep the tree responsive while a large note (≤1 MB) renders
      startTransition(() => set({ doc, raw: null, unsupported: null }))
    } catch (e) {
      // stale tree (a pull moved/removed the note after it was walked): re-walk
      // once so disk truth returns, then show a plain message instead of the
      // raw VAULT_OUTSIDE_PATH. Guard against a loop — only self-heal once.
      if (isStalePathError(e) && !retriedStale) {
        await get().loadTree()
        return get().open(path, readingOrder, true)
      }
      set({
        doc: null,
        raw: null,
        docError: isStalePathError(e)
          ? 'This note has moved or was removed since the list was loaded. The file list has been refreshed — pick it again from the tree.'
          : errText(e),
      })
    }
  },

  async refresh() {
    clearLinkCaches() // vault.tree also rebuilds the core-side link index
    useDiagnostics.getState().clear()
    await get().loadTree()
    const { selected, readingOrder } = get()
    if (selected) await get().open(selected, readingOrder)
  },

  reset() {
    clearLinkCaches()
    useDiagnostics.getState().clear()
    set({
      tree: null,
      treeError: null,
      selected: null,
      doc: null,
      raw: null,
      unsupported: null,
      docError: null,
      readingOrder: [],
    })
  },
}))

// Story 9.3 (live refresh): the watcher/poller's vault.changed replaces manual
// refreshes — tree and the open note follow disk truth. `paths: []` = full
// reconcile; a path batch only re-reads when it could touch what's on screen.
// (bridge guard keeps this importable from node unit tests)
if (typeof window !== 'undefined' && window.loredex) {
  onEvent((e) => {
    if (e.kind !== 'vault.changed') return
    const s = useReader.getState()
    if (s.tree === null) return // reader never opened — nothing to refresh
    void s.refresh()
  })
}
