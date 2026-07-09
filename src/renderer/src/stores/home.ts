/** Product home store (story 2.5): the Start Here brief + load state. */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { HomeBrief } from '../../../shared/types'
import { invoke } from '../api'

interface HomeState {
  brief: HomeBrief | null
  loading: boolean
  error: string | null
  load(): Promise<void>
  reset(): void
}

export const useHome = create<HomeState>((set) => ({
  brief: null,
  loading: false,
  error: null,

  async load() {
    set({ loading: true })
    try {
      const brief = await invoke('home.brief', undefined)
      set({ brief, loading: false, error: null })
    } catch (e) {
      set({ loading: false, error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e) })
    }
  },

  reset() {
    set({ brief: null, loading: false, error: null })
  },
}))
