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
import { invoke } from '../api'

interface ReaderState {
  tree: TreeNode[] | null
  treeError: string | null
  /** vault-relative path of the open note */
  selected: string | null
  doc: Doc | null
  docError: string | null
  loadTree(): Promise<void>
  open(path: string): Promise<void>
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

  async loadTree() {
    try {
      const tree = await invoke('vault.tree', undefined)
      set({ tree, treeError: null })
    } catch (e) {
      set({ tree: [], treeError: errText(e) })
    }
  },

  async open(path) {
    set({ selected: path, docError: null })
    try {
      const doc = await invoke('vault.readNote', { path })
      // keep the tree responsive while a large note (≤1 MB) renders
      startTransition(() => set({ doc }))
    } catch (e) {
      set({ doc: null, docError: errText(e) })
    }
  },

  async refresh() {
    await get().loadTree()
    const { selected } = get()
    if (selected) await get().open(selected)
  },

  reset() {
    set({ tree: null, treeError: null, selected: null, doc: null, docError: null })
  },
}))
