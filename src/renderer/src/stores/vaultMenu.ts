/**
 * Vault switcher menu (story 23.1, D1 amendment 7 §D). The popover behind the
 * bottom-left vault identity chip: recently-opened vaults, "Open vault…"
 * (switch in place), "Open in new window", "Create or join…". This store owns
 * the vault-changing wiring (the node-testable seam); create/join delegate to
 * the wizard store from the component.
 *
 * Switch-in-place reuses setVault → main's applyVault (persist + restart THIS
 * window's core host); the App's onVaultChanged listener re-inits the stores.
 * A new window is a fresh main-process BrowserWindow bound to its own vault.
 */
import { create } from 'zustand'
import type { RecentVault } from '../../../shared/recent-vaults'
import { listRecentVaults, openInNewWindow, pickVaultFolder, setVault } from '../api'

interface VaultMenuState {
  open: boolean
  recents: RecentVault[]
  /** true while a switch/open action is settling (guards double-fire) */
  busy: boolean
  toggle(): Promise<void>
  close(): void
  refresh(): Promise<void>
  /** switch THIS window to an already-known vault path (a recent) */
  switchTo(path: string): Promise<void>
  /** pick a folder, then switch THIS window in place */
  openHere(): Promise<void>
  /** open a new window: on `path` when given (a recent), else pick a folder */
  openNewWindow(path?: string): Promise<void>
}

export const useVaultMenu = create<VaultMenuState>((set, get) => ({
  open: false,
  recents: [],
  busy: false,

  async toggle() {
    if (get().open) {
      set({ open: false })
      return
    }
    set({ open: true })
    await get().refresh()
  },

  close() {
    set({ open: false })
  },

  async refresh() {
    try {
      set({ recents: await listRecentVaults() })
    } catch {
      set({ recents: [] })
    }
  },

  async switchTo(path) {
    if (get().busy) return
    set({ busy: true, open: false })
    try {
      await setVault(path)
    } finally {
      set({ busy: false })
    }
  },

  async openHere() {
    if (get().busy) return
    const picked = await pickVaultFolder()
    if (!picked) return
    set({ busy: true, open: false })
    try {
      await setVault(picked)
    } finally {
      set({ busy: false })
    }
  },

  async openNewWindow(path) {
    if (get().busy) return
    const target = path ?? (await pickVaultFolder())
    if (!target) return
    set({ busy: true, open: false })
    try {
      await openInNewWindow(target)
      await get().refresh()
    } finally {
      set({ busy: false })
    }
  },
}))
