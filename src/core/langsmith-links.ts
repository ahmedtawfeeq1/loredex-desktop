/**
 * "Here is the conversation, tell me what happened."
 *
 * The user works in their own platform, not in LangSmith. When something goes
 * wrong with a customer they have a CONVERSATION link (or just its id) — not a
 * trace id, and not a LangSmith URL. Their Python agents stamp the conversation
 * onto every run's metadata, so the id is the join key between the two systems.
 *
 * This module turns whatever they paste into the values worth searching for.
 * Deliberately forgiving: the platform's URL shape is theirs to change, and a
 * parser that only accepted one shape would break the day a route was renamed.
 *
 * Observed metadata on a real export (al-hazem-tech, 2026-07-23):
 *   conversation_id: 126        (number)
 *   session_id:      "conv-126"
 *   thread_id:       "conv-126"
 * so one conversation is searchable under BOTH `126` and `conv-126`, and which
 * key carries which is not ours to assume.
 */

/** What the user pasted, resolved to something searchable. */
export type TraceRef =
  | {
      kind: 'conversation'
      /** the bare id as typed/extracted, e.g. `126` */
      id: string
      /** every spelling worth matching against metadata_value, in order */
      candidates: string[]
    }
  | {
      kind: 'langsmith-run'
      /** a run id from a LangSmith URL — fetched as a whole trace */
      runId: string
      /** the tracing project uuid, when the URL carried one */
      projectId: string | null
    }

/** The conversation id spelled every way the metadata might carry it. */
function candidatesFor(id: string): string[] {
  const bare = id.replace(/^conv-/i, '')
  // both spellings, bare first: a numeric metadata_value is the more common
  // stamp, and duplicates would just cost an extra OR arm
  return bare === id ? [bare, `conv-${bare}`] : [bare, id]
}

/**
 * A LangSmith app URL, if that is what was pasted.
 *   https://smith.langchain.com/o/<org>/projects/p/<project>/r/<run>?trace=…
 *   https://smith.langchain.com/public/<share>/r/<run>
 * Anything else returns null and falls through to conversation parsing.
 */
function parseLangsmithUrl(text: string): TraceRef | null {
  if (!/smith\.langchain\.com/i.test(text)) return null
  const run = /\/r\/(" ?)?([0-9a-f-]{36})/i.exec(text)?.[2] ?? null
  const project = /\/projects\/p\/([0-9a-f-]{36})/i.exec(text)?.[1] ?? null
  if (run) return { kind: 'langsmith-run', runId: run, projectId: project }
  // a project URL with no run pinned is not something we can analyse
  return null
}

/**
 * The conversation id inside whatever was pasted.
 *
 * Priority is deliberate — an explicit parameter beats a path segment beats a
 * bare number, because a URL is full of digits (ports, pagination, timestamps)
 * and guessing wrong sends the user a confidently empty result.
 */
function parseConversationId(text: string): string | null {
  const s = text.trim()
  if (s === '') return null

  // 1. a bare id, or `conv-126`
  if (/^conv-\d+$/i.test(s) || /^\d+$/.test(s)) return s

  // 2. an explicit parameter. The real console link is
  //    http://app.genudo.ai/inboxes?conversation=128 (production, confirmed
  //    2026-07-23; the dev host devconsole.loop-x.co uses the same route). The
  //    match is on the PARAMETER, not the host, so both work and a new
  //    environment needs no change here. The other spellings are there so a
  //    route rename does not silently break this.
  const param = /[?&#](?:conversation_?id|conversation|thread_?id|session_?id)=([\w-]+)/i.exec(s)
  if (param?.[1]) return param[1]

  // 3. a path segment: /conversations/126, /conversation/126, /inbox/conv-126
  const seg = /\/(?:conversations?|threads?|chats?)\/(conv-)?(\d+)/i.exec(s)
  if (seg) return `${seg[1] ?? ''}${seg[2]}`

  // 4. `conv-126` anywhere in the string (a slug, a title, a pasted log line)
  const slug = /\bconv-(\d+)\b/i.exec(s)
  if (slug) return `conv-${slug[1]}`

  // Deliberately NOT "the last number in the URL": that matches a port, a page
  // number or a timestamp just as happily, and a wrong id looks exactly like a
  // conversation with no traces.
  return null
}

/** Whatever the user pasted, resolved — or null when nothing usable was found. */
export function parseTraceRef(text: string): TraceRef | null {
  const ls = parseLangsmithUrl(text)
  if (ls) return ls
  const id = parseConversationId(text)
  if (!id) return null
  return { kind: 'conversation', id, candidates: candidatesFor(id) }
}

/**
 * The LangSmith filter expression for one conversation.
 *
 * `in(metadata_key, [...])` because which key carries the id is the user's
 * choice, not ours; `or(...)` across value spellings because `126` and
 * `conv-126` are the same conversation. Values are compared as strings.
 *
 * Docs: https://docs.langchain.com/langsmith/trace-query-syntax
 */
export function conversationFilter(candidates: string[]): string {
  const keys = ['conversation_id', 'session_id', 'thread_id']
  const keyList = keys.map((k) => `"${k}"`).join(', ')
  const values = candidates.map((v) => `eq(metadata_value, "${escapeValue(v)}")`)
  const valueExpr = values.length === 1 ? values[0] : `or(${values.join(', ')})`
  return `and(in(metadata_key, [${keyList}]), ${valueExpr})`
}

/** The filter DSL is a string; a quote or backslash in a value would break it. */
function escapeValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
