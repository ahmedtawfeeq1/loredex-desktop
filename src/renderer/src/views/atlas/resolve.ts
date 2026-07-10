/**
 * HYPERLINK-EVERYTHING (story 10.4): every Atlas node resolves somewhere real
 * in one click — the ATLAS-CONCEPT §3 table, row for row. `resolveNode` is
 * pure (descriptor out, unit-tested per row); `performResolution` maps each
 * descriptor onto the existing routes/channels. No dead clicks: what cannot
 * resolve on this machine degrades to an honest copy affordance.
 */
import { toVaultRelative } from '../../../../shared/handoff-lanes'
import type { AtlasEdge, AtlasNode } from '../../../../shared/types'
import { invoke } from '../../api'
import { useApp } from '../../stores/app'
import { useAtlas } from '../../stores/atlas'
import { useHandoffs } from '../../stores/handoffs'
import { useReader } from '../../stores/reader'
import { useToasts } from '../../stores/toasts'

export type Resolution =
  /** note → Reader view (marks read via readState.mark) */
  | { kind: 'reader'; path: string }
  /** handoff → its brief with the thread rail expanded (handoffs.thread) */
  | { kind: 'handoff-card'; path: string }
  /** project cluster → drill into Learn (story 10.3's row) */
  | { kind: 'drill'; project: string }
  /** aggregated route edge → the board filtered to the receiving project */
  | { kind: 'board'; project: string }
  /** source/commit → outbound jump (editor deep link / GitHub page) */
  | { kind: 'external'; url: string; via: 'editor' | 'github' }
  /** honest disabled state: nothing local to open — copy instead */
  | { kind: 'copy'; text: string; reason: string }
  /** contract → timeline filtered to the file (view ships with story 11.2) */
  | { kind: 'contract-timeline'; repoRoot: string; file: string }

/** `editor: system|vscode|cursor|windsurf|custom` → deep-link URL. */
export function editorUrl(editor: string | null | undefined, absPath: string): string {
  if (!editor || editor === 'system') return `file://${absPath}`
  return `${editor}://file${absPath}`
}

export function resolveNode(node: AtlasNode, ctx: { editor: string | null }): Resolution {
  switch (node.type) {
    case 'note':
      return { kind: 'reader', path: node.path ?? '' }
    case 'handoff':
      return { kind: 'handoff-card', path: node.path ?? '' }
    case 'project':
      return { kind: 'drill', project: node.label }
    case 'source': {
      // local re-resolution happened core-side: roots map first, recorded
      // absolute path fallback (§3 source row). Nothing local → copy-path.
      if (node.localPath) return { kind: 'external', url: editorUrl(ctx.editor, node.localPath), via: 'editor' }
      const text = node.sourcePath || `${node.sourceProject ?? ''}/${node.sourceRel ?? ''}`
      return { kind: 'copy', text, reason: 'repo not on this machine' }
    }
    case 'commit': {
      if (node.commitBase && node.sha) {
        return { kind: 'external', url: `${node.commitBase}/commit/${node.sha}`, via: 'github' }
      }
      // non-GitHub remote: plain mono text + copy-sha, no link (m2 §6)
      return { kind: 'copy', text: node.sha ?? node.label, reason: 'non-GitHub remote' }
    }
    case 'contract':
      return { kind: 'contract-timeline', repoRoot: node.repoRoot ?? '', file: node.file ?? '' }
  }
}

/**
 * Edge resolution (§3): route/thread edges resolve to the handoff that
 * created them; contract-link edges resolve by direction of click (the end
 * nearer the pointer); aggregated overview routes open the receiving
 * project's board lane.
 */
export function resolveEdgeTarget(
  edge: AtlasEdge,
  byId: Map<string, AtlasNode>,
  nearerEnd: 'source' | 'target',
): { node: AtlasNode } | { board: string } | null {
  if (edge.category === 'route') {
    if (edge.totalCount !== undefined) {
      const to = byId.get(edge.target)
      return to ? { board: to.label } : null
    }
    const handoff = edge.handoffId ? byId.get(edge.handoffId) : undefined
    return handoff ? { node: handoff } : null
  }
  if (edge.category === 'thread') {
    // the edge's source card carries the replies_to/fulfills that created it
    const node = byId.get(edge.source)
    return node ? { node } : null
  }
  const node = byId.get(nearerEnd === 'source' ? edge.source : edge.target)
  return node ? { node } : null
}

let cachedEditor: string | null | undefined

/** The loredex config's editor scheme, fetched once per session. */
export async function editorScheme(): Promise<string | null> {
  if (cachedEditor !== undefined) return cachedEditor
  try {
    const config = await invoke('config.get', undefined)
    cachedEditor = (config as { editor?: string }).editor ?? null
  } catch {
    cachedEditor = null
  }
  return cachedEditor
}

export function performResolution(res: Resolution): void {
  switch (res.kind) {
    case 'reader': {
      useApp.getState().setView('reader')
      void useReader.getState().open(res.path)
      void invoke('readState.mark', { paths: [res.path] }).catch(() => {})
      return
    }
    case 'handoff-card': {
      // the app's card-detail surface: the brief in the reader with the
      // thread rail (handoffs.thread) expanded beneath it — board state
      // mirrors live via handoff.stateChanged either way
      const vaultPath = useApp.getState().identity?.vaultPath ?? ''
      const card = (useHandoffs.getState().cards ?? []).find(
        (c) => toVaultRelative(c.path, vaultPath) === res.path,
      )
      useApp.getState().setView('reader')
      if (card) useHandoffs.getState().markRead(card)
      else void invoke('readState.mark', { paths: [res.path] }).catch(() => {})
      void useReader.getState().open(res.path, card?.readingOrder ?? [])
      return
    }
    case 'drill': {
      void useAtlas.getState().drillProject(res.project)
      return
    }
    case 'board': {
      useApp.getState().setView('handoffs')
      useHandoffs.getState().setProject(res.project)
      return
    }
    case 'external': {
      // outbound affordance: opened via main's allow-listed shell.openExternal
      window.open(res.url, '_blank')
      return
    }
    case 'copy': {
      void navigator.clipboard.writeText(res.text)
      useToasts.getState().push('Copied', `${res.text} — ${res.reason}`)
      return
    }
    case 'contract-timeline': {
      // contract nodes only exist once the story 11.1 scan provides them; the
      // timeline view rides story 11.2. Until then this row stays honest.
      useToasts
        .getState()
        .push('Contract timeline', `${res.file} — the timeline view arrives with epic 11`)
      return
    }
  }
}

/** One-click activation used by the canvas and ⌘K (story 10.4 AC5). */
export async function activateNode(node: AtlasNode): Promise<void> {
  performResolution(resolveNode(node, { editor: await editorScheme() }))
}
