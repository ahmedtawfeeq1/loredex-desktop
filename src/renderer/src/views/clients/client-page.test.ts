/**
 * Pure client-page builder (agent-ops epic) — DOM-free, deterministic
 * (pattern: project-page tests).
 */
import { describe, expect, it } from 'vitest'
import type { ClientInfo, LintFinding } from '../../../../shared/ipc-contract'
import { buildClientPage } from './client-page'

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
