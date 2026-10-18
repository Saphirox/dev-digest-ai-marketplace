# Layers and the dependency rule

The full map from Onion rings to this repo's folders, what each ring may
import, and the known debt as of 2026-10-03.

## Contents
1. Ring → folder map
2. Import matrix
3. Why these placements (the non-obvious ones)
4. Known debt (baseline)
5. Paying debt down

---

## 1. Ring → folder map

| Ring (inner → outer) | server/ | reviewer-core/ |
|---|---|---|
| **Domain model** | `src/vendor/shared/contracts/*` (zod schema + inferred type), `modules/<f>/helpers.ts`, `modules/<f>/constants.ts`, `platform/errors.ts` (`AppError` taxonomy), `platform/grounding.ts` (a re-export of the reviewer-core rule) | `src/prompt.ts`, `src/grounding.ts`, `src/review/reduce.ts`, `src/output/*` |
| **Domain services / ports** | `src/vendor/shared/adapters.ts` (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `AuthProvider`, `SecretsProvider`), `modules/<f>/ports.ts` (repository and store interfaces), `modules/repo-intel/types.ts` (`RepoIntel` facade) | `LLMProvider` (imported from `@devdigest/shared`) |
| **Application** | `modules/<f>/service.ts`, `modules/reviews/run-executor.ts`, `modules/reviews/diff-loader.ts`, `modules/repo-intel/pipeline/*`, job handler bodies | `src/review/run.ts` (`reviewPullRequest` orchestration) |
| **Infrastructure** | `modules/<f>/repository.ts`, `modules/reviews/repository/*.repo.ts`, `src/db/*` (schema, client, migrations), `src/adapters/*`, `platform/{jobs,sse,run-logger,resilience,price-book}.ts` | `src/llm/*` (`OpenRouterProvider`, the OpenAI SDK) |
| **Presentation** | `modules/<f>/routes.ts`, `modules/_shared/{context,schemas}.ts`, the error handler in `app.ts` | `src/index.ts` (the package's public API) |
| **Composition root** | `platform/container.ts`, `app.ts`, `server.ts`, `modules/index.ts`, and each module plugin's wiring lines | the caller (`server` container) |
| **Tests** | `test/*`, `src/adapters/mocks.ts` | `reviewer-core` tests with a stubbed `LLMProvider` |

`src/prompts/` (agent prompt text) is data. Treat it like constants.

## 2. Import matrix

Rows import columns. ✅ allowed · ⚠️ allowed only through a type-only import or the container · ❌ forbidden.

| from ↓ / to → | contracts & helpers | ports | application | repository / db | adapters/* | routes | container |
|---|---|---|---|---|---|---|---|
| **contracts, helpers, constants** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **ports** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **application** (service, executor, pipeline) | ✅ | ✅ | ✅ same module | ❌ (use a port) | ❌ (use a port) | ❌ | ⚠️ `import type { Container }` |
| **repository** | ✅ | ✅ implements | ❌ | ✅ | ❌ | ❌ | ❌ |
| **adapters/*** | ✅ | ✅ implements | ❌ | ❌ | ✅ same adapter | ❌ | ❌ |
| **routes.ts** | ✅ | ✅ | ✅ own module's service | ⚠️ construct only, never query | ❌ | — | ✅ `app.container` |
| **container / app.ts** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |

Cross-module rule: module A may use module B only through the container
(`container.agentsRepo`, `container.reviewRepo`, `container.repoIntel`) or B's
`constants.ts`/`types.ts`/`ports.ts`. It never imports B's `routes`,
`service`, `repository` or `run-executor`. The rule exists because the
container is the one place that decides lifetimes, and a direct import
creates a second instance with its own state.

## 3. Why these placements (the non-obvious ones)

- **Zod contracts are the domain model.** Classic onion keeps the core free
  of libraries. Here `zod` is allowed in the centre on purpose: one schema
  drives request validation, response serialization (`fastify-type-provider-zod`)
  and the client, which removes a whole class of drift. The price: contracts
  must stay free of HTTP and DB concerns (no Drizzle types, no Fastify types).
- **`platform/errors.ts` is domain, even though `AppError` carries a
  `statusCode`.** This is a pragmatic shortcut: errors say *what* went wrong
  (`not_found`, `validation_error`) and suggest a status. Only the error
  handler in `app.ts` turns them into a response. Services still never touch `reply`.
- **Repository interfaces live in `ports.ts`, not in `vendor/shared`.** They
  are module-local and the client never needs them. `vendor/shared` is
  hand-synced with `client/src/vendor/shared`, so putting server-only
  interfaces there buys drift for nothing. Put an interface in
  `vendor/shared/adapters.ts` only when several modules share it *and* it
  describes an external system.
- **`repo-intel/types.ts` is a port.** It is the facade every feature codes
  against, while ast-grep, dependency-cruiser, graphology and the tokenizer
  stay behind it. It is the model to copy for any large capability.
- **The route plugin is the module's composition point.** `reposRoutes` is
  where `new RepoService(app.container)` happens and where job handlers
  are registered. Constructing things there is fine. Querying there is not.
- **`reviewer-core/src/llm/` is an adapter corner inside the core package.**
  The package ships one adapter (`OpenRouterProvider`) for convenience. The
  engine (`review/`, `prompt.ts`, `grounding.ts`, `output/`) sees only the
  `LLMProvider` interface. `reviewer-core-engine-no-sdk` enforces that.

## 4. Known debt (baseline 2026-10-03: 0 errors, 15 warnings)

Don't copy these. If your change touches one of these files, you may fix
the debt in passing when it is cheap, and say so in the PR. Don't start a
refactor nobody asked for. `routes-no-persistence` and
`pure-module-files-no-io` were paid down to zero and are now `error` rules.

| Rule | Where | Nature |
|---|---|---|
| `application-no-drizzle` ×2 | `reviews/run-executor.ts`, `reviews/diff-loader.ts` → `db/schema` | Row types used above the repository |
| `modules-no-concrete-adapters` ×7 | `repo-intel/service.ts`, `repo-intel/pipeline/{full,incremental}.ts` → `adapters/{astgrep,codeindex}`; `repo-intel/pipeline/repo-map.ts` → `adapters/tokenizer` | Parsers called directly instead of through a port |
| `adapters-not-inward-to-app` ×2 | `adapters/astgrep/index.ts`, `adapters/depgraph/index.ts` → `modules/repo-intel/constants.ts` | An adapter reading app constants. Pass them in as options or move them to the adapter |
| `no-circular` ×4 | `repo-intel/service.ts` and `repo-intel/pipeline/{full,incremental}.ts` ↔ `platform/container.ts` | Services take the whole `Container`, which constructs them. Harmless at runtime (type-only), but it hides dependencies |

## 5. Paying debt down

The order that gives the most per hour:

1. **A route with inline queries** → create `repository.ts` (move the queries
   verbatim, keep the `workspaceId` scoping), then `service.ts`, then slim the
   route. Test coverage: add an `*.it.test.ts` for the repository first.
2. **Row types in helpers** → have the repository return the contract type,
   and make the helper take the contract type.
3. **Pure parsers in `adapters/`** (`diff-parser.ts`, `codeindex/extract.ts`)
   → if a function has no I/O and no native dependency, it is domain code.
   Moving it inward removes the warning without adding a port.
4. **Native-lib calls from pipelines** → reach them through a port on the
   container (like `depgraph` and `tokenizer` already are).

After each step run `arch:check`. Once a rule reaches zero warnings,
promote it to `error` in `.dependency-cruiser.cjs` so it can't regress.
