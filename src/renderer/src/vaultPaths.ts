/**
 * Vault-relative → absolute, for the paths a human hands to something else.
 *
 * The app speaks vault-relative paths everywhere (TreeNode.path, InboxItem.rel,
 * search hits), which is right for the app and useless outside it: an agent, a
 * terminal, or a chat with an AI needs the real on-disk path. Every "Copy path"
 * affordance goes through here so they all produce the same thing.
 */
import { useApp } from './stores/app'

/** The absolute on-disk path for a vault-relative one.
 *  With no vault open yet the input is returned unchanged — a bogus
 *  `/projects/x.md` reads as real and would be pasted somewhere as fact. */
export function absVaultPath(rel: string): string {
  const vault = useApp.getState().identity?.vaultPath
  if (!vault || rel.startsWith('/')) return rel
  return `${vault.replace(/\/+$/, '')}/${rel}`
}

/** Copy the absolute path to the clipboard, best-effort (no clipboard in tests). */
export function copyVaultPath(rel: string): void {
  try {
    void navigator.clipboard?.writeText(absVaultPath(rel))
  } catch {
    // no clipboard permission/API — the action simply didn't happen
  }
}
