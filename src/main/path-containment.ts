/**
 * WP-F: containment + open-eligibility for "reveal in Finder / open in OS app".
 * SECURITY (risk #3): a dex is shared and its files are teammate-authored, so we
 * NEVER hand an arbitrary committed file to the OS. Two gates:
 *
 *   1. isInsideVault — realpath BOTH sides (defeats a symlink that escapes the
 *      dex) then a boundary-safe prefix check. A missing target is not contained.
 *   2. isOpenableExt — an ALLOWLIST (not a denylist: a denylist misses
 *      `.command`/`.app`/`.desktop`/`.jar`/… and gives false assurance). Anything
 *      not on the list is reveal-only, never launched.
 */
import { realpathSync } from 'node:fs'
import { extname, sep } from 'node:path'

/**
 * Extensions we will hand to the OS default application. Documents + images an
 * operator legitimately double-clicks; everything else (scripts, bundles,
 * archives, unknown) is revealed in the file manager, never launched.
 */
export const OPENABLE_EXTS = new Set([
  '.pdf',
  '.xlsx',
  '.xls',
  '.docx',
  '.doc',
  '.pptx',
  '.ppt',
  '.csv',
  '.txt',
  '.rtf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
])

/** Binary/document extensions the agent-ops tree surfaces as openable rows. */
export const BINARY_EXTS = ['.pdf', '.xlsx', '.xls', '.docx', '.pptx', '.png'] as const

/** True when `p`'s extension is on the launch allowlist (case-insensitive). */
export function isOpenableExt(p: string): boolean {
  return OPENABLE_EXTS.has(extname(p).toLowerCase())
}

/**
 * Resolve `target` to its REAL path if it lives inside `root`, else null.
 * realpath both (so a symlink pointing out of the dex fails), then a
 * separator-anchored prefix test so `/vault-evil` is NOT "inside" `/vault`.
 * Returning the RESOLVED path is load-bearing: the caller must gate the launch
 * allowlist + hand the OS the real target, never the symlink — otherwise an
 * `invoice.pdf` symlinked to `payload.command` (both in-dex) would pass the .pdf
 * allowlist yet launch the executable. A target that can't be resolved
 * (missing / unreadable) is NOT contained.
 */
export function resolveInsideVault(root: string, target: string): string | null {
  let r: string
  let t: string
  try {
    r = realpathSync(root)
    t = realpathSync(target)
  } catch {
    return null
  }
  return t === r || t.startsWith(r + sep) ? t : null
}

/** Boolean containment (the realpath'd target isn't needed). */
export function isInsideVault(root: string, target: string): boolean {
  return resolveInsideVault(root, target) !== null
}
