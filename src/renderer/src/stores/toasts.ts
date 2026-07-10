/**
 * Receipt toasts (DESIGN v2): bottom-right card, mono details line,
 * auto-dismiss 5 s. Every M2 vault write ends in one of these.
 */
import { create } from 'zustand'

export interface Toast {
  id: number
  title: string
  /** mono details line — path + pushed state for write receipts */
  detail?: string
}

interface ToastsState {
  toasts: Toast[]
  push(title: string, detail?: string): void
  dismiss(id: number): void
}

let nextId = 1

export const useToasts = create<ToastsState>((set) => ({
  toasts: [],

  push(title, detail) {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, title, ...(detail ? { detail } : {}) }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 5000)
  },

  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

/** The standard write-receipt detail line: vault-relative path + push honesty. */
export function receiptDetail(relPath: string, pushed: boolean): string {
  return `${relPath} · ${pushed ? 'pushed' : 'will push on next sync'}`
}
