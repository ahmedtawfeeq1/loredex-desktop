/**
 * Status-suggestion store (story 12.2 AC4). suggest.statusChange events land
 * here; the toast persists until acted on or dismissed (recorded deviation
 * from the 5 s auto-dismiss toast spec — a suggestion is a decision, not a
 * receipt). Apply is an ORDINARY user-invoked write: `accepted` rides
 * handoffs.setStatus, `consumed` rides handoffs.consume (the lib's one
 * consume writer — setHandoffStatus has no consumed arm, recorded deviation
 * from the AC wording). Nothing here writes without a click, categorically.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import { invoke, onEvent } from '../api'
import { useHandoffs, TRANSITION_TITLE } from './handoffs'
import { effectiveIdentity, useIdentity } from './identity'
import { useToasts } from './toasts'

export interface Suggestion {
  handoffId: string
  suggested: 'consumed' | 'accepted'
  sha: string
  prUrl?: string
}

export const suggestionKey = (s: Pick<Suggestion, 'handoffId' | 'sha'>): string =>
  `${s.handoffId}:${s.sha}`

/** Pure Apply routing (unit-test surface): which ordinary writer channel a
 *  suggestion rides. The suggestion pipeline itself owns zero write paths. */
export function applyChannel(suggested: Suggestion['suggested']): 'handoffs.consume' | 'handoffs.setStatus' {
  return suggested === 'consumed' ? 'handoffs.consume' : 'handoffs.setStatus'
}

interface SuggestsState {
  suggestions: Suggestion[]
  /** suggestion mid-apply (buttons disabled) */
  applyingKey: string | null
  error: string | null
  add(s: Suggestion): void
  apply(s: Suggestion): Promise<void>
  dismiss(s: Suggestion): Promise<void>
  reset(): void
}

export const useSuggests = create<SuggestsState>((set, get) => ({
  suggestions: [],
  applyingKey: null,
  error: null,

  add(s) {
    const existing = get().suggestions
    if (existing.some((x) => suggestionKey(x) === suggestionKey(s))) return
    set({ suggestions: [...existing, s] })
  },

  /** One click → one attributed lib write through the ordinary channel
   *  (write lock + identity, exactly like a board action). */
  async apply(s) {
    const identity = effectiveIdentity(useIdentity.getState())
    if (!identity) {
      set({ error: 'applying needs an identity — set name and email in Settings' })
      return
    }
    if (get().applyingKey) return
    set({ applyingKey: suggestionKey(s), error: null })
    try {
      if (s.suggested === 'consumed') {
        await invoke('handoffs.consume', { id: s.handoffId, identity })
        useToasts.getState().push('Handoff consumed', `${s.handoffId} · evidence ${s.sha.slice(0, 7)}`)
      } else {
        await invoke('handoffs.setStatus', {
          id: s.handoffId,
          transition: { to: 'accepted' },
          identity,
        })
        useToasts
          .getState()
          .push(TRANSITION_TITLE.accepted, `${s.handoffId} · evidence ${s.sha.slice(0, 7)}`)
      }
      set({
        suggestions: get().suggestions.filter((x) => suggestionKey(x) !== suggestionKey(s)),
        applyingKey: null,
      })
      void useHandoffs.getState().load() // the board refetch (event also fires)
    } catch (e) {
      set({
        applyingKey: null,
        error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e),
      })
    }
  },

  /** Dismiss persists (app_settings dismissed:<handoffId>:<sha>) — the
   *  suggestion never re-fires, on this machine, ever. */
  async dismiss(s) {
    set({
      suggestions: get().suggestions.filter((x) => suggestionKey(x) !== suggestionKey(s)),
    })
    try {
      await invoke('suggest.dismiss', { handoffId: s.handoffId, sha: s.sha })
    } catch {
      // an old core host without the channel just loses persistence — the
      // in-session removal above already happened
    }
  },

  reset() {
    set({ suggestions: [], applyingKey: null, error: null })
  },
}))

// suggest.statusChange events feed the stack from any view (bridge guard
// keeps this importable from node unit tests)
if (typeof window !== 'undefined' && window.loredex) {
  onEvent((e) => {
    if (e.kind === 'suggest.statusChange') {
      useSuggests.getState().add({
        handoffId: e.handoffId,
        suggested: e.suggested,
        sha: e.evidence.sha,
        ...(e.evidence.prUrl ? { prUrl: e.evidence.prUrl } : {}),
      })
    }
  })
}
