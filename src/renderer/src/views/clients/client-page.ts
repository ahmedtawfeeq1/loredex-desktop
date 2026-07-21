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
    // Paths follow the structure the genudo playbook specifies and the pull
    // writes. They were the ORIGINAL scaffold names, so every chip opened a file
    // that no longer exists — hence "This note has moved or was removed".
    personaPath: `${unit.dir}/_persona.md`,
    generalInstructionsPath: `${unit.dir}/_instructions.md`,
    actionsPath: `${unit.dir}/_actions.yaml`,
    settingsPath: `${unit.dir}/pipeline.yaml`,
    stages: unit.stages.map((stage) => ({
      nn: stage.nn,
      slug: stage.slug,
      instructionsPath: `${unit.dir}/stages/${stage.dir}/_instructions.md`,
      // `stage.files` is keyed by the retired scaffold names, so every stage read
      // as broken. Until the lib's schema is updated it cannot tell us anything
      // true about a pulled stage, so only a real prefix mismatch marks one.
      broken: stage.prefixMismatches.length > 0,
    })),
    problems: lints
      .filter((f) => f.level === 'error' && f.scope.startsWith(scope))
      .map((f) => f.message),
  }
}

/**
 * Filenames from the ORIGINAL agent-ops scaffold, which no longer exist.
 *
 * A pipeline pulled from genudo is written in the structure the genudo editing
 * playbook now specifies (verified server-side 2026-07-21): `_instructions.md`,
 * `_actions.yaml`, `pipeline.yaml`, and per stage `_instructions.md` +
 * `stage.yaml`. The lib's linter still checks for the scaffold's old names, so
 * it reports a dozen files as "missing" that were simply RENAMED — the content
 * is present and correct.
 *
 * Reporting a healthy client as broken is worse than reporting nothing, so these
 * specific stale findings are suppressed here. This is a STOPGAP: the real fix
 * is updating UNIT_FILES / STAGE_FILE_SUFFIXES in loredex/src/core/agent-ops.ts
 * (plus the scaffold, doctor and indexer that share them) and re-vendoring.
 * Every other finding still shows.
 */
const RETIRED_FILENAMES =
  /_general_instructions\.md|_settings\.export\.yaml|actions\.curls\.yaml|_enter_condition\.md|_stage_instructions\.md|_followup\.md|\d\d_(enter_condition|stage_instructions|followup)\b/

/** True when this finding is only about the retired scaffold names. */
export function isRetiredSchemaLint(f: LintFinding): boolean {
  return RETIRED_FILENAMES.test(f.message)
}

export function buildClientPage(info: ClientInfo, lints: LintFinding[]): ClientPageModel {
  const mine = lints.filter((f) => f.client === info.slug && !isRetiredSchemaLint(f))
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
