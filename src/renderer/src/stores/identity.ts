/**
 * Consume-identity store (story 3.4): app profile with the vault repo's git
 * config as the offered default. Effective identity = saved profile, else a
 * usable ambient identity; consume stays disabled without one.
 */
import { create } from 'zustand'
import { isValidIdentity } from '../../../shared/identity'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { Identity } from '../../../shared/types'
import { invoke } from '../api'

interface IdentityState {
  profile: Identity | null
  ambient: Identity | null
  loaded: boolean
  error: string | null
  load(): Promise<void>
  save(identity: Identity): Promise<boolean>
}

export function effectiveIdentity(s: Pick<IdentityState, 'profile' | 'ambient'>): Identity | null {
  if (isValidIdentity(s.profile)) return s.profile
  if (isValidIdentity(s.ambient)) return s.ambient
  return null
}

export const useIdentity = create<IdentityState>((set) => ({
  profile: null,
  ambient: null,
  loaded: false,
  error: null,

  async load() {
    try {
      const { profile, ambient } = await invoke('settings.identity.get', undefined)
      set({ profile, ambient, loaded: true, error: null })
    } catch (e) {
      // NOT `loaded: true` — the core was unreachable, so nothing was learned.
      // Claiming otherwise made a saved identity read as "none set" for the rest
      // of the session, because no caller ever retried.
      set({ error: isErrEnvelope(e) ? e.message : String(e) })
    }
  },

  async save(identity) {
    try {
      await invoke('settings.identity.set', identity)
      set({ profile: identity, error: null })
      return true
    } catch (e) {
      set({ error: isErrEnvelope(e) ? e.message : String(e) })
      return false
    }
  },
}))
