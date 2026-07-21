/**
 * Fleet-wide view of staged pipeline edits (agent-ops only).
 *
 * The genudo MCP stages every instruction edit as local files before writing to
 * a client's account, so the user gets a diff to review. That is a good design,
 * but the MCP is scoped to ONE account at a time — it structurally cannot answer
 * "across all my clients, what did I stage and never push?".
 *
 * Measured on the live fleet 2026-07-21: 29 staged-edit folders across 3 clients,
 * 26 of them in a single client on a single day, and for every one of them
 * "did this ship?" was unanswerable without opening the web UI and comparing by
 * hand. This module answers it by reading the folders instead.
 *
 * Read-only. Never writes, never touches the platform, never touches a research
 * dex — the caller gates on agent-ops.
 */
import { type Dirent, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Where staged edits live. `instructions-updates/` is the genudo MCP's current
 *  convention; `pipelines/<unit>/versions/` is the proposed one (change request
 *  2026-07-21). Both are scanned so this works today AND after they adopt. */
const LEGACY_ROOT = 'instructions-updates'
const VERSIONS_DIR = 'versions'

import type { EditState, StagedEdit, StagedEditsReport } from '../shared/types'

export type { EditState, StagedEdit, StagedEditsReport }

function safeDirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
  } catch {
    return []
  }
}

function countFiles(dir: string): number {
  let n = 0
  const walk = (d: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) walk(join(d, e.name))
      else n += 1
    }
  }
  walk(dir)
  return n
}

/** `hazem-tech_2026-07-20` → `2026-07-20`; `v01_2026-07-20` → same. */
export function dateFromName(name: string): string | null {
  return /(\d{4}-\d{2}-\d{2})/.exec(name)?.[1] ?? null
}

/** `hazem-tech_2026-07-20` → `hazem-tech`. Null when there is no date to split on. */
export function pipelineFromName(name: string): string | null {
  const m = /^(.+)_\d{4}-\d{2}-\d{2}$/.exec(name)
  return m?.[1] ?? null
}

/**
 * Read a version folder's state.
 *
 * Prefers `manifest.json` (the machine-readable contract we asked the MCP for).
 * Falls back to a `**Status:** PUSHED` line in CHANGES.md, which is the
 * human-facing half of the same request. Neither present → `unknown`, never a
 * guess.
 */
export function readState(versionAbs: string): EditState {
  try {
    const raw = readFileSync(join(versionAbs, 'manifest.json'), 'utf8')
    const parsed = JSON.parse(raw) as { state?: unknown }
    if (parsed.state === 'pushed' || parsed.state === 'staged') return parsed.state
  } catch {
    // no manifest, or malformed — fall through to the prose form
  }
  try {
    const changes = readFileSync(join(versionAbs, 'CHANGES.md'), 'utf8')
    const status = /^\s*\*\*Status:\*\*\s*(\w+)/im.exec(changes)?.[1]?.toLowerCase()
    if (status === 'pushed') return 'pushed'
    if (status === 'staged') return 'staged'
  } catch {
    // no CHANGES.md either
  }
  return 'unknown'
}

/** Every staged edit under one client, from both the legacy and proposed roots. */
function scanClient(projectsAbs: string, client: string): StagedEdit[] {
  const out: StagedEdit[] = []
  const clientAbs = join(projectsAbs, client)

  const push = (versionAbs: string, rel: string, version: string, pipeline: string | null): void => {
    let when = dateFromName(version) ?? dateFromName(rel)
    if (!when) {
      try {
        when = new Date(statSync(versionAbs).mtimeMs).toISOString().slice(0, 10)
      } catch {
        when = ''
      }
    }
    out.push({
      client,
      path: rel,
      version,
      pipeline,
      when,
      fileCount: countFiles(versionAbs),
      state: readState(versionAbs),
    })
  }

  // legacy: instructions-updates/<pipeline>_<date>/vN/
  const legacyAbs = join(clientAbs, LEGACY_ROOT)
  for (const batch of safeDirs(legacyAbs)) {
    for (const version of safeDirs(join(legacyAbs, batch))) {
      push(
        join(legacyAbs, batch, version),
        `projects/${client}/${LEGACY_ROOT}/${batch}/${version}`,
        version,
        pipelineFromName(batch),
      )
    }
  }

  // proposed: pipelines/<unit>/versions/vNN_<date>/
  const pipelinesAbs = join(clientAbs, 'pipelines')
  for (const unit of safeDirs(pipelinesAbs)) {
    const versionsAbs = join(pipelinesAbs, unit, VERSIONS_DIR)
    if (!existsSync(versionsAbs)) continue
    for (const version of safeDirs(versionsAbs)) {
      push(
        join(versionsAbs, version),
        `projects/${client}/pipelines/${unit}/${VERSIONS_DIR}/${version}`,
        version,
        unit,
      )
    }
  }

  return out
}

/**
 * Scan every client. Newest first, so the thing you most likely care about is at
 * the top; ties break on client then version name for a stable order.
 */
export function scanStagedEdits(vaultPath: string): StagedEditsReport {
  const projectsAbs = join(vaultPath, 'projects')
  const clients = safeDirs(projectsAbs)
  const edits = clients.flatMap((c) => scanClient(projectsAbs, c))
  edits.sort(
    (a, b) =>
      b.when.localeCompare(a.when) ||
      a.client.localeCompare(b.client) ||
      a.version.localeCompare(b.version),
  )
  return {
    edits,
    clientsScanned: clients.length,
    manifestsPresent: edits.some((e) => e.state !== 'unknown'),
  }
}
