/**
 * Pure protocol-mapping helpers in acp.ts (acp blueprint 2026-07-18, step 4):
 * session/update → chunk/event/ignore actions and session/request_permission
 * → the acp.permission CoreEvent. Pure functions only — the session registry,
 * batching and adapter lifecycle are exercised by the dev-app smoke (no live
 * agent in unit tests). Heavy core deps are mocked so the import stays light.
 */
import { describe, expect, it, vi } from 'vitest'
import type { RequestPermissionRequest, SessionNotification } from '@agentclientprotocol/sdk'

// acp.ts imports these at module scope for the (untested-here) session
// lifecycle — mock them so the unit test never touches sqlite or the MCP host
vi.mock('./mcp-server', () => ({
  getMcpStatus: vi.fn(() => ({ state: 'stopped', port: null })),
}))
vi.mock('./settings', () => ({
  mintAgentToken: vi.fn(() => 'tok'),
  revokeAgentToken: vi.fn(),
}))

import { mapPermissionEvent, mapUpdate } from './acp'

type Update = SessionNotification['update']

describe('mapUpdate — chunks', () => {
  it('maps agent/thought text chunks to batchable chunk actions', () => {
    expect(
      mapUpdate('s1', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hi' } }),
    ).toEqual({ act: 'chunk', role: 'agent', text: 'Hi' })
    expect(
      mapUpdate('s1', { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'hmm' } }),
    ).toEqual({ act: 'chunk', role: 'thought', text: 'hmm' })
  })

  it('drops non-text ContentBlocks (v1 ceiling)', () => {
    const image: Update = {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'image', data: '', mimeType: 'image/png' },
    }
    expect(mapUpdate('s1', image)).toEqual({ act: 'ignore' })
  })

  it('ignores user_message_chunk — we render the submitted text ourselves', () => {
    const echo: Update = {
      sessionUpdate: 'user_message_chunk',
      content: { type: 'text', text: 'my prompt' },
    }
    expect(mapUpdate('s1', echo)).toEqual({ act: 'ignore' })
  })
})

describe('mapUpdate — tool calls', () => {
  it('tool_call maps every field onto acp.tool', () => {
    expect(
      mapUpdate('s1', {
        sessionUpdate: 'tool_call',
        toolCallId: 't1',
        title: 'Read README',
        kind: 'read',
        status: 'pending',
      }),
    ).toEqual({
      act: 'event',
      event: {
        kind: 'acp.tool',
        sessionId: 's1',
        toolCallId: 't1',
        title: 'Read README',
        toolKind: 'read',
        status: 'pending',
      },
    })
  })

  it('tool_call_update passes through only what came — absent/null fields → undefined', () => {
    const sparse = mapUpdate('s1', {
      sessionUpdate: 'tool_call_update',
      toolCallId: 't1',
      status: 'completed',
      title: null, // protocol allows explicit null — must not surface as "null"
      kind: null,
    })
    expect(sparse).toEqual({
      act: 'event',
      event: {
        kind: 'acp.tool',
        sessionId: 's1',
        toolCallId: 't1',
        title: undefined,
        toolKind: undefined,
        status: 'completed',
      },
    })
  })
})

describe('mapUpdate — plan + unknown variants', () => {
  it('plan maps entries onto AcpPlanEntry (drops _meta)', () => {
    expect(
      mapUpdate('s1', {
        sessionUpdate: 'plan',
        entries: [
          { content: 'read the file', priority: 'high', status: 'in_progress', _meta: { x: 1 } },
          { content: 'edit it', priority: 'low', status: 'pending' },
        ],
      }),
    ).toEqual({
      act: 'event',
      event: {
        kind: 'acp.plan',
        sessionId: 's1',
        entries: [
          { content: 'read the file', priority: 'high', status: 'in_progress' },
          { content: 'edit it', priority: 'low', status: 'pending' },
        ],
      },
    })
  })

  it('unknown/unstable variants are ignored without throwing (sdk minors add them)', () => {
    for (const variant of ['available_commands_update', 'current_mode_update', 'unstable_v9']) {
      const update = { sessionUpdate: variant } as unknown as Update
      expect(mapUpdate('s1', update)).toEqual({ act: 'ignore' })
    }
  })
})

describe('mapPermissionEvent', () => {
  const req = (over: Partial<RequestPermissionRequest> = {}): RequestPermissionRequest => ({
    sessionId: 'adapter-sid',
    toolCall: { toolCallId: 't1', title: 'Write notes/a.md', kind: 'edit' },
    options: [
      { optionId: 'y', name: 'Allow', kind: 'allow_once' },
      { optionId: 'ya', name: 'Always allow', kind: 'allow_always' },
      { optionId: 'n', name: 'Reject', kind: 'reject_once' },
    ],
    ...over,
  })

  it('maps title/kind and the options verbatim, ordered as received', () => {
    expect(mapPermissionEvent('s1', 'r1', req())).toEqual({
      kind: 'acp.permission',
      sessionId: 's1', // OUR session id, never the adapter's
      requestId: 'r1',
      title: 'Write notes/a.md',
      toolKind: 'edit',
      options: [
        { optionId: 'y', name: 'Allow', kind: 'allow_once' },
        { optionId: 'ya', name: 'Always allow', kind: 'allow_always' },
        { optionId: 'n', name: 'Reject', kind: 'reject_once' },
      ],
    })
  })

  it('falls back to "Tool call" when the toolCall carries no title', () => {
    const e = mapPermissionEvent('s1', 'r2', req({ toolCall: { toolCallId: 't2', title: null } }))
    expect(e).toMatchObject({ title: 'Tool call', toolKind: undefined })
  })
})
