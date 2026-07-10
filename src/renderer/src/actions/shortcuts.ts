/**
 * Pure shortcut matching (story 15.3) — the App shell's one keydown handler
 * runs THIS against the registry. Guards, in order:
 *
 *   - overlay open (modal / palette / cheatsheet): only `always` actions
 *     match (⌘K) — every overlay owns its own keys (Esc, ⌘⏎, ↑↓⏎);
 *   - typing in an input/textarea/select/contenteditable: bare-key combos
 *     ('?') never fire; ⌘-combos still do (a chord is not typing);
 *   - ⌘ matches metaKey OR ctrlKey (same rule the old ⌘K handler used).
 */
import type { AppAction } from './registry'

export interface KeyStroke {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export interface ShortcutContext {
  typing: boolean
  overlayOpen: boolean
}

/** True when the event target is a text-entry surface. */
export function isTypingTarget(target: unknown): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null
  if (!el || typeof el.tagName !== 'string') return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable === true
  )
}

export function matchShortcut(
  stroke: KeyStroke,
  actions: readonly AppAction[],
  ctx: ShortcutContext,
): AppAction | null {
  if (stroke.altKey) return null // ⌥ types characters on macOS — never bound
  const meta = stroke.metaKey || stroke.ctrlKey
  const key = stroke.key.length === 1 ? stroke.key.toLowerCase() : stroke.key
  for (const action of actions) {
    const combo = action.combo
    if (!combo) continue
    if (ctx.overlayOpen && !action.always) continue
    const wantsMeta = combo.meta === true
    if (!wantsMeta && (ctx.typing || meta)) continue // bare keys never fire while typing/chorded
    if (wantsMeta !== meta) continue
    if ((combo.shift === true) !== stroke.shiftKey && combo.key.length === 1 && /[a-z0-9]/.test(combo.key)) {
      continue // letter/digit chords are shift-exact (⇧⌘R ≠ ⌘R); '?' carries its own shift
    }
    if (key !== (combo.key.length === 1 ? combo.key.toLowerCase() : combo.key)) continue
    return action
  }
  return null
}
