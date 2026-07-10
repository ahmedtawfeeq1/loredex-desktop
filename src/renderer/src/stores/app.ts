/**
 * App shell store: vault identity + open/picker state (story 1.4).
 * Thin zustand store per view (architecture.md#tech-stack).
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { VaultIdentity } from '../../../shared/types'
import { invoke, pickVault } from '../api'

export type AppView =
  | 'home'
  | 'reader'
  | 'handoffs'
  | 'atlas'
  | 'contracts'
  | 'search'
  | 'feed'
  | 'sync'
  | 'settings'

interface AppState {
  status: 'loading' | 'no-vault' | 'ready'
  identity: VaultIdentity | null
  error: string | null
  view: AppView
  setView(view: AppView): void
  init(): Promise<void>
  openVaultPicker(): Promise<string | null>
}

export const useApp = create<AppState>((set, get) => ({
  status: 'loading',
  identity: null,
  error: null,
  // home is the default view once a vault is open (story 2.5)
  view: 'home',

  setView(view) {
    set({ view })
  },

  async init() {
    try {
      const identity = await invoke('app.identity', undefined)
      set({ status: 'ready', identity, error: null })
    } catch (e) {
      if (isErrEnvelope(e) && e.code === 'NO_CONFIG') {
        set({ status: 'no-vault', identity: null, error: null })
      } else if (isErrEnvelope(e) && e.code === 'PORT_SWAPPED') {
        // core host was re-brokered mid-flight — retry once on the new port
        await get().init()
      } else {
        set({ status: 'no-vault', identity: null, error: isErrEnvelope(e) ? e.message : String(e) })
      }
    }
  },

  async openVaultPicker() {
    const picked = await pickVault()
    if (picked) await get().init()
    return picked
  },
}))
