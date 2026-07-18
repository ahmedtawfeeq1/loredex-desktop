# Blueprint: embedded terminal with VS Code-style splits

2026-07-18. Implements Part 1 of `docs/research/embedded-terminal-and-agent-panels-2026-07-18.md`.
Four ordered build agents. Each section lists exact files, signatures, insertion points, and acceptance checks.
Minimal v1 — deliberate deferrals listed at the end.

## Global decisions (read first, all agents)

- **Keybinding**: `ActionCombo` is `{ key; meta?; shift? }` (registry.ts:27–33) and `meta: true` already matches `metaKey OR ctrlKey` (shortcuts.ts:44). So **ctrl+backtick works today with NO combo-type change**: `combo: { key: '`', meta: true }`, hint `'⌃`'`. On macOS ⌘\` is the OS window-cycler, so users press ⌃\` — exactly VS Code muscle memory. Do NOT add a `ctrl` field.
- **Ctrl-chord vs shell conflict** (the one real keyboard hazard): the global handler (App.tsx:130–147) treats Ctrl as ⌘, and registry owns ⌘E/⌘K/⌘F/⌘N/⌘S/⌘1–9 — all of which are shell/readline keys (Ctrl+E end-of-line, Ctrl+K kill-line, Ctrl+N next-history…). The terminal pane MUST stop propagation of `ctrlKey && !metaKey` chords (except the toggle itself) so they reach the shell. Exact snippet in Agent 3 §TermPane.
- **cwd**: `term.create` takes `cwd?: string`; core defaults to `engine.getConfig().vaultPath`. (Deliberate one-field softening of the research shape: the renderer never needs to know the vault's absolute path; "Open terminal here" later passes an explicit cwd.)
- **Drawer lifecycle**: the drawer component stays MOUNTED whenever a layout tree exists; `open: false` hides it with `display: none`. Closing the drawer does NOT kill ptys (VS Code behavior); killing happens on close-pane, vault switch, window close, quit. This removes any need for buffer replay in v1.
- **Persistence**: per-vault `app_settings` row `terminal` = `{ open, height }` via new `settings.terminal.get/set` (rails pattern verbatim). Layout-tree persistence is NOT nearly free (pty ids die with the core host; restore would need respawn logic) → **deferred**.
- **Never log pty data** in core/main logs — no `console.log(data)` anywhere in `src/core/terminals.ts`; error paths log ids/codes only.
- Do not git commit/push. Gates after each agent: `npm run typecheck` + the targeted vitest files named per agent.

---

## Agent 1 — deps + natives + packaging

node-pty 1.1.0 is N-API with darwin/win32 prebuilds → it is in the @parcel/watcher class (no dual-ABI staging), NOT the better-sqlite3 class.

### Edits

1. `package.json` — add to `dependencies` (exact pins, repo convention):
   - `node-pty@1.1.0` (must be `dependencies` so externalizeDepsPlugin externalizes it for the core bundle and electron-builder packs it)
   - `@xterm/xterm@6.0.0`, `@xterm/addon-fit@0.11.0`, `@xterm/addon-search@0.16.0`, `@xterm/addon-web-links@0.12.0` (renderer-bundled pure JS; `dependencies` to match react/codemirror placement)
   - NO `@xterm/addon-webgl` (spec).
2. `electron.vite.config.ts` — **no edits** (auto-externalized / renderer-bundled).
3. `electron-builder.yml`:
   - add `asarUnpack: ["**/node_modules/node-pty/**"]` (spawn-helper needs real disk + exec bits; node-pty rewrites `app.asar` → `app.asar.unpacked` itself)
   - add to `files`: `"!**/node_modules/node-pty/prebuilds/**/*.pdb"` (~35 MB win debug symbols)
4. `scripts/prepare-electron-natives.mjs`:
   - extend the header comment: node-pty is N-API like @parcel/watcher — one binary serves both runtimes; `install-app-deps` may drop an Electron-header build into its `build/Release`, also N-API, no restore needed; NOT added to the stamp.
   - add an `electronCanOpen`-style guard after the existing check: `require('node-pty')` under `ELECTRON_RUN_AS_NODE=1` electron, so a broken pty binary fails `predev` instead of app runtime.
5. `tests/native-smoke/pty.test.ts` (new, mirrors `watcher.test.ts`): `pty.spawn('/bin/sh', ['-c', 'echo PTY_OK'], { name: 'xterm-256color', cols: 80, rows: 24, cwd: process.cwd() })`, collect onData, assert output contains `PTY_OK` and exitCode 0 via onExit. The existing ci.yml native-smoke step then covers it under the packaged Electron ABI with zero workflow edits.

### Acceptance

- `npm install` succeeds; proof command passes (expect `PASS node-pty ABI=148`):
  ```bash
  ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e "const pty=require('node-pty');const p=pty.spawn('/bin/sh',['-c','echo PTY_OK'],{name:'xterm-256color',cols:80,rows:24,cwd:process.cwd()});let o='';p.onData(d=>o+=d);p.onExit(({exitCode})=>{const ok=o.includes('PTY_OK')&&exitCode===0;console.log(ok?'PASS node-pty ABI='+process.versions.modules:'FAIL '+JSON.stringify(o));process.exit(ok?0:1)})"
  ```
- Run it again after `npx electron-builder install-app-deps` (post-rebuild state), then restore: `npm rebuild better-sqlite3 @parcel/watcher` is NOT needed for node-pty but run the repo's normal `predev`/`postdist` flow once to confirm better-sqlite3 staging is undisturbed.
- `npx vitest run tests/native-smoke/pty.test.ts` passes under plain node too (N-API).
- `npm run typecheck` clean.

---

## Agent 2 — contract + core host (+ preload: zero changes)

### 1. `src/shared/ipc-contract.ts`

Inside `interface CoreApi` (declared :75; put the family near the other evented-job entries, e.g. after `dashboard.recurate` at :292):

```ts
/** Embedded terminal (terminal-splits blueprint 2026-07-18): pty sessions
 *  live in the CORE HOST. create/input/resize/kill are cheap invokes; the
 *  output stream rides CoreEvents (term.data batched ~8ms core-side) —
 *  a pty stream must never ride an invoke. cwd omitted → open vault root. */
'term.create': { in: { cwd?: string; cols: number; rows: number }; out: { id: string } }
'term.input': { in: { id: string; data: string }; out: void }
'term.resize': { in: { id: string; cols: number; rows: number }; out: void }
'term.kill': { in: { id: string }; out: void }
/** Per-vault drawer prefs (rails pattern): app.db `app_settings` row
 *  `terminal`; get degrades to closed/280 while no vault/db is open. */
'settings.terminal.get': { in: void; out: { open: boolean; height: number } }
'settings.terminal.set': { in: { open: boolean; height: number }; out: void }
```

`CoreEvent` union (append after `{ kind: 'git.warning'; text: string }` at :405):

```ts
| { kind: 'term.data'; id: string; data: string }
| { kind: 'term.exit'; id: string; code: number }
```

`IpcCode` (:438–…): add two members after the routing-safety block:

```ts
| 'TERM_CWD_INVALID'
| 'TERM_UNKNOWN'
```

No `WireEvent`/preload changes (generic bridge).

### 2. New file `src/core/terminals.ts` — pty session manager

Module-level registry (so both handlers.ts and the core exit hook reach it without plumbing). Lazy `require('node-pty')` inside `create` — keeps plain-node vitest from loading the native module unless a test really spawns (test-bleed risk), and unit tests mock the module.

```ts
import { statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { CoreEvent } from '../shared/ipc-contract'
import { ipcError } from '../shared/ipc-contract'
import type { IPty } from 'node-pty'   // type-only import — no runtime load

const FLUSH_MS = 8            // research doc: batch term.data so the bridge doesn't choke
const MAX_TERMINALS = 16      // ponytail ceiling: enough for any sane split tree

interface Session { pty: IPty; buf: string; timer: NodeJS.Timeout | null }
const sessions = new Map<string, Session>()

export function termCreate(
  emit: (e: CoreEvent) => void,
  arg: { cwd: string; cols: number; rows: number },
): { id: string }
export function termInput(id: string, data: string): void      // unknown id → ipcError('TERM_UNKNOWN', …)
export function termResize(id: string, cols: number, rows: number): void
export function termKill(id: string): void                     // idempotent: unknown id is a no-op
export function killAllTerminals(): void                       // quit hook — kill every pty, clear timers
```

Implementation rules:
- `termCreate`: validate `statSync(arg.cwd).isDirectory()` inside try/catch → `throw ipcError('TERM_CWD_INVALID', 'terminal cwd is not a directory')` (never echo the path into the message — `detail` may carry it). Enforce `sessions.size < MAX_TERMINALS`.
- Spawn: `const pty = require('node-pty') as typeof import('node-pty')`; posix: `pty.spawn(process.env.SHELL || '/bin/zsh', ['-l'], { name: 'xterm-256color', cols, rows, cwd, env: process.env })` (login shell per spec); win32: `pty.spawn(process.env.COMSPEC || 'powershell.exe', [], …)`.
- Batching: `pty.onData(d => { s.buf += d; if (!s.timer) s.timer = setTimeout(flush, FLUSH_MS) })`; `flush` emits ONE `{ kind: 'term.data', id, data: s.buf }` and resets `buf`/`timer`. `pty.onExit(({ exitCode }) => { flush(); sessions.delete(id); emit({ kind: 'term.exit', id, code: exitCode }) })`.
- `termKill`: `clearTimeout`, `pty.kill()`, delete. Never log `data`.

### 3. `src/core/handlers.ts` — registration

Inside `registerCoreHandlers` body, next to the recurate block (~:681):

```ts
// Embedded terminal (terminal-splits blueprint): ptys are core-owned OS
// resources; output rides CoreEvents. NEVER log pty data.
ipc.register('term.create', ({ cwd, cols, rows }) =>
  termCreate((e) => ipc.emit(e), { cwd: cwd ?? engine.getConfig().vaultPath, cols, rows }))
ipc.register('term.input', ({ id, data }) => termInput(id, data))
ipc.register('term.resize', ({ id, cols, rows }) => termResize(id, cols, rows))
ipc.register('term.kill', ({ id }) => termKill(id))
```

No `withWriteLock` (ptys don't touch the vault), no identity, no invalidate/announce ritual.

Settings pair — clone the listWidth block at handlers.ts:880–888:

```ts
ipc.register('settings.terminal.get', () => {
  const db = getAppDb()
  const vid = currentVaultId()
  return db && vid ? loadTerminalPrefs(db, vid) : { open: false, height: 280 }
})
ipc.register('settings.terminal.set', (prefs) => {
  const { db, vid } = requireDb()
  saveTerminalPrefs(db, vid, prefs)
})
```

### 4. `src/core/settings.ts` — persistence fns

Append after the listWidth block (:153–155), same defensive-clamp doctrine (core keeps its own copy of the renderer band so a hand-edited row can't break layout):

```ts
// ── Terminal drawer (terminal-splits blueprint 2026-07-18) ──────────────────
// PER-VAULT UI pref, app_settings row `terminal` beside `rails`.
const MIN_TERM_HEIGHT = 120
const MAX_TERM_HEIGHT = 600
const DEFAULT_TERM_HEIGHT = 280
export function loadTerminalPrefs(db: AppDb, vaultId: string): { open: boolean; height: number }
export function saveTerminalPrefs(db: AppDb, vaultId: string, prefs: { open: boolean; height: number }): void
```

(load: `appSettingGet(db, vaultId, 'terminal')`, JSON.parse in try/catch, `open === true`, clamp height, fall through to `{ open: false, height: 280 }`; save: `appSettingSet` with clamped values — mirror `loadListPaneWidth`/`saveListPaneWidth` exactly.)

### 5. `src/core/index.ts` — quit cleanup

Line 221: `process.on('exit', () => removeDiscovery())` → `process.on('exit', () => { killAllTerminals(); removeDiscovery() })` (+ import). SIGTERM/SIGINT already funnel through `process.exit(0)` (:222–223), and window-close/app-quit kill the core host (main/index.ts:129–133, 258–261), so this single hook covers window close AND quit — **no main/index.ts edits**.

### 6. Preload / renderer api

Zero changes (`window.loredex.invoke`/`onEvent` are generic; `invoke('term.create', …)` is typed the moment the contract entry exists).

### Acceptance

- `npm run typecheck` clean.
- `npx vitest run src/core/ipc.test.ts` still green.
- Manual (or leave to Agent 4): a bare `createCoreIpc()` + `registerCoreHandlers` rejects `term.create` with a bad cwd as `TERM_CWD_INVALID`.

---

## Agent 3 — renderer UI

### Files (new unless noted)

1. `src/renderer/src/terminal/paneTree.ts` — PURE tree ops (unit-testable, no React/xterm):

```ts
export type Pane =
  | { kind: 'term'; id: string }
  | { kind: 'split'; dir: 'row' | 'column'; ratio: number; a: Pane; b: Pane }
export type PanePath = ReadonlyArray<'a' | 'b'>   // address of a node from the root

export function splitPane(root: Pane, targetId: string, dir: 'row' | 'column', newId: string): Pane
// replaces {kind:'term',id:targetId} with {kind:'split',dir,ratio:0.5,a:target,b:{kind:'term',id:newId}}
export function removePane(root: Pane, id: string): Pane | null   // parent split collapses to sibling; null when last pane
export function setRatio(root: Pane, path: PanePath, ratio: number): Pane  // clamp 0.15–0.85
export function collectTermIds(root: Pane): string[]
export function firstTermId(root: Pane): string
```

2. `src/renderer/src/terminal/drawerHeight.ts` — pure clamp, listPaneWidth.ts pattern: `MIN_TERM_HEIGHT = 120`, `MAX_TERM_HEIGHT = 600`, `DEFAULT_TERM_HEIGHT = 280`, `clampTermHeight(px: number): number` (non-finite → default). Must match core's band.

3. `src/renderer/src/stores/terminal.ts` — zustand store, rails.ts pattern verbatim (plain `create`, fire-and-forget persist in try/catch, `PORT_SWAPPED` retry-once in `load`, session-only `resizing`):

```ts
interface TerminalState {
  open: boolean
  height: number
  root: Pane | null            // null until the first terminal spawns
  activeId: string | null      // focused pane; falls back to firstTermId
  resizing: boolean            // kills the height transition mid-drag (never persisted)
  exited: Record<string, number>  // termId → exit code, for the glyph+label chip
  load(): Promise<void>
  toggle(): Promise<void>              // open + spawn-on-first-open; persists {open,height}
  splitActive(dir: 'row' | 'column'): Promise<void>   // invoke term.create, splitPane
  closePane(id: string): Promise<void>                // invoke term.kill, removePane; last pane → root:null, open:false
  setActive(id: string): void
  updateRatio(path: PanePath, ratio: number): void    // live drag, no persist (layout tree isn't persisted in v1)
  dragHeight(px: number): void         // clamp, no persist
  commitHeight(): void                 // persist on pointerup
  resetHeight(): void                  // double-click → default, persisted
  setResizing(v: boolean): void
  reset(): Promise<void>               // vault switch: kill all local ptys (term.kill each), dispose xterms, defaults
}
```

- `persist()` = `void invoke('settings.terminal.set', { open, height }).catch(() => {})` inside try/catch (rails.ts:35–44 shape).
- `toggle()` opening with `root === null`: `const { id } = await invoke('term.create', { cols: 80, rows: 24 })` → `root = { kind: 'term', id }` (real cols/rows arrive via the first fit).
- Module-scope event subscription guarded by `typeof window !== 'undefined' && window.loredex` (dashboard-data.ts:174–184 model): `term.exit` → record in `exited`; `term.data` → forward to the xterm registry (below).

4. `src/renderer/src/terminal/xtermRegistry.ts` — imperative xterm instances live OUTSIDE React state:

```ts
export function attachTerm(id: string, container: HTMLElement): void  // creates Terminal + fit/search/web-links addons, replays pending chunks
export function writeTerm(id: string, data: string): void             // xterm.write, or buffer into pending[] until attached
export function fitTerm(id: string): void        // fitAddon.fit() then void invoke('term.resize', { id, cols, rows }).catch(() => {})
export function disposeTerm(id: string): void
export function disposeAllTerms(): void
export function refreshTermThemes(): void        // re-reads CSS vars, reassigns term.options.theme on every instance
```

- Terminal options: `{ fontFamily: cs.getPropertyValue('--font-mono'), fontSize: 12, lineHeight: 1.2, theme: xtermTheme(), allowProposedApi: false, scrollback: 5000 }` where `xtermTheme()` maps `getComputedStyle(document.documentElement)` vars: `background: --bg-inset`, `foreground: --text-1`, `cursor: --accent`, `selectionBackground: color-mix fallback → --bg-hover`. Deliberately minimal ANSI mapping: leave xterm's default 16-color palette, only ground/foreground/cursor themed (ceiling comment).
- `term.onData(d => void invoke('term.input', { id, data: d }).catch(() => {}))`.
- A single `MutationObserver` on `document.documentElement` `attributeFilter: ['data-theme']` calls `refreshTermThemes()` (settings.ts stamps `dataset.theme`, :13–15).
- Import `@xterm/xterm/css/xterm.css` here (Vite inlines it; never touch loredex-v3.css).

5. `src/renderer/src/terminal/TermPane.tsx` — one leaf pane:
- `useEffect`: `attachTerm(id, ref.current)`; `ResizeObserver` on the container → rAF-throttled `fitTerm(id)` (covers ratio drags, height drags, window resizes, drawer reopen); cleanup disposes the RO only (xterm disposal belongs to closePane/reset).
- Click → `setActive(id)` + xterm focus. Active pane gets class `term-pane-active`.
- **Chord guard** (capture phase on the container div — this is the App.tsx:130–147 caveat):
  ```tsx
  onKeyDownCapture={(e) => {
    // Let ⌃` (toggle) and real ⌘-chords bubble to the global handler;
    // stop bare-ctrl chords so readline keys (⌃E ⌃K ⌃N ⌃F ⌃S…) reach the shell
    // instead of triggering ⌘-aliased app actions.
    if (e.ctrlKey && !e.metaKey && e.key !== '`') e.stopPropagation()
  }}
  ```
- Bare-key registry actions (C/A/D/S/E/?) are already safe: xterm's helper textarea is a typing target (shortcuts.ts:27–36).
- If `exited[id] !== undefined`, overlay a status chip — glyph + label, never color alone: `▪ exited · code 0` (`--ok` for 0, `--rust` otherwise) with a "close" affordance → `closePane(id)`.

6. `src/renderer/src/terminal/PaneNode.tsx` — recursion:
```tsx
function PaneNode({ pane, path }: { pane: Pane; path: PanePath }): JSX.Element
```
- `kind: 'term'` → `<TermPane id={pane.id} />`.
- `kind: 'split'` → flex container (`flexDirection: pane.dir`), children sized `flex: ratio` / `flex: 1 - ratio`, with a 6px divider between them cloning `ListResizeHandle.tsx`'s pointer-capture protocol (:46–68): pointerdown records start coord + start ratio + container size, pointermove → `updateRatio(path, startRatio + delta / containerSize)`, pointerup/cancel → `setResizing(false)` + release capture (no commit — tree isn't persisted). `role="separator"`, `aria-orientation` per direction, `cursor: col-resize|row-resize`, `touch-action: none`.

7. `src/renderer/src/terminal/TerminalDrawer.tsx` — the drawer shell:
- Renders `null` when `root === null`; otherwise always mounted, `style={{ height }}`, class `terminal-drawer` + `terminal-drawer-hidden` (display:none) when `!open`. On `open` flip to true: rAF → `collectTermIds(root).forEach(fitTerm)` (fit is wrong under display:none).
- Top edge: 6px horizontal resize handle — ListResizeHandle rotated 90°: drag → `dragHeight(startHeight - deltaY)`, pointerup → `commitHeight()`, double-click → `resetHeight()`, `aria-orientation="horizontal"`, `cursor: row-resize`.
- Header row (28px, `--bg-card`, 1px bottom hairline): `TERMINAL` label in `var(--font-mono)` 11px `--text-3`; right-aligned text buttons `split ▸`, `split ▾`, `close` wired to `splitActive('row')`, `splitActive('column')`, `closePane(activeId)`.
- Body: `<PaneNode pane={root} path={[]} />`.

8. `src/renderer/src/App.tsx` (edit):
- Mount `<TerminalDrawer />` as a sibling AFTER the `.app` div (between :288 and :289) — `.app-shell` is flex-column so it stacks full-width under sidebar+content; render unconditionally like TopBar.
- `useTerminal.getState().load()` beside the rails load (:106); on vault change (:122–125) `await reset()` then `load()` — reset kills this window's ptys and disposes xterms (the old core host may also be torn down; `term.kill` failures are swallowed).

9. `src/renderer/src/actions/registry.ts` (edit) — one combo action + three palette-only actions (palette rows auto-derive; zero palette code):
```ts
{
  id: 'action:toggle-terminal',
  title: useTerminal.getState().open ? 'Close terminal' : 'Open terminal',  // live title, toggle-sidebar pattern (:219–224)
  shortcut: '⌃`',
  combo: { key: '`', meta: true },   // meta matches ⌘ OR ⌃ (shortcuts.ts:44) → VS Code's ⌃` for free
  run: () => void useTerminal.getState().toggle(),
},
{ id: 'action:terminal-split-right', title: 'Terminal: Split right', run: () => void useTerminal.getState().splitActive('row') },
{ id: 'action:terminal-split-down',  title: 'Terminal: Split down',  run: () => void useTerminal.getState().splitActive('column') },
{ id: 'action:terminal-close-pane',  title: 'Terminal: Close pane',  run: /* closePane(activeId) when set */ },
```
No combos on the three (⌘\ is taken by the sidebar; deferred) — combo-less actions need no `shortcut` hint and satisfy palette-coverage automatically.

10. `src/renderer/src/styles.css` (append, new section):
```
/* ── terminal drawer (terminal-splits blueprint / 2026-07-18) ─────────────── */
```
Rules: drawer ground `var(--bg-inset)`; `border-top: 1px solid var(--hairline)`; header `var(--bg-card)` + 1px hairline; **zero gradients**; active pane `border-left: 2px solid var(--accent)` (the ONE accent use in this surface; explicitly legal per fidelity test border whitelist), inactive panes `border-left: 2px solid transparent` (no layout shift); dividers tint `color-mix(in srgb, var(--accent) 45%, transparent)` on hover/drag (ListResizeHandle recipe); `.terminal-drawer` height transition ~120ms ease (reduced-motion kill is global, styles.css:88–95) and `.terminal-drawer.term-resizing { transition: none; }`; exit chip = `.chip-glyph` primitives with `--ok`/`--rust` + text label. Both themes come free via vars — verify visually in dark AND light.

### Acceptance

- `npm run typecheck` clean.
- `npx vitest run src/renderer/src/design-fidelity.test.ts src/renderer/src/actions/registry.test.ts` — both green (new CSS obeys gradient/border laws; toggle action has unique combo + hint + palette row).
- Manual smoke (`npm run dev`): ⌃\` opens drawer with a live shell at the vault root; typing/scroll/URLs work; split right/down produce independent shells; divider drags re-fit; close pane collapses to sibling; last close hides drawer; theme flip restyles terminals; reopen after toggle keeps scrollback; `exit` in a shell shows the glyph+label chip.

---

## Agent 4 — tests

1. `src/core/terminals.test.ts` (new):
   - `vi.mock('node-pty', …)` with a fake `spawn` returning `{ onData, onExit, kill, resize, write }` capturing callbacks (mock works because terminals.ts requires lazily — no real shells, keeps the flaky suites unharmed).
   - Fake timers: two `onData` chunks inside 8ms → exactly ONE `term.data` emit with concatenated payload; a chunk after flush → second emit.
   - `onExit` → pending buffer flushed BEFORE `term.exit`, session removed.
   - `termCreate` with a file path / missing path → throws envelope `code: 'TERM_CWD_INVALID'`.
   - `termInput`/`termResize` on unknown id → `TERM_UNKNOWN`; `termKill` unknown id → no-op; `killAllTerminals` kills every fake pty and clears timers.
   - MAX_TERMINALS cap enforced.
   - Registration smoke: bare `createCoreIpc()` + `registerCoreHandlers(ipc, noop)` (existing core-test pattern, no app-db) → `settings.terminal.get` degrades to `{ open: false, height: 280 }`.
2. `src/renderer/src/terminal/paneTree.test.ts` (new, pure): split replaces target with 0.5 split preserving order (target = `a`); remove collapses parent to sibling; removing the last pane → null; `setRatio` clamps 0.15–0.85 and only touches the addressed node; `collectTermIds`/`firstTermId` on nested trees.
3. `src/renderer/src/stores/terminal.test.ts` (new, rails.test.ts:9–18 pattern): `vi.stubGlobal('window', { loredex: { invoke } })`; `load()` reads `settings.terminal.get` and clamps height via `clampTermHeight`; `toggle()` invokes `term.create` (no cwd field) then persists `settings.terminal.set` with exact `{ open, height }`; persist failures degrade silently (state stays applied); `dragHeight` does NOT invoke, `commitHeight` does; `closePane` invokes `term.kill` and flips `open` false on last pane; `PORT_SWAPPED` retry on load.
4. `tests/native-smoke/pty.test.ts` — written by Agent 1; verify it's green under plain node here.
5. Law suites (no edits expected, must pass): `npx vitest run src/renderer/src/actions/registry.test.ts src/renderer/src/design-fidelity.test.ts`.

### Gates

- `npm run typecheck`
- `npx vitest run src/core/terminals.test.ts src/renderer/src/terminal/paneTree.test.ts src/renderer/src/stores/terminal.test.ts tests/native-smoke/pty.test.ts src/renderer/src/actions/registry.test.ts src/renderer/src/design-fidelity.test.ts`
- `npm run test:e2e` (existing suite only). Under the FULL parallel vitest run, ignore the known-flaky perf/poller/route-safety/set-frontmatter failures if they are the only failures.

---

## Deliberately deferred (v1 ceilings — each gets a short code comment where it bites)

- **Layout-tree persistence** — pty ids die with the core host; restoring a tree means respawning N shells on load. Only `{ open, height }` persists.
- **pty survival across window reload / core respawn** (headless buffer replay) — research doc's "optional later".
- **addon-webgl** — excluded by spec.
- **Search UI** — `@xterm/addon-search` is loaded but has no keybinding/find bar (⌘F is taken app-wide); palette action later.
- **Focus cycling (alt+arrows)** — impossible today: shortcuts.ts aborts on any `altKey`. Focus follows click only (spec-compliant).
- **"Open terminal here" on project/client rows** — the `cwd?` parameter is the ready seam.
- **Split-pane combos** (⌘\ taken by sidebar) — palette + header buttons only.
- **Per-OS prebuild excludes in electron-builder** (a few MB) — only the `.pdb` exclusion ships.
- **Windows ConPTY polish** — spawn path exists (`COMSPEC`), untested; darwin is the target platform.
- **Terminal e2e** — real shells in CI are a flake source; covered by native-smoke + mocked unit tests + manual smoke.
- **ANSI 16-color theme mapping** — xterm defaults kept; only ground/foreground/cursor follow the app theme.
