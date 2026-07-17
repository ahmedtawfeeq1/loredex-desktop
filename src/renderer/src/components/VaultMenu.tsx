/**
 * Vault switcher (story 23.1, D1 amendment 7 §D). The bottom-left vault
 * identity chip becomes a menu: click the chip (or its ▾) → a popover with
 * recently-opened vaults, "Open vault…" (switch in place), "Open in new
 * window", and "Create or join…" (the existing wizards). The chip itself
 * (IdentityBadge) still shows THIS window's current vault.
 */
import { useEffect, useRef } from 'react'
import { formatVaultIdentity, vaultName } from '../../../shared/identity'
import { useApp } from '../stores/app'
import { dotTone, useSync } from '../stores/sync'
import { useVaultMenu } from '../stores/vaultMenu'
import { useWizard } from '../stores/wizard'

export function VaultMenu({
  collapsed = false,
  compact = false,
}: {
  collapsed?: boolean
  /** v3 side-head variant: just the ▾ caret; the menu popover is unchanged */
  compact?: boolean
}): React.JSX.Element | null {
  const identity = useApp((s) => s.identity)
  const tone = useSync((s) => dotTone(s.health))
  const open = useVaultMenu((s) => s.open)
  const recents = useVaultMenu((s) => s.recents)
  const rootRef = useRef<HTMLDivElement>(null)

  // dismiss on Escape or a click outside the switcher
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useVaultMenu.getState().close()
    }
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        useVaultMenu.getState().close()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  if (!identity) return null
  const currentPath = identity.vaultPath

  return (
    <div className="vault-switcher" ref={rootRef}>
      {open && (
        <div className="vault-menu" role="menu" aria-label="Switch vault">
          {recents.length > 0 && (
            <>
              <div className="vault-menu-label">Recent vaults</div>
              {recents.map((r) => {
                const isCurrent = r.path === currentPath
                return (
                  <div key={r.path} className="vault-menu-recent">
                    <button
                      type="button"
                      role="menuitem"
                      className="vault-menu-item vault-menu-recent-main"
                      aria-current={isCurrent}
                      disabled={isCurrent}
                      title={isCurrent ? `${r.path} (current)` : `Switch to ${r.path}`}
                      onClick={() => void useVaultMenu.getState().switchTo(r.path)}
                    >
                      <span className={`vault-chip-dot sync-dot-${isCurrent ? tone : 'ink'}`} aria-hidden />
                      <span className="vault-menu-recent-text">
                        <span className="vault-menu-recent-name">{r.name}</span>
                        <span className="vault-menu-recent-path">{r.path}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="vault-menu-newwin"
                      title="Open in a new window"
                      aria-label={`Open ${r.name} in a new window`}
                      onClick={() => void useVaultMenu.getState().openNewWindow(r.path)}
                    >
                      ⧉
                    </button>
                  </div>
                )
              })}
              <div className="vault-menu-sep" role="separator" />
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className="vault-menu-item"
            onClick={() => void useVaultMenu.getState().openHere()}
          >
            Open vault…
          </button>
          <button
            type="button"
            role="menuitem"
            className="vault-menu-item"
            onClick={() => void useVaultMenu.getState().openNewWindow()}
          >
            Open in new window…
          </button>
          <div className="vault-menu-sep" role="separator" />
          <div className="vault-menu-label">Create or join</div>
          <button
            type="button"
            role="menuitem"
            className="vault-menu-item"
            onClick={() => {
              useVaultMenu.getState().close()
              useWizard.getState().openCreate()
            }}
          >
            Create vault…
          </button>
          <button
            type="button"
            role="menuitem"
            className="vault-menu-item"
            onClick={() => {
              useVaultMenu.getState().close()
              useWizard.getState().openJoin()
            }}
          >
            Join vault…
          </button>
        </div>
      )}
      <button
        type="button"
        className={
          compact
            ? 'dex-caret'
            : collapsed
              ? 'vault-chip rail-collapsed vault-chip-button'
              : 'vault-chip vault-chip-button'
        }
        title={formatVaultIdentity(identity)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current dex ${vaultName(identity)} — switch dex`}
        onClick={() => void useVaultMenu.getState().toggle()}
      >
        {compact ? (
          <span aria-hidden>▾</span>
        ) : (
          <>
        <span className={`vault-chip-dot sync-dot-${tone}`} aria-hidden />
        {!collapsed && (
          <div className="vault-chip-text">
            <span className="vault-chip-name">{vaultName(identity)}</span>
            <span className="vault-chip-meta">{identity.displayPath}</span>
            <span className="vault-chip-meta">
              loredex {identity.engineVersion} · {identity.configSource}
            </span>
          </div>
        )}
        {!collapsed && <span className="vault-chip-caret" aria-hidden>▾</span>}
          </>
        )}
      </button>
    </div>
  )
}
