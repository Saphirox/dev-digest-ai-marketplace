---
name: workflow-retro
description: Retrospective of a finished multi-agent workflow run (/run-sdd, spec-creator → implementation-planner, or any session that spawned agents) — tokens, agent count and order, per-agent difficulties, duplicated and missed information — plus concrete proposals for the agent prompts, skills and pipeline, written to the chat and a ledger entry in docs/retro/ledger/. Use when the user types /workflow-retro.
disable-model-invocation: true
argument-hint: "[deep] [--since <ISO time | cmd:run-sdd>] [--session <id>] [\"what to focus on\"]"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/session-stats.mjs:*)
  - Write(docs/retro/ledger/**)
  - Edit(docs/retro/ledger/**)
---

# Workflow retro

You (the main session) look back at a multi-agent run that has already
finished and answer two questions: **how did it go** (numbers, order, what
each agent struggled with) and **what should change** (proposals for the
agent prompts, skills and pipeline). Today: !`date +%F`.

Arguments: `$ARGUMENTS`

## Rules

- **Manual only.** This skill runs when the user types `/workflow-retro`.
  Nothing — no hook, no other skill, no agent, no final report — starts
  it, and you do not suggest wiring it in automatically.
- **Read-only except the ledger.** You write only under
  `docs/retro/ledger/`. You never edit any agent file, any `SKILL.md`,
  `AGENTS.md`, any `INSIGHTS.md`, specs, plans or state files. Proposals and
  module insights are written *into the ledger entry*; the user decides what
  gets applied and where.
- **Spawn no agents.** The retro is the main session's own analysis.
- **Evidence or nothing.** Every claim names its source: the agent (type +
  short id), and where you saw it — `report` (its hand-back), `state`
  (`docs/plans/*.state.json`), `stats` (the script), `transcript` (deep
  mode), `user` (a user message in this session). Mark inferences as
  inferences. A number you do not have is `n/a`, never an estimate.
- **Do not re-litigate.** A decision the user made during the run is
  context, not a finding.

## Modes

| Mode | Data | Cost |
|---|---|---|
| default (in-context) | what is already in this conversation — agent hand-backs, task notifications, the state file, user messages — plus the stats script's summary (numbers only) | ~1 script call + reading the state file |
| `deep` | everything above, plus `--detail` from the script (error samples, files read by several agents, repeated commands) and targeted `jq` extracts from the subagent transcripts | a few extra calls; never read a whole transcript |

In default mode, if the run happened in an earlier session and its reports
are not in context, say so and suggest `deep --session <id>`.

## Workflow

```
workflow-retro progress:
- [ ] 1. Scope the run
- [ ] 2. Numbers (stats script)
- [ ] 3. Per-agent assessment
- [ ] 4. Workflow-level signals
- [ ] 5. Compare with earlier retros and INSIGHTS
- [ ] 6. Proposals
- [ ] 7. Ledger entry + chat summary
```

### 1. Scope the run

- Which workflow: `/run-sdd` (look for its invocation and the plan path),
  spec → plan, or ad-hoc agent use. Default window: from the last `/run-sdd`
  invocation if there is one (`--since cmd:run-sdd`), else the whole session.
  `--since` / `--session` in the arguments override this.
- Load what the run left on disk: the `docs/plans/NNNN-<slug>.state.json`
  (phase, review rounds, findings and their status, fix lists,
  `manualChecks`), and the plan's and spec's paths. Read the state file
  fresh — other sessions may have changed it.

### 2. Numbers

```sh
node ${CLAUDE_SKILL_DIR}/scripts/session-stats.mjs --session ${CLAUDE_SESSION_ID} --since <window> [--detail]
```

`--detail` only in deep mode. The script prints tokens per context (main
and each agent: input / cache-write / cache-read / output, cache-hit ratio),
the agent timeline with parallel **waves**, model and skills per agent,
the harness's own token figure from each task notification, tool calls,
tool errors and how many of them were hook/permission **blocks**, wall vs
active time, compactions. Known limit: subagent output tokens are a lower
bound (transcripts log usage at stream start); input/cache are exact. If the
script fails, fall back to the `<usage>` blocks of the task notifications in
context and mark the main session's tokens `n/a`.

### 3. Per-agent assessment

For each agent (in timeline order), fill the same five fields — one line
each, `—` when there is no evidence:

- **Difficulties** — blockers, errors, blocked commands, retries, a stop
  that needed the user, a long run for a small task.
- **Went easily** — what it finished cleanly, fast, first time.
- **Duplicated** — information it re-gathered that an earlier agent or the
  orchestrator already had (same files read, same commands re-run, the plan
  re-explained in its prompt *and* re-read from disk).
- **Missed** — what a later agent or the user had to catch: review findings
  on its code, verifier `fail` rows, user corrections, `Not verified` items.
- **Handoff** — did its prompt carry what it needed (paths, step numbers,
  design frames)? Did its report give the next agent what it needed, at a
  reasonable size (`Report chars`)?

Deep mode — pick only the agents worth it: errors or blocks > 0, no
hand-back, duration or tokens > 2× the median for the same agent type, or a
finding that bounced back. Extract, don't read:

```sh
jq -c 'select(.type=="user") | .message.content[]? | select(.type=="tool_result" and .is_error==true) | .content' <agent>.jsonl | cut -c1-300
jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | "\(.name) \(.input.file_path // .input.command // .input.pattern // "")"' <agent>.jsonl
```

Transcripts: `~/.claude/projects/<cwd with every non-alphanumeric as ->/<session>/subagents/agent-<id>.jsonl`.

### 4. Workflow-level signals

Report each with its number, then one line of judgement:

| Signal | Source | Read it as |
|---|---|---|
| Loop rounds — architecture review, verify fix rounds, security fix round | state | > 1 round: what the first pass missed and why |
| Bounce-backs — a finding `fixed` that came back; a verifier row failing twice | state | prompt or plan gap, not bad luck |
| Rework — files touched again by fix rounds / all changed files | state + reports | high → implementer prompt or plan steps under-specified |
| Stop-and-ask count, and whether each question was necessary | context | an avoidable question is a missing default |
| User interventions — corrections, "no, do X", manual fixes | user messages | the strongest signal; each one gets a proposal |
| Blocked tool calls | stats | a hook or allowlist fighting the agent's job |
| Parallelism — waves, agents per wave, longest agent per wave | stats | the critical path; a serial wave that could have been parallel |
| Stuck or silent agents — no hand-back, outlier duration | stats | needs a stop condition or a smaller task |
| Cache hit ratio, compactions | stats | low hit / compactions → prompts or context too big |
| Token split — main vs agents, per agent type | stats | where the money went; orchestrator overhead |
| Spec compliance — `must`/`should` met, `met-manual` count | last plan-verifier report | the outcome the cost bought |

### 5. Compare with earlier retros and INSIGHTS

- Read `docs/retro/ledger/README.md` (the index). For the last 1–3 entries
  of the same workflow, compare tokens, agent count, loop rounds and
  wall time; call out regressions.
- Check the **Proposals** tables of earlier entries: for each `open`
  proposal, has it been applied (`git log --oneline -- <target file>` since
  that entry's date)? Report applied/still-open; recurring evidence for an
  open proposal raises its priority instead of creating a duplicate.
- Grep the relevant `INSIGHTS.md` (root for `.claude/`, plus the modules
  the run touched) for each candidate insight's key words; drop what is
  already recorded.

### 6. Proposals

Each proposal is a concrete change somebody could apply in one sitting:

| Field | Content |
|---|---|
| ID | `P-<entry NNNN>-<n>` |
| Target | the file and section — e.g. `sdd-engineering/agents/implementer.md` *Inputs*, `sdd-engineering/skills/run-sdd/SKILL.md` step 2, a hook (paths in the dev-digest marketplace repo) |
| Change | what to add/remove/reword, specific enough to paste |
| Evidence | the observations above it answers (agent ids, numbers) |
| Expected effect | the metric that should move (rounds, tokens, blocks, interventions) |
| Priority | `high` (repeated or user-visible) · `medium` · `low` |
| Status | `open` (always, when written) |

Prefer removing work over adding instructions: a duplicated read fixed by
passing an excerpt beats a new rule. Three strong proposals beat ten weak
ones. Also propose changes to **this** skill when the retro itself lacked
data.

### 7. Ledger entry + chat summary

1. **Number:** next unused 4-digit prefix in `docs/retro/ledger/`, never
   renumbered. File: `docs/retro/ledger/NNNN-<workflow>-<slug>.md`, from
   [template.md](template.md).
2. **Write the entry**, including the *Module insights* section —
   candidate `INSIGHTS.md` lines grouped by module, in the
   `engineering-insights` line format. They stay in the ledger; promoting
   one into an `INSIGHTS.md` is the user's call.
3. **Append one row** to the index table in `docs/retro/ledger/README.md`.
4. **Chat:** lead with one sentence (the run's outcome and its cost), then
   the totals line, the timeline table, the top 3 problems, the proposals
   table, and the ledger path. Nothing is staged or committed.
