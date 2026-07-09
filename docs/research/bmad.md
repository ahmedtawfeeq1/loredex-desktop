# The BMAD Method — Current State, Artifact Chain, and Exact Story-File Format

Research date: 2026-07-09. All templates below were pulled verbatim from the official repository ([bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD), ~50,300 stars) and its docs site ([docs.bmad-method.org](https://docs.bmad-method.org)). Purpose: enable authoring authentic BMAD artifacts (brief → PRD → architecture → epics → story files) and running a BMAD dev workflow for the loredex-desktop greenfield project.

---

## 1. What BMAD is, and where it stands today

**BMAD-METHOD** ("Breakthrough Method for Agile AI-Driven Development"; the docs now also expand it as "Build More Architect Dreams") is Brian Madison's (BMad Code) open-source framework for running agentic software development as a *simulated agile team*: named AI agents with fixed roles (Analyst, PM, Architect, Developer, …) produce a chain of versioned markdown artifacts, ending in **self-contained story files** that a dev agent can implement without ever reading the PRD or architecture doc. Its two core innovations, per the repo: **agentic planning** (dedicated planning agents producing consistent PRD/architecture) and **context-engineered development** (a story-preparation step that embeds everything the implementer needs directly in the story file).

**Version landscape (verified against [GitHub releases](https://github.com/bmad-code-org/BMAD-METHOD/releases)):**

| Line | Status (2026-07) | Notes |
|---|---|---|
| **V4** | Frozen on the [`V4` branch](https://github.com/bmad-code-org/BMAD-METHOD/tree/V4) | The "classic" BMAD most tutorials describe: `bmad-core/` with agents/tasks/templates, `Draft/Approved/InProgress/Review/Done` story lifecycle, SM+Dev+QA cycle. Still fully readable and usable as a manual method. |
| **V5** | Never shipped as a stable line | Tags jump from v4.x straight to `v6.0.0-alpha` (Sep 2025). "v5" was effectively skipped; the rewrite shipped as V6. |
| **V6** | **Current.** First stable `v6.0.0` (Jan 2026); latest **v6.10.0, released 2026-07-03** | Repo moved from `bmadcode/BMAD-METHOD` to `bmad-code-org/BMAD-METHOD`. Ground-up restructure: module ecosystem (BMM core, BMB builder, TEA test architect, CIS creative, BMGD game dev), agents-as-skills (`bmad-agent-*`), four phases, planning tracks, `sprint-status.yaml` tracking, `_bmad/` + `_bmad-output/` folders. v6.3.0 (2026-04-10) consolidated three implementation personas (dev "Barry", TEA "Quinn", SM "Bob") into a single Developer agent, **Amelia**. v6.10.0 added the `bmad-loop` module for unattended story-loop automation. |

Install: `npx bmad-method install` (Node ≥ 20.12 for v6; `@next` for prerelease). Docs: [docs.bmad-method.org](https://docs.bmad-method.org); source of docs pages lives in-repo under [`docs/`](https://github.com/bmad-code-org/BMAD-METHOD/tree/main/docs).

**Which form to emulate:** this report captures both. The *story-file anatomy* everyone means by "a BMAD story" (Status lifecycle `Draft → Approved → InProgress → Review → Done`, Story statement, ACs, Tasks/Subtasks, Dev Notes with architecture citations, Dev Agent Record, QA Results) is the **V4 format** — §5. The current **V6 workflow** (§6–7) keeps the same anatomy with a slightly different lifecycle (`backlog → ready-for-dev → in-progress → review → done` tracked in `sprint-status.yaml`) and folds SM/QA duties into the Developer agent. For hand-authored artifacts driven by a generic coding agent (no BMAD installer), the V4 format is the most faithful, self-contained target; adopt V6's `sprint-status.yaml` if a machine-readable board is wanted.

---

## 2. Agent roles

### V4 core team ([bmad-kb.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/data/bmad-kb.md), agent files under [`bmad-core/agents/`](https://github.com/bmad-code-org/BMAD-METHOD/tree/V4/bmad-core/agents))

| id | Persona | Role | Key commands / duties |
|---|---|---|---|
| `analyst` | Mary | Business Analyst | brainstorming, market research, competitor analysis, **project brief** |
| `pm` | John | Product Manager | **PRD** (FRs, NFRs, epics & stories), `*correct-course` |
| `architect` | Winston | Solution Architect | **architecture doc** from PRD (+ UX spec) |
| `ux-expert` | Sally | UX Designer | front-end spec, v0/Lovable UI prompts (optional) |
| `po` | Sarah | Product Owner | **po-master-checklist** across PRD+architecture, **shard documents**, `validate-next-story` |
| `sm` | Bob | Scrum Master | `*draft` → **create-next-story** task; "story creation expert who prepares detailed, actionable stories for AI developers … NOT allowed to implement stories or modify code EVER" ([sm.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/agents/sm.md)) |
| `dev` | James | Full Stack Developer | `*develop-story` — sequential task execution; edits only its permitted story sections ([dev.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/agents/dev.md)) |
| `qa` | Quinn | **Test Architect** & Quality Advisor | `*risk`, `*design`, `*trace`, `*nfr`, `*review`, `*gate`; may edit **only the QA Results section** of a story ([qa.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/agents/qa.md)) |

Meta agents: `bmad-master` (can do everything except implement stories) and `bmad-orchestrator` (web-bundle team coordinator only — explicitly not for IDE use). Agents are markdown files with an embedded YAML block (persona, commands, lazy-loaded `dependencies` on tasks/templates/checklists) — agents load dependency files only when a command needs them ("lean context").

### V6 named agents ([docs/reference/agents.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/reference/agents.md), [named-agents.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/explanation/named-agents.md))

Six named agents, each an installable skill (`bmad-agent-*`), each anchored to a phase:

| Agent | Skill ID | Phase | Primary workflows |
|---|---|---|---|
| 📊 **Mary**, Business Analyst | `bmad-agent-analyst` | 1 Analysis | Brainstorm, Market/Domain/Technical Research, Create Brief, PRFAQ, Document Project |
| 📚 **Paige**, Technical Writer | `bmad-agent-tech-writer` | 1 Analysis | Document Project, Write Document, Mermaid diagrams, Validate Doc |
| 📋 **John**, Product Manager | `bmad-agent-pm` | 2 Planning | Create/Update/Validate PRD, **Create Epics and Stories**, Implementation Readiness, Correct Course |
| 🎨 **Sally**, UX Designer | `bmad-agent-ux-designer` | 2 Planning | Create UX Design |
| 🏗️ **Winston**, System Architect | `bmad-agent-architect` | 3 Solutioning | Create Architecture, Implementation Readiness check |
| 💻 **Amelia**, Senior Engineer | `bmad-agent-dev` | 4 Implementation | Sprint Planning, **Create Story**, **Dev Story**, Quick Dev, **Code Review**, QA test generation, Epic Retrospective |

Note the consolidation: in V6 there is **no separate SM, PO, or QA agent** — Amelia runs story creation, implementation, and code review (each in a *fresh chat*, ideally review with a *different LLM*). The full Test Architect (TEA, "Murat") lives in a separate optional module. Agents are customized via layered TOML (`customize.toml` → `_bmad/custom/*.toml` team → `*.user.toml` personal).

---

## 3. The artifact chain

### V4 chain and standard paths ([user-guide.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/docs/user-guide.md))

```
(optional) brainstorming / market research / competitor analysis   — Analyst
project brief                                                      — Analyst
PRD (FRs, NFRs, epics, stories)             → docs/prd.md          — PM
(optional) front-end spec                                          — UX Expert
architecture doc                            → docs/architecture.md — Architect
PO master checklist (alignment gate)                               — PO
SHARD documents                             → docs/prd/ (epic-{n}*.md), docs/architecture/*.md — PO
story files                                 → docs/stories/{epic}.{story}.{slug}.md — SM
QA assessments / gates                      → docs/qa/assessments/, docs/qa/gates/  — QA
```

Planning was recommended in a web UI with a large-context model ("cost effective"), then a hard **switch to the IDE**: copy `docs/prd.md` + `docs/architecture.md`, shard them, and run the SM → Dev → QA loop, **one story at a time, fresh chat per agent**. The dev cycle (verbatim from the kb):

```
1. SM Agent (New Chat) → Creates next story from sharded docs
2. You → Review and approve story
3. Dev Agent (New Chat) → Implements approved story
4. QA Agent (New Chat) → Reviews and refactors code
5. You → Verify completion
6. Repeat until epic complete
```

`core-config.yaml` (project root, [V4 example](https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/core-config.yaml)) wires the paths — most importantly **`devLoadAlwaysFiles`**, the only architecture files the dev agent ever auto-loads:

```yaml
prd: { prdFile: docs/prd.md, prdSharded: true, prdShardedLocation: docs/prd, epicFilePattern: epic-{n}*.md }
architecture: { architectureFile: docs/architecture.md, architectureSharded: true, architectureShardedLocation: docs/architecture }
devLoadAlwaysFiles:
  - docs/architecture/coding-standards.md
  - docs/architecture/tech-stack.md
  - docs/architecture/source-tree.md
devStoryLocation: docs/stories
qa: { qaLocation: docs/qa }
```

### V6 chain: four phases, three planning tracks ([workflow map](https://docs.bmad-method.org/reference/workflow-map/), [getting started](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/tutorials/getting-started.md))

| Phase | Workflows (skill names) | Output |
|---|---|---|
| **1 Analysis** *(optional)* | `bmad-brainstorming`, `bmad-forge-idea`, `bmad-market/domain/technical-research`, `bmad-product-brief`, `bmad-prfaq` | `brief.md`, research docs |
| **2 Planning** | `bmad-prd` (Create/Update/Validate intents), `bmad-ux` | `prd.md` (+ `addendum.md`, `.memlog.md`), UX design |
| **3 Solutioning** | `bmad-create-architecture`, **`bmad-create-epics-and-stories`**, `bmad-generate-project-context`, `bmad-check-implementation-readiness` (PASS/CONCERNS/FAIL gate) | `architecture.md`, `epics.md` (or `epics/` folder), `project-context.md` |
| **4 Implementation** | `bmad-sprint-planning` (once) → loop: `bmad-create-story` → `bmad-dev-story` → `bmad-code-review` → epic done: `bmad-retrospective`; `bmad-correct-course` for mid-sprint change | `sprint-status.yaml`, story files, code+tests |

Standard v6 output tree:

```
_bmad/                                   # installed agents/workflows/config
_bmad-output/
  planning-artifacts/    (PRD.md, architecture.md, epics.md or epics/)
  implementation-artifacts/ (sprint-status.yaml, {epic}-{story}-{slug}.md story files)
  project-context.md     (optional cross-workflow implementation rules)
```

Planning tracks (scale-adaptive): **Quick Flow** (1–15 stories; `bmad-quick-dev` goes spec→code, no PRD/architecture), **BMad Method** (10–50+ stories; PRD + Architecture + UX), **Enterprise** (30+; adds security/devops). A headline V6 change: **epics/stories are created *after* architecture** so the breakdown is technically informed.

---

## 4. Epics: format and sizing rules

### The epics file ([v6 epics-template.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/3-solutioning/bmad-create-epics-and-stories/templates/epics-template.md))

`epics.md` carries: a Requirements Inventory (FR list, NFR list, UX requirements, **FR coverage map**), an Epic List, then per epic:

```markdown
## Epic {N}: {epic_title}
{epic_goal}

### Story {N}.{M}: {story_title}
As a {user_type},
I want {capability},
So that {value_benefit}.

**Acceptance Criteria:**
**Given** {precondition}
**When** {action}
**Then** {expected_outcome}
**And** {additional_criteria}
```

(V6 ACs are BDD Given/When/Then in the epic file; V4 used plain numbered ACs.)

### Sizing and sequencing rules (verbatim from the [V4 PRD template](https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/templates/prd-tmpl.yaml) — still the canonical statement of BMAD story sizing)

Epics:
- "Epics MUST be logically sequential following agile best practices"
- "Each epic should deliver a significant, end-to-end, fully deployable increment of testable functionality"
- "**Epic 1 must establish foundational project infrastructure (app setup, Git, CI/CD, core services)** … while also delivering an initial piece of functionality, even as simple as a health-check route or display of a simple canary page"
- "Err on the side of less epics"

Stories:
- "Stories within each epic MUST be logically sequential"
- "Each story should be a **'vertical slice'** delivering complete functionality aside from early enabler stories for project foundation"
- "No story should depend on work from a later story or epic"
- "Focus on 'what' and 'why' not 'how' (leave technical implementation to Architect)"
- "**Size stories for AI agent execution: Each story must be completable by a single AI agent in one focused session without context overflow**"
- "**Think 'junior developer working for 2-4 hours'** — stories must be small, focused, and self-contained"
- "If a story seems complex, break it down further as long as it can deliver a vertical slice"

This is the exact provenance of the "one dev-agent session" sizing rule.

---

## 5. The V4 story file — exact format

Source: [`bmad-core/templates/story-tmpl.yaml`](https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/templates/story-tmpl.yaml) (template id `story-template-v2`). Output file: `docs/stories/{epic_num}.{story_num}.{story_title_short}.md`, title `Story {epic_num}.{story_num}: {story_title_short}`. Sections in order, with owner/editor permissions (the permission model is load-bearing — it is what keeps three agents from trampling each other in one file):

| # | Section | Content | Owner | Editors |
|---|---|---|---|---|
| 1 | **Status** | one of **`Draft`, `Approved`, `InProgress`, `Review`, `Done`** | scrum-master | scrum-master, dev-agent |
| 2 | **Story** | `**As a** {role},`<br>`**I want** {action},`<br>`**so that** {benefit}` | scrum-master | scrum-master |
| 3 | **Acceptance Criteria** | numbered list, **copied from the epic file** | scrum-master | scrum-master |
| 4 | **Tasks / Subtasks** | checkboxed tree; each task tagged to ACs: `- [ ] Task 1 (AC: 1, 3)` with `- [ ] Subtask 1.1…` | scrum-master | scrum-master, dev-agent |
| 5 | **Dev Notes** | *only* facts extracted from real docs — "Do not invent information"; relevant source-tree info; notes from previous story; "**Put enough information in this section so that the dev agent should NEVER need to read the architecture documents**" | scrum-master | scrum-master |
| 5a | └ **Testing** | test file location, standards, frameworks/patterns, story-specific testing requirements — pulled from testing-strategy | scrum-master | scrum-master |
| 6 | **Change Log** | table `[Date, Version, Description, Author]` | scrum-master | scrum-master, dev-agent, qa-agent |
| 7 | **Dev Agent Record** | populated by dev agent during implementation | dev-agent | dev-agent |
| 7a | └ Agent Model Used | `{{agent_model_name_version}}` | dev-agent | dev-agent |
| 7b | └ Debug Log References | links to debug logs/traces | dev-agent | dev-agent |
| 7c | └ Completion Notes List | issues met, what was actually done | dev-agent | dev-agent |
| 7d | └ **File List** | ALL files created/modified/deleted | dev-agent | dev-agent |
| 8 | **QA Results** | appended by QA agent's `*review` | qa-agent | qa-agent |

### Status lifecycle (V4)

`Draft` (SM creates) → user/PO review → `Approved` → dev agent picks it up → `InProgress` → all tasks `[x]`, tests pass, DoD checklist run → dev sets **"Ready for Review"** (the `Review` state) → optional QA `*review` writes QA Results + gate file → human verifies, commits → `Done`. The kb states it as: "Status Tracking: Maintain story statuses (Draft → Approved → InProgress → Done)". The dev agent's completion rule (verbatim from [dev.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/agents/dev.md)): "All Tasks and Subtasks marked [x] and have tests → Validations and full regression passes (DON'T BE LAZY, EXECUTE ALL TESTS and CONFIRM) → Ensure File List is Complete → run the task execute-checklist for the checklist story-dod-checklist → set story status: 'Ready for Review' → HALT".

### How the SM builds it — `create-next-story` ([task file](https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/tasks/create-next-story.md))

Sequential, non-skippable steps:

0. Load `core-config.yaml`; HALT if missing.
1. **Identify next story**: find highest `{epic}.{story}.story.md` in `devStoryLocation`; if it isn't `Done`, alert the user; if epic complete, *ask* (never auto-advance epics); if no stories exist, next is **always 1.1**.
2. **Previous story context**: read the prior story's Dev Agent Record (completion notes, debug refs, deviations, lessons) and carry insights forward.
3. **Architecture context with a per-story-type reading strategy** — for ALL stories read `tech-stack.md`, `unified-project-structure.md`, `coding-standards.md`, `testing-strategy.md`; backend stories add `data-models.md`, `database-schema.md`, `backend-architecture.md`, `rest-api-spec.md`, `external-apis.md`; frontend stories add `frontend-architecture.md`, `components.md`, `core-workflows.md`, `data-models.md`. Extract ONLY story-relevant details; never invent; **"ALWAYS cite source documents: `[Source: architecture/{filename}.md#{section}]`"**.
4. Verify file paths/module names against the project structure guide; log conflicts in "Project Structure Notes".
5. Populate the template: Dev Notes organized by category (Previous Story Insights, Data Models, API Specifications, Component Specifications, File Locations, Testing Requirements, Technical Constraints), every fact with a `[Source: …]` reference, "If information for a category is not found in the architecture docs, explicitly state: 'No specific guidance found in architecture docs'"; Tasks/Subtasks generated ONLY from epic + ACs + reviewed architecture, with AC links and explicit unit-test subtasks.
6. Set Status `Draft`, run `story-draft-checklist`, suggest optional PO `validate-next-story`.

### How context flows so the dev never reads the PRD

Three mechanisms, all verbatim policies:

1. **Story self-sufficiency** — dev agent core principle: "Story has ALL info you will need aside from what you loaded during the startup commands. **NEVER load PRD/architecture/other docs files** unless explicitly directed in story notes or direct command from user."
2. **A tiny always-loaded rule set** — the dev agent loads only the assigned story + `devLoadAlwaysFiles` (lean coding-standards / tech-stack / source-tree). The kb advises shrinking coding-standards over time as the codebase itself becomes the example.
3. **Write-fencing** — dev may edit *only*: Tasks/Subtasks checkboxes, Dev Agent Record (all subsections), File List, Change Log, Status. "DO NOT modify Status→sections list… Story, Acceptance Criteria, Dev Notes, Testing sections". QA may edit *only* QA Results. This keeps the requirements half of the file immutable during implementation.

Dev execution order (`*develop-story`): "Read (first or next) task → Implement Task and its subtasks → Write tests → Execute validations → Only if ALL pass, then update the task checkbox with [x] → Update File List → repeat". HALT conditions: unapproved dependencies needed, ambiguity after story check, 3 repeated failures, missing config, failing regression.

### V4 QA layer — the Test Architect (Quinn)

Advisory, never blocking ("teams choose their quality bar"). Commands and outputs ([user-guide.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/docs/user-guide.md)):

```
*risk    → docs/qa/assessments/{epic}.{story}-risk-{YYYYMMDD}.md      (probability × impact 1–9; ≥9 FAIL, ≥6 CONCERNS)
*design  → docs/qa/assessments/{epic}.{story}-test-design-{YYYYMMDD}.md (P0/P1/P2 scenarios, unit/int/e2e split)
*trace   → docs/qa/assessments/{epic}.{story}-trace-{YYYYMMDD}.md      (AC → test mapping, Given-When-Then)
*nfr     → docs/qa/assessments/{epic}.{story}-nfr-{YYYYMMDD}.md        (security/performance/reliability/maintainability)
*review  → QA Results section in story + gate file
*gate    → docs/qa/gates/{epic}.{story}-{slug}.yml   (PASS / CONCERNS / FAIL / WAIVED)
```

---

## 6. The V6 story file — exact format

Source: [`src/bmm-skills/4-implementation/bmad-create-story/template.md`](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/4-implementation/bmad-create-story/template.md) (verbatim, current `main` @ v6.10.0):

```markdown
# Story {{epic_num}}.{{story_num}}: {{story_title}}

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a {{role}},
I want {{action}},
so that {{benefit}}.

## Acceptance Criteria

1. [Add acceptance criteria from epics/PRD]

## Tasks / Subtasks

- [ ] Task 1 (AC: #)
  - [ ] Subtask 1.1
- [ ] Task 2 (AC: #)
  - [ ] Subtask 2.1

## Dev Notes

- Relevant architecture patterns and constraints
- Source tree components to touch
- Testing standards summary

### Project Structure Notes

- Alignment with unified project structure (paths, modules, naming)
- Detected conflicts or variances (with rationale)

### References

- Cite all technical details with source paths and sections, e.g. [Source: docs/<file>.md#Section]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
```

Same anatomy as V4 (Story / ACs / Tasks-Subtasks with AC links / Dev Notes with `[Source: …]` citations / Dev Agent Record with Model, Debug Log, Completion Notes, File List) — differences: statuses are lowercase lifecycle strings; a `baseline_commit` YAML frontmatter key is added by `dev-story` (git SHA at start of work, or `NO_VCS`); **no QA Results section** — instead `bmad-code-review` appends a **"Senior Developer Review (AI)"** section (outcome Approve / Changes Requested / Blocked; severity-ranked Action Items) plus a **"Review Follow-ups (AI)"** subsection under Tasks/Subtasks whose items are prefixed `[AI-Review]`. Story files land at `{implementation_artifacts}/{{story_key}}.md` with story keys like `1-2-user-authentication`.

### V6 status lifecycle and `sprint-status.yaml`

Verbatim STATUS DEFINITIONS from the [sprint-status template](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/4-implementation/bmad-sprint-planning/sprint-status-template.yaml):

```
Epic Status:   backlog → in-progress → done
Story Status:  backlog        (story only exists in epic file)
             → ready-for-dev  (story file created)
             → in-progress    (developer actively implementing)
             → review         (implementation complete, ready for review)
             → done
Retrospective: optional → done
Action items:  open → in-progress → done
```

Workflow notes in the same file: mark epic `in-progress` on its first story; "Developer typically creates next story ONLY after previous one is 'done' to incorporate learnings"; "Dev moves story to 'review', then Dev runs code-review (**fresh context, ideally different LLM**)". The file is a flat `development_status:` map (`epic-1: backlog`, `1-1-user-authentication: done`, `epic-1-retrospective: optional`, …) plus an `action_items:` list appended by retrospectives. Note: statuses are canonically lowercase; the repo has had drift bugs where prose said "Ready for Review" ([issue #1105](https://github.com/bmad-code-org/BMAD-METHOD/issues/1105)).

### How V6 builds story context — `bmad-create-story` ([SKILL.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/4-implementation/bmad-create-story/SKILL.md))

Self-described "**story context engine that prevents LLM developer mistakes, omissions, or disasters** … your purpose is NOT to copy from epics". Named failure modes it exists to prevent: "reinventing wheels, wrong libraries, wrong file locations, breaking regressions, ignoring UX, vague implementations, lying about completion, not learning from past work". Steps:

1. Pick target story: first `backlog` story in `sprint-status.yaml` (reading the file top-to-bottom, order preserved), or user-specified `1-2` / `epic 1 story 5`.
2. **Exhaustive artifact analysis**: epics file (whole-epic context + this story's ACs), PRD/architecture/UX as fallbacks (SELECTIVE_LOAD), **previous story's Dev Notes/review feedback/file patterns**, plus **git intelligence** (last ~5 commits: files touched, conventions, dependencies added).
3. **Architecture guardrail extraction** (stack+versions, structure, API patterns, schemas, security, testing standards) and — non-negotiable — **read every existing file the story will modify**, documenting current state / what changes / what must be preserved: "A story implementation must leave the system working end-to-end — not just satisfy its stated ACs."
4. **Web research** for latest versions/breaking changes of critical libraries.
5. Write the story file from the template; set Status `ready-for-dev`.
6. Validate against `checklist.md`, flip `sprint-status.yaml` entry `backlog → ready-for-dev`.

### How V6 implements — `bmad-dev-story` ([SKILL.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/4-implementation/bmad-dev-story/SKILL.md))

- Finds first `ready-for-dev` story in sprint order (or takes a path); parses Story / ACs / Tasks-Subtasks / Dev Notes / Dev Agent Record / File List / Change Log / Status.
- Write-fence (verbatim): "Only modify the story file in these areas: YAML frontmatter `baseline_commit`, Tasks/Subtasks checkboxes, Dev Agent Record (Debug Log, Completion Notes), File List, Change Log, and Status".
- Records `baseline_commit` (git HEAD) on first start; flips sprint status to `in-progress`.
- Detects **review continuation**: if a "Senior Developer Review (AI)" section exists, prioritizes unchecked `[AI-Review]` follow-up tasks first.
- Implements each task via **red-green-refactor** (failing test first → minimal code → refactor), with hard rules: "NEVER implement anything not mapped to a specific task/subtask in the story file"; "NEVER mark a task complete unless ALL conditions are met — NO LYING OR CHEATING"; run in a single continuous execution, no "milestone" pauses. HALT conditions: new dependencies need approval, 3 consecutive failures, missing configuration, regression failures.
- Completion (step 9): all tasks `[x]`, full regression suite, File List complete, definition-of-done checklist → Status `review` (story file + sprint-status). Tip printed to the user: "run `code-review` using a **different** LLM than the one that implemented this story."
- `code-review` approval marks the story `done`. After the epic's last story: `bmad-retrospective` (writes action items into sprint-status).

Automation: v6.10's **bmad-loop** module (`bmad-dev-auto` skill) runs the create-story → dev-story → code-review loop unattended between human checkpoints.

---

## 7. Greenfield best practices (as BMAD itself teaches them)

Consolidated from the [V4 user guide/kb](https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/docs/user-guide.md) and [V6 getting started](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/tutorials/getting-started.md):

1. **Do the full planning chain before any code** for anything product-sized: brief → PRD → (UX) → architecture → epics/stories → readiness check. Quick Flow (`bmad-quick-dev`) only for 1–15-story, well-understood work.
2. **Fresh chat per workflow and per agent role, always.** "Clean handoffs: always start fresh when switching between agents." Planning in a big-context model; implementation in the IDE.
3. **Epic 1 = walking skeleton**: project scaffold, git, CI/CD, core services, plus one visible feature (health-check route / canary page).
4. **Stories are sequential vertical slices sized for one focused dev-agent session** ("junior developer, 2–4 hours"), no forward dependencies, ACs copied verbatim from the epic.
5. **Run the alignment gate before implementation** — V4: PO master-checklist over PRD+architecture; V6: `bmad-check-implementation-readiness` (PASS/CONCERNS/FAIL). Fix documents, not code.
6. **Keep the dev agent's standing context tiny and curated** — V4 `devLoadAlwaysFiles` (lean coding-standards/tech-stack/source-tree); V6 `project-context.md` ("technology stack and implementation rules" loaded by every workflow). Everything else arrives through the story file.
7. **One story at a time; don't draft story N+1 until N is done** — so each new story inherits the previous Dev Agent Record's lessons.
8. **Review with fresh context, ideally a different model**, then commit before proceeding ("IMPORTANT: COMMIT YOUR CHANGES BEFORE PROCEEDING!" is a red node in the official workflow diagram).
9. **Statuses are the coordination protocol** — agents and humans communicate through the Status field / sprint-status.yaml, never through chat memory.
10. **Retrospective per epic**; `correct-course` (PM) for mid-flight scope changes rather than ad-hoc edits.

---

## 8. Applying this to loredex-desktop

- **Artifact set to author**: `docs/project-brief.md` (Analyst voice — the simulation report is effectively the market/user research input), `docs/prd.md` (PM: FRs/NFRs drawn from the DESKTOP-APP-FEATURES must/should/could table, epics honoring the MVP cut line), `docs/architecture.md` (Architect: Tauri/Electron decision, loredex lib embedding, vault/git model — then sharded so `coding-standards.md`, `tech-stack.md`, `source-tree.md` exist for `devLoadAlwaysFiles`), `docs/epics/epic-{n}-*.md`, and stories in `docs/stories/{epic}.{story}.{slug}.md`.
- **Story format**: use the V4 anatomy verbatim (§5) — it is the exact schema requested (Status `Draft/Approved/InProgress/Review/Done`, Story statement, ACs, Tasks/Subtasks with `(AC: #)`, Dev Notes with `[Source: architecture/…#…]` citations + Testing subsection, Change Log, Dev Agent Record, QA Results). Optionally add a V6-style `sprint-status.yaml` as the machine-readable board — which, notably, is the same pattern loredex's own handoff-status problem space (F1/F3) wants.
- **Epic 1** should be the walking skeleton: app shell boots on macOS arm64, opens a vault, renders one markdown note — BMAD's canary-page rule maps cleanly onto the MVP pillar 1 (vault reader).
- **Sizing check** for every story: implementable by one agent in one session against only the story file + the three always-load architecture shards. If a story needs the PRD open, its Dev Notes are underspecified — fix the story, not the process.

---

## Sources

1. BMAD-METHOD repository (main, v6.10.0) — https://github.com/bmad-code-org/BMAD-METHOD
2. Releases (version/date verification via GitHub API; v6.10.0 = 2026-07-03, v6.0.0 = 2026-01, v6.3.0 = 2026-04-10) — https://github.com/bmad-code-org/BMAD-METHOD/releases
3. V4 story template (verbatim) — https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/templates/story-tmpl.yaml
4. V4 create-next-story task — https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/tasks/create-next-story.md
5. V4 dev agent (James) — https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/agents/dev.md
6. V4 SM agent (Bob) — https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/agents/sm.md
7. V4 QA agent (Quinn) — https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/agents/qa.md
8. V4 core-config.yaml — https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/core-config.yaml
9. V4 user guide (planning + dev-cycle diagrams, Test Architect, QA paths) — https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/docs/user-guide.md
10. V4 knowledge base (philosophy, dev loop, agent table) — https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/data/bmad-kb.md
11. V4 PRD template (epic/story sizing rules, verbatim) — https://github.com/bmad-code-org/BMAD-METHOD/blob/V4/bmad-core/templates/prd-tmpl.yaml
12. V6 story template (verbatim) — https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/4-implementation/bmad-create-story/template.md
13. V6 create-story workflow — https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/4-implementation/bmad-create-story/SKILL.md
14. V6 dev-story workflow — https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/4-implementation/bmad-dev-story/SKILL.md
15. V6 sprint-status template (status definitions, verbatim) — https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/4-implementation/bmad-sprint-planning/sprint-status-template.yaml
16. V6 epics template — https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/3-solutioning/bmad-create-epics-and-stories/templates/epics-template.md
17. V6 agents reference — https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/reference/agents.md
18. V6 named agents explainer — https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/explanation/named-agents.md
19. V6 getting-started tutorial (phases, tracks, folder layout, build cycle) — https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/tutorials/getting-started.md
20. V6 workflow map — https://docs.bmad-method.org/reference/workflow-map/
21. Status-string drift issue (canonical lowercase statuses) — https://github.com/bmad-code-org/BMAD-METHOD/issues/1105
22. Secondary overview cross-checks — https://www.augmentcode.com/guides/bmad-method-ai-development ; https://codemyspec.com/blog/bmad-method-explained ; https://medium.com/@hieutrantrung.it/from-token-hell-to-90-savings-how-bmad-v6-revolutionized-ai-assisted-development-09c175013085
