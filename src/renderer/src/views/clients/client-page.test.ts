/**
 * Pure client-page builder (agent-ops epic) — DOM-free, deterministic
 * (pattern: project-page tests).
 */
import { describe, expect, it, vi } from 'vitest'
import type { ClientInfo, LintFinding } from '../../../../shared/ipc-contract'
import {
  buildClientPage,
  genudoLabel,
  genudoUrlDecision,
  genudoUrlFieldValue,
  signOutThenChangeEnvironment,
} from './client-page'

const stage = (nn: string, slug: string, opts?: { noConfig?: boolean; noInstructions?: boolean }) => ({
  nn,
  slug,
  dir: `${nn}_${slug}`,
  files: {
    stageInstructions: !opts?.noInstructions,
    stageConfig: !opts?.noConfig,
  },
})

const unit = (name: string, kind: 'pipeline' | 'agent', over?: Partial<ClientInfo['pipelines'][number]>) => ({
  name,
  kind,
  dir: `projects/brightsmile-dental/${kind === 'pipeline' ? 'pipelines' : 'agents'}/${name}`,
  persona: 'ok' as const,
  instructions: 'ok' as const,
  hasActions: true,
  hasVariables: true,
  hasConfig: true,
  stages: [],
  hasStagesDir: kind === 'pipeline',
  ...over,
})

const info: ClientInfo = {
  slug: 'brightsmile-dental',
  dir: 'projects/brightsmile-dental',
  tags: ['dental', 'new-platform'],
  manager: 'sara',
  pipelines: [
    unit('booking', 'pipeline', {
      stages: [stage('01', 'intake'), stage('02', 'confirm', { noConfig: true })],
    }),
  ],
  agents: [unit('reception-agent', 'agent', { hasActions: false, hasVariables: false })],
  knowledgeTables: ['patients.csv'],
  workflows: ['booking-flow.json'],
  inboxCount: 2,
  inboxOldestMs: 1000,
  randomsCount: 1,
  hasWorkspaceYml: true,
}

const lints: LintFinding[] = [
  {
    level: 'error',
    client: 'brightsmile-dental',
    scope: 'pipelines/booking/stages/02_confirm',
    message: 'missing stage.yaml',
  },
  { level: 'attention', client: 'brightsmile-dental', scope: '_inbox', message: '2 pending' },
  { level: 'error', client: 'other-client', scope: '.', message: 'not mine' },
]

describe('buildClientPage', () => {
  it('builds header counts, sections, and reader open targets', () => {
    const page = buildClientPage(info, lints)
    expect(page.header).toEqual({
      slug: 'brightsmile-dental',
      manager: 'sara',
      tags: ['dental', 'new-platform'],
      pipelineCount: 1,
      agentCount: 1,
      stageCount: 2,
      errorCount: 1, // only THIS client's errors
    })
    const booking = page.pipelines[0]
    expect(booking?.files.find((f) => f.label === 'persona')?.path).toBe(
      'projects/brightsmile-dental/pipelines/booking/_persona.md',
    )
    expect(booking?.stages.map((s) => s.nn)).toEqual(['01', '02'])
    expect(booking?.problems).toEqual(['missing stage.yaml'])
    expect(page.agents[0]?.stages).toEqual([])
    expect(page.tables).toEqual([
      { name: 'patients.csv', path: 'projects/brightsmile-dental/knowledge_tables/patients.csv' },
    ])
    expect(page.workflows[0]?.path).toBe(
      'projects/brightsmile-dental/automation_workflows/booking-flow.json',
    )
    expect(page.inbox).toEqual({ count: 2, oldestMs: 1000 })
    expect(page.hasWorkspaceYml).toBe(true)
    // other clients' findings never leak in
    expect(page.lints.every((f) => f.client === 'brightsmile-dental')).toBe(true)
  })

  /**
   * The bug this guards: every file chip was rendered as a link regardless of
   * whether the file existed, so a pipeline with no actions — a perfectly normal
   * pipeline — opened "This note has moved or was removed" and read as broken.
   */
  it('marks a file the unit does not have as absent, not as a link', () => {
    const page = buildClientPage(info, lints)
    const agent = page.agents[0]
    expect(agent?.files.find((f) => f.label === 'actions')).toMatchObject({ present: false })
    expect(agent?.files.find((f) => f.label === 'variables')).toMatchObject({ present: false })
    expect(agent?.files.find((f) => f.label === 'persona')).toMatchObject({ present: true })
  })

  it('a stage is broken when it has no stage.yaml — not merely no instructions', () => {
    const page = buildClientPage(info, lints)
    const stages = page.pipelines[0]?.stages
    expect(stages?.[0]?.broken).toBe(false)
    expect(stages?.[1]?.broken).toBe(true)
  })

  /**
   * A stage with no `_instructions.md` inherits the pipeline's — that is by
   * design, and the pull deliberately omits the duplicate. Clicking it must open
   * the config it DOES have rather than a file that was never written.
   */
  it('a stage with no instructions of its own opens stage.yaml instead', () => {
    const inherited: ClientInfo = {
      ...info,
      pipelines: [
        unit('booking', 'pipeline', { stages: [stage('01', 'intake', { noInstructions: true })] }),
      ],
    }
    const step = buildClientPage(inherited, [])?.pipelines[0]?.stages[0]
    expect(step?.hasInstructions).toBe(false)
    expect(step?.instructionsPath).toBe(
      'projects/brightsmile-dental/pipelines/booking/stages/01_intake/stage.yaml',
    )
    expect(step?.broken).toBe(false)
  })

  it('a stage WITH instructions opens them', () => {
    const step = buildClientPage(info, [])?.pipelines[0]?.stages[0]
    expect(step?.instructionsPath).toBe(
      'projects/brightsmile-dental/pipelines/booking/stages/01_intake/_instructions.md',
    )
  })
})

describe('genudoLabel', () => {
  it('invites sign-in when there is no session', () => {
    expect(genudoLabel({ signedIn: false, account: null, expiresAt: null })).toEqual({
      text: 'Not connected to Genudo',
      action: 'Sign in to Genudo',
    })
  })

  it('names the account when signed in', () => {
    expect(
      genudoLabel({ signedIn: true, account: 'ops@acme.test', expiresAt: Date.now() + 3_600_000 }),
    ).toEqual({ text: 'Signed in as ops@acme.test · renews automatically', action: 'Sign out' })
  })

  it('asks for a fresh sign-in once the session is past expiry', () => {
    expect(genudoLabel({ signedIn: true, account: null, expiresAt: Date.now() - 1 })).toEqual({
      text: 'Genudo session expired',
      action: 'Sign in again',
    })
  })
})

describe('genudoUrlFieldValue', () => {
  it('is empty for the production default (endpoint form)', () => {
    expect(genudoUrlFieldValue('https://api.genudo.ai/mcp')).toBe('')
  })

  it('is empty when unset', () => {
    expect(genudoUrlFieldValue(undefined)).toBe('')
  })

  it('shows the host, with the /mcp suffix stripped, for an override', () => {
    expect(genudoUrlFieldValue('https://staging.genudo.ai/mcp')).toBe('https://staging.genudo.ai')
  })
})

describe('genudoUrlDecision', () => {
  it('treats an empty field as restoring the default, with no warning when nothing changes', () => {
    expect(genudoUrlDecision('', 'https://api.genudo.ai/mcp', true)).toEqual({
      payload: null,
      changed: false,
      warn: false,
    })
  })

  it('flags a real change but only warns when a session is live', () => {
    const signedOut = genudoUrlDecision('https://staging.genudo.ai', 'https://api.genudo.ai/mcp', false)
    expect(signedOut).toEqual({ payload: 'https://staging.genudo.ai', changed: true, warn: false })

    const signedIn = genudoUrlDecision('https://staging.genudo.ai', 'https://api.genudo.ai/mcp', true)
    expect(signedIn).toEqual({ payload: 'https://staging.genudo.ai', changed: true, warn: true })
  })

  it('does not warn when the input normalises to the SAME endpoint already stored', () => {
    // pasting the full endpoint verbatim, trailing slash and all — the
    // obvious copy-paste mistake — must read as "nothing changed"
    const d = genudoUrlDecision('https://api.genudo.ai/mcp/', 'https://api.genudo.ai/mcp', true)
    expect(d).toEqual({ payload: 'https://api.genudo.ai/mcp/', changed: false, warn: false })
  })

  it('restoring the default off a non-default current value is a change', () => {
    const d = genudoUrlDecision('', 'https://staging.genudo.ai/mcp', true)
    expect(d).toEqual({ payload: null, changed: true, warn: true })
  })
})

describe('signOutThenChangeEnvironment', () => {
  it('commits only after sign-out actually succeeds', async () => {
    const commit = vi.fn(async () => {})
    const onFailed = vi.fn()
    await signOutThenChangeEnvironment(async () => {}, commit, onFailed)
    expect(commit).toHaveBeenCalledOnce()
    expect(onFailed).not.toHaveBeenCalled()
  })

  // The bug this pins: a `.catch(toast).then(commit)` chain runs `.then`
  // unconditionally because `.catch` without a rethrow resolves the chain —
  // so a FAILED sign-out (e.g. a locked keychain) still committed the new
  // environment, leaving the client holding a token minted at the old host.
  it('does NOT commit when sign-out fails', async () => {
    const commit = vi.fn(async () => {})
    const onFailed = vi.fn()
    const boom = new Error('keychain locked')
    await signOutThenChangeEnvironment(
      async () => {
        throw boom
      },
      commit,
      onFailed,
    )
    expect(commit).not.toHaveBeenCalled()
    expect(onFailed).toHaveBeenCalledWith(boom)
  })

  it('a failing commit itself does not get swallowed — it propagates to the caller', async () => {
    const commitError = new Error('write lock busy')
    await expect(
      signOutThenChangeEnvironment(
        async () => {},
        async () => {
          throw commitError
        },
        vi.fn(),
      ),
    ).rejects.toBe(commitError)
  })
})
