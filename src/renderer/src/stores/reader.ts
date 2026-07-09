/**
 * Reader store: current note selection + parsed doc (story 1.4).
 * Story 2.1 adds the vault tree; keep an explicit reset()/invalidate seam.
 */
import { create } from 'zustand'
import type { Doc } from '../../../shared/ipc-contract'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import { invoke } from '../api'

interface ReaderState {
  /** vault-relative path of the open note */
  selected: string | null
  doc: Doc | null
  docError: string | null
  open(path: string): Promise<void>
  reset(): void
}

export const useReader = create<ReaderState>((set) => ({
  selected: null,
  doc: null,
  docError: null,

  async open(path) {
    set({ selected: path, doc: null, docError: null })
    try {
      const doc = await invoke('vault.readNote', { path })
      set({ doc })
    } catch (e) {
      set({ docError: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e) })
    }
  },

  reset() {
    set({ selected: null, doc: null, docError: null })
  },
}))
