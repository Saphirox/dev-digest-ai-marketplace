# Testing by ring, and enforcing the rings

A payoff of Onion Architecture is that each ring can be tested at its own
cost. If a test for an inner ring needs something from an outer ring (Docker,
a key, the network), the layering has leaked. Treat that as a design
signal, not as a test problem.

## Contents
1. Test type per ring
2. Fakes vs mocks
3. `arch:check` (dependency-cruiser)
4. Changing the rules

---

## 1. Test type per ring

Conventions from root `AGENTS.md` and `TESTING.md` apply: server tests live in
`server/test/`, not beside the source. DB-backed ones **must** end in
`.it.test.ts` or the unit/integration split breaks.

| Ring | What to test | How | File |
|---|---|---|---|
| Domain: contracts, `helpers.ts`, reviewer-core engine | Rules, transforms, grounding, prompt assembly | Plain vitest, no container, no mocks | `test/<feature>-helpers.test.ts`, `reviewer-core` tests |
| Application: services, executors | Use-case flow, error cases, which ports get called | Hand-written fakes for `ports.ts` stores, `adapters/mocks.ts` for shared ports, stubbed `LLMProvider` | `test/<feature>-service.test.ts` |
| Infrastructure: repositories | Queries, `workspaceId` scoping, transactions, PG error translation | Real Postgres via testcontainers (`test/helpers/pg.ts`) | `test/<feature>-*.it.test.ts` |
| Infrastructure: adapters | Mapping SDK ↔ contract, error translation | Unit tests with a recorded or fake transport. No live network in CI | `test/adapters.test.ts` style |
| Presentation: routes | Status codes, validation (422), envelope, auth context | `buildApp({ config, overrides })` + `app.inject()` | `test/routes-smoke.test.ts` style |
| Whole flow | One per data-backed workflow | `buildApp` + real Postgres | `*.it.test.ts` |

Run the lanes (from `TESTING.md`):

```sh
cd server && ./node_modules/.bin/vitest run --exclude '**/*.it.test.ts'   # unit, no Docker
cd server && ./node_modules/.bin/vitest run .it.test                      # integration, needs Docker
```

(Call the binary directly. `pnpm <script>` can fail with
`ERR_PNPM_IGNORED_BUILDS` on this machine; see root `INSIGHTS.md`.)

## 2. Fakes vs mocks

- For **store ports** (`FooStore`), prefer a small in-memory fake
  (`class InMemoryFooStore implements FooStore`) in the test file or
  `test/helpers/`. It lets a service test assert on *state* ("the run is
  done"), not on call order, and survives refactors.
- For **external ports**, use the shared mocks in `src/adapters/mocks.ts`
  (`MockGitHubClient`, …) and inject them through `ContainerOverrides` or the
  service's deps.
- If a service test needs `vi.mock('../../src/adapters/...')` module mocking,
  the service is importing a concrete adapter. Fix the import. Don't add the
  module mock.

## 3. `arch:check` (dependency-cruiser)

`server/.dependency-cruiser.cjs` turns the import matrix from
`layers-and-dependency-rule.md` into rules. `dependency-cruiser` is already a
runtime dependency of the server (the repo-intel depgraph adapter uses it), so
the check adds nothing to install.

```sh
cd server
./node_modules/.bin/depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --output-type err
# or: pnpm arch:check   (same command, when the pnpm wrapper cooperates)
```

- Exit code is non-zero only for `error` violations. `warn` violations
  print but pass.
- **Baseline 2026-10-03: 0 errors, 15 warnings** (list in
  `layers-and-dependency-rule.md` §4). Compare the warning count before and
  after your change. An increase means your change added debt.
- To see one file's edges: add `--focus 'src/modules/foo'`. For a graph:
  `--output-type dot | dot -T svg > deps.svg` (needs graphviz).

Severity policy:
- **error** means the ring is clean today and must stay clean.
- **warn** means known debt exists. New code must not add to it.
- When a `warn` rule reaches zero, promote it to `error` in the same PR.

## 4. Changing the rules

Config gotchas found while writing this config (don't rediscover them):

- **pnpm layout.** Resolved paths look like
  `node_modules/.pnpm/drizzle-orm@0.38.4_postgres@3.4.9/node_modules/drizzle-orm/index.cjs`.
  Match packages with the `NM` prefix constant (`(^|/)node_modules/`), never
  `^node_modules/<pkg>/`.
- **No `types` in `conditionNames`.** It resolves packages to `.d.ts` files,
  and the `exclude` of `\.d\.ts$` then silently drops those edges. Every
  `drizzle-orm` import vanished from the graph that way. `import` *is*
  needed: without it the ESM-only `octokit` and `p-queue` don't resolve.
- **`not-to-unresolvable` is part of enforcement.** A package a ring doesn't
  install (e.g. `drizzle-orm` from `reviewer-core`) resolves to nothing, so a
  path-based rule can't see it. The unresolvable rule catches it.
- **Prove a new rule fires.** Add a throwaway file with a deliberate
  violation, run the check, see the error, delete the file. A rule that
  never fires looks the same as a clean codebase.
- `tsPreCompilationDeps: true` counts `import type` edges too. That is
  intended: a type-only dependency on an outer ring is still an outward
  dependency. It is also why the `service ↔ container` cycles show up.
