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

export interface GenudoStatus {
  signedIn: boolean
  account: string | null
  expiresAt: number | null
}

/** Copy for the genudo row: signed-out, live, or expired. Pure, so it is testable. */
export function genudoLabel(
  status: GenudoStatus,
  /**
   * Whether this machine holds a pasted token for the connection's `${VAR}` ref.
   *
   * Without it the row claimed "● Not connected to Genudo" directly beneath a
   * green "✓ Connected · 29 tools" from the live probe — both were true and the
   * pair read as a contradiction. A pasted token IS a working connection; it
   * just isn't a sign-in session. Defaults to `false` so an omitted argument
   * keeps the old, more cautious wording rather than silently claiming a
   * credential that may not exist.
   */
  hasToken = false,
): { text: string; action: string } {
  if (!status.signedIn) {
    return hasToken
      ? { text: 'Connected with a token', action: 'Sign in instead' }
      : { text: 'Not connected to Genudo', action: 'Sign in to Genudo' }
  }
  if (status.expiresAt !== null && status.expiresAt <= Date.now()) {
    return { text: 'Genudo session expired', action: 'Sign in again' }
  }
  return {
    text: status.account
      ? `Signed in as ${status.account} · renews automatically`
      : 'Signed in to Genudo · renews automatically',
    action: 'Sign out',
  }
}

/** The production default a client's genudo `url` reads as unset (Task 7). */
export const GENUDO_DEFAULT_BASE_URL = 'https://api.genudo.ai'
const GENUDO_DEFAULT_ENDPOINT = `${GENUDO_DEFAULT_BASE_URL}/mcp`

/**
 * Strip-then-append normalisation, mirrored from `genudo-migrate.ts`'s
 * `normalizeGenudoUrl` (itself mirroring `genudo-server.ts`'s own fallback) —
 * this is the renderer reading the SAME shape to decide what the field shows
 * and whether Save has anything to do, not a second definition of what the
 * endpoint means. The core-side setter is the one source of truth for what
 * actually gets written.
 */
function normalizeGenudoEndpoint(input: string): string {
  return `${input.trim().replace(/\/mcp\/?$/, '').replace(/\/+$/, '')}/mcp`
}

/**
 * What the environment field shows: '' (so the placeholder carries the
 * default) when the client's genudo connection IS the production default,
 * else the override with the `/mcp` suffix stripped back off — editing shows
 * a host, not the full endpoint the setter will re-append `/mcp` to.
 */
export function genudoUrlFieldValue(url: string | undefined): string {
  if (!url) return ''
  const host = url.trim().replace(/\/mcp\/?$/, '').replace(/\/+$/, '')
  return host === GENUDO_DEFAULT_BASE_URL ? '' : host
}

export interface GenudoUrlDecision {
  /** payload for `clients.genudo.setBaseUrl` — empty input restores the default */
  payload: string | null
  /** the resolved endpoint actually differs from what's stored now */
  changed: boolean
  /** a live session needs a warn-and-offer-sign-out step before Save proceeds —
   *  its token was minted against the OLD host and would 401 against the new
   *  one with no obvious cause */
  warn: boolean
}

/** Decide what Save does with the environment field: the IPC payload, whether
 *  it is actually a change, and whether a live session needs the warn step. */
export function genudoUrlDecision(
  input: string,
  currentUrl: string | undefined,
  signedIn: boolean,
): GenudoUrlDecision {
  const trimmed = input.trim()
  const payload = trimmed === '' ? null : trimmed
  const nextEndpoint = payload === null ? GENUDO_DEFAULT_ENDPOINT : normalizeGenudoEndpoint(payload)
  const currentEndpoint = currentUrl ? normalizeGenudoEndpoint(currentUrl) : GENUDO_DEFAULT_ENDPOINT
  const changed = nextEndpoint !== currentEndpoint
  return { payload, changed, warn: changed && signedIn }
}

/**
 * Review finding (2026-07-29): "Sign out and change" was wired as
 * `invoke(signOut).catch(toast).then(() => commit())` — a `.catch` handler
 * that doesn't rethrow resolves the chain, so the `.then` ran UNCONDITIONALLY.
 * A locked keychain (or any sign-out failure) produced a "Sign-out failed"
 * toast AND still committed the new environment — leaving the client holding
 * a token minted at the OLD host, exactly the silent-401 failure this whole
 * warn-and-offer-sign-out flow exists to prevent. That bug was untestable as
 * written (the sequencing lived inline in a JSX onClick), which is why it
 * survived review the first time.
 *
 * The effects are injected (`signOut`/`commit`/`onSignOutFailed`) so the
 * SEQUENCING — commit only ever runs after signOut genuinely resolved — is
 * unit-tested independent of IPC/React.
 */
export async function signOutThenChangeEnvironment(
  signOut: () => Promise<void>,
  commit: () => Promise<void>,
  onSignOutFailed: (error: unknown) => void,
): Promise<void> {
  try {
    await signOut()
  } catch (e) {
    onSignOutFailed(e)
    return
  }
  await commit()
}
