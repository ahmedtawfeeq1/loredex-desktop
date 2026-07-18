/**
 * Slash-command picker logic (composer autocomplete). The agent advertises its
 * commands via `available_commands_update` (captured in A7 as session.commands);
 * this drives the `/`-triggered menu in the composer. Invocation is just sending
 * the `/name …` text — the adapter runs it — so this is pure input ergonomics.
 */
import type { AcpCommand } from '../../../shared/ipc-contract'

/** Max rows in the menu — enough to scan, not a wall. */
export const SLASH_LIMIT = 8

/**
 * The query for the slash menu, or null when the menu should be closed.
 * Open only while the draft is a single bare `/token` (leading slash, no
 * whitespace yet) — once a space is typed the user is writing args, so the
 * menu closes. Returns '' for a lone `/` (show everything).
 */
export function slashQuery(draft: string): string | null {
  const m = /^\/(\S*)$/.exec(draft)
  return m ? m[1] : null
}

/**
 * Commands matching `query`, prefix-matches first then substring, capped.
 * Empty query returns the first `limit` commands (the lone-`/` case).
 */
export function filterCommands(
  commands: AcpCommand[],
  query: string,
  limit = SLASH_LIMIT,
): AcpCommand[] {
  const q = query.toLowerCase()
  if (q === '') return commands.slice(0, limit)
  const prefix: AcpCommand[] = []
  const substr: AcpCommand[] = []
  for (const c of commands) {
    const name = c.name.toLowerCase()
    if (name.startsWith(q)) prefix.push(c)
    else if (name.includes(q)) substr.push(c)
  }
  return [...prefix, ...substr].slice(0, limit)
}
