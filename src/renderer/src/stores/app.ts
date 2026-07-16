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
  | 'clients'
  | 'handoffs'
  | 'plan'
  | 'agents'
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
  /** `?` cheatsheet modal (story 15.3) */
  cheatsheetOpen: boolean
  setView(view: AppView): void
  setCheatsheetOpen(open: boolean): void
  init(): Promise<void>
  openVaultPicker(): Promise<string | null>
}

export const useApp = create<AppState>((set, get) => ({
  status: 'loading',
  identity: null,
  error: null,
  // home is the default view once a vault is open (story 2.5)
  view: 'home',
  cheatsheetOpen: false,

  setView(view) {
    set({ view })
  },

  setCheatsheetOpen(open) {
    set({ cheatsheetOpen: open })
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
