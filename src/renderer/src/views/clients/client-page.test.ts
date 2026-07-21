/**
 * Pure client-page builder (agent-ops epic) — DOM-free, deterministic
 * (pattern: project-page tests).
 */
import { describe, expect, it } from 'vitest'
import type { ClientInfo, LintFinding } from '../../../../shared/ipc-contract'
import { buildClientPage , isRetiredSchemaLint } from './client-page'

const stage = (nn: string, slug: string, broken = false) => ({
  nn,
  slug,
  dir: `${nn}_${slug}`,
  files: {
    enterCondition: true,
    stageInstructions: true,
    followup: !broken,
    actions: true,
  },
  prefixMismatches: [],
})

const info: ClientInfo = {
  slug: 'brightsmile-dental',
  dir: 'projects/brightsmile-dental',
  tags: ['dental', 'new-platform'],
  manager: 'sara',
  pipelines: [
    {
      name: 'booking',
      kind: 'pipeline',
      dir: 'projects/brightsmile-dental/pipelines/booking',
      persona: 'ok',
      generalInstructions: 'ok',
      hasActions: true,
      hasSettings: true,
      stages: [stage('01', 'intake'), stage('02', 'confirm', true)],
      hasStagesDir: true,
    },
  ],
  agents: [
    {
      name: 'reception-agent',
      kind: 'agent',
      dir: 'projects/brightsmile-dental/agents/reception-agent',
      persona: 'ok',
      generalInstructions: 'ok',
      hasActions: true,
      hasSettings: true,
      stages: [],
      hasStagesDir: false,
    },
  ],
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
    message: 'stage 02 has no matching platform stage',
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
    expect(booking?.personaPath).toBe('projects/brightsmile-dental/pipelines/booking/_persona.md')
    expect(booking?.stages.map((s) => s.nn)).toEqual(['01', '02'])
    expect(booking?.stages[0]?.instructionsPath).toBe(
      'projects/brightsmile-dental/pipelines/booking/stages/01_intake/_instructions.md',
    )
    // `broken` is now driven ONLY by a real prefix mismatch: stage.files is keyed
    // by the retired scaffold names, so it cannot say anything true about a
    // pulled stage until the lib's schema catches up.
    expect(booking?.stages[0]?.broken).toBe(false)
    expect(booking?.stages[1]?.broken).toBe(false)
    expect(booking?.problems).toEqual(['stage 02 has no matching platform stage'])
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
})

describe('retired scaffold lints', () => {
  /**
   * The lib's linter still checks for the ORIGINAL scaffold filenames. A pulled
   * pipeline uses the names the genudo playbook now specifies, so those findings
   * report renamed files as "missing" — content that is present and correct.
   * Showing a healthy client as broken is worse than showing nothing.
   */
  it('suppresses findings that name only retired scaffold files', () => {
    for (const message of [
      '_general_instructions.md missing',
      'missing 00_enter_condition.md, 00_stage_instructions.md, 00_followup.md, 00_actions.curls.yaml',
      '_settings.export.yaml missing',
    ]) {
      expect(isRetiredSchemaLint({ level: 'error', client: 'c', scope: '.', message })).toBe(true)
    }
  })

  it('never suppresses a finding that still means something', () => {
    for (const message of [
      'stage numbering has a gap: 00, 02',
      'workspace.yml references an undefined token',
      '2 pending',
    ]) {
      expect(isRetiredSchemaLint({ level: 'error', client: 'c', scope: '.', message })).toBe(false)
    }
  })
})
