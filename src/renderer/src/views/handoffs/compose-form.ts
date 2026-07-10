/**
 * Pure compose-modal logic (stories 7.2/7.3): candidate lists from the vault
 * tree, validation, and payload assembly. The brief itself is assembled by the
 * lib (createHandoff) — this module only shapes the inputs, verbatim.
 */
import type {
  CreateHandoffInput,
  HandoffCard,
  ReplyHandoffInput,
  TreeNode,
} from '../../../../shared/types'
import type { HandoffRef } from '../../stores/handoffs'

/** Project names = the directories under the vault's top-level projects/. */
export function vaultProjects(tree: TreeNode[]): string[] {
  const projects = tree.find((n) => n.kind === 'dir' && n.path === 'projects')
  return (projects?.children ?? []).filter((n) => n.kind === 'dir').map((n) => n.name).sort()
}

/** Note names of one project (recursive), briefs excluded — mirrors lib collectNotes. */
export function projectNotes(tree: TreeNode[], project: string): string[] {
  const projects = tree.find((n) => n.kind === 'dir' && n.path === 'projects')
  const root = projects?.children?.find((n) => n.kind === 'dir' && n.name === project)
  const names: string[] = []
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'dir') walk(node.children ?? [])
      else if (!node.name.startsWith('Start Here')) names.push(node.name)
    }
  }
  walk(root?.children ?? [])
  return names
}

export interface ComposeState {
  kind: 'request' | 'delivery'
  fromProject: string
  toProject: string
  objective: string
  /** selected note names, selection order = Reading order */
  notes: string[]
  /** textarea raw: one next action per line */
  nextActions: string
  body: string
}

export const emptyCompose = (fromProject = ''): ComposeState => ({
  kind: 'delivery',
  fromProject,
  toProject: '',
  objective: '',
  notes: [],
  nextActions: '',
  body: '',
})

/**
 * Reply prefill (story 7.3 AC2): route inverted from the parent, kind defaulted
 * per the lib rule (reply to a request → delivery) but still switchable.
 */
export function replyCompose(parent: Pick<HandoffCard, 'from' | 'to'>): ComposeState {
  return { ...emptyCompose(parent.to), toProject: parent.from, kind: 'delivery' }
}

/** First blocking problem, or null when the form can submit. */
export function composeProblem(s: ComposeState): string | null {
  if (!s.fromProject) return 'Pick the sending project.'
  if (!s.toProject) return 'Pick the receiving project.'
  if (s.fromProject === s.toProject) return 'A handoff needs two different projects.'
  if (!s.objective.trim()) return 'Write the objective — one sentence of what you need done.'
  return null
}

const parsedActions = (raw: string): string[] =>
  raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

/** The exact lib payload — notes keep their selection order, prose verbatim. */
export function buildCreateInput(s: ComposeState): CreateHandoffInput {
  const nextActions = parsedActions(s.nextActions)
  const body = s.body.trim()
  return {
    fromProject: s.fromProject,
    toProject: s.toProject,
    objective: s.objective.trim(),
    kind: s.kind,
    notes: [...s.notes],
    ...(nextActions.length > 0 ? { nextActions } : {}),
    ...(body ? { body } : {}),
  }
}

/** Reply payload: same fields minus the route (the lib derives it from the parent). */
export function buildReplyInput(s: ComposeState): ReplyHandoffInput {
  const { fromProject: _f, toProject: _t, ...rest } = buildCreateInput(s)
  return rest
}

/**
 * The open reader note as a reply/comment target (story 7.3 "detail view"):
 * a handoff brief at projects/<p>/handoffs/<name>.md with a real route.
 */
export function handoffRefFromNote(
  selected: string,
  meta: Record<string, unknown>,
): HandoffRef | null {
  if (meta.type !== 'handoff') return null
  if (!/^projects\/[^/]+\/handoffs\/[^/]+\.md$/.test(selected)) return null
  if (!meta.from_project || !meta.to_project) return null
  return {
    id: (selected.split('/').pop() as string).replace(/\.md$/, ''),
    from: String(meta.from_project),
    to: String(meta.to_project),
    objective: String(meta.objective ?? ''),
    kind: String(meta.kind ?? 'delivery'),
  }
}
