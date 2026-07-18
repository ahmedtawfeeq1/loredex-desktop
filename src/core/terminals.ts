/**
 * Embedded terminal pty sessions (terminal-splits blueprint 2026-07-18).
 * The core host owns every pty (OS-resource rule); create/input/resize/kill
 * are cheap invokes and the output stream rides CoreEvents — term.data is
 * batched ~8ms so a chatty process emits one event per frame, not one per
 * chunk. NEVER log pty data anywhere in this module: it is the user's live
 * shell (keystrokes echo through it). Error paths log ids/codes only.
 */
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import type { IPty } from 'node-pty' // type-only import — no runtime load
import { type CoreEvent, ipcError } from '../shared/ipc-contract'

/** Batch window for term.data — the research doc's ~8ms bridge-protection. */
const FLUSH_MS = 8
/** ponytail ceiling: enough for any sane split tree; a spawn loop stops here. */
const MAX_TERMINALS = 16

interface Session {
  pty: IPty
  buf: string
  timer: NodeJS.Timeout | null
  emit: (e: CoreEvent) => void
}

/** Module-level registry so handlers.ts and the core exit hook both reach it
 *  without plumbing — one core host per vault means one registry. */
const sessions = new Map<string, Session>()

/** Lazy-loaded so plain-node vitest never touches the native module unless a
 *  session really spawns; unit tests vi.mock('node-pty') this import. */
let ptyModule: typeof import('node-pty') | null = null
async function loadPty(): Promise<typeof import('node-pty')> {
  if (!ptyModule) ptyModule = await import('node-pty')
  return ptyModule
}

function flush(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  if (s.timer) {
    clearTimeout(s.timer)
    s.timer = null
  }
  if (s.buf.length === 0) return
  const data = s.buf
  s.buf = ''
  s.emit({ kind: 'term.data', id, data })
}

export async function termCreate(
  emit: (e: CoreEvent) => void,
  arg: { cwd: string; cols: number; rows: number },
): Promise<{ id: string }> {
  let isDir = false
  try {
    isDir = statSync(arg.cwd).isDirectory()
  } catch {
    isDir = false // missing/unreadable path — same envelope as a file path
  }
  if (!isDir) {
    // the path never rides the message; detail carries it for debugging
    throw ipcError('TERM_CWD_INVALID', 'terminal cwd is not a directory', { cwd: arg.cwd })
  }
  if (sessions.size >= MAX_TERMINALS) {
    throw ipcError('INTERNAL', `terminal limit reached (${MAX_TERMINALS})`)
  }
  const { spawn } = await loadPty()
  const shell =
    process.platform === 'win32'
      ? (process.env.COMSPEC ?? 'powershell.exe')
      : (process.env.SHELL ?? '/bin/zsh')
  const pty = spawn(shell, process.platform === 'win32' ? [] : ['-l'], {
    name: 'xterm-256color',
    cols: arg.cols,
    rows: arg.rows,
    cwd: arg.cwd,
    env: process.env,
  })
  const id = randomUUID()
  const s: Session = { pty, buf: '', timer: null, emit }
  sessions.set(id, s)
  pty.onData((d) => {
    s.buf += d
    if (!s.timer) s.timer = setTimeout(() => flush(id), FLUSH_MS)
  })
  pty.onExit(({ exitCode }) => {
    flush(id) // pending output lands BEFORE the exit event
    sessions.delete(id)
    emit({ kind: 'term.exit', id, code: exitCode })
  })
  return { id }
}

export function termInput(id: string, data: string): void {
  const s = sessions.get(id)
  if (!s) throw ipcError('TERM_UNKNOWN', 'unknown terminal id')
  s.pty.write(data)
}

export function termResize(id: string, cols: number, rows: number): void {
  const s = sessions.get(id)
  if (!s) throw ipcError('TERM_UNKNOWN', 'unknown terminal id')
  s.pty.resize(cols, rows)
}

/** Idempotent: close-pane can race the pty's own exit — unknown id is a no-op. */
export function termKill(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  if (s.timer) clearTimeout(s.timer)
  sessions.delete(id)
  s.pty.kill()
}

/** Quit hook (core/index.ts 'exit'): leave no orphan shells behind. */
export function killAllTerminals(): void {
  for (const id of [...sessions.keys()]) termKill(id)
}
