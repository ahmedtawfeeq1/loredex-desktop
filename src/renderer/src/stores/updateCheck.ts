/**
 * BL-11: in-app update check. The app is unsigned, so a real auto-updater
 * (Squirrel.Mac via electron-updater) can't run on macOS — it requires a signed
 * bundle. Instead of shipping an updater that silently fails on the primary
 * platform, this just ASKS GitHub what the latest release is and, when it's
 * newer, surfaces a banner linking to the download.
 *
 * Read-only, best-effort, and never blocks the app: any network/API failure is
 * swallowed and simply shows nothing.
 */
import { create } from 'zustand'

const RELEASES_API = 'https://api.github.com/repos/ahmedtawfeeq1/loredex-desktop/releases/latest'
const RELEASES_PAGE = 'https://github.com/ahmedtawfeeq1/loredex-desktop/releases/latest'

/** `v0.9.7` / `0.9.7` → `[0,9,7]`; a pre-release suffix (`-agentops.3`) is
 *  compared after the numeric core so `0.9.7` beats `0.9.7-agentops.1`. */
export function parseVersion(v: string): { nums: number[]; pre: string } {
  const clean = v.trim().replace(/^v/, '')
  const [core = '', ...preParts] = clean.split('-')
  return {
    nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0),
    pre: preParts.join('-'),
  }
}

/**
 * Is `latest` newer than `current`? Numeric parts first, then: a release beats
 * a pre-release of the same numbers, and two pre-releases compare as strings.
 * Returns false on anything unparseable — never nag on a bad compare.
 */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  const len = Math.max(a.nums.length, b.nums.length)
  for (let i = 0; i < len; i++) {
    const x = a.nums[i] ?? 0
    const y = b.nums[i] ?? 0
    if (x !== y) return x > y
  }
  if (a.pre === b.pre) return false
  if (!a.pre) return true // 0.9.7 > 0.9.7-agentops.1
  if (!b.pre) return false // 0.9.7-agentops.1 is NOT > 0.9.7
  return a.pre > b.pre
}

interface UpdateState {
  /** the newer version's tag, once found — null while unknown/up to date */
  available: string | null
  url: string
  dismissed: boolean
  check(): Promise<void>
  dismiss(): void
}

export const useUpdateCheck = create<UpdateState>((set, get) => ({
  available: null,
  url: RELEASES_PAGE,
  dismissed: false,

  async check() {
    // __APP_VERSION__ is injected at build time (electron.vite.config.ts)
    const current = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''
    if (!current) return
    try {
      const res = await fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) return // rate-limited / offline / no releases — stay quiet
      const body = (await res.json()) as { tag_name?: string; html_url?: string }
      const tag = body.tag_name
      if (typeof tag !== 'string' || !isNewer(tag, current)) return
      set({ available: tag, url: body.html_url ?? RELEASES_PAGE })
    } catch {
      // offline / blocked / malformed — an update check must never surface an error
    }
  },

  dismiss() {
    set({ dismissed: true })
    void get() // keep the store shape stable for tests
  },
}))
