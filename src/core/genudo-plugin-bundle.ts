/**
 * Official GenuDo Plugin Bundle for Google Antigravity & Gemini CLI (`agy`).
 *
 * This module embeds the complete, official GenuDo plugin package directly into
 * Loredex Desktop. It provides zero-friction offline installation so that:
 * 1. Installing or opening Loredex automatically ensures the plugin is present
 *    in `~/.gemini/config/plugins/genudo` for Antigravity CLI and IDE.
 * 2. Settings › AI Providers and Settings › Integrations provide a live status
 *    and a one-click "Install / Reinstall Plugin" button.
 * 3. The plugin bundles:
 *    - Streamable HTTP MCP connection to https://api.genudo.ai/mcp
 *    - 4 Workflow Skills (Pipelines, Knowledge Tables, Messaging Operations, Follow-ups)
 *    - Operating conventions and safety rules
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const BUNDLED_GENUDO_PLUGIN_VERSION = '1.0.0'

export const GENUDO_PLUGIN_FILES: Record<string, string> = {
  'plugin.json': `{
  "name": "genudo",
  "version": "1.0.0",
  "description": "Official GenuDo integration for Antigravity & Gemini CLI — manage pipelines, agents, knowledge tables, and CRM actions",
  "author": {
    "name": "GenuDo AI",
    "url": "https://genudo.ai"
  },
  "keywords": [
    "genudo",
    "mcp",
    "crm",
    "ai-agents",
    "pipelines",
    "automation"
  ]
}
`,

  'mcp_config.json': `{
  "mcpServers": {
    "genudo": {
      "type": "http",
      "url": "https://api.genudo.ai/mcp",
      "serverUrl": "https://api.genudo.ai/mcp",
      "headers": {
        "Authorization": "Bearer \${GENUDO_TOKEN}"
      },
      "trust": true
    }
  }
}
`,

  'rules/genudo-conventions.md': `# GenuDo Agent Guidelines

## Core Principles

- **Authentication**: Ensure the \`GENUDO_TOKEN\` environment variable is set and valid before invoking GenuDo MCP tools.
- **Safety First**: Do not mutate or delete knowledge tables or active pipeline stages without explicit user confirmation.
- **Read-Before-Write**: Always discover existing resources first:
  - Call \`list_pipelines\` before creating new pipelines.
  - Call \`list_pipeline_stages\` before modifying or creating stages.
  - Call \`list_knowledge_tables\` before defining or modifying tables.
  - Call \`get_stage_followup\` before designing or updating stage follow-ups.
- **Data Validation**: When upserting knowledge points (\`upsert_knowledge_points\`), validate text payloads, ensure a stable \`default_id\` is provided, and supply complete values matching table column schemas.
- **Safe State Changes**: When updating live pipelines or stages (\`update_pipeline\`, \`update_stage\`), present a before-and-after comparison of instructions and stage settings before pushing changes.
- **Error Diagnostics**: On 401 or token errors, instruct the user to verify that their GenuDo token has the \`mcp:use\` scope enabled under **Developer > API Keys & Tokens** in the GenuDo dashboard.
`,

  'skills/pipeline-management/SKILL.md': `---
name: genudo-pipeline-management
description: Inspect, create, edit, and troubleshoot GenuDo automation pipelines, stages, and agent action tool bindings. Trigger whenever the user asks about GenuDo pipelines, journeys, or stage workflows.
---

# GenuDo Pipeline Management

## Overview
Guidelines and multi-step runbook for creating, modifying, and troubleshooting conversational automation pipelines, stages, and action bindings via GenuDo MCP tools.

## Key Tools

| Purpose | MCP Tool |
|---|---|
| Fetch available pipelines | \`list_pipelines\` |
| Inspect stages of a pipeline | \`list_pipeline_stages\` |
| Read valid build choices (models, channels) | \`get_pipeline_options\` |
| Scaffold a new pipeline | \`create_pipeline\` |
| Add a stage to a pipeline | \`create_stage\` |
| Attach actions/webhooks to a stage | \`create_action\` |
| Manage custom variables | \`create_variable\`, \`list_variables\`, \`update_variable\` |
| Update live pipeline / stages | \`update_pipeline\`, \`update_stage\`, \`update_action\` |
| Enroll contact into a pipeline | \`start_pipeline_journey\` |

---

## Step-by-Step Workflow

### 1. Discovery First
Always check what already exists before creating new objects:
1. Call \`list_pipelines\` to check existing pipelines and their IDs.
2. Call \`list_pipeline_stages\` with \`pipeline_id\` to inspect current stages, order, instructions, and \`enter_condition\` rules.
3. Call \`get_pipeline_options\` to retrieve allowed models, channel types (WhatsApp, Messenger, Instagram, Web), and system capabilities.

### 2. Pipeline Scaffolding
When creating a pipeline (\`create_pipeline\`):
- Provide a clear \`name\` indicating business role (e.g., "Inbound Sales Qualifying - WhatsApp").
- Define global \`instructions\` (business hours, company persona, tone, escalation triggers).
- Configure the default AI model and connected communication channel.

### 3. Stage Architecture
When creating stages (\`create_stage\`):
- **Logical Flow**: Order stages chronologically (e.g., \`Greeting / Discovery\` → \`Qualification\` → \`Booking / Handoff\` → \`Closed Won / Lost\`).
- **Enter Conditions**: Define unambiguous enter conditions so the AI transitions at the right conversation milestone.
- **Stage Instructions**: Focus on the specific objective of that stage (e.g., "Collect user budget and project timeline").
- **Opening Messages**: Specify whether the stage should send an opening message or wait for customer input.

### 4. Action & Webhook Bindings
To trigger external workflows (\`create_action\`):
- Specify \`stage_id\` and the trigger event (e.g., stage entry, stage completion, or explicit tool call).
- Define HTTP method, endpoint URL, headers, and request payload template.
- Attach required variables (e.g., \`{{contact.phone}}\`, \`{{variables.budget}}\`).

### 5. Safe Live Updates
When editing an existing pipeline or stage:
1. Read the live state via \`list_pipelines\` / \`list_pipeline_stages\`.
2. Generate a clear markdown before/after diff for the user.
3. Confirm with the user before calling \`update_pipeline\` or \`update_stage\`.
4. Verify by listing the stages again.

---

## Best Practices & Guardrails

- **Never Blind-Overwrite**: Do not call \`update_pipeline\` or \`update_stage\` without checking existing instructions first.
- **Tone & Persona**: Keep persona definitions in global pipeline instructions; keep stage instructions strictly focused on stage goals.
- **Variable Alignment**: Confirm custom variables exist (\`list_variables\`) before referencing them in stage instructions or action webhooks.
`,

  'skills/knowledge-tables/SKILL.md': `---
name: genudo-knowledge-tables
description: Manage, search, upsert, and curate GenuDo knowledge tables and vector grounding points. Trigger when managing company knowledge bases, updating facts, performing semantic vector searches, or modifying knowledge points.
---

# GenuDo Knowledge Tables Management

## Overview
Knowledge tables provide structured, vector-indexed factual grounding for GenuDo AI agents. Each table contains a defined column schema and row records retrieved via semantic hybrid search at runtime when leads ask factual or product questions.

## Key Tools

| Task | MCP Tool |
|---|---|
| View tables, columns, and attached pipelines | \`list_knowledge_tables\` |
| Create a new knowledge table schema | \`create_knowledge_table\` |
| Insert or update knowledge rows (vector points) | \`upsert_knowledge_points\` |
| Test runtime semantic retrieval | \`search_knowledge_table\` |
| Delete rows by stable ID | \`delete_knowledge_points\` |

---

## Step-by-Step Workflow

### 1. Discovery & Schema Inspection
Call \`list_knowledge_tables\` to inspect:
- Existing table names, descriptions, and IDs.
- Column schemas (e.g., \`product_name\`, \`pricing\`, \`features\`, \`eligibility\`).
- Which pipelines are linked to each table.

### 2. Table Creation
When creating a new table (\`create_knowledge_table\`):
- **\`name\`**: Descriptive identifier (e.g., \`summer_camp_pricing_2026\`).
- **\`description\`**: Clear "when-to-use" prompt guiding the AI router on when to query this table.
- **\`columns\`**: Array of column names that define the row schema.

### 3. Upserting Knowledge Points
Call \`upsert_knowledge_points\` to populate or update data:
- **\`table_id\`**: Target knowledge table ID.
- **\`points\`**: Array of data rows.
- **Stable ID (\`default_id\`)**: Always assign a deterministic, stable ID (e.g., \`prod-pro-annual\`, \`faq-refund-policy\`). If a point with the same \`default_id\` exists, it updates in-place; otherwise, it inserts a new row.
- **Complete Columns**: Supply values for all defined schema columns to avoid incomplete facts.

### 4. Verifying Retrieval
Always test retrieval before declaring the knowledge base ready:
- Call \`search_knowledge_table\` with \`table_id\`, \`query\`, and optional \`limit\`.
- Use realistic customer phrasing (e.g., "how much does the family plan cost?").
- Verify that the expected row is returned in the top matches with high relevance.

### 5. Deleting Outdated Points
- Call \`delete_knowledge_points\` with the target \`default_id\` list.
- **Caution**: Deletions are irreversible. Always show the candidate rows to the user and obtain confirmation before executing.

---

## Best Practices

- **Knowledge Table vs. Global Instructions**:
  - Use **Global Instructions** for overarching business rules, communication style, and fixed operational boundaries.
  - Use **Knowledge Tables** for variable catalogs, FAQs, pricing tiers, and domain knowledge that updates frequently or exceeds prompt limits.
- **Stable IDs**: Never generate random IDs for points if you need to update them later; use slugified semantic keys.
`,

  'skills/messaging-operations/SKILL.md': `---
name: genudo-messaging-operations
description: Analyze messaging statistics, inspect contact conversations, evaluate AI performance metrics, and trigger pipeline journeys. Trigger when reviewing message volume, channel breakdown (WhatsApp, Instagram, Messenger), investigating chat transcripts, or managing contact opportunities.
---

# GenuDo Messaging & CRM Operations

## Overview
Operational runbook for monitoring multi-channel messaging traffic, auditing conversation transcripts, evaluating AI agent performance, and syncing contact opportunities across WhatsApp, Instagram, Messenger, and LinkedIn.

## Key Tools

| Category | MCP Tool | Purpose |
|---|---|---|
| Account Health | \`get_account_summary\` | Overall count of pipelines, opportunities, and message totals/costs |
| Volume Analytics | \`get_messaging_stats\` | Time-windowed message traffic by channel provider and pipeline |
| AI Metrics | \`get_ai_performance\` | Model latency, token usage, cost per conversation, and completion rates |
| Transcripts | \`list_messages\` | Full turn-by-turn conversation history for contacts or pipelines |
| Contacts | \`list_contacts\` | Look up contacts by phone number, name, or metadata |
| Opportunities | \`list_opportunities\` / \`update_opportunities\` | Inspect and update pipeline deal status (active, won, lost) |
| Journey Automation | \`start_pipeline_journey\` | Enroll a contact into an automated pipeline flow |

---

## Step-by-Step Workflows

### 1. Workspace Health Audit
1. Call \`get_account_summary\` to verify:
   - Total pipelines and active opportunities.
   - Cumulative message volume and cost metrics.
   - Cost-per-deal ratios.
2. If anomaly or high volume is detected, proceed to channel-level investigation.

### 2. Channel Traffic & Volume Analysis
Call \`get_messaging_stats\` with specific filters:
- **\`provider\`**: Filter by \`whatsapp\`, \`messenger\`, \`instagram\`, or \`linkedin\`.
- **\`pipeline_id\`**: Focus on a specific active campaign or pipeline.
- **\`start_date\` / \`end_date\`**: Scope to daily, weekly, or monthly reporting intervals.

### 3. Transcript Audit & Drift Diagnosis
When diagnosing customer conversations or agent mistakes:
1. Identify the contact with \`list_contacts\` (search by phone or name).
2. Fetch chronological chat messages with \`list_messages\` passing \`contact_id\` or \`pipeline_id\`.
3. Review turn-by-turn interactions:
   - Identify which stage the conversation was in.
   - Check if the agent respected stage boundaries, instructions, and grounding facts.
   - Pinpoint drift points (e.g., hallucinations, missed webhook triggers, premature stage transitions).

### 4. Opportunity & Funnel Management
1. Call \`list_opportunities\` to query leads by stage, status (\`active\`, \`pending\`, \`won\`, \`lost\`), or pipeline.
2. Call \`update_opportunities\` to update lead status, move opportunities to different stages, or mark deals as won/lost.

### 5. Enrolling Contacts in Pipeline Journeys
To trigger automated outreach or sequence onboarding:
- Call \`start_pipeline_journey\` with the target \`pipeline_id\` and \`contact_id\` (or contact details).
- Verify enrollment and monitor initial messages via \`list_messages\`.
`,

  'skills/stage-followups/SKILL.md': `---
name: genudo-stage-followups
description: Design, schedule, and update per-stage follow-up sequences for re-engaging silent leads in GenuDo pipelines. Trigger when configuring lead nurture intervals, follow-up messages, or stage expiration actions.
---

# GenuDo Stage Follow-up Sequences

## Overview
Guidelines for creating and modifying automated re-engagement sequences when leads go quiet within a specific pipeline stage. Follow-ups allow the agent to reach back out after specified elapsed time intervals with context-aware, value-first messaging.

## Key Tools

| Purpose | MCP Tool |
|---|---|
| Check existing stage follow-up configuration | \`get_stage_followup\` |
| Create a new follow-up sequence for a stage | \`create_followup\` |
| Update an existing follow-up sequence | \`update_followup\` |

---

## Architecture of a Follow-up Sequence

Each pipeline stage holds at most **one** follow-up sequence. A sequence consists of:

1. **Intervals**: The timed schedule of when each message fires after the contact becomes inactive.
   - Format: Array of objects \`{ interval_value: 1–100, interval_unit: "minute" | "hour" | "day" | "week" | "month" }\`.
   - Example: First message at 10 hours, second at 24 hours, third at 3 days.
2. **Drafting Instructions**: Guidance for how the AI dynamically composes the follow-up message (e.g., "Reference the plan discussed previously, ask if they had questions regarding setup").
3. **Assets**: Optional media or resources attached to messages (brochures, demo videos, scheduling links).
4. **\`after_followup_stage_id\`**: Optional stage to automatically move the opportunity to when all follow-up attempts are exhausted without a reply (e.g., transitioning to a "Cold Leads" or "Closed Lost" stage).

---

## Step-by-Step Workflow

### 1. Check Existing Configuration
Always run \`get_stage_followup\` with the target \`stage_id\`:
- If a sequence exists, capture the \`followup_id\` for use with \`update_followup\`.
- If no sequence exists, prepare to call \`create_followup\`.

### 2. Design the Sequence
Collaborate with the user to establish:
- Realistic intervals that avoid spamming (e.g., 6 hours, 24 hours, 72 hours).
- Distinct angles for each follow-up message:
  - Follow-up 1: Gentle check-in / question clarification.
  - Follow-up 2: Value add (case study, testimonial, or brief tip).
  - Follow-up 3: Soft breakup or alternative contact option.
- Expiration action: specify \`after_followup_stage_id\` or leave \`null\`.

### 3. Push to GenuDo
- **New Sequence**: Call \`create_followup\` with \`stage_id\`, \`is_active\`, \`intervals\`, \`instructions\`, and optional \`after_followup_stage_id\`.
- **Existing Sequence**: Call \`update_followup\` with \`followup_id\`.
  - **Important**: The \`intervals\` array *replaces* the existing schedule completely; always pass the full intended list.

---

## Safety & Best Practices

- **Explicit Approval**: Always present the follow-up schedule and drafting angle to the user in a clear table before calling \`create_followup\` or \`update_followup\`.
- **Safe Activation**: When creating draft sequences, set \`is_active: false\` until the user confirms readiness to go live.
`,

  'README.md': `# GenuDo Plugin for Google Antigravity & Gemini CLI (\`agy\`)

Official GenuDo integration for Antigravity and Gemini CLI. Bundles the GenuDo MCP server and 4 workflow skills.

## Features
- **Remote Streamable HTTP MCP**: Preconfigured connection to \`https://api.genudo.ai/mcp\`.
- **Pipeline Management Skill**: Create, manage, and wire stage actions.
- **Knowledge Tables Skill**: Factual grounding vector points and hybrid search.
- **Messaging Operations Skill**: Omni-channel chat analytics and transcripts.
- **Stage Follow-ups Skill**: Lead re-engagement interval schedules.
- **Operating Conventions**: Pre-configured safety rules for agent decisions.
`
}

/** Default destination path for global Antigravity plugins. */
export function defaultPluginInstallDir(): string {
  return join(homedir(), '.gemini', 'config', 'plugins', 'genudo')
}

/** Check whether the GenuDo plugin is installed and valid in the specified directory. */
export function isGenudoPluginInstalled(targetDir: string = defaultPluginInstallDir()): boolean {
  try {
    const manifestPath = join(targetDir, 'plugin.json')
    if (!existsSync(manifestPath)) return false
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string; version?: string }
    return parsed.name === 'genudo' && typeof parsed.version === 'string'
  } catch {
    return false
  }
}

/** Status object for IPC and UI inspection. */
export function getGenudoPluginStatus(targetDir: string = defaultPluginInstallDir()): {
  installed: boolean
  version: string | null
  bundledVersion: string
  path: string
} {
  try {
    const manifestPath = join(targetDir, 'plugin.json')
    if (existsSync(manifestPath)) {
      const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: string }
      return {
        installed: true,
        version: parsed.version ?? 'unknown',
        bundledVersion: BUNDLED_GENUDO_PLUGIN_VERSION,
        path: targetDir,
      }
    }
  } catch {
    // treat read error as missing
  }
  return {
    installed: false,
    version: null,
    bundledVersion: BUNDLED_GENUDO_PLUGIN_VERSION,
    path: targetDir,
  }
}

/**
 * Install or update the GenuDo Antigravity plugin by writing all bundled files.
 * Replaces existing files cleanly.
 */
export function installGenudoPlugin(targetDir: string = defaultPluginInstallDir()): {
  ok: boolean
  path: string
  files: string[]
} {
  const written: string[] = []
  try {
    for (const [relPath, content] of Object.entries(GENUDO_PLUGIN_FILES)) {
      const absPath = join(targetDir, relPath)
      const parentDir = dirname(absPath)
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true })
      }
      writeFileSync(absPath, content, 'utf8')
      written.push(relPath)
    }
    return { ok: true, path: targetDir, files: written }
  } catch {
    return { ok: false, path: targetDir, files: written }
  }
}

/**
 * Ensures the GenuDo plugin is installed in the global Antigravity config directory.
 * Best-effort, non-blocking. In test environments, does not run automatically.
 */
export function ensureGenudoPluginInstalled(targetDir: string = defaultPluginInstallDir()): void {
  try {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return
    }
    if (!isGenudoPluginInstalled(targetDir)) {
      installGenudoPlugin(targetDir)
    }
  } catch {
    // Non-blocking best-effort
  }
}
