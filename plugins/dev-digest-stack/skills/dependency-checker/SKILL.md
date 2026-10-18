---
name: dependency-checker
description: >-
  Audits the npm/pnpm dependencies of every package in a multi-package repo (here server, client, reviewer-core, e2e, mcp) and the links between them — draws a Mermaid dependency map, lists each dependency by type, category, version, own / transitive / exclusive size on disk and where it is used, flags version drift, unused, misplaced, undeclared, heavy, duplicated, deprecated and license-risky packages, then ends with a prioritised P0–P3 action list with exact commands. Use whenever the user asks to check, audit, analyse, map or clean up dependencies or packages, asks why node_modules is so big, what a package costs, what can be removed, whether an install --prod / deploy will break on dependencies, or whether versions are aligned across packages — even if they don't say "audit". Read-only: never installs, updates or removes anything.
argument-hint: "[<package dir>...] [online] [save] [\"what to focus on\"]"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(du:*)
  - Bash(find:*)
  - Bash(ls:*)
  - Bash(git ls-files:*)
  - Bash(git grep:*)
  - Bash(git status:*)
  - Bash(diff:*)
  - Bash(npm --prefix * ls:*)
  - Bash(pnpm --dir * list:*)
  - Bash(npm --prefix * outdated:*)
  - Bash(npm --prefix * audit:*)
  - Bash(pnpm --dir * outdated:*)
  - Bash(pnpm --dir * audit:*)
  - Write(docs/research/**)
---

# Dependency checker

You produce one structured report a developer can act on without
re-reading node_modules: **what we depend on → what it weighs → what is wrong
→ what to do first**. You measure with read-only shell commands, verify
every suspicion against the code, then rank and turn it into actions.

Arguments: `$ARGUMENTS`

## Rules

- **Read-only.** Never run `install`, `ci`, `add`, `remove`, `update`,
  `dedupe`, `audit fix`, a build, or edit any `package.json` / lock file.
  An audit that mutates the tree destroys the evidence it is reporting on,
  and a stray install can write a competing lock file. Fixes go into the
  report as commands for the user to run.
- **Each package keeps its own package manager.** Work it out per package
  (step 1) and use it in every command for that package — `pnpm --dir api …`
  for a pnpm package, `npm --prefix web …` for an npm one. In this repo:
  `server/`, `client/` are pnpm; `reviewer-core/`, `e2e/`, `mcp/` are npm.
- **Fixes match the repo's layout.** Outside a workspace (step 1), every fix
  is per package — aligning a version is one `pnpm --dir <pkg> add <dep>@<ver>`
  / `npm --prefix <pkg> install <dep>@<ver>` per package. Never propose
  `workspace:*`, workspace-wide `overrides` / `catalog:` or converting to a
  workspace as a fix; this repo is deliberately not one (packages share code
  through tsconfig path aliases).
- **Numbers come from commands you ran, never from memory.** A value you did
  not measure is `n/a`. Sizes are apparent bytes on disk (install weight),
  not browser bundle size — say so whenever you talk about a frontend.
- **Suspicion is not a finding.** A grep hit, a missing import or a big
  folder is a candidate; verify it (step 3). A candidate you rejected stays
  in the report with the reason, so the next run does not re-open it.
- **Network is opt-in.** `outdated` / `audit` run only when the arguments
  contain `online` or the user asked about vulnerabilities or updates.
- **Write a file only on `save`** (`docs/research/dependency-audit-<YYYY-MM-DD>.md`,
  first line `Status: … · Date: … · Scope: …`). Default output is the chat.
- Report prose in the user's language; package names, commands, codes and
  table headers stay verbatim.

## Workflow

```
dependency-checker progress:
- [ ] 1. Inventory packages
- [ ] 2. Measure sizes and trees
- [ ] 3. Find and verify findings
- [ ] 4. (online only) outdated + audit
- [ ] 5. Prioritise (references/prioritization.md)
- [ ] 6. Report (template.md)
```

Batch independent commands into one shell call per step — a monorepo has
several packages and one call per package wastes turns.

### 1. Inventory packages

- Packages = the root plus every directory with a `package.json` that is not
  under `node_modules` (`git ls-files '*package.json'` respects `.gitignore`;
  a plain `find` also walks ignored clones and build output).
- Per package record: name, `dependencies` / `devDependencies` /
  `optionalDependencies` / `peerDependencies`, scripts, `packageManager`
  field, lock files present (`pnpm-lock.yaml`, `package-lock.json`,
  `yarn.lock`) and whether git tracks them, `tsconfig.json` `paths`
  aliases, whether `node_modules` exists.
- Workspace or not: it is a workspace only if a root `pnpm-workspace.yaml`
  has a `packages:` list or the root `package.json` has `workspaces`. A
  `pnpm-workspace.yaml` holding only `allowBuilds:` (pnpm ≥10 writes one per
  package on an ignored build) is a settings file, not a workspace.
- Package manager: the `packageManager` field, else the only lock file.
  **Two lock files** in one package is itself a finding (`LOCKFILE_MIX`):
  read README / AGENTS.md / CI to decide which is canonical, and compare the
  two locks' versions against what is installed to show which one is stale.
- A package without `node_modules`: report declared versions and lock
  counts only, and list the install command under "Not checked".

### 2. Measure sizes and trees

- **node_modules total:** `du -sk <pkg>/node_modules`.
- **Own size per dependency:** `du -sk <pkg>/node_modules/<name>` (scoped:
  `@scope/name`). Under pnpm `node_modules/<name>` is a symlink — measure
  `du -skL`, or the real folder under `node_modules/.pnpm/`.
- **Tree** (itself + everything it pulls in) — `npm --prefix <pkg> ls --all --json`
  or `pnpm --dir <pkg> list --depth Infinity --json` (both offline, they read
  node_modules). If they fail on a hand-made or partial tree, walk the
  `dependencies` of each installed `package.json` instead.
- **Exclusive** = the part of a dependency's tree that nothing else in the
  package needs. This is what removing it actually frees, and the only size
  to quote as a saving; own and tree sizes overstate it whenever packages
  share sub-dependencies.
- Tag each dependency with a category from
  [references/categories.json](references/categories.json) (first matching
  regex wins; `other` otherwise).

### 3. Find and verify findings

Look for each code below, then verify it the cheapest way and mark it
✅ confirmed, ⚠️ partial, or ❌ rejected (with the reason).

| Code | How to find | Verify by |
|---|---|---|
| `DEV_DEP_AT_RUNTIME` | a devDependency imported by non-test source | trace from the `start` entry point — is the file loaded in production, or build/test only? |
| `UNDECLARED_IMPORT` | `git grep -nE "from ['\"]<x>|require\\(['\"]<x>|import\\(['\"]<x>"` hits for names not in package.json (skip builtins and tsconfig aliases) | open the line: a string inside a test fixture, template or comment is ❌; a runtime import that resolves only through another package's dependency is ✅ (pnpm's strict layout will not expose it) |
| `UNREFERENCED` | a declared dependency with no import, no bin used in scripts, no config / plugin string | grep the name everywhere (JSON/YAML/shell, Dockerfiles, root scripts); tools load some implicitly (postcss → `postcss.config.*`, `@types/*` → tsconfig, peer deps of a framework) |
| `PROD_DEP_DEV_USE` | a `dependency` used only in tests / config / scripts | does the production start path need it (e.g. `tsx` in a `start` script is runtime)? |
| `DEPRECATED` | `deprecated` field in `node_modules/<x>/package.json`, or `npm ls` warnings | is it on the runtime path? |
| `DRIFT_MAJOR` | the same library on different majors across packages | do values or types of it cross the boundary (a schema built with v4 parsed by code running v3, shared contracts via a path alias)? Check AGENTS.md / INSIGHTS.md for a deliberate, documented pin |
| `DRIFT_MINOR` | the same library on one major but different minor / patch versions across packages | same boundary question as `DRIFT_MAJOR`; list every package's version, not a count |
| `ALIAS_FORKED` | one tsconfig alias pointing at different copies in different packages | `diff -r` the copies; report what differs |
| `CROSS_PACKAGE_DEEP_IMPORT` | one repo package importing another's internal files by relative path (`../reviewer-core/src/…`) instead of its tsconfig alias or entry point | does `tsc` / a `--prod` install or the package's build still resolve it? Is the imported file part of the other package's public surface? |
| `HEAVY` | prod dependency with large exclusive size or tree | intrinsic (framework, compiler) or replaceable / lazy-loadable? Is it used by one component behind a click? |
| `LOCKFILE_MIX`, `UNTRACKED_PM_FILE` | two lock files; lock / `pnpm-workspace.yaml` not tracked by git | which manager is canonical; does the stale lock disagree with what is installed? |
| `LICENSE_REVIEW` | copyleft / unknown `license` in the production tree | read the LICENSE file; optional platform binaries are usually fine |
| `DUPLICATE_VERSIONS`, `INSTALL_SCRIPTS` | several versions of one package in a lock; `preinstall`/`install`/`postinstall` scripts | informational — summarise |

When the user's question is about a deploy or a `--prod` install, also
trace what that exact command would see: a tsconfig path alias that `tsc`
leaves as a bare import, a lock file whose `importers` don't match
`package.json` (`--frozen-lockfile` refuses), a flat `node_modules` that
was not produced by the declared manager. Mark these as inferred unless
you ran something that proves them.

Before calling something deliberate or accidental, read the module's
`AGENTS.md` / `INSIGHTS.md` / README: some oddities are documented decisions
(in this repo: zod 4 in `mcp/`, the vendored `@devdigest/shared` copy in
`client/`), and the report must say which.

### 4. Online checks (only with `online`)

Per package, with its own manager (a non-zero exit just means "found
something"): `pnpm --dir <pkg> outdated --format json` / `npm --prefix <pkg> outdated --json`,
and `… audit --json`. A major behind → `OUTDATED_MAJOR`; minor/patch
behind → one aggregated `OUTDATED` line; each advisory → `VULN` with
severity, path and fixed-in version.

### 5. Prioritise

Apply [references/prioritization.md](references/prioritization.md): every
✅/⚠️ finding gets a priority (P0–P3), an impact line in concrete units
(MB freed — exclusive only — or what breaks, where), an effort (S/M/L),
and an exact command or edit. Merge findings that share one fix.

### 6. Report

Fill [template.md](template.md) and keep its section order and headings, so
reports stay comparable between runs. Scale it to the question: for a
narrow one ("why is web/node_modules big?") keep every section but focus the
tables on the package asked about and say the others were scanned for
context. The Mermaid map shows each repo package as a node with its size,
its heaviest dependencies (solid arrow = prod, dashed = dev), the
build-time links between repo packages (thick arrow, labelled with the
alias) and forked copies (dotted line). All 8 sections, every time: a
section with nothing to report gets one line (`- none`), and "Not checked"
is never empty on a run without `online` — it lists the skipped `outdated` /
`audit` checks. End in chat with the TL;DR and the P0/P1 rows even when you
saved a file.

## Files

| File | Role |
|---|---|
| `references/prioritization.md` | priority scale, default priority per code, fix playbook |
| `references/categories.json` | category per package name (ordered regexes) |
| `template.md` | report skeleton |
| `evals/evals.json` | eval scenarios (skill-creator schema) |
