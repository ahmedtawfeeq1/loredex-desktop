/**
 * Pull a client's LIVE pipeline configuration off the genudo platform into the
 * vault (agent-ops only).
 *
 * Why this exists: measured 2026-07-20, 61 of 61 client pipelines in the live
 * fleet still held the untouched scaffold stub (`<!-- Who this AI is… -->`) and
 * there were zero real stages. The folder tree was a shape with no content,
 * because the real configuration only ever lived on the platform. Versioning,
 * diffing and review are all meaningless until the content is actually here.
 *
 * The platform is the source of truth; the vault is a git-backed MIRROR of it.
 * So a pull is one-way and destructive-by-design for the files it owns — it
 * OVERWRITES them. It never deletes anything it does not write, and it never
 * touches _inbox/_randoms/knowledge_tables (client-owned) or the generated
 * tooling files.
 *
 * Format follows how a field is edited and reviewed:
 *   - prose (persona, instructions, notes) → markdown, so git diffs are readable
 *     and a human can edit them. This is the vault's whole advantage over the
 *     platform's textareas.
 *   - structured config (model, temperature, ids, conditions) → yaml.
 * Nothing is stored as JSON-with-escaped-newlines, which is what makes the raw
 * platform export unreadable.
 */
import { type Dirent, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { widenWindowsPath } from './win-spawn'

/** Prose fields lifted out of the pipeline object into their own .md files. */
const PIPELINE_PROSE = ['persona', 'instructions'] as const
/**
 * Ditto per stage — instructions only (user decision 2026-07-20).
 * `ai_persona` and `notes` are deliberately NOT mirrored: `notes` is a verbatim
 * copy of the pipeline's instructions on every stage (measured: 4 stages, all
 * 10,059 bytes, identical), and the stage persona is not something this team
 * edits. Both would be pure noise in the diff.
 */
const STAGE_PROSE = ['instructions', 'description'] as const

/** Volatile/derived fields that would churn the diff on every pull for no
 *  information — timestamps move even when nothing meaningful changed. */
const SKIP_FIELDS = new Set(['created_at', 'updated_at', 'training_cost'])

export interface PullFile {
  /** path relative to the client folder */
  rel: string
  content: string
}

export interface PullPlan {
  client: string
  pipelines: { id: number; name: string; slug: string; stages: number }[]
  files: PullFile[]
  warnings: string[]
}

/** readdir that answers [] for a missing dir — a first pull has no unit folder. */
function safeEntries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/** `Hazem tech` → `hazem-tech`; keeps unicode out of paths. */
export function slugify(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'unnamed'
}

/** Minimal YAML emitter — flat scalar maps and simple lists only, which is all
 *  the platform's config fields are. Avoids a dependency for one shape. */
/** Identity first (that is what a reader looks for), then alphabetical. Fixed
 *  order is what makes a refresh byte-identical: the API may return keys in a
 *  different order between calls, and without this every pull would rewrite
 *  every file and bury the real change in noise. */
export function orderedEntries(obj: Record<string, unknown>): [string, unknown][] {
  const FIRST = ['id', 'name', 'pipeline_id', 'stage_id', 'order', 'status']
  const keys = Object.keys(obj)
  const head = FIRST.filter((k) => keys.includes(k))
  const tail = keys.filter((k) => !FIRST.includes(k)).sort()
  return [...head, ...tail].map((k) => [k, obj[k]])
}

export function toYaml(obj: Record<string, unknown>, indent = 0): string {
  const pad = ' '.repeat(indent)
  const lines: string[] = []
  for (const [k, v] of orderedEntries(obj)) {
    if (v === undefined) continue
    if (v === null) lines.push(`${pad}${k}:`)
    else if (Array.isArray(v)) {
      if (v.length === 0) lines.push(`${pad}${k}: []`)
      else {
        lines.push(`${pad}${k}:`)
        for (const item of v) {
          if (item !== null && typeof item === 'object') {
            const inner = toYaml(item as Record<string, unknown>, indent + 4)
            lines.push(`${pad}  - ${inner.trimStart()}`)
          } else lines.push(`${pad}  - ${scalar(item)}`)
        }
      }
    } else if (typeof v === 'object') {
      lines.push(`${pad}${k}:`)
      lines.push(toYaml(v as Record<string, unknown>, indent + 2))
    } else if (typeof v === 'string' && v.includes('\n')) {
      lines.push(blockScalar(k, v, pad))
    } else lines.push(`${pad}${k}: ${scalar(v)}`)
  }
  return lines.join('\n')
}

function scalar(v: unknown): string {
  if (typeof v === 'string') {
    // quote anything that would otherwise parse as a non-string or break the line
    if (v === '' || /[:#\n"']/.test(v) || /^(true|false|null|~|-?\d)/i.test(v)) {
      return JSON.stringify(v)
    }
    return v
  }
  return String(v)
}

/**
 * A multi-line string as a YAML BLOCK scalar rather than a quoted one-liner.
 *
 * Fields like `enter_condition` are prose — bullet lists a human wrote. Emitted
 * as `"- line one\n- line two\n"` they are unreadable AND undiffable: editing
 * one bullet rewrites the entire line, so `git diff` shows the whole condition
 * changed. A block scalar keeps one source line per line, so the diff is the
 * bullet that actually moved.
 */
function blockScalar(key: string, v: string, pad: string): string {
  const body = v
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => (l.length > 0 ? `${pad}  ${l}` : ''))
    .join('\n')
  // `|-` strips the trailing newline; the platform is inconsistent about it and
  // a phantom blank line would churn every diff
  return `${pad}${key}: |-\n${body.replace(/\n+$/, '')}`
}

/** Frontmatter so a pulled note is a first-class vault note (and the reader's
 *  properties panel shows where it came from). */
function md(meta: Record<string, string | number>, body: string): string {
  const fm = Object.entries(meta)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : String(v)}`)
    .join('\n')
  return `---\n${fm}\n---\n\n${body.trim()}\n`
}

interface RawPipeline {
  id: number
  name: string
  [k: string]: unknown
}
interface RawStage {
  id: number
  name: string
  order: number
  [k: string]: unknown
}

/**
 * Turn one platform bundle into the files that mirror it. Pure — no I/O — so
 * the mapping is unit-testable and a dry run costs nothing.
 */
export function planFiles(
  client: string,
  bundles: { pipeline: RawPipeline; stages: RawStage[]; actions: unknown[]; variables: unknown[] }[],
): PullPlan {
  const files: PullFile[] = []
  const warnings: string[] = []
  const pipelines: PullPlan['pipelines'] = []

  for (const { pipeline, stages, actions, variables } of bundles) {
    const slug = slugify(pipeline.name)
    const base = join('pipelines', slug)
    pipelines.push({ id: pipeline.id, name: pipeline.name, slug, stages: stages.length })

    // prose out to markdown
    for (const field of PIPELINE_PROSE) {
      const text = pipeline[field]
      if (typeof text !== 'string' || !text.trim()) {
        warnings.push(`${pipeline.name}: no ${field} on the platform`)
        continue
      }
      files.push({
        rel: join(base, `_${field}.md`),
        content: md(
          { client, pipeline: pipeline.name, platform_id: pipeline.id, type: field },
          text,
        ),
      })
    }

    // everything else is config
    const config: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(pipeline)) {
      if (SKIP_FIELDS.has(k)) continue
      if ((PIPELINE_PROSE as readonly string[]).includes(k)) continue
      config[k] = v
    }
    files.push({
      rel: join(base, 'pipeline.yaml'),
      content: `# Live platform config for "${pipeline.name}" (genudo pipeline ${pipeline.id}).\n# Pulled from the platform — the platform is the source of truth.\n${toYaml(config)}\n`,
    })

    if (actions.length > 0) {
      files.push({
        rel: join(base, '_actions.yaml'),
        content: `# Actions this pipeline can fire (webhooks into automation workflows).\n${toYaml({ actions })}\n`,
      })
    }
    if (variables.length > 0) {
      files.push({
        rel: join(base, '_variables.yaml'),
        content: `# Variables the agent collects across the conversation.\n${toYaml({ variables })}\n`,
      })
    }

    // stages, ordered — the folder number comes from the platform's own order
    const sorted = [...stages].sort((a, b) => a.order - b.order)
    sorted.forEach((stage, i) => {
      const nn = String(stage.order ?? i + 1).padStart(2, '0')
      const dir = join(base, 'stages', `${nn}_${slugify(stage.name)}`)
      for (const field of STAGE_PROSE) {
        const text = stage[field]
        if (typeof text !== 'string' || !text.trim()) continue
        // never mirror a stage field that is a verbatim copy of the pipeline's
        // instructions — one edit would otherwise show as N+1 changed files
        if (text === pipeline.instructions) continue
        files.push({
          rel: join(dir, `_${field}.md`),
          content: md(
            {
              client,
              pipeline: pipeline.name,
              stage: stage.name,
              platform_id: stage.id,
              type: field,
            },
            text,
          ),
        })
      }
      const stageConfig: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(stage)) {
        if (SKIP_FIELDS.has(k)) continue
        if ((STAGE_PROSE as readonly string[]).includes(k)) continue
        if (k === 'ai_persona' || k === 'notes') continue // dropped by decision
        stageConfig[k] = v
      }
      files.push({
        rel: join(dir, 'stage.yaml'),
        content: `# Stage "${stage.name}" (genudo stage ${stage.id}) of "${pipeline.name}".\n${toYaml(stageConfig)}\n`,
      })
    })
  }

  return { client, pipelines, files, warnings }
}

/**
 * Call the client's own genudo MCP and collect every pipeline's configuration.
 * The token is the client's — passed in, never read from a global — so a pull
 * for one client can never reach another's data.
 */
export async function fetchBundles(
  token: string,
  baseUrl: string,
  timeoutMs = 120_000,
): Promise<{
  bundles: { pipeline: RawPipeline; stages: RawStage[]; actions: unknown[]; variables: unknown[] }[]
}> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
  const client = new Client({ name: 'loredex-pull', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'genudo-mcp-client'],
    // widenWindowsPath is a no-op off Windows; there it appends the per-user
    // Node locations a desktop-launched app cannot otherwise see
    env: widenWindowsPath({
      ...process.env,
      GENUDO_TOKEN: token,
      GENUDO_BASE_URL: baseUrl,
    }) as Record<string, string>,
  })
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    const res = (await client.callTool({ name, arguments: args })) as {
      content: { type: string; text?: string }[]
    }
    const text = res.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n')
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
  const deadline = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`genudo pull timed out after ${timeoutMs}ms`)), timeoutMs),
  )
  try {
    await Promise.race([client.connect(transport), deadline])
    // verbose:true matters — without it the platform TRUNCATES persona and
    // instructions with a "…re-call with verbose:true" marker, and we would
    // mirror the truncation into the vault as if it were the real content
    const list = (await Promise.race([
      call('list_pipelines', { verbose: true }),
      deadline,
    ])) as { pipelines?: RawPipeline[] }
    const bundles = []
    for (const pipeline of list.pipelines ?? []) {
      const [stages, actions, variables] = (await Promise.race([
        Promise.all([
          call('list_pipeline_stages', { pipeline_id: pipeline.id, verbose: true }),
          call('list_actions', { pipeline_id: pipeline.id }),
          call('list_variables', { pipeline_id: pipeline.id }),
        ]),
        deadline,
      ])) as [{ stages?: RawStage[] }, { actions?: unknown[] }, { variables?: unknown[] }]
      bundles.push({
        pipeline,
        stages: stages.stages ?? [],
        actions: actions.actions ?? [],
        variables: variables.variables ?? [],
      })
    }
    return { bundles }
  } finally {
    try {
      await client.close()
    } catch {
      // the bridge exits on stdin close — a failed close is not a pull failure
    }
  }
}

/**
 * Files the pull OWNS inside a pipeline folder, and may therefore replace.
 * Everything else in there belongs to someone else and is left alone — most
 * importantly `versions/`, which the genudo MCP writes at push time and whose
 * CHANGES.md records WHY a change was made. That reasoning never existed on the
 * platform, so a re-pull cannot reconstruct it: deleting it is unrecoverable.
 */
function ownsFile(name: string): boolean {
  return name === 'pipeline.yaml' || /^_.+\.(md|yaml)$/.test(name)
}

/**
 * Write a plan to disk.
 *
 * Deletes only what it owns — the unit's own `_*` field files, `pipeline.yaml`,
 * and `stages/` (regenerated wholesale, since a stage removed upstream must not
 * linger). It never removes the pipeline folder itself, so anything another tool
 * put there survives a refresh.
 *
 * Everything outside `pipelines/` — knowledge_tables, _inbox, _randoms,
 * workspace.yml — was already untouched and still is.
 */
export function writePlan(clientDirAbs: string, plan: PullPlan): { written: number } {
  for (const p of plan.pipelines) {
    const unitAbs = join(clientDirAbs, 'pipelines', p.slug)
    // stages are fully regenerated: a stage deleted upstream must disappear here
    rmSync(join(unitAbs, 'stages'), { recursive: true, force: true })
    for (const entry of safeEntries(unitAbs)) {
      if (entry.isFile() && ownsFile(entry.name)) {
        rmSync(join(unitAbs, entry.name), { force: true })
      }
    }
  }
  for (const file of plan.files) {
    const abs = join(clientDirAbs, file.rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, file.content, 'utf8')
  }
  return { written: plan.files.length }
}
