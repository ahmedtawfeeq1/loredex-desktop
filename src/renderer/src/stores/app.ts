/**
 * App shell store: vault identity + open/picker state (story 1.4).
 * Thin zustand store per view (architecture.md#tech-stack).
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { VaultIdentity } from '../../../shared/types'
import { invoke, pickVault } from '../api'

interface AppState {
  status: 'loading' | 'no-vault' | 'ready'
  identity: VaultIdentity | null
  error: string | null
  init(): Promise<void>
  openVaultPicker(): Promise<string | null>
}

export const useApp = create<AppState>((set, get) => ({
  status: 'loading',
  identity: null,
  error: null,

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
