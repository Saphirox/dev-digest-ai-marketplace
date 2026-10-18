---
name: run-sdd
description: Runs the implementation half of Spec-Driven Development automatically from an approved spec and its saved Development Plan — implementer, architecture review with fix rounds, test-writer, plan-verifier with its fix loop, security review — and stops only where the user must decide. Use when the user types /run-sdd.
disable-model-invocation: true
argument-hint: "<docs/plans/NNNN-slug.md | specs/spec-NNNN-slug.md> [--resume] [--docs] [\"extra notes for the implementer\"]"
---

# Run SDD

You (the main session) orchestrate the build phase for a feature whose spec
and plan the user has already written and approved with `spec-creator` and
`implementation-planner`. You spawn the agents, pass paths between them,
keep a state file, and stop only at the points listed under *When to stop
and ask*. Subagents cannot spawn agents, so every spawn is yours.

Agents ship as plugins of the `dev-digest` marketplace; spawn them by their
full names: `sdd-engineering:implementer`, `sdd-engineering:test-writer`,
`sdd-engineering:plan-verifier`, `sdd-engineering:security-reviewer` and
`architecture-reviewer:architecture-reviewer`. `doc-writer` is not part of
these plugins: `--docs` works only when the project defines its own
`doc-writer` agent; otherwise say so in the final report and skip step 6.
Paths such as `server/` below are examples from the reference project; use
the modules and commands from the project's `CLAUDE.md` / `AGENTS.md`.

Arguments: `$ARGUMENTS`

## Inputs

1. **Resolve the plan and the spec.**
   - A plan path → read its `**Source:**` line for the spec path.
   - A spec path → find the plan whose `**Source:**` names it
     (`rg -l "<spec path>" docs/plans/*.md`); if none, stop: "no plan for
     this spec — run implementation-planner first".
2. **Check they are ready.** The spec is `Status: approved` and the plan is
   `**Status:** ready`. Anything else → stop and say which one is not ready
   and why. Do not fix either file; the user owns them.
3. **Extra notes** (a quoted string in the arguments) go to every
   `implementer` prompt as context. They never override the spec or plan;
   if they contradict either, stop and ask.
4. **`--resume`** → load the state file and continue from its `phase`.
   **`--docs`** → run `doc-writer` at the end.

## State file

`docs/plans/NNNN-<slug>.state.json`, next to the plan. Create it at the
start, update it after every agent returns, and read it before every step —
it is what lets `--resume` continue after a compaction or in a new session.

```json
{
  "plan": "docs/plans/0014-repo-onboarding.md",
  "spec": "specs/spec-0003-repo-onboarding.md",
  "phase": "arch-review",
  "mode": "multi-agent",
  "changedPaths": ["server/src/modules/onboarding/service.ts"],
  "archReview": {
    "round": 2,
    "findings": [
      { "id": "AR-1-1", "severity": "critical", "location": "server/src/modules/onboarding/routes.ts:42",
        "claim": "Drizzle query in a route", "status": "fixed", "fixedInRound": 1 }
    ]
  },
  "verify": { "round": 1, "fixList": [] },
  "security": "required",
  "manualChecks": [],
  "log": ["2026-09-29 implementer wave 1 done"]
}
```

`status` is one of `open` · `fixing` · `fixed` · `deferred` (a suggestion,
reported at the end) · `declined` (the user chose not to fix it).

## Workflow

Copy this checklist into your notes and keep it current:

```
run-sdd progress:
- [ ] 0. Inputs resolved, state file created
- [ ] 1. Build — implementer (all waves)
- [ ] 2. Architecture review loop — no open critical/warning
- [ ] 3. Tests — test-writer, one test per AC
- [ ] 4. Verify loop — plan-verifier, Fix list empty
- [ ] 5. Security review (if required)
- [ ] 6. Docs (only with --docs)
- [ ] 7. Final report
```

### 1. Build

- **Single-agent plan:** one `implementer` with the plan path, the spec
  path and any extra notes.
- **Multi-agent plan:** follow the plan's *Work split*. Spawn every track of
  a wave in parallel (one message, several Agent calls), wait for the wave,
  then start the next. Give each implementer the plan path, its step
  numbers and the files its track owns.
- Collect each report's *Done*, *Not verified* and *Deviations*. Add every
  touched file to `changedPaths`. An implementer that stops on a blocker →
  *When to stop and ask*.

### 2. Architecture review loop (up to 3 rounds)

Each round:

1. **Stage only this run's files:** `git add -- <changedPaths>` — never
   `-A`; other sessions share the index.
2. **Review:** spawn `architecture-reviewer` on the staged diff, limited to
   those paths (`git diff --cached -- <paths>`). From round 2 on, pass the
   list of findings still `open` or `fixing` and ask it to confirm, for
   each, whether it is closed — and to review only the files changed since
   the last round.
3. **Record** each new finding in the state file as `AR-<round>-<n>` with
   its severity, location and claim.
4. **Decide automatically:**
   - `critical` and `warning` → `fixing`.
   - `suggestion` → `deferred`.
   - A finding whose fix would contradict the spec or the plan → leave it
     `open` and put it in the stop-and-ask list; the user decides.
5. **Fix:** spawn `implementer` with the plan path and only the `fixing`
   findings (id, location, claim, rule, failure scenario). Tell it to fix
   exactly those, record any plan deviation under *Deviations*, and report
   the files it changed. Add them to `changedPaths`.
6. **Next round** re-reviews those files and confirms the fixes; confirmed
   ones become `fixed`.

The loop ends when no `critical` or `warning` finding is `open` or `fixing`.
After round 3 with some still open → *When to stop and ask*. The same
finding coming back after being marked `fixed` also goes to the user
instead of into another round.

### 3. Tests

Spawn `test-writer` with the spec path, the plan path and `changedPaths`:
one test per `AC`/`EC` (and each `NFR` with a number), the ID in the test
title, fixtures from the spec's *Examples*, test level from its
*Traceability* verification hints — plus one new e2e flow per user journey
the spec adds (the plan's e2e step, run with `npm run e2e:hermetic`). Add
its test files and flows to `changedPaths`; a flow written but not run
(Docker or `agent-browser` missing) goes to `manualChecks`.
Record its *Not covered* items; ACs it marks as reachable only by eye go to
`manualChecks`.

### 4. Verify loop (up to 2 fix rounds)

1. Spawn `plan-verifier` with the spec, the plan, the implementer reports
   and the test-writer report.
2. Save its *Fix list* in `verify.fixList`. Empty → done.
3. Otherwise spawn `implementer` for the code rows and `test-writer` for
   the test rows — in parallel when their files do not overlap — then
   re-run `plan-verifier`.
4. If a fix round changed production code, run one architecture review
   round on just those files (critical only is fixed; the rest is
   `deferred`).
5. After 2 fix rounds with rows still failing → *When to stop and ask*.

`met-manual` rows go to `manualChecks` for the user.

### 5. Security review

Required when the spec's *Untrusted inputs* has repo or PR text reaching an
LLM, or LLM output reaching the page — then spawn `security-reviewer` on
`changedPaths`. HIGH findings go to `implementer` for one fix round and a
re-check; MEDIUM and LOW go to the final report. Not required → skip it and
say so in the report.

### 6. Docs (only with `--docs`)

Spawn `doc-writer` with the spec, the plan and `changedPaths`.

### 7. Final report

Lead with one sentence: what was built and whether every spec item is met.
Then:

- **Spec compliance** — `must` and `should` met out of total (from the last
  `plan-verifier` run).
- **Manual checks for you** — each `met-manual` AC with the design frame
  to compare against.
- **Architecture findings** — fixed, deferred (suggestions), declined.
- **Security** — findings, or "not required" with the reason.
- **Not verified / deviations** — collected from the agents.
- **Files changed** — `changedPaths`, and that they are staged but **not
  committed**: the user reviews the diff and commits.

Mark the state file `"phase": "done"`.

## When to stop and ask

Stop with `AskUserQuestion` — options first, recommendation labelled —
only here:

- The spec is not `approved` or the plan is not `ready` (at the start).
- An agent reports a blocker it cannot resolve (missing dependency, Docker
  down, a plan step that cannot work as written).
- A review finding whose fix would contradict the spec or the plan.
- Architecture review still has open critical/warning findings after 3
  rounds, or a fixed finding came back: offer *3 more rounds* · *accept the
  rest as declined* · *stop here*.
- `plan-verifier` rows still failing after 2 fix rounds: offer *another
  round* · *stop and hand over the Fix list*.
- A change would touch the root `AGENTS.md` "Do not touch" list.

Everything else runs without asking. Never commit, push, or edit the spec
or the plan.
