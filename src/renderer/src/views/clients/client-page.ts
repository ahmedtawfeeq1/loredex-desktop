/**
 * Client page model (agent-ops epic) — pure builder over the fleet read model
 * + lint findings, DOM-free and deterministic (pattern: atlas/project-page.ts).
 * The page reads top-down: header (manager, tags, health), pipelines with their
 * ordered stage rail, agents, knowledge tables, workflows, inbox attention.
 */
import type { ClientInfo, LintFinding } from '../../../../shared/ipc-contract'

export interface StageRailStep {
  nn: string
  slug: string
  /**
   * What clicking this stage opens. Its `_instructions.md` when it has one;
   * otherwise `stage.yaml`, because a stage that inherits the pipeline's
   * instructions still has config worth reading — and opening a file that was
   * never written is how a healthy stage came to look broken.
   */
  instructionsPath: string
  /** false when this stage has no `_instructions.md` — it inherits the pipeline's */
  hasInstructions: boolean
  /** no `stage.yaml` — the stage is not addressable on the platform */
  broken: boolean
}

/**
 * One file the page can offer to open, and whether it is actually there.
 *
 * A pipeline legitimately has no actions or no variables. Rendering a chip that
 * opens "This note has moved or was removed" makes a healthy pipeline look
 * broken, so presence travels with the path and the view renders absent files
 * as absent rather than as a dead link.
 */
export interface UnitFileRef {
  label: string
  path: string
  present: boolean
}

export interface UnitSection {
  name: string
  kind: 'pipeline' | 'agent'
  /** files this unit can open, in reading order; check `present` before linking */
  files: UnitFileRef[]
  stages: StageRailStep[]
  /** error-level lint messages scoped to this unit */
  problems: string[]
}

export interface ClientPageModel {
  header: {
    slug: string
    manager: string | null
    tags: string[]
    pipelineCount: number
    agentCount: number
    stageCount: number
    errorCount: number
  }
  pipelines: UnitSection[]
  agents: UnitSection[]
  /** knowledge table file names (paths derive from dir + name) */
  tables: Array<{ name: string; path: string }>
  workflows: Array<{ name: string; path: string }>
  inbox: { count: number; oldestMs: number | null }
  randomsCount: number
  hasWorkspaceYml: boolean
  workspacePath: string
  /** all findings for this client, errors first (already sorted by core) */
  lints: LintFinding[]
}

function unitSection(info: ClientInfo, unit: ClientInfo['pipelines'][number], lints: LintFinding[]): UnitSection {
  const scope = unit.dir.replace(`${info.dir}/`, '')
  return {
    name: unit.name,
    kind: unit.kind,
    // `present` comes from the scanner, not from guessing at the filename — the
    // lib and the pull now agree on these names, so an absent file here means
    // the platform genuinely has nothing for that field.
    files: [
      { label: 'persona', path: `${unit.dir}/_persona.md`, present: unit.persona !== 'missing' },
      {
        label: 'instructions',
        path: `${unit.dir}/_instructions.md`,
        present: unit.instructions !== 'missing',
      },
      { label: 'actions', path: `${unit.dir}/_actions.yaml`, present: unit.hasActions },
      { label: 'variables', path: `${unit.dir}/_variables.yaml`, present: unit.hasVariables },
      { label: 'config', path: `${unit.dir}/pipeline.yaml`, present: unit.hasConfig },
    ],
    stages: unit.stages.map((stage) => ({
      nn: stage.nn,
      slug: stage.slug,
      instructionsPath: `${unit.dir}/stages/${stage.dir}/${
        stage.files.stageInstructions ? '_instructions.md' : 'stage.yaml'
      }`,
      hasInstructions: stage.files.stageInstructions,
      // no stage.yaml = no id, no order, no enter condition. That is broken;
      // a stage with no instructions of its own is merely inheriting.
      broken: !stage.files.stageConfig,
    })),
    problems: lints
      .filter((f) => f.level === 'error' && f.scope.startsWith(scope))
      .map((f) => f.message),
  }
}

export function buildClientPage(info: ClientInfo, lints: LintFinding[]): ClientPageModel {
  const mine = lints.filter((f) => f.client === info.slug)
  return {
    header: {
      slug: info.slug,
      manager: info.manager,
      tags: info.tags,
      pipelineCount: info.pipelines.length,
      agentCount: info.agents.length,
      stageCount: info.pipelines.reduce((n, p) => n + p.stages.length, 0),
      errorCount: mine.filter((f) => f.level === 'error').length,
    },
    pipelines: info.pipelines.map((p) => unitSection(info, p, mine)),
    agents: info.agents.map((a) => unitSection(info, a, mine)),
    tables: info.knowledgeTables.map((name) => ({
      name,
      path: `${info.dir}/knowledge_tables/${name}`,
    })),
    workflows: info.workflows.map((name) => ({
      name,
      path: `${info.dir}/automation_workflows/${name}`,
    })),
    inbox: { count: info.inboxCount, oldestMs: info.inboxOldestMs },
    randomsCount: info.randomsCount,
    hasWorkspaceYml: info.hasWorkspaceYml,
    workspacePath: `${info.dir}/workspace.yml`,
    lints: mine,
  }
}
