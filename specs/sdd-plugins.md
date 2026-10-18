# Spec: SDD Engineering plugin family

Status: implemented (0.1.0)
Source: `Saphirox/dev-digest`, `.claude/` only (agents, skills, hooks, references)

## Goal

Ship the dev-digest Spec-Driven Development workflow as installable plugins in this
marketplace: one `sdd-engineering` plugin with the full pipeline, standalone
plugins that are useful on their own (`research-tools`, `architecture-reviewer`,
`git-rebase-sync`), a stack skills plugin (`dev-digest-stack`), and one shared
dependency (`engineering-foundations`) so nothing is copied twice.

## Plugins

| Plugin | Contents | Depends on |
|---|---|---|
| `engineering-foundations` | skills `security`, `engineering-insights`, `mermaid-diagram`, `review-severity`; read-only Bash guard hook | - |
| `dev-digest-stack` | skills `drizzle-orm-patterns`, `fastify-best-practices`, `frontend-ui-architecture`, `next-best-practices`, `onion-architecture`, `postgresql-table-design`, `react-best-practices`, `react-testing-library`, `typescript-expert`, `zod`, `dependency-checker` | - |
| `git-rebase-sync` | skill `git-rebase-sync`; rebase-before-commit hook (opt-in) | - |
| `research-tools` | agent `researcher` | `engineering-foundations` |
| `architecture-reviewer` | agent `architecture-reviewer` | `engineering-foundations`, `dev-digest-stack` |
| `sdd-engineering` | agents `spec-creator`, `implementation-planner`, `implementer`, `test-writer`, `plan-verifier`, `security-reviewer`; skills `run-sdd`, `workflow-retro`, `spec-writing`; spec-creator hook | `engineering-foundations`, `architecture-reviewer`, `research-tools`, `dev-digest-stack` |

All start at `0.1.0`. Dependencies use a caret range on the bare name (resolved in
this marketplace), e.g. `{ "name": "engineering-foundations", "version": "^0.1.0" }`.
Claude Code resolves the range against our `<plugin>--vX.Y.Z` tags, which CI
creates, and installs missing dependencies automatically.

Installing `sdd-engineering` brings in five plugins (all but `git-rebase-sync`).

### Why this split

- `researcher` and `architecture-reviewer` are called by the pipeline but also run
  on their own, so they live in their own plugins and SDD depends on them.
- `test-writer` and `security-reviewer` are steps of `/run-sdd`, so they ship with SDD.
- `spec-writing` is used only by `spec-creator` and stays in SDD.
- Stack skills are preloaded or loaded by the planner, implementer, test-writer and
  architecture reviewer; without them the agents still run (a missing preloaded
  skill is skipped with a warning), but plans lose their rules, so SDD depends on them.
- `git-rebase-sync` changes how every commit behaves, so it is its own opt-in plugin
  and nothing depends on it.
- Skills and hook code used by more than one plugin go to `engineering-foundations`.

## Porting rules

1. **Hooks move out of agent frontmatter.** Plugin agents ignore `hooks`,
   `mcpServers` and `permissionMode` (Claude Code docs, sub-agents and plugin
   components pages). Each restriction is a plugin-level `hooks/hooks.json` entry
   whose script reads `agent_type` from the hook input and acts only for its agents;
   the main session and other agents are left alone.

   | `agent_type` | Profile (unchanged from the source) |
   |---|---|
   | `research-tools:researcher`, `sdd-engineering:implementation-planner` | `read` |
   | `architecture-reviewer:architecture-reviewer` | `architecture` |
   | `sdd-engineering:security-reviewer` | `security` |
   | `sdd-engineering:plan-verifier` | `verify` |
   | `sdd-engineering:spec-creator` | write scope + spec lint (`sdd-engineering/hooks/spec-creator-hook.mjs`) |

   The read-only guard lives once, in `engineering-foundations/hooks/readonly-guard.mjs`.
   Both entries also accept the bare agent name, because the docs do not say whether
   `agent_type` carries the `<plugin>:` prefix for plugin agents.
2. **Paths.** `$CLAUDE_PROJECT_DIR/.claude/...` became `${CLAUDE_PLUGIN_ROOT}/...` in
   hooks and agent bodies, and `${CLAUDE_SKILL_DIR}/...` inside skills. The spec lint
   resolves spec paths against `CLAUDE_PROJECT_DIR` (or the cwd), not its own location.
3. **Cross-plugin skills.** An agent never points into another plugin's files.
   Preloaded skills use `<plugin>:<skill>` in `skills:`; agents that read a skill on
   demand (`architecture-reviewer`, `implementation-planner` for `mermaid-diagram`,
   `spec-creator` for `mermaid-diagram`) got the `Skill` tool instead of `Read` on a
   `.claude/skills/...` path. `security-reviewer` preloads `security` and
   `review-severity`. Shared skills name their supporting files as
   `${CLAUDE_SKILL_DIR}/<file>` so the path is absolute wherever they are loaded.
4. **Names.** Agents keep their names; each agent body has a short *Plugin names*
   note mapping skills and agents to their `<plugin>:` prefix. `run-sdd` spawns
   agents by their full names.
5. **Manual skills.** `run-sdd` and `workflow-retro` keep
   `disable-model-invocation: true`: `/sdd-engineering:run-sdd`,
   `/sdd-engineering:workflow-retro`.
6. **Project files.** Conventions are unchanged: `specs/spec-NNNN-<slug>.md`,
   `docs/plans/NNNN-<slug>.md` (+ `.state.json`), `docs/retro/ledger/`, per-module
   `INSIGHTS.md`. Plugins never write inside their own directory.
7. **Not ported:** the insights `Stop` reminder (project policy; documented in the
   `engineering-foundations` README) and the agents outside scope: `investigator`,
   `brainstorm`, `doc-writer`, `insight-curator`. Prompts still mention them as
   optional helpers; `run-sdd --docs` runs `doc-writer` only if the project has one.
8. **Content kept as-is** (decision: port first, generalize later). Prompts still name
   dev-digest modules (`client/`, `server/`, `reviewer-core/`, `mcp/`) and pnpm
   commands; READMEs tell other projects to describe theirs in `AGENTS.md` /
   `CLAUDE.md`. `spec-creator` keeps its Chrome tools; they work only when the
   extension is connected. Six stack skill descriptions were edited to carry a
   "Use when" trigger, and `onion-architecture`'s was cut to 1024 characters.

## Repo changes outside the plugins

- CI runs `node --test` over `plugins/*/hooks/*.test.mjs` and
  `plugins/*/skills/*/scripts/*.test.mjs`.
- `check_invariants.py` checks agent frontmatter (`name` = file name, `description`,
  no ignored `hooks`/`mcpServers`/`permissionMode`), that every preloaded
  `<plugin>:<skill>` exists, and that every `dependencies` entry is a plugin listed
  in `marketplace.json`.

## Still to verify in a live session

Not documented, and not yet exercised with `claude --plugin-dir`:

1. `agent_type` for a plugin agent in hook input (`plugin:agent` or bare); both are
   handled.
2. Whether `skills:` in a plugin agent resolves `<plugin>:<skill>` names from a
   dependency plugin. If not, the skills are skipped with a debug-log warning and the
   agents run without them.
3. Whether `${CLAUDE_SKILL_DIR}` is substituted when a skill is preloaded through
   `skills:` (it is for skills invoked directly), and in a skill's `allowed-tools`.

Check: install `sdd-engineering`, run `@agent-research-tools:researcher` with a
request that needs `rm`, and confirm the deny; ask `security-reviewer` to quote the
first line of its `checklists.md`.
