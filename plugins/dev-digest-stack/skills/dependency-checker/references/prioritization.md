# Prioritisation rubric

## Priority scale

| Priority | Meaning | Typical trigger |
|---|---|---|
| **P0 — now** | Something is broken, exploitable or will break on the next clean install / production deploy | runtime import of an undeclared or dev-only package, a high/critical `VULN` on a runtime path, a deprecated package with a security notice, two lock files fighting in one package |
| **P1 — this sprint** | A real risk or cost that grows the longer it waits | a major-version split of a library whose types cross package boundaries, a forked shared copy that already differs, a moderate `VULN`, a prod dependency nobody uses, `OUTDATED_MAJOR` of a framework with an EOL date |
| **P2 — planned** | Hygiene with measurable payoff | heavy dependency with a lighter / lazy alternative, dev tool misplaced in `dependencies`, unused devDependency, duplicate versions you can dedupe, untracked package-manager files |
| **P3 — note** | Worth knowing, no action unless it changes | install scripts, permissive-but-unusual licenses, intrinsic weight (Next.js, TypeScript), range-only drift |

Two modifiers move a finding **one level up**: it is on the production path
(server start, client runtime, mcp `start`) or it affects more than one
package. One modifier moves it **one level down**: the package is dev/test
only and nothing ships from it (`e2e/`). Never move above P0 or below P3.

## Default priority per code (before modifiers and verification)

| Code | Default | Fix playbook (use the package's own manager) |
|---|---|---|
| `VULN` (high/critical) | P0 | `pnpm --dir <pkg> update <dep>` / `npm --prefix <pkg> update <dep>`; if no fix, pin an override and note it |
| `VULN` (moderate/low) | P1 / P2 | same; batch them |
| `UNDECLARED_IMPORT` (runtime) | P0 | `pnpm --dir <pkg> add <dep>` with the version currently resolved |
| `DEV_DEP_AT_RUNTIME` | P0 if the file runs in production, else ❌ | move to `dependencies` (`pnpm --dir <pkg> add <dep>`; npm: `npm --prefix <pkg> install <dep> --save-prod`) |
| `LOCKFILE_MIX` | P0 | delete the lock file of the wrong manager, re-install with the right one |
| `DEPRECATED` | P1 (P0 if the notice says security) | replace per the notice |
| `DRIFT_MAJOR` | P1 if values/types cross the boundary, else P2 | align the major with one `add <dep>@<ver>` per package (never a workspace override — SKILL.md Rules), or document the deliberate pin in the module's `AGENTS.md` |
| `DRIFT_MINOR` | P2 if values/types cross the boundary, else P3 | same per-package `add <dep>@<ver>` to the highest version in use |
| `ALIAS_FORKED` | P1 if the copies differ, P3 if identical | sync the copies or add a drift check (e.g. a test that diffs them) |
| `CROSS_PACKAGE_DEEP_IMPORT` | P1 (P0 if a build or `--prod` install breaks on it) | import through the tsconfig alias / the package's public entry point and export the symbol there; never `add <pkg>@workspace:*` |
| `UNREFERENCED` (prod) | P1 | `pnpm --dir <pkg> remove <dep>` after the grep in SKILL.md step 3 |
| `UNREFERENCED` (dev) | P2 | same; zero gain when `pulledBy` is set — say "cosmetic" |
| `OUTDATED_MAJOR` | P1 framework / P2 other | upgrade in its own PR, read the changelog |
| `HEAVY` | P2 | lazy-load (`next/dynamic`, `await import()`), a lighter alternative, or accept as intrinsic (P3) |
| `PROD_DEP_DEV_USE` | P2 | move to `devDependencies` |
| `LICENSE_REVIEW` | P2 (P1 for AGPL/SSPL/UNKNOWN on a shipped path) | confirm the license; replace if incompatible |
| `VERSION_MISMATCH`, `MISSING_INSTALL` | P2 | `pnpm --dir <pkg> install --frozen-lockfile` / `npm --prefix <pkg> ci` |
| `UNTRACKED_PM_FILE`, `STRAY_PM_FILE` | P2 | commit it if the team uses it, else delete it and add to `.gitignore` |
| `DUPLICATE_VERSIONS` | P3 (P2 if a runtime lib like `react` is duplicated) | `pnpm --dir <pkg> dedupe` / `npm --prefix <pkg> dedupe` |
| `STRING_REF_ONLY` | P3 | none if confirmed |
| `INSTALL_SCRIPTS`, `NOT_INSTALLED`, `OUTDATED` | P3 | inform; pnpm ≥10 asks to approve builds (`allowBuilds` in `pnpm-workspace.yaml`) |

## Impact and effort

- **Impact** — one line in concrete units: MB freed (use *exclusive*, never
  *tree*), packages removed from the tree, what breaks (which command,
  which environment), which advisory.
- **Effort** — S: one command, no code change · M: code edits in one
  package or a version bump with a changelog read · L: cross-package
  migration (e.g. a zod major across shared contracts).
- Order within a priority: impact ÷ effort, highest first.

## Advice section — what good advice looks like

- Concrete and local: "lazy-load `mermaid` in `MermaidDiagram.tsx` via
  `next/dynamic` — 113 MB exclusive, used by one component" beats "consider
  reducing bundle size".
- Grounded: each advice cites the finding ID(s) it comes from.
- Includes the "do not" when relevant: intrinsic weight (Next.js,
  TypeScript) gets "accept", not a migration plan.
- At most 5 advice bullets; everything else is in the action table.
