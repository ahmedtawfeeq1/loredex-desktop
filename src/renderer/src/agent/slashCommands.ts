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

/** One recognized command inside the draft, with where it sits. */
export interface InvokedCommand {
  command: AcpCommand
  /** index into the draft where the `/name` token starts */
  start: number
  /** index just past the token */
  end: number
}

/**
 * EVERY known command the draft invokes, in order.
 *
 * A draft can carry several — `/feature-wireframe /n8n-build` is two distinct
 * instructions, and showing only the first hid the rest behind plain text.
 * Matching is on whole `/token`s at a word boundary, so prose that merely
 * contains a slash never lights up.
 */
export function recognizedCommands(
  draft: string,
  commands: readonly AcpCommand[],
): InvokedCommand[] {
  const byName = new Map(commands.map((c) => [c.name.toLowerCase(), c]))
  const out: InvokedCommand[] = []
  const re = /(?:^|\s)(\/([A-Za-z0-9][\w-]*))(?=\s|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(draft)) !== null) {
    const command = byName.get((m[2] ?? '').toLowerCase())
    if (!command) continue
    const start = m.index + m[0].indexOf('/')
    out.push({ command, start, end: start + (m[1]?.length ?? 0) })
  }
  return out
}

/** The draft with one command token removed, whitespace tidied. */
export function removeCommand(draft: string, at: InvokedCommand): string {
  return `${draft.slice(0, at.start)}${draft.slice(at.end)}`.replace(/\s{2,}/g, ' ').trim()
}
