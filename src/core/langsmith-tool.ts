/**
 * `langsmith_conversation` — the agent's own way to answer "what happened in
 * this conversation?".
 *
 * This exists INSTEAD of a button. Pasting a conversation URL and asking for an
 * analysis is a sentence, not a UI affordance: the user types
 *
 *   "http://app.genudo.ai/inboxes?conversation=128 — what went wrong here?"
 *
 * and the agent calls this tool mid-turn. No control to find first, works in
 * Claude, Codex and Gemini alike, and it composes — the agent can look up three
 * conversations and compare them without three round trips through a UI.
 *
 * It returns a PATH, not the runs. One of the user's runs is ~47 KB of inputs
 * and outputs and a conversation is many turns; handing that back as tool output
 * would bury the context the agent needs to reason with. The agent reads as much
 * of the file as it wants with its own file tools.
 */
import { z } from 'zod'
import { langsmithApiKey, langsmithStatus } from './langsmith-config'
import { parseTraceRef } from './langsmith-links'
import { fetchTraceForRef } from './langsmith-trace'

/** The shape `McpServer.registerTool` wants, kept minimal on purpose. */
export const LANGSMITH_TOOL_NAME = 'langsmith_conversation'

const INPUT = {
  conversation: z
    .string()
    .describe(
      'A conversation URL from the user’s own platform (e.g. http://app.genudo.ai/inboxes?conversation=128), a bare conversation id (128), `conv-128`, or a LangSmith run URL.',
    ),
}

const DESCRIPTION = [
  'Fetch the LangSmith traces for one conversation from the user’s AI agent system, for debugging what happened.',
  'Accepts a conversation link from their platform, a bare conversation id, or a LangSmith run URL.',
  'Returns the PATH to a JSON file holding the matching runs (inputs, outputs, tool calls, retrieved documents, cost, stage transitions) — read that file to analyse the conversation.',
  'Use this whenever the user pastes a conversation link or id and asks what went wrong, what the agent did, or why it answered a certain way.',
].join(' ')

type ToolResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

const text = (s: string, isError = false): ToolResult => ({
  content: [{ type: 'text', text: s }],
  ...(isError ? { isError: true } : {}),
})

/** The handler, exported so it is testable without an MCP server. */
export async function runLangsmithConversationTool(
  conversation: string,
  now: () => string,
): Promise<ToolResult> {
  const ref = parseTraceRef(conversation)
  if (!ref) {
    // refusing beats guessing: a wrong id returns an empty result that reads
    // exactly like "this conversation was never traced"
    return text(
      `Could not find a conversation id in "${conversation}". Expected a conversation URL, a bare id (128), \`conv-128\`, or a LangSmith run URL.`,
      true,
    )
  }
  const key = langsmithApiKey()
  if (!key) {
    return text(
      'No LangSmith API key is configured. The user can add one in loredex → Settings → MCP server → LangSmith.',
      true,
    )
  }
  const res = await fetchTraceForRef(key, ref, langsmithStatus().project, now())
  if (!res.ok || !res.path) return text(res.detail, true)
  return text(
    [
      `Wrote ${res.count} run(s) for ${ref.kind === 'conversation' ? `conversation ${ref.id}` : 'that trace'} to:`,
      res.path,
      '',
      `Detail: ${res.detail}`,
      res.truncated
        ? 'NOTE: capped — the newest turns only. Say so if the answer depends on earlier turns.'
        : '',
      'Read that file to analyse the conversation. Each run has inputs (query, instructions, model config), outputs (response, tool_calls, retrieved_documents, cost, stage_transition) and metadata (pipeline, stage, actions fired).',
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

/** Register the tool on a freshly built MCP server. Best-effort: a failure here
 *  must never take down the whole host, which serves the dex tools too. */
export function registerLangsmithTool(mcp: {
  registerTool: (
    name: string,
    config: { title?: string; description?: string; inputSchema?: typeof INPUT },
    cb: (args: { conversation: string }) => Promise<ToolResult>,
  ) => unknown
}): void {
  try {
    mcp.registerTool(
      LANGSMITH_TOOL_NAME,
      {
        title: 'Fetch a conversation’s LangSmith traces',
        description: DESCRIPTION,
        inputSchema: INPUT,
      },
      ({ conversation }) =>
        runLangsmithConversationTool(conversation, () =>
          new Date().toISOString().replace(/[:.]/g, '-'),
        ),
    )
  } catch {
    // an SDK shape we no longer understand — the dex tools still work
  }
}
