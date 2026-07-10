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
  docError: string | null
  /** wikilink targets to render inline beneath the note — set when a handoff
   *  brief is opened from the board (story 3.2, F5 reading order) */
  readingOrder: string[]
  loadTree(): Promise<void>
  open(path: string, readingOrder?: string[]): Promise<void>
  /** manual refresh action: re-walk the tree and re-read the open note */
  refresh(): Promise<void>
  reset(): void
}

const errText = (e: unknown): string => (isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e))

export const useReader = create<ReaderState>((set, get) => ({
  tree: null,
  treeError: null,
  selected: null,
  doc: null,
  docError: null,
  readingOrder: [],

  async loadTree() {
    try {
      const tree = await invoke('vault.tree', undefined)
      set({ tree, treeError: null })
    } catch (e) {
      set({ tree: [], treeError: errText(e) })
    }
  },

  async open(path, readingOrder = []) {
    set({ selected: path, docError: null, readingOrder })
    useDiagnostics.getState().clearNote(path) // re-fed as the note re-renders
    try {
      const doc = await invoke('vault.readNote', { path })
      // keep the tree responsive while a large note (≤1 MB) renders
      startTransition(() => set({ doc }))
    } catch (e) {
      set({ doc: null, docError: errText(e) })
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
