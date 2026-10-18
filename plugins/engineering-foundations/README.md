# engineering-foundations

Shared building blocks for the dev-digest agent plugins: four skills and the
read-only Bash guard. You rarely install it by hand; `sdd-engineering`,
`research-tools` and `architecture-reviewer` pull it in as a dependency.

## Install

```
/plugin marketplace add Saphirox/dev-digest-ai-marketplace
/plugin install engineering-foundations@dev-digest
```

## Components

| Type | Name | Purpose |
|------|------|---------|
| Skill | `security` | OWASP Top 10:2025 guidance, checklists and safe/unsafe examples |
| Skill | `engineering-insights` | Read and maintain per-module `INSIGHTS.md` files |
| Skill | `mermaid-diagram` | Mermaid diagrams in Markdown |
| Skill | `review-severity` | One severity scale (`critical` / `warning` / `suggestion`) for reviewer agents; not user-invocable |
| Hook | `PreToolUse` Bash -> `hooks/readonly-guard.mjs` | Allowlists Bash for the read-only agents |

## The read-only guard

Plugin agents cannot declare hooks in their frontmatter, so this plugin runs
one `PreToolUse` hook for every Bash call and decides by the calling agent
(`agent_type` in the hook input). It acts only for these agents and stays
silent for the main session and everyone else:

| Agent | Profile |
|-------|---------|
| `research-tools:researcher`, `sdd-engineering:implementation-planner` | `read`: file, search and git reads, read-only SQL |
| `architecture-reviewer:architecture-reviewer` | `architecture`: staged diff only, plus `arch:check` |
| `sdd-engineering:security-reviewer` | `security`: reads plus typecheck and `arch:check` |
| `sdd-engineering:plan-verifier` | `verify`: reads plus the project's test, typecheck and lint commands |

Every segment of a command must match the profile, or the whole command is
denied. Rules live in `hooks/readonly-allowlist.mjs`; tests run with
`node --test hooks/`.

## Requirements

Node.js 20+ on `PATH` for the hook.

## Not included

The source setup also had a `Stop` hook that reminds the session to update
`INSIGHTS.md`. It is project policy rather than plugin behaviour; add it to
your project's `.claude/settings.json` if you want it.
