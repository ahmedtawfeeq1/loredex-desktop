/**
 * n8n-mcp is installed ON DEMAND, not bundled: the package is 105 MB installed
 * (data/nodes.db alone is 96 MB, the offline n8n node documentation), and
 * bundling it would roughly double every release asset for an opt-in feature.
 *
 * It lands in <userData>/mcp/n8n-mcp/ — beside app.db, so it survives the app
 * bundle being replaced — at a PINNED version.
 *
 * `--omit=optional` is load-bearing, not tidiness: n8n-mcp's only optional
 * dependency is better-sqlite3, a NATIVE module. A build compiled for one Node
 * ABI does not load under Electron's (this project has already been bitten by
 * exactly that). Omitting it forces the required pure-WASM sql.js path — no
 * compiler needed on the user's machine, no Windows build toolchain, and
 * measured FASTER to start (427 ms vs 1113 ms).
 *
 * We spawn the resolved entry under our own node, so `npx` is never involved and
 * the Windows npx.cmd problem (BL-24) does not arise.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { mcpInstallDir } from './paths'

export const N8N_MCP_VERSION = '2.65.1'

const INSTALL_ID = 'n8n-mcp'

function root(): string {
  return mcpInstallDir(INSTALL_ID)
}

/**
 * The stdio entry, or null when not installed. NOTE: n8n-mcp restricts its
 * `exports` map, so `require.resolve('n8n-mcp/package.json')` — the trick
 * adapterEntry uses for the ACP adapters — THROWS on this package. The path is
 * therefore constructed directly from the known install layout.
 */
export function n8nEntryPath(): string | null {
  let dir: string
  try {
    dir = root()
  } catch {
    return null // no user-data (bare host) — nothing can be installed
  }
  const entry = join(dir, 'node_modules', 'n8n-mcp', 'dist', 'mcp', 'stdio-wrapper.js')
  return existsSync(entry) ? entry : null
}

export function isN8nInstalled(): boolean {
  return n8nEntryPath() !== null
}

/** The exact command the setup card shows when the in-app install cannot run. */
export function n8nInstallCommand(): string {
  return `npm install n8n-mcp@${N8N_MCP_VERSION} --omit=optional --prefix "${root()}"`
}

/**
 * Install (or repair) the pinned package. Best-effort: a GUI-launched app does
 * not inherit a login shell's PATH, so npm may simply not be reachable — that is
 * NOT a dead end, it degrades to the setup card showing n8nInstallCommand().
 */
export async function installN8nMcp(
  onLog: (line: string) => void = () => {},
): Promise<{ ok: boolean; detail: string }> {
  let dir: string
  try {
    dir = root()
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) }
  }
  return await new Promise((resolve) => {
    const child = execFile(
      'npm',
      [
        'install',
        `n8n-mcp@${N8N_MCP_VERSION}`,
        '--omit=optional',
        '--no-audit',
        '--no-fund',
        '--prefix',
        dir,
      ],
      { timeout: 600_000 },
      (err) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code
          resolve({
            ok: false,
            detail:
              code === 'ENOENT'
                ? 'npm was not found on this app’s PATH — run the command below in a terminal instead'
                : err.message.split('\n')[0],
          })
          return
        }
        resolve(
          isN8nInstalled()
            ? { ok: true, detail: `n8n-mcp ${N8N_MCP_VERSION} installed` }
            : { ok: false, detail: 'install reported success but the entry is missing' },
        )
      },
    )
    child.stderr?.on('data', (d: Buffer) => onLog(d.toString()))
  })
}
