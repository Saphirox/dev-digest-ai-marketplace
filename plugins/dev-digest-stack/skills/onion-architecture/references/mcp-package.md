# The `mcp/` package (`@devdigest/mcp`)

The stdio MCP server follows **the same module layout and ring rules as
`server/`**. Only the presentation technology differs: MCP tools instead of
Fastify routes, and an HTTP client instead of Drizzle.

## Where `mcp/` sits in the whole system

`mcp/` is an **outer-ring driving adapter** of DevDigest, like `client/`. It
reaches the core only through the Fastify HTTP API (`DEVDIGEST_API_URL`). It
never imports `server/src/**`, the DB or `@devdigest/shared`. The last one
is banned because the zod-4 alias breaks at
`server/src/vendor/shared/contracts/platform.ts:95`, so `mcp/` hand-types the
fields it reads and validates them with `safeParse` at the adapter boundary.

## Folder → ring map (mirror of `server/src`)

| `server/src` | `mcp/src` | Ring | Holds |
|---|---|---|---|
| `app.ts` | `app.ts` | composition | `createApp(container)` → `McpServer` + `registerModules(server, container)`. Constructs nothing itself. |
| `modules/index.ts` | `modules/index.ts` | composition | `registerModules(server, container)` — imports every module's `tools.ts` and registers it; the one sanctioned place that crosses module boundaries at the registration level |
| `server.ts` | `server.ts` | composition (entry) | config → container → `app` → `StdioServerTransport`; no I/O before `connect()` |
| `platform/container.ts` | `platform/container.ts` | composition root | **cross-cutting infra only**: the HTTP client, the shared `Resolver` (+ its `_shared` `LookupApiRepository`), config values. `ContainerOverrides` (`client`, `resolver`, `pollMs`) is the one test seam — a test builds a real `Container` with an overridden `client`/`pollMs` instead of hand-assembling an `AppContainer` object literal, so it exercises the real wiring. It does **not** construct a feature module's repository or service — see *Import rules* |
| `platform/config.ts` | `platform/config.ts` | infra | the only `process.env` read |
| `platform/errors.ts` | `platform/errors.ts` | domain | `McpError` base class (a `code` discriminant + `Error`, mirrors `server/`'s `AppError`) and 11 subclasses (`AgentNotFound`, `RunFailed`, `MalformedResponse`, …) with no user-facing prose |
| — | `platform/log.ts` | infra | stderr-only logger (stdout is JSON-RPC) |
| `src/db/*` (shared client) | `adapters/devdigest-api/client.ts` | infrastructure | `DevDigestApiClient`: the **only** `fetch`, timeout, `ApiErrorBody` → `platform/errors` mapping |
| `modules/<f>/ports.ts` | `modules/<f>/ports.ts` | port | **the module's contracts**: record shapes it reads (e.g. `ReviewRecord`, `FindingRecord`, `RunStatusRecord`) and its `<Feature>Store` interface, declared next to the service that uses it. Only the fields the module actually reads — an unread field is dropped, not carried "for completeness" (contracts hygiene) |
| `modules/<f>/repository.ts` | `modules/<f>/repository.ts` | infrastructure | `<Feature>ApiRepository implements <Feature>Store` over the shared HTTP client; owns that module's response zod schemas + `safeParse` (the HTTP analogue of row → record mapping) |
| `modules/<f>/service.ts` | `modules/<f>/service.ts` | application | a class per module (`AgentsService`, `ReviewsService`, `ConventionsService`); constructor takes its `<Feature>Store` and, where needed, the shared `Resolver` — via a named deps type (`XxxServiceDeps`), consistently for every service |
| `modules/<f>/helpers.ts`, `constants.ts` | same | domain (pure) | select, sort, verdict, truncate, agent-matching rule; typed by the module's `ports.ts` records; no I/O |
| `src/lib/*.ts` | `src/lib/*.ts` | domain (pure) | pure helpers with no I/O shared across rings that otherwise couldn't share a copy without widening the import allowlist (precedent: `server/src/lib/diff-lines.ts:14-19`) — e.g. `text.ts`'s `truncate`. A `lib` file imports nothing internal and nothing but `zod`; it may be imported by `helpers`, `render`, `adapter`, `repository` and every `_shared/*` (`shared-*`) file |
| `modules/<f>/routes.ts` | `modules/<f>/tools.ts` | presentation | builds its own module's repository + service **from the container** (`register<F>Tools(server, container)`, mirrors `routes.ts` building its service from `container.db`), then `registerTool`: `z.object` schemas, description, annotations; validate → call **one** service method → render |
| — | `modules/<f>/render.ts` | presentation | model-facing line text for that module's tools (including any "DONE …" header line — never inlined in `tools.ts`) |
| `modules/_shared/context.ts` | `modules/_shared/resolver.ts` + `ports.ts` + `repository.ts` | application / port / infra | `owner/name` + PR number + agent → ids (process cache). Its own contracts (`RepoRecord`, `PullRecord`, `AgentRef`, `LookupStore`) live in `_shared/ports.ts`, implemented by `_shared/repository.ts` |
| `modules/_shared/schemas.ts` | `modules/_shared/schemas.ts` | presentation | shared zod input fields (`repo`, `pr`, `agent`) |
| `app.ts` error handler | `modules/_shared/messages.ts` | presentation | domain error → forward-leading text (`toToolResult`), the **only** prose catalogue — every non-error ("ok") forward-leading text (e.g. `list_agents`' "No agents configured.", `get_blast_radius`'s degraded-reason and "no callers" lines) lives here too, never inlined in a `tools.ts` |

There is **no** central `ports.ts` / `domain/types.ts`: each module owns its
contracts, as in `server/`. A record shape needed by two modules is declared
structurally in each (only the fields that module reads), or in `_shared/ports.ts`
when it belongs to the resolver.

Modules: `agents/` (`list_agents`), `reviews/` (`run_agent_on_pr`,
`get_findings`), `conventions/` (`get_conventions`), `blast/`
(`get_blast_radius`, a full module — `ports`/`repository`/`service`/
`helpers`/`render`/`tools.ts` — reading a PR's precomputed blast radius plus
prior PRs touching the same files).

## Import rules

Same direction as the server: every import points inward.

- `tools.ts` may import its own module's `ports`, `repository` (to construct
  `new <Feature>ApiRepository(container.client)`), `service` (to construct
  `new <Feature>Service({ store, resolver: container.resolver })` and as a
  type), `render`, `helpers`, `constants`, `modules/_shared/{schemas,messages}`,
  `platform/errors`, `platform/container` (the `AppContainer` **type** only —
  never the concrete `Container` class), `@modelcontextprotocol/*` and `zod`.
  It never imports `adapters/` directly, nor another module's internals.
- `service.ts` may import its own `ports`/`helpers`/`constants`,
  `modules/_shared/{ports,resolver}` and `platform/errors`. It never imports
  `repository.ts`, `adapters/`, `@modelcontextprotocol/*`, `platform/config`,
  `platform/container` or `messages`, and it never reads `process.env`.
- `helpers.ts`, `constants.ts`, `ports.ts` and `platform/errors.ts` do no I/O.
  They import no `node:*`, no SDK, no adapters and no repository. `helpers.ts`
  and `render.ts` may additionally import `src/lib/*` (see below).
- `repository.ts` may import its own `ports`, `adapters/devdigest-api/client`,
  `platform/errors`, `src/lib/*` and `zod`. It never imports `service`, `tools`
  or tool names.
- `adapters/**` may import `platform/errors` and `src/lib/*` only; it knows no
  module and no config.
- `src/lib/*.ts` imports nothing internal and nothing but `zod` (most `lib`
  files, like `text.ts`, need neither). It may be imported by `helpers.ts`,
  `render.ts`, `adapters/**`, `repository.ts` and every `modules/_shared/*`
  (`shared-*`) file — never by `tools.ts`, `service.ts` or `platform/container.ts`.
- `platform/container.ts` may import `platform/config`,
  `adapters/devdigest-api/client` and `modules/_shared/{repository,resolver}`
  only — **never a feature module's `repository`/`service`**. Cross-cutting
  infra (the HTTP client, the shared `Resolver`) is the container's job; a
  module's own repository/service is that module's `tools.ts`'s job.
- `modules/index.ts` may import every module's `tools.ts` (that is its whole
  purpose) and `platform/container`'s `AppContainer` type.
- `app.ts` may import `modules/index.ts` and `platform/container`'s
  `AppContainer` type only.
- **`no-cross-module-internals`**: module A never imports module B's
  `tools`/`service`/`repository`/`ports`/`helpers`/`constants`/`render`.
  Shared code goes through `modules/_shared/`. `modules/index.ts` is the one
  exemption (it must reach every module's `tools.ts` to register it).
- **No concrete construction outside two places**: only
  `platform/container.ts` and a module's own `tools.ts` may write
  `new <Feature>ApiRepository(...)`, `new <Feature>Service(...)`,
  `new DevDigestApiClient(...)` or `new Resolver(...)`. `app.ts`, `server.ts`
  and every other file receive already-built instances.
- **`new Container(...)` is `server.ts`-only.** Every other file, including
  `platform/container.ts` itself, `app.ts` and every module's `tools.ts`,
  receives an already-built `AppContainer`, never constructs one.
- **Every import of `platform/container.ts` from a `tools.ts`, `app.ts` or
  `modules/index.ts` file must be type-only** (`import type { AppContainer }`,
  or `import { type AppContainer }`) — enforced, not just documented: a value
  import of `Container` from one of those files is a real regression (it
  would let a tool construct its own container instead of receiving the
  composition root's), and `test/architecture.test.ts` fails it by tracking
  an `isTypeOnly` flag per parsed import specifier.

## Rules specific to MCP presentation

- Services return domain results and throw `platform/errors` types (`McpError` subclasses). `messages.ts`'s `toToolResult` turns them into `isError` text that names the next tool or step, via an exhaustive `switch` on `.code` (TypeScript rejects the build if a new `McpError` subclass has no matching `case`).
- Progress and cancel: a service takes `onProgress`/`AbortSignal` as plain parameters. `tools.ts` bridges `ctx.mcpReq._meta?.progressToken`/`ctx.mcpReq.notify`/`ctx.mcpReq.signal`.
- The token budget (`tools/list` ≤ 6,000 chars, `instructions` ≤ 160) is guarded by `mcp/test/tools.test.ts`.

## Deliberate deviations from `server/`

`mcp/` mirrors `server/`'s layout, not byte-for-byte its file list — these
differences are intentional, not debt:

- `_shared/resolver.ts` (+ `_shared/ports.ts`/`repository.ts`) stands in for
  server's `modules/_shared/context.ts`: both resolve "which tenant/PR/agent
  am I talking about", but `mcp/` additionally caches `owner/name#n → prId`
  for the process lifetime (no per-request workspace scoping to do — a
  single local API, no multi-tenant auth).
- `modules/_shared/messages.ts` stands in for server's `app.ts` error
  handler: both are the one place that turns a thrown domain error into a
  response, but `mcp/`'s is a pure function per tool call (`toToolResult`),
  not a framework-level hook, and it also carries the non-error ("ok")
  forward-leading texts (`waitExhaustedMessage`, `noReviewsMessage`, …),
  which server's error handler has no equivalent of.
- `modules/<f>/repository.ts` classes are HTTP repositories
  (`<Feature>ApiRepository` over `DevDigestApiClient`), not Drizzle — there
  is no database in this package, so no `db.transaction`/`UnitOfWork` port
  either: every "write" is a single `POST` to the already-transactional API.
- `platform/container.ts` builds far less than server's `Container`: only
  the HTTP client and the shared `Resolver`. Server's container additionally
  builds shared repositories (`agentsRepo`, `reviewRepo`) and every adapter
  (LLM, GitHub, git, embedder, …) because those are genuinely cross-cutting
  in a multi-module Postgres-backed app; `mcp/` has one HTTP client and no
  other adapter to share, so each module's `tools.ts` builds its own
  repository + service instead (item A of the 2026-09-26 compliance pass).

## Enforcement

Dependency-cruiser does not scan `mcp/`. The rules above are enforced by:
- `mcp/test/architecture.test.ts`: per-kind **allowlists** (module, file-kind,
  now including a `lib` kind) plus `no-cross-module-internals`, a "no concrete
  construction outside `platform/container.ts`/a module's `tools.ts`" check
  (plus `new Container(...)` restricted to `server.ts`), and a check that every
  `platform/container.ts` import from a `tools`/`app`/`modules-index` file is
  type-only. It parses `import … from`, `export … from`, `import('...')`/
  `` import(`...`) `` (dynamic import, including a template-literal argument)
  and `import('...').Foo` (type-position `ts.ImportTypeNode`) — not a regex,
  so it isn't fooled by the word "from" in a comment or the shape of a dynamic
  import — and records whether each parsed specifier is type-only (`import
  type ...` or an inline `type` named specifier) to support the type-only
  container check.
- `.github/workflows/mcp.yml`: typecheck + tests on `mcp/**` and `server/src/vendor/shared/**`.

Test placement matches the server: tests live in `mcp/test/`, not beside the source. Services are tested with a fake `<Feature>Store`, repositories with a stubbed HTTP client, and the composed app (`tools.test.ts`) over `InMemoryTransport` with a fake `DevDigestApiClient` injected via `Container`'s `overrides.client` — the same seam production code uses, exercising each module's real `tools.ts`-built repository + service, not a per-module fake store.
