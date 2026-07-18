/**
 * ACP conversation transcript (Phase 2 B0) — the vault-scoped, core-persisted
 * agent thread. The core host is the app's SOLE SQLite opener (read-state.ts is
 * the model), so the canonical transcript lives here and the renderer's
 * AcpChatItem[] is a VIEW hydrated via agent.conv.load.
 *
 * Three tables (db/index.ts migration 2):
 *   agent_conversations   — the logical thread (our uuid, vault-scoped)
 *   agent_conv_providers  — the adapter's own session id per (conv, provider),
 *                           for SAME-provider native resume (session/load)
 *   agent_messages        — the log; one row per contiguous agent/thought run,
 *                           per tool (upsert by toolCallId), per user turn, so
 *                           it maps 1:1 to AcpChatItem on hydration
 *
 * Type-only db import — no runtime better-sqlite3 dependency, so acp.ts stays
 * light for its plain-node unit test. SECURITY: chat text lands in app.db only
 * (disposable, per-user, NEVER the vault, NEVER a commit) — same seam as
 * read-state.
 */
import { randomUUID } from 'node:crypto'
import type { AppDb } from './db/index'
import type {
  AcpAgent,
  AcpConvLoad,
  AcpConvMessage,
  AcpConvSummary,
} from '../shared/ipc-contract'

/** loadConversation adds vault_id (the seam scope-checks it) to AcpConvLoad. */
export interface LoadedConversation extends AcpConvLoad {
  vaultId: string
}

type ToolMsg = NonNullable<AcpConvMessage['tool']>

/** Create a fresh thread (our uuid, vault-scoped). last_provider seeds to the
 *  starting agent; setConvProviderSession follows the most recent adapter. */
export function createConversation(
  db: AppDb,
  vaultId: string,
  arg: { agent: AcpAgent; title?: string | null },
): { id: string } {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO agent_conversations (vault_id, id, title, last_provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(vaultId, id, arg.title ?? null, arg.agent, now, now)
  return { id }
}

/** Append (or grow/upsert) one message, mirroring the renderer's commit/merge
 *  so the persisted thread matches the view. Best-effort at the call sites —
 *  a db hiccup must never take down a live turn. */
export function appendMessage(db: AppDb, convId: string, msg: AcpConvMessage): void {
  const now = new Date().toISOString()
  // agent/thought text grows the last row when it shares the role — one row per
  // contiguous run (the renderer's commitChunks), keeping renderSeed compact.
  if ((msg.role === 'agent' || msg.role === 'thought') && msg.text != null) {
    const last = db
      .prepare('SELECT seq, role, text FROM agent_messages WHERE conv_id = ? ORDER BY seq DESC LIMIT 1')
      .get(convId) as { seq: number; role: string; text: string | null } | undefined
    if (last && last.role === msg.role) {
      db.prepare('UPDATE agent_messages SET text = ? WHERE conv_id = ? AND seq = ?').run(
        (last.text ?? '') + msg.text,
        convId,
        last.seq,
      )
      touch(db, convId, now)
      return
    }
  }
  // a tool row upserts by toolCallId — a tool_call_update carries only the
  // changed fields, so sparse-merge onto the prior stored tool (the renderer's
  // acp.tool handler does the same).
  if (msg.role === 'tool' && msg.tool) {
    const existing = db
      .prepare(
        "SELECT seq, tool_json FROM agent_messages WHERE conv_id = ? AND role = 'tool' AND json_extract(tool_json, '$.toolCallId') = ?",
      )
      .get(convId, msg.tool.toolCallId) as { seq: number; tool_json: string } | undefined
    if (existing) {
      const merged = mergeTool(JSON.parse(existing.tool_json) as ToolMsg, msg.tool)
      db.prepare('UPDATE agent_messages SET tool_json = ?, text = ? WHERE conv_id = ? AND seq = ?').run(
        JSON.stringify(merged),
        merged.title ?? null,
        convId,
        existing.seq,
      )
      touch(db, convId, now)
      return
    }
  }
  const seq = nextSeq(db, convId)
  db.prepare(
    `INSERT INTO agent_messages (conv_id, seq, role, text, tool_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    convId,
    seq,
    msg.role,
    msg.role === 'tool' ? (msg.tool?.title ?? null) : (msg.text ?? null),
    msg.tool ? JSON.stringify(msg.tool) : null,
    now,
  )
  touch(db, convId, now)
}

/** Record the adapter's own session id for one provider (same-provider native
 *  resume) and follow last_provider to it (the seed target + list tag). */
export function setConvProviderSession(
  db: AppDb,
  convId: string,
  provider: AcpAgent,
  acpSessionId: string,
): void {
  db.prepare(
    `INSERT INTO agent_conv_providers (conv_id, provider, acp_session_id) VALUES (?, ?, ?)
     ON CONFLICT(conv_id, provider) DO UPDATE SET acp_session_id = excluded.acp_session_id`,
  ).run(convId, provider, acpSessionId)
  db.prepare('UPDATE agent_conversations SET last_provider = ?, updated_at = ? WHERE id = ?').run(
    provider,
    new Date().toISOString(),
    convId,
  )
}

/** The full thread by id (null if unknown). vault scoping is the seam's job. */
export function loadConversation(db: AppDb, convId: string): LoadedConversation | null {
  const conv = db
    .prepare(
      'SELECT vault_id, id, title, last_provider FROM agent_conversations WHERE id = ?',
    )
    .get(convId) as
    | { vault_id: string; id: string; title: string | null; last_provider: string }
    | undefined
  if (!conv) return null
  const provRows = db
    .prepare('SELECT provider, acp_session_id FROM agent_conv_providers WHERE conv_id = ? ORDER BY provider')
    .all(convId) as Array<{ provider: string; acp_session_id: string | null }>
  const msgRows = db
    .prepare('SELECT role, text, tool_json FROM agent_messages WHERE conv_id = ? ORDER BY seq')
    .all(convId) as Array<{ role: string; text: string | null; tool_json: string | null }>
  return {
    id: conv.id,
    vaultId: conv.vault_id,
    title: conv.title,
    lastProvider: conv.last_provider as AcpAgent,
    providers: provRows.map((p) => ({
      provider: p.provider as AcpAgent,
      acpSessionId: p.acp_session_id,
    })),
    messages: msgRows.map(rowToMessage),
  }
}

/** All threads for a vault, newest-updated first. */
export function listConversations(db: AppDb, vaultId: string, limit = 50): AcpConvSummary[] {
  const rows = db
    .prepare(
      `SELECT id, title, last_provider, created_at, updated_at FROM agent_conversations
       WHERE vault_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?`,
    )
    .all(vaultId, limit) as Array<{
    id: string
    title: string | null
    last_provider: string
    created_at: string
    updated_at: string
  }>
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    lastProvider: r.last_provider as AcpAgent,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

/** Compact, provider-neutral markdown transcript for cross-provider seeding
 *  (B2): user + assistant turns verbatim, tool actions reduced to title +
 *  touched filenames (diff BODIES elided — the seed carries WHAT changed, not
 *  the patch), thoughts (private reasoning) dropped. Empty string for an
 *  unknown / empty conversation. */
export function renderSeed(db: AppDb, convId: string): string {
  const loaded = loadConversation(db, convId)
  if (!loaded) return ''
  const blocks: string[] = []
  for (const m of loaded.messages) {
    if (m.role === 'user') blocks.push(`**User:** ${m.text ?? ''}`)
    else if (m.role === 'agent') blocks.push(`**Assistant:** ${m.text ?? ''}`)
    else if (m.role === 'tool' && m.tool) {
      const files = toolFiles(m.tool)
      blocks.push(`**Tool:** ${m.tool.title ?? 'Tool call'}${files.length ? ` — ${files.join(', ')}` : ''}`)
    }
    // thought rows are the model's private reasoning — omitted from the seed
  }
  return blocks.join('\n\n')
}

// ── helpers ─────────────────────────────────────────────────────────────────

function touch(db: AppDb, convId: string, now: string): void {
  db.prepare('UPDATE agent_conversations SET updated_at = ? WHERE id = ?').run(now, convId)
}

function nextSeq(db: AppDb, convId: string): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM agent_messages WHERE conv_id = ?')
    .get(convId) as { next: number }
  return row.next
}

/** Sparse-merge a tool_call_update onto the stored tool (absent = keep prior),
 *  dropping keys that resolve to nothing so the JSON stays clean. */
function mergeTool(prev: ToolMsg, next: ToolMsg): ToolMsg {
  const pick = <K extends keyof ToolMsg>(k: K): ToolMsg[K] | undefined => next[k] ?? prev[k]
  const merged: ToolMsg = { toolCallId: next.toolCallId }
  const title = pick('title')
  const toolKind = pick('toolKind')
  const status = pick('status')
  const content = pick('content')
  const locations = pick('locations')
  if (title != null) merged.title = title
  if (toolKind != null) merged.toolKind = toolKind
  if (status != null) merged.status = status
  if (content != null) merged.content = content
  if (locations != null) merged.locations = locations
  return merged
}

function rowToMessage(r: { role: string; text: string | null; tool_json: string | null }): AcpConvMessage {
  if (r.role === 'tool' && r.tool_json) {
    return { role: 'tool', tool: JSON.parse(r.tool_json) as ToolMsg }
  }
  return {
    role: r.role as AcpConvMessage['role'],
    ...(r.text != null ? { text: r.text } : {}),
  }
}

/** Basenames of every file a tool touched (diff paths + locations), deduped —
 *  ABSOLUTE paths are elided to filenames so the seed leaks no machine paths. */
function toolFiles(tool: ToolMsg): string[] {
  const files = new Set<string>()
  for (const c of tool.content ?? []) if (c.kind === 'diff') files.add(basename(c.path))
  for (const l of tool.locations ?? []) files.add(basename(l.path))
  return [...files]
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}
