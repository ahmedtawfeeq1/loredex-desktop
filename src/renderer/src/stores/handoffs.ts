/**
 * Handoffs board store (story 3.2): one company-wide fetch, lanes derived in
 * the view (pure lanes.ts). Refreshes on vault.changed / handoff events.
 */
import { create } from 'zustand'
import { qualifiedId, toVaultRelative } from '../../../shared/handoff-lanes'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { ConsumeReceipt, HandoffCard, HandoffTransition } from '../../../shared/types'
import { invoke } from '../api'
import { useApp } from './app'
import { effectiveIdentity, useIdentity } from './identity'
import { useToasts } from './toasts'

/** The slice of a card the write modals need — reader-detail actions build
 *  one from note frontmatter, board actions pass full cards (story 7.3). */
export type HandoffRef = Pick<HandoffCard, 'id' | 'from' | 'to' | 'objective' | 'kind'>

/** Compose-form field prefill (story 8.3 retro-link path). */
export interface ComposePrefill {
  fulfills?: string
  objective?: string
  body?: string
}

interface HandoffsState {
  /** null until first load (skeleton); company-wide, lanes derived per project */
  cards: HandoffCard[] | null
  error: string | null
  /** 'all' = company-wide PM view */
  project: string | 'all'
  /** last consume receipt (story 3.4) — shown until dismissed */
  receipt: ConsumeReceipt | null
  /** card mid-consume (button disabled) */
  consumingId: string | null
  /** stamp-press animation trigger for the just-transitioned card */
  pressedId: string | null
  /** card mid-transition (story 8.1) — lifecycle buttons disabled */
  transitioningId: string | null
  /** decline-reason / snooze-until modal targets (story 8.1) */
  declineFor: HandoffCard | null
  snoozeFor: HandoffCard | null
  /** compose modal (story 7.2); replyTo set = reply variant (story 7.3) */
  composeOpen: boolean
  composeReplyTo: HandoffRef | null
  /** story 8.3 retro-link: field prefill for the compose form (fulfills etc.) */
  composePrefill: ComposePrefill | null
  /** story 8.3: delivery card looking for its request ("Link to request…") */
  linkRequestFor: HandoffCard | null
  /** comment modal target (story 7.3) */
  annotateFor: HandoffRef | null
  load(): Promise<void>
  consume(card: HandoffCard): Promise<void>
  /** story 8.1: accept/decline/snooze/reopen through the one lib writer */
  setStatus(card: HandoffCard, transition: HandoffTransition): Promise<void>
  openDecline(card: HandoffCard): void
  closeDecline(): void
  openSnooze(card: HandoffCard): void
  closeSnooze(): void
  dismissReceipt(): void
  setProject(project: string | 'all'): void
  openCompose(replyTo?: HandoffRef, prefill?: ComposePrefill): void
  closeCompose(): void
  openLinkRequest(card: HandoffCard): void
  closeLinkRequest(): void
  openAnnotate(card: HandoffRef): void
  closeAnnotate(): void
  /** optimistic insert from the handoff.created event — no full refetch */
  applyCreated(card: HandoffCard): void
  reset(): void
}

export const useHandoffs = create<HandoffsState>((set, get) => ({
  cards: null,
  error: null,
  project: 'all',
  receipt: null,
  consumingId: null,
  pressedId: null,
  transitioningId: null,
  declineFor: null,
  snoozeFor: null,
  composeOpen: false,
  composeReplyTo: null,
  composePrefill: null,
  linkRequestFor: null,
  annotateFor: null,

  async load() {
    try {
      const cards = await invoke('handoffs.list', { scope: 'all' })
      set({ cards, error: null })
    } catch (e) {
      set({ cards: [], error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e) })
    }
  },

  /** AC5: optimistic flip + stamp press now; the lib write follows; revert on failure.
   *  Legal from open (CLI skip-accept path) and accepted (story 8.1 state machine). */
  async consume(card) {
    const identity = effectiveIdentity(useIdentity.getState())
    if (!identity || (card.status !== 'open' && card.status !== 'accepted') || get().consumingId)
      return
    const before = get().cards
    set({
      consumingId: card.id,
      pressedId: card.id,
      cards: (before ?? []).map((c) => (c.id === card.id ? { ...c, status: 'consumed' } : c)),
    })
    try {
      const receipt = await invoke('handoffs.consume', { id: card.id, identity })
      set({ receipt, error: null, consumingId: null })
      // authoritative refetch arrives via the consume's vault.changed event too
      void get().load()
    } catch (e) {
      set({
        cards: before,
        pressedId: null,
        consumingId: null,
        error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e),
      })
    }
  },

  /**
   * Story 8.1: one action for every non-consume transition — optimistic status
   * flip + stamp press now, lib write follows, revert on failure. The
   * StatusReceipt surfaces as a receipt toast (before → after · by · pushed).
   */
  async setStatus(card, transition) {
    const identity = effectiveIdentity(useIdentity.getState())
    if (!identity || get().transitioningId) return
    const before = get().cards
    set({
      transitioningId: card.id,
      pressedId: card.id,
      declineFor: null,
      snoozeFor: null,
      cards: (before ?? []).map((c) =>
        c.id === card.id
          ? {
              ...c,
              status: transition.to,
              ...(transition.to === 'snoozed'
                ? { snoozedUntil: transition.until, expired: false }
                : {}),
            }
          : c,
      ),
    })
    try {
      const receipt = await invoke('handoffs.setStatus', {
        id: qualifiedId(card),
        transition,
        identity,
      })
      const vaultPath = useApp.getState().identity?.vaultPath ?? ''
      const rel = toVaultRelative(receipt.path, vaultPath)
      useToasts
        .getState()
        .push(
          TRANSITION_TITLE[transition.to],
          `${receipt.before.status ?? 'open'} → ${receipt.after.status} · ${receipt.by.name} · ${rel} · ${receipt.pushed ? 'pushed' : 'will push on next sync'}`,
        )
      set({ error: null, transitioningId: null })
      // authoritative refetch — the write's vault.changed event triggers one too
      void get().load()
    } catch (e) {
      set({
        cards: before,
        pressedId: null,
        transitioningId: null,
        error: isErrEnvelope(e) ? transitionProblem(e.code, e.message) : String(e),
      })
      // a race means our snapshot is stale — refetch the truth (AC5)
      void get().load()
    }
  },

  openDecline(card) {
    set({ declineFor: card })
  },

  closeDecline() {
    set({ declineFor: null })
  },

  openSnooze(card) {
    set({ snoozeFor: card })
  },

  closeSnooze() {
    set({ snoozeFor: null })
  },

  dismissReceipt() {
    set({ receipt: null, pressedId: null })
  },

  setProject(project) {
    set({ project })
  },

  openCompose(replyTo, prefill) {
    set({ composeOpen: true, composeReplyTo: replyTo ?? null, composePrefill: prefill ?? null })
  },

  closeCompose() {
    set({ composeOpen: false, composeReplyTo: null, composePrefill: null })
  },

  openLinkRequest(card) {
    set({ linkRequestFor: card })
  },

  closeLinkRequest() {
    set({ linkRequestFor: null })
  },

  openAnnotate(card) {
    set({ annotateFor: card })
  },

  closeAnnotate() {
    set({ annotateFor: null })
  },

  applyCreated(card) {
    const cards = get().cards
    if (cards === null || cards.some((c) => c.id === card.id)) return
    set({ cards: [card, ...cards] })
  },

  reset() {
    set({
      cards: null,
      error: null,
      project: 'all',
      receipt: null,
      consumingId: null,
      pressedId: null,
      transitioningId: null,
      declineFor: null,
      snoozeFor: null,
      composeOpen: false,
      composeReplyTo: null,
      composePrefill: null,
      linkRequestFor: null,
      annotateFor: null,
    })
  },
}))

/** Receipt-toast titles per transition (story 8.1 AC5). */
export const TRANSITION_TITLE: Record<HandoffTransition['to'], string> = {
  accepted: 'Handoff accepted',
  declined: 'Handoff declined',
  snoozed: 'Handoff snoozed',
  open: 'Handoff reopened',
}

/** Illegal-transition envelopes rendered actionably (story 8.1 AC5). */
export function transitionProblem(code: string, message: string): string {
  if (code === 'ILLEGAL_TRANSITION') {
    return `${message} — someone likely transitioned it first; the board just refreshed`
  }
  if (code === 'UNKNOWN_HANDOFF' || code === 'AMBIGUOUS_HANDOFF') {
    return `${code}: ${message} — refresh the board and retry`
  }
  return `${code}: ${message}`
}
