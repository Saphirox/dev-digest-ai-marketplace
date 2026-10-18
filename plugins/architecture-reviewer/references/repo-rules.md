# Hard repo rules (dev-digest layout)

No other step checks these, so the reviewer does when the diff touches the paths below. In
another project, use the equivalent rules from its `AGENTS.md` / `CLAUDE.md`, if any.

| Rule | How to check |
|---|---|
| A merged migration under `server/src/db/migrations/` is never edited | `git diff --cached --name-status -- server/src/db/migrations/` shows `M` on an existing file |
| No hand-edited or competing lockfile (e.g. `pnpm-lock.yaml` / `pnpm-workspace.yaml` in an npm package) | `git diff --cached --stat` |
| `vendor/shared` changes land on both sides | `diff -r server/src/vendor/shared client/src/vendor/shared` |
| A DB-backed server test is named `*.it.test.ts` | the staged file names |

Cite the command you ran for each rule you checked.

## The boundary check

Run `pnpm arch:check` in `server/` (or `./node_modules/.bin/depcruise src ../reviewer-core/src
--config .dependency-cruiser.cjs --output-type err`) before reasoning about anything
dependency-cruiser covers. Report its output verbatim under *Deterministic results reused* and
never overrule it: a violation it reports is a fact, not a finding you weigh.
