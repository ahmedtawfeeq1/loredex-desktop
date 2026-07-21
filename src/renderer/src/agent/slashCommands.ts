/**
 * Slash-command picker logic (composer autocomplete). The agent advertises its
 * commands via `available_commands_update` (captured in A7 as session.commands);
 * this drives the `/`-triggered menu in the composer. Invocation is just sending
 * the `/name …` text — the adapter runs it — so this is pure input ergonomics.
 */
import type { AcpCommand } from '../../../shared/ipc-contract'

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
 * Commands matching `query`, prefix-matches first then substring. ALL matches
 * are returned (the menu scrolls) — a lone `/` lists every command. `limit` is
 * optional and defaults to no cap.
 */
export function filterCommands(
  commands: AcpCommand[],
  query: string,
  limit = Number.POSITIVE_INFINITY,
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

/**
 * The command a draft actually INVOKES, or null.
 *
 * `slashQuery` only matches while the draft is still one bare token (`^/(\S*)$`),
 * because it drives the autocomplete menu. But the moment you type
 * `/compact focus on the webhook work` the draft stops being one token, the menu
 * closes, and every signal that this is a command disappears — it reads as plain
 * text right up to the moment you send it.
 *
 * This answers the different question "is the first word a real command?", so
 * the composer can keep showing that it is, arguments and all.
 */
export function recognizedCommand(
  draft: string,
  commands: readonly AcpCommand[],
): AcpCommand | null {
  const m = /^\/(\S+)(?:\s|$)/.exec(draft)
  if (!m) return null
  const name = (m[1] ?? '').toLowerCase()
  return commands.find((c) => c.name.toLowerCase() === name) ?? null
}

/** The argument text after a recognized command, for the composer hint. */
export function commandArgs(draft: string): string {
  return /^\/\S+\s+([\s\S]*)$/.exec(draft)?.[1] ?? ''
}
