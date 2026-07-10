/**
 * Receipt toasts (DESIGN v2): bottom-right card, mono details line,
 * auto-dismiss 5 s. Every M2 vault write ends in one of these.
 */
import { create } from 'zustand'

/** An optional inline action on a toast — e.g. Undo on a route receipt (epic4). */
export interface ToastAction {
  label: string
  run(): void | Promise<void>
}

export interface Toast {
  id: number
  title: string
  /** mono details line — path + pushed state for write receipts */
  detail?: string
  /** inline action button (epic4: route-receipt Undo); actioned toasts linger longer */
  action?: ToastAction
}

interface ToastsState {
  toasts: Toast[]
  push(title: string, detail?: string, action?: ToastAction): void
  dismiss(id: number): void
}

let nextId = 1

export const useToasts = create<ToastsState>((set) => ({
  toasts: [],

  push(title, detail, action) {
    const id = nextId++
    set((s) => ({
      toasts: [...s.toasts, { id, title, ...(detail ? { detail } : {}), ...(action ? { action } : {}) }],
    }))
    // actioned receipts (Undo) linger long enough to act on; plain receipts 5 s
    setTimeout(
      () => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      },
      action ? 10000 : 5000,
    )
  },

  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

/** The standard write-receipt detail line: vault-relative path + push honesty. */
export function receiptDetail(relPath: string, pushed: boolean): string {
  return `${relPath} · ${pushed ? 'pushed' : 'will push on next sync'}`
}
