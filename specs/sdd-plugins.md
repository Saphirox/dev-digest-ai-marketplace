# Spec: SDD Engineering plugin family

Status: draft
Source: `Saphirox/dev-digest`, `.claude/` only (agents, skills, hooks, references)

## Goal

Ship the dev-digest Spec-Driven Development workflow as installable plugins in this
marketplace: one `sdd-engineering` plugin with the full pipeline, two standalone
plugins that are useful on their own (`research-tools`, `architecture-reviewer`),
and one shared dependency (`engineering-foundations`) so nothing is copied twice.

## Plugins

| Plugin | Contents | Depends on |
|---|---|---|
| `engineering-foundations` | skills `security`, `engineering-insights`, `mermaid-diagram`, `review-severity`; read-only Bash guard hook | - |
| `research-tools` | agent `researcher` | `engineering-foundations` |
| `architecture-reviewer` | agent `architecture-reviewer` | `engineering-foundations` |
| `sdd-engineering` | agents `spec-creator`, `implementation-planner`, `implementer`, `test-writer`, `plan-verifier`, `security-reviewer`; skills `run-sdd`, `workflow-retro`, `spec-writing`; spec-creator scope hook | `engineering-foundations`, `architecture-reviewer`, `research-tools` |

All start at `0.1.0`. Dependencies use a caret range on the bare name (resolved in
this marketplace), e.g. `{ "name": "engineering-foundations", "version": "^0.1.0" }`.
Claude Code resolves the range against our `<plugin>--vX.Y.Z` tags, which CI already
creates, and installs missing dependencies automatically.

Installing `sdd-engineering` therefore brings in all four plugins. A user who only
wants research or architecture review installs that plugin alone.

### Why this split

- `researcher` and `architecture-reviewer` are called by the pipeline but also run
  on their own, so they live in their own plugins and SDD depends on them.
- `test-writer` and `security-reviewer` are steps of `/run-sdd`, so they ship with SDD.
- `spec-writing` is used only by `spec-creator` and stays in SDD.
- Skills and hook code used by more than one plugin go to `engineering-foundations`.

## Layout

```
plugins/
  engineering-foundations/
    .claude-plugin/plugin.json
    hooks/hooks.json                 # PreToolUse Bash -> readonly-guard.mjs
    hooks/readonly-guard.mjs         # from readonly-allowlist.mjs + readonly-bash.mjs
    hooks/*.test.mjs
    skills/security/                 # SKILL.md, checklists.md, examples.md, references.md
    skills/engineering-insights/     # SKILL.md, template.md
    skills/mermaid-diagram/          # SKILL.md, examples.md
    skills/review-severity/SKILL.md  # from .claude/references/review-severity.md, user-invocable: false
  research-tools/
    agents/researcher.md
  architecture-reviewer/
    agents/architecture-reviewer.md
  sdd-engineering/
    agents/{spec-creator,implementation-planner,implementer,test-writer,plan-verifier,security-reviewer}.md
    skills/run-sdd/SKILL.md
    skills/workflow-retro/           # SKILL.md, template.md, scripts/session-stats.mjs (+ test)
    skills/spec-writing/             # SKILL.md, references/, scripts/lint.mjs (+ test), evals/
    hooks/hooks.json                 # spec-creator scope + spec lint
    hooks/spec-creator-scope.mjs (+ test)
```

Every plugin also has `README.md`, `CHANGELOG.md`, `LICENSE` from `templates/plugin/`.

## Porting rules

1. **Hooks move out of agent frontmatter.** Plugin agents ignore `hooks`,
   `mcpServers` and `permissionMode` (Claude Code docs, sub-agents and plugin
   components pages). Each restriction becomes a plugin-level `hooks/hooks.json`
   entry. Hook input carries `agent_type` for tool calls inside a subagent, so the
   script picks its rule set from that:

   | `agent_type` | Profile (unchanged from the source) |
   |---|---|
   | `research-tools:researcher`, `sdd-engineering:implementation-planner` | `read` |
   | `architecture-reviewer:architecture-reviewer` | `architecture` |
   | `sdd-engineering:security-reviewer` | `security` |
   | `sdd-engineering:plan-verifier` | `verify` |
   | anything else | no decision (hook prints nothing) |

   The guard lives once, in `engineering-foundations`, which is always enabled
   when any dependent plugin is installed. `spec-creator-scope` and the
   `spec-writing` lint stay in `sdd-engineering`, matched on
   `sdd-engineering:spec-creator`.
2. **Paths.** `$CLAUDE_PROJECT_DIR/.claude/...` becomes `${CLAUDE_PLUGIN_ROOT}/...`
   in hooks and in agent and skill bodies, and `${CLAUDE_SKILL_DIR}/...` inside a
   skill. An agent never points into another plugin's files; it preloads that
   plugin's skill through `skills:` instead (this is why `review-severity`
   becomes a skill).
3. **Names.** Agents keep their names; users see them as `<plugin>:<agent>`.
   Cross-references in agent prompts ("hand off to `test-writer`") use the
   scoped name so the main session spawns the right agent.
4. **Manual skills.** `run-sdd` and `workflow-retro` keep
   `disable-model-invocation: true` and are invoked as `/sdd-engineering:run-sdd`
   and `/sdd-engineering:workflow-retro`.
5. **Project files.** The plugins write into the user's project, with the
   conventions unchanged: `specs/spec-NNNN-<slug>.md`, `docs/plans/NNNN-<slug>.md`
   (+ `.state.json`), `docs/retro/ledger/`, per-module `INSIGHTS.md`. Plugins never
   write inside their own directory; persistent plugin state, if needed, goes to
   `${CLAUDE_PLUGIN_DATA}`.
6. **Not ported:** project `settings.json` hooks (`rebase-before-commit`, the
   insights `Stop` reminder). They are project policy, not plugin behaviour; the
   README shows how to add them to a project.

## How the pipeline works (goes into `sdd-engineering/README.md`)

```
brief + design -> spec-creator -> specs/spec-NNNN-<slug>.md   (user approves)
spec          -> implementation-planner -> docs/plans/NNNN-<slug>.md (status: ready)
/sdd-engineering:run-sdd docs/plans/NNNN-<slug>.md
   1 implementer (single agent, or waves from the plan's Work split)
   2 architecture-reviewer on the staged diff, up to 3 fix rounds
   3 test-writer, one test per acceptance criterion
   4 plan-verifier, fix loop until the fix list is empty
   5 security-reviewer (when the plan requires it)
   6 final report; state kept in docs/plans/NNNN-<slug>.state.json (--resume)
/sdd-engineering:workflow-retro -> docs/retro/ledger/ entry with proposals
researcher: on demand, from any step or directly
```

The README also covers: install (`/plugin install sdd-engineering@dev-digest`),
what each agent may write, required project conventions (`specs/`, `docs/plans/`,
`INSIGHTS.md`), Node.js 20+ for the hook and script files, and a **Releases**
section that links `CHANGELOG.md` and lists the dependency ranges per release.

## Versions and releases

- Each plugin has its own `CHANGELOG.md` and is released with
  `scripts/release.py <plugin> patch|minor|major`.
- A breaking change in `engineering-foundations` (renamed skill, changed guard
  profile) is a major bump; dependents raise their range in the same PR.
- The root README plugin table gets the four plugins; CODEOWNERS gets four lines.

## Repo changes outside the plugins

- CI: add a `node --test` step for `plugins/*/hooks/*.test.mjs` and
  `plugins/*/skills/*/scripts/*.test.mjs` (Node is already set up).
- `check_invariants.py`: check `agents/*.md` frontmatter (`name`, `description`,
  no ignored `hooks`/`mcpServers`/`permissionMode`), and that every `dependencies`
  entry names a plugin listed in `marketplace.json`.

## Delivery order

0. **Spike** (blocks the rest): confirm with `claude --plugin-dir` that
   (a) `agent_type` for a plugin agent is `<plugin>:<agent>` in hook input, and
   (b) how an agent's `skills:` names a skill from a dependency plugin (bare name
   or `plugin:skill`). Neither is documented.
1. `engineering-foundations`
2. `research-tools`, `architecture-reviewer`
3. `sdd-engineering`
4. CI and invariant updates, root README, CODEOWNERS

## Open questions

1. **Stack skills.** `implementation-planner`, `implementer`, `test-writer` and
   `architecture-reviewer` load `onion-architecture`, `frontend-ui-architecture`,
   `react-*`, `next-best-practices`, `fastify-best-practices`, `drizzle-orm-patterns`,
   `postgresql-table-design`, `zod`, `typescript-expert`. A missing preloaded skill
   is skipped with a warning, so agents still run without them. Proposal: a separate
   optional `dev-digest-stack` plugin; or leave them in the dev-digest repo.
2. **Repo-specific text in agents.** Prompts name `client/`, `server/`,
   `reviewer-core/`, `mcp/` and `pnpm arch:check` / `pnpm test`. Port as-is first,
   or replace with "read the project's CLAUDE.md for module layout and commands"?
3. **Other referenced agents.** `investigator`, `brainstorm`, `doc-writer`
   (`/run-sdd --docs`) and `insight-curator` are mentioned by the ported agents but
   not in scope. Add them (e.g. `doc-writer` to SDD, `investigator`/`brainstorm` to
   `research-tools`), or remove the references?
4. **`spec-creator` Chrome tools** (`mcp__claude-in-chrome__*`) only work when the
   user has that extension connected. Keep them in `tools:`?
