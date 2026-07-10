/**
 * Contracts store (story 11.2): the merged change timeline + one open diff.
 * Everything derived — the core scans incrementally on each load; the view
 * refreshes on contract.changed events (Refresh stays the fallback).
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { ContractChange } from '../../../shared/types'
import { invoke, onEvent } from '../api'

export interface OpenDiff {
  sha: string
  file: string
  unified: string
  truncated: boolean
}

interface ContractsState {
  /** null until first load (skeleton) */
  changes: ContractChange[] | null
  /** roots configured for this vault? (empty-state matrix, AC4) */
  rootsCount: number | null
  loading: boolean
  error: string | null
  /** 'all' = every project; filter is client-side so switching is instant */
  project: string | 'all'
  /** the change whose diff is expanded (sha is unique enough per view) */
  openDiff: OpenDiff | null
  diffFor: string | null
  diffError: string | null
  /** story 11.3: change to scroll to + ring after a chip navigation */
  focusSha: string | null
  load(): Promise<void>
  setProject(project: string | 'all'): void
  toggleDiff(change: ContractChange): Promise<void>
  focus(sha: string): void
  clearFocus(): void
  reset(): void
}

export const useContracts = create<ContractsState>((set, get) => ({
  changes: null,
  rootsCount: null,
  loading: false,
  error: null,
  project: 'all',
  openDiff: null,
  diffFor: null,
  diffError: null,
  focusSha: null,

  async load() {
    set({ loading: true })
    try {
      const [{ roots }, changes] = await Promise.all([
        invoke('settings.projectRoots.get', undefined),
        invoke('contracts.timeline', {}),
      ])
      set({
        changes,
        rootsCount: Object.keys(roots).length,
        loading: false,
        error: null,
      })
    } catch (e) {
      set({
        changes: [],
        rootsCount: get().rootsCount ?? 0,
        loading: false,
        error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e),
      })
    }
  },

  setProject(project) {
    set({ project })
  },

  /** Click-through diff (AC2): one open at a time; clicking again closes.
   *  Interacting with a card also clears a chip-navigation focus ring. */
  async toggleDiff(change) {
    if (get().openDiff?.sha === change.sha && get().openDiff?.file === change.file) {
      set({ openDiff: null, diffError: null, focusSha: null })
      return
    }
    set({ diffFor: change.sha, diffError: null, focusSha: null })
    try {
      const diff = await invoke('contracts.diff', {
        repoRoot: change.repoRoot,
        file: change.file,
        sha: change.sha,
      })
      set({
        openDiff: { sha: change.sha, file: change.file, ...diff },
        diffFor: null,
      })
    } catch (e) {
      set({
        diffFor: null,
        openDiff: null,
        diffError: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e),
      })
    }
  },

  focus(sha) {
    set({ focusSha: sha })
  },

  clearFocus() {
    set({ focusSha: null })
  },

  reset() {
    set({
      changes: null,
      rootsCount: null,
      loading: false,
      error: null,
      project: 'all',
      openDiff: null,
      diffFor: null,
      diffError: null,
      focusSha: null,
    })
  },
}))

// Live refresh (AC4): a post-integrate scan found new rows → reload the loaded
// timeline. (bridge guard keeps this importable from node unit tests)
if (typeof window !== 'undefined' && window.loredex) {
  onEvent((e) => {
    if (e.kind === 'contract.changed' && useContracts.getState().changes !== null) {
      void useContracts.getState().load()
    }
  })
}
