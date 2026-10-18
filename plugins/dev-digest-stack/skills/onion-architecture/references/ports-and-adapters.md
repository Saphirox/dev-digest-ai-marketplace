# Ports, adapters, the DI container, and reviewer-core

Every external system (GitHub, git, LLM providers, embeddings, secrets,
native parsers, the filesystem) reaches the core only through an interface
the core owns. This is the Ports & Adapters mechanism that Onion
Architecture relies on for its "infrastructure is external" rule.

## Contents
1. The existing ports
2. Adding a new external dependency (checklist)
3. Where the interface goes
4. Adapter rules
5. The DI container is the composition root
6. reviewer-core: the pure engine

---

## 1. The existing ports

| Port (interface) | Declared in | Adapters (`server/src/adapters/`) | Container getter |
|---|---|---|---|
| `LLMProvider` | `vendor/shared/adapters.ts` | `llm/openai.ts`, `llm/anthropic.ts`, reviewer-core `OpenRouterProvider` | `await container.llm(id)` |
| `Embedder` | `vendor/shared/adapters.ts` | `embedder/openai.ts` | `await container.embedder()` |
| `GitHubClient` | `vendor/shared/adapters.ts` | `github/octokit.ts` | `await container.github()` |
| `GitClient` | `vendor/shared/adapters.ts` | `git/simple-git.ts` | `container.git` |
| `CodeIndex` | `vendor/shared/adapters.ts` | `codeindex/ripgrep.ts` | `container.codeIndex` |
| `AuthProvider` | `vendor/shared/adapters.ts` | `auth/local.ts` | `container.auth` (field) |
| `SecretsProvider` | `vendor/shared/adapters.ts` | `secrets/local.ts` | `container.secrets` (field) |
| `RepoIntel` (facade) | `modules/repo-intel/types.ts` | `modules/repo-intel/service.ts` | `container.repoIntel` |
| `DepGraph`, `Tokenizer` | the adapter file itself (`depgraph/index.ts`, `tokenizer/index.ts`) | same file | `container.depgraph`, `container.tokenizer` |

Adapters that need a key (`github`, `llm`, `embedder`) are **async methods**
that resolve the secret through `SecretsProvider` on first use. Keyless ones are
lazy getters. Every accessor checks `overrides.<name>` first. That is how tests inject
`adapters/mocks.ts` (`buildApp({ overrides: { github: new MockGitHubClient(...) } })`).

`DepGraph` and `Tokenizer` declare their interface next to the implementation.
That is acceptable while the only consumer is repo-intel's pipeline. When a
second consumer appears, move the interface inward.

## 2. Adding a new external dependency (checklist)

Say a feature needs Slack notifications.

1. **Port.** `interface Notifier { send(channel: string, msg: NotifyMessage): Promise<void> }`,
   named after the capability, not the vendor. The method signatures use
   contract or domain types, never SDK types.
2. **Adapter.** `src/adapters/notifier/slack.ts`: `export class SlackNotifier implements Notifier`.
   Naming follows root `AGENTS.md`: `adapters/<port>/<impl>.ts`, port name singular.
3. **Mock.** Add `MockNotifier` to `src/adapters/mocks.ts`, recording calls
   for assertions.
4. **Container.** Add `notifier?: Notifier` to `ContainerOverrides`. Needs a key,
   so add an async accessor like `github()`: check `this.overrides.notifier`,
   else read the token via `this.secrets`, build and cache `new SlackNotifier(token)`.
   Credentials come from `SecretsProvider`, never from `.env` (the secrets rule
   in root `AGENTS.md`), and `invalidateSecretCaches()` must drop the cached instance.
5. **Config.** Make it optional. The server must boot with no keys
   (server `AGENTS.md`). A missing key throws `ConfigError` when the port is
   first *used*, not at boot.
6. **Consume.** The service receives `Notifier` in its deps. It never imports
   `adapters/notifier/slack.ts` (`modules-no-concrete-adapters`).

## 3. Where the interface goes

```
Is it an external system several modules will use, or does the client need its shape?
  └─ yes → vendor/shared/adapters.ts   (then mirror to client/src/vendor/shared deliberately)
Is it a module's own store / repository contract?
  └─ yes → modules/<f>/ports.ts
Is it a large internal capability with its own sub-system (like repo-intel)?
  └─ yes → modules/<f>/types.ts as a facade; the implementation hides the libraries
```

Why not always `vendor/shared`: it's hand-vendored and must be synced to the
client by hand (root `AGENTS.md` "Do not touch"). Each server-only interface
added there is future drift with no benefit.

## 4. Adapter rules

- **Implements exactly one port.** It imports the port and its own SDK, and
  nothing from `modules/*` (`adapters-not-inward-to-app`). If an adapter needs
  a tunable (max chars, supported extensions), take it as a constructor option.
  Don't import the module's `constants.ts`. `astgrep/index.ts` and
  `depgraph/index.ts` currently break this.
- **Translates at the edge.** SDK types in, contract types out. SDK errors in,
  `AppError`/`ExternalServiceError` out. Rate limits and retries go through
  `platform/resilience.ts`, not re-implemented per call site.
- **No business decisions.** An adapter answers "how do I talk to X", never
  "should we". For example, `GitHubClient.getPullRequest` returns every changed
  file. Deciding which files a review should skip (generated, vendored) is a
  domain rule, so it goes in a helper or `reviewer-core`, not in the Octokit adapter.
- **Pure code isn't an adapter.** `git/diff-parser.ts` (`parseUnifiedDiff`)
  and `codeindex/extract.ts` do no I/O, so they are domain functions sitting
  in the adapters folder. New pure parsers go inward (a module `helpers.ts`
  or `reviewer-core`). Moving the existing ones is on the debt list.

## 5. The DI container is the composition root

`platform/container.ts` is the only place (with `app.ts`, `server.ts` and the
module plugins' wiring lines) allowed to import concrete adapters and
construct them. The rule behind it: *"Services depend on these interfaces,
not the concrete classes"* (the container's own doc comment).

- **Lazy getters**, so the server boots with no keys and unused adapters are
  never built.
- **One instance per app**, which gives shared caches (`llmCache`, `priceBook`)
  and shared repositories for cross-cutting entities (`agentsRepo`,
  `reviewRepo`). Direct `new XRepository()` in another module creates a
  second instance.
- **Overrides for every port.** A port without a `ContainerOverrides` field
  can't be mocked in `buildApp`-level tests.
- **Not a service locator for business code.** New services should receive
  a narrow deps object (see `application-services.md` §2). They shouldn't
  receive `container` and fetch from it on demand.

## 6. reviewer-core: the pure engine

`reviewer-core` is the clearest onion in the repo: diff → prompt → LLM →
grounded findings, with a single side effect through an injected
`LLMProvider` (`reviewer-core/AGENTS.md`).

Rules (enforced by `reviewer-core-pure` and `reviewer-core-engine-no-sdk`):
- No DB, filesystem, GitHub, git, Fastify, or `process.env`. If a feature
  needs data from those, `server` fetches it and passes it in as plain input.
  The prompt slots `skills`, `memory`, `specs` and `callers` exist for exactly this.
- Contracts come from `@devdigest/shared`. Don't define parallel types.
- Only `src/llm/` touches the `openai` SDK. `src/index.ts` may re-export the
  `OpenRouterProvider` adapter as public API. Nothing in `review/`,
  `prompt.ts`, `grounding.ts` or `output/` may import it.
- Tests stub `LLMProvider` and never need keys or network.
- Grounding and score recomputation are domain rules. They stay here and are
  never duplicated in the server (`platform/grounding.ts` is only a re-export).
