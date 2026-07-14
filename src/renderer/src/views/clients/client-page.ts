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
  /** vault-relative path of the stage instructions file (reader open target) */
  instructionsPath: string
  /** any of the four files missing / misnumbered */
  broken: boolean
}

export interface UnitSection {
  name: string
  kind: 'pipeline' | 'agent'
  personaPath: string
  generalInstructionsPath: string
  actionsPath: string
  settingsPath: string
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
    personaPath: `${unit.dir}/_persona.md`,
    generalInstructionsPath: `${unit.dir}/_general_instructions.md`,
    actionsPath: `${unit.dir}/_actions.curls.yaml`,
    settingsPath: `${unit.dir}/_settings.export.yaml`,
    stages: unit.stages.map((stage) => ({
      nn: stage.nn,
      slug: stage.slug,
      instructionsPath: `${unit.dir}/stages/${stage.dir}/${stage.nn}_stage_instructions.md`,
      broken:
        stage.prefixMismatches.length > 0 || Object.values(stage.files).some((present) => !present),
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
