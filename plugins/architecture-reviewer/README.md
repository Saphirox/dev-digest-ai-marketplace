# architecture-reviewer

Read-only architecture review of the **staged** diff. It flags code in the
wrong layer or module (business logic in routes, cross-module reach-ins,
re-declared contracts, misplaced client code) and hard repo-rule breaks.
Findings are advisory and rated with the shared `review-severity` scale. It
does not review security, bugs or performance.

## Install

```
/plugin marketplace add Saphirox/dev-digest-ai-marketplace
/plugin install architecture-reviewer@dev-digest
```

Installs `engineering-foundations` (read-only Bash guard, `review-severity`)
and `dev-digest-stack` (the `onion-architecture` and frontend skills it
reviews against).

## Components

| Type | Name | Purpose |
|------|------|---------|
| Agent | `architecture-reviewer:architecture-reviewer` | Layer and module boundary review of `git diff --cached` (`opus`) |

## Usage

Stage the change, then: `@agent-architecture-reviewer:architecture-reviewer review the staged diff`.
In `sdd-engineering`, `/sdd-engineering:run-sdd` runs it automatically with
up to three fix rounds.

The prompt was written for the dev-digest layout (`client/`, `server/`,
`reviewer-core/`, `mcp/`, `pnpm arch:check`); in another repo it falls back
to the project's `AGENTS.md` / `CLAUDE.md`.
