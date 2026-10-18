---
name: spec-writing
description: Writes and checks feature specs (specs/spec-NNNN-<slug>.md) for this repo's Spec-Driven Development — the template, EARS requirement lines with module tags and priorities, design-gap checklists, NFR categories, examples, traceability, and a lint script. Use when writing, updating or reviewing a spec, turning a brief or design into acceptance criteria, or checking that a plan, test or implementation covers a spec's AC/EC/NFR IDs. Not for Development Plans or docs of already-built code (docs/specs/).
---

# Spec writing

How to write a spec that the planner, `test-writer` and `plan-verifier` can
use without asking anyone. `spec-creator` preloads this file; its prompt
holds the rules about who decides and what it may write. A complete spec
that passes the lint:
[references/spec-0000-example-onboarding.md](references/spec-0000-example-onboarding.md).
Worked gap → requirement conversions:
[references/gap-to-requirement.md](references/gap-to-requirement.md).

**Contents:** Terms · Workflow · Lint · Template · Requirement lines · EARS ·
Design-gap checklists · NFR categories · Examples · Traceability ·
Decisions

## Terms

Used with one meaning each throughout:

- **requirement** — one `AC-n`, `EC-n` or `NFR-n` line; its **ID** is the
  `AC-3` part.
- **gap** — something the design or brief leaves out that the
  implementation will still have to decide.
- **open question** — a gap not yet decided, written
  `[NEEDS CLARIFICATION]`.
- **decision** — a user answer, recorded as `D-n`.
- **frame** — a saved design image, `specs/images/spec-NNNN/<name>.png`.
- **tag** — a module where the requirement's code changes.

## Workflow

Copy this into your working notes and tick it off:

```
Spec progress:
- [ ] 1. Gaps listed — every frame walked against the four checklists
- [ ] 2. Gaps asked — each is now a decision (D-n) or an open question
- [ ] 3. Draft written from the template
- [ ] 4. Lint run — errors fixed, lint re-run until it exits 0
- [ ] 5. Judgement pass — contracts named, nothing observable-only missing, examples added
```

Step 4 is a loop: run the lint, fix exactly what it reports, run it again.
Move on only when it exits 0.

## Lint

Run it; don't read it.

```sh
node ${CLAUDE_SKILL_DIR}/scripts/lint.mjs specs/spec-NNNN-<slug>.md
```

Exit `0` clean, `1` errors, `2` usage. Output is one line per problem:

```
specs/spec-0003-repo-onboarding.md: 2 error(s), 0 warning(s)
error: AC-4 has no "shall" (EARS)
error: Traceability: NFR-2 has no row
```

It proves the mechanical part — file name ↔ Spec ID, header lines, section
order, requirement line shape, ID sequences, tags, priorities, `shall` and
`IF…THEN`, untestable words, `Modules:` = union of tags, one traceability
row per ID, `D-n` citations, example rows, frame paths. It cannot judge
whether a requirement is the right one. In `spec-creator` it also runs as a
PostToolUse hook after every write. Its tests:
`node --test ${CLAUDE_SKILL_DIR}/scripts/lint.test.mjs`.

## Template

Use exactly this structure — the lint checks it, and three agents parse it.
Drop *User stories* only when they add nothing; every other section stays,
with "None." when empty.

```markdown
# Spec: <feature name>

Spec ID: SPEC-NNNN
Status: draft
Supersedes: <SPEC-MMMM link, or "—">
Modules: <owner> (owner), <other modules touched>
Design: <Figma/URL + specs/images/spec-NNNN/*.png, or "none — backend only">

## Problem and user
## Goals / Non-goals
## User stories
## Acceptance criteria (EARS)
## Edge cases
## Non-functional requirements
## Examples
## Traceability and verification
## Decisions
## Inputs and provenance
## Untrusted inputs
## Open questions
```

| Section | Holds |
|---|---|
| Problem and user | The pain and who has it |
| Goals / Non-goals | What the change does; non-goals include every declined proposal (`declined by user, D-n`) |
| User stories | Only when they make the behaviour clearer |
| Acceptance criteria | `AC-n` requirement lines |
| Edge cases | `EC-n` requirement lines; each names the expected behaviour or the AC that covers it |
| Non-functional requirements | `NFR-n` requirement lines with a number or an observable condition |
| Examples | Given / When / Then rows for the riskiest requirements |
| Traceability and verification | One row per ID |
| Decisions | One `D-n` per user answer |
| Inputs and provenance | Every data source the feature reads (DB table, GitHub API, LLM output, repo files, user input), and which source won when the design and brief disagreed |
| Untrusted inputs | Every attacker-controllable input (PR titles/bodies, diffs, file contents, commit messages, LLM output) and how it is treated: escaped when rendered, never executed, never interpolated into shell/SQL/prompt instructions |
| Open questions | Every open question, with the default you would assume |

Match the length to the feature: cover the substance, no filler sections,
no restating of the brief. A spec past a few pages usually mixes several
features (split them) or has drifted into plan territory (cut it).

## Requirement lines

```markdown
- **AC-3** `[server, client]` `must` WHEN the model call fails, the PR page shall show the deterministic overview with the degradation reason.
```

ID · tags · priority · EARS text — the same shape for `EC-n` and `NFR-n`.
IDs run from 1 per kind and are never reused.

- **Priority:** `must` — not done without it; `should` — wanted, deferrable
  only by a decision (`D-n`), which moves it to *Non-goals* or a follow-up
  spec.
- **Tags:** `client`, `server`, `repo-intel`, `reviewer-core`, `mcp` —
  where the code changes, not where it is tested (so no `e2e`). At least
  one per requirement, taken from the code you traced. Two or more tags
  make a contract: name the route, payload field, event or MCP tool.
  `Modules:` is exactly the union of the tags, owner first.
- **Actor:** name it (`the PR page`, `the API`, `the get_onboarding tool`)
  rather than "the system".

## EARS

| Pattern | Shape | Good | Bad (why) |
|---|---|---|---|
| Ubiquitous | `The <actor> shall <response>.` | The API shall log each generation with its token count. | The system shall be observable. (nothing to check) |
| Event-driven | `WHEN <trigger>, the <actor> shall <response>.` | WHEN the user opens a PR, the page shall list findings grouped by severity. | When a PR loads it should work fast. (no `shall`, no threshold) |
| State-driven | `WHILE <state>, the <actor> shall <response>.` | WHILE a review is running, the PR page shall show its progress. | The page shows progress sometimes. (no state) |
| Unwanted | `IF <condition>, THEN the <actor> shall <response>.` | IF the model call fails, THEN the API shall keep the previous tour and return the failure reason. | Errors are handled properly. (no condition) |
| Optional | `WHERE <feature enabled>, the <actor> shall <response>.` | WHERE repo indexing is enabled, the reading path shall be ordered by import-graph rank. | Indexing can be used if needed. (no response) |

One requirement per ID — split on "and". The response is something a test
or a person can observe: a screen, an API response, a stored row, a log
line.

## Design-gap checklists

Judgement, not a script: walk each list against every frame and write down
what the design leaves out. Each gap ends as a requirement, a non-goal or
an open question.

- **States the design does not show:** empty / zero items · loading ·
  error · degraded (LLM unavailable, repo not indexed, GitHub rate-limited,
  secret missing) · stale data (another session re-ran it) · long text,
  many items, overflow · first run vs returning user · missing permission
  or configuration.
- **Corner cases:** concurrent runs on the same PR or repo · PR
  force-pushed or closed mid-run · huge, binary, renamed or deleted files ·
  non-English or emoji content · zero results vs a failed run (they must
  look different) · zero vs unknown for counts and cost · re-entry after a
  crash or a closed tab.
- **Cross-module interaction:** trace the data end to end and, for each
  hop, name its owner and contract — `client` ↔ `server` routes and SSE ·
  `@devdigest/shared` contracts (two hand-synced copies; a new field lands
  in both) · `server` ↔ `reviewer-core` engine input/output · `repo-intel`
  index data · an `mcp` tool exposing the same data · Postgres tables
  (future-lesson tables already exist). For three or more modules, a
  sequence diagram in *Inputs and provenance* shows missing contracts
  faster than prose ([mermaid-diagram](../mermaid-diagram/SKILL.md)).
- **UX and accessibility** — offered as questions, never slipped in:
  keyboard-only operation and visible focus · accessible names for icons
  and controls · a text or icon twin for every colour signal · contrast on
  tinted backgrounds · deep links · confirmation or undo on destructive
  actions · skeletons or optimistic UI for slow steps · an existing
  component or pattern to reuse (cite it).

## NFR categories

Keep only what the feature needs; each becomes an `NFR-n` with a number or
an observable condition.

| Category | Example |
|---|---|
| Performance | The tour page shall render its first section within 1 s of the API response. |
| LLM cost / tokens | The API shall send at most 40,000 characters of repository facts per generation. |
| Degraded mode | IF the model is unavailable, THEN the API shall return the last stored tour with `stale: true`. |
| Security / privacy | The API shall never include file contents from paths matching `.env*` in a prompt. |
| Accessibility | The tour page shall be operable with the keyboard alone. |
| Observability | WHEN a generation fails, the API shall log the repo ID, the model and the failure reason. |

## Examples

For the two or three riskiest requirements, one row of concrete data each.
`test-writer` uses these as fixtures, so write input a real user would
produce — in this repo, tests built on tidy invented data have missed real
bugs.

```markdown
| ID | Given | When | Then |
|---|---|---|---|
| AC-3 | tree has `src/app.ts`; model links `src/app.ts` and `src/missing.ts` | the tour is stored | the `src/app.ts` link stays; no `src/missing.ts` link |
```

"None." only when no requirement has a non-obvious input.

## Traceability

One row per ID, so every requirement points back to why it exists and
forward to how it will be proven:

```markdown
| ID | Source | Verification hint |
|---|---|---|
| AC-3 | brief "links must be real files" | server unit test with a fake model response (Examples row AC-3) |
| AC-7 | D-4 | manual: compare with `specs/images/spec-0001/layout.png` |
```

- **Source:** a brief quote, a frame path, a decision `D-n`, a research
  result, or an `INSIGHTS.md` entry (`<module>/INSIGHTS.md` + date). A
  requirement with no source was invented — cut it or ask.
- **Verification hint:** the test level (unit, `*.it.test.ts`, client RTL,
  `mcp` test, e2e) or `manual` plus the frame to compare against. Use
  `manual` only where no automated test reaches (visual layout, an
  e2e-only interaction) — it is what allows `plan-verifier`'s
  `met-manual`.

## Decisions

```markdown
- **D-1** What happens on an unindexed repo? → disable the button with a hint (accepted).
```

One line per user answer: accepted, declined, or a `brainstorm` chosen
option. The spec keeps them after the conversation is gone.
