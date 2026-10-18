# Application ring: services, executors, pipelines

The application ring runs use cases. It knows *what* happens (load a PR,
run agents, persist findings, enqueue indexing) and *in which order*, but
not *how* storage or external systems do it.

## Contents
1. What belongs here
2. Depend on ports, receive them from outside
3. Transactions: the service owns the boundary
4. Helpers and constants: the domain next door
5. Background work and events
6. Worked before → after

---

## 1. What belongs here

- `modules/<f>/service.ts`: one class per feature, with public methods as
  use cases (`add`, `list`, `refresh`, `remove`, `runCloneJob`).
- Larger use cases get their own file: `reviews/run-executor.ts`,
  `reviews/diff-loader.ts`, `repo-intel/pipeline/*`.
- A service **may** call ports (`GitClient`, `GitHubClient`, `LLMProvider`,
  `RepoIntel`, a `FooStore`), pure helpers, the `JobRunner` and the `RunBus`.
- A service **may not** import `drizzle-orm`, `src/db/schema`,
  `src/adapters/*`, Fastify types, or another module's service or repository.

The repos service states the contract in its own header comment:
*"No HTTP and no raw SQL live here: persistence goes through RepoRepository,
pure transforms through helpers.ts, literals through constants.ts."* Every
new service should meet that bar.

## 2. Depend on ports, receive them from outside

**Current convention.** Services take the whole `Container` and build their
own repository:

```ts
export class RepoService {
  private repo: RepoRepository;
  constructor(private container: Container) {
    this.repo = new RepoRepository(container.db);   // concrete Drizzle class
  }
}
```

This works, but the dependency is hidden (you can't tell from the constructor
what the service uses), and testing it needs a real DB. It also creates the
`service ↔ container` import cycles in the debt list.

**For new services**, declare what you need as a narrow deps type made of
interfaces, and let the module plugin or the container supply concretes:

```ts
// modules/foo/ports.ts  (domain services / ports ring)
import type { Foo } from '@devdigest/shared';
export interface FooStore {
  findById(workspaceId: string, id: string): Promise<Foo | undefined>;
  insert(workspaceId: string, input: NewFoo): Promise<Foo>;
}

// modules/foo/service.ts  (application ring)
import type { GitClient } from '@devdigest/shared';
import type { JobRunner } from '../../platform/jobs.js';
import type { FooStore } from './ports.js';

export interface FooDeps {
  store: FooStore;
  git: GitClient;
  jobs: JobRunner;
}

export class FooService {
  constructor(private deps: FooDeps) {}

  async get(workspaceId: string, id: string): Promise<Foo> {
    const foo = await this.deps.store.findById(workspaceId, id);
    if (!foo) throw new NotFoundError(`Foo ${id} not found`);
    return foo;
  }
}
```

Why a deps object and not `Container`: the signature documents exactly which
outer-ring capabilities the use case needs. A test can pass three fakes
instead of building a container. The service stops importing
`platform/container.ts`, which removes the cycle.

**Ports that need a key are factories, not instances.** `github()`, `llm(id)`
and `embedder()` are async on the container because they read a secret on
first use, and the server must boot without keys. Put them in deps as
`github: () => Promise<GitHubClient>` and wire them as
`github: () => app.container.github()`. Never `await` them at wiring time.

**Inside an existing `Container`-style module, stay consistent** (Step 0).
Converting one method's dependencies halfway makes the module harder to read,
not easier. Convert the whole service or leave it.

## 3. Transactions: the service owns the boundary

`db.transaction(` already exists in some repositories (`settings`, `agents`,
`conventions`; each wraps its writes inside one repository method). A
use case that spans several repositories uses the pattern below.

**Rule:** the *use case* decides what must be atomic, so the service owns the
boundary. Repositories must work the same inside or outside a transaction,
and the application must not see a Drizzle `tx` type.

```ts
// modules/runs/ports.ts
export interface RunStores {
  runs: RunStore;
  reviews: ReviewStore;
}
export interface UnitOfWork {
  /** Runs `work` in one DB transaction; rolls back if it throws. */
  run<T>(work: (stores: RunStores) => Promise<T>): Promise<T>;
}

// modules/runs/service.ts
await this.deps.uow.run(async ({ runs, reviews }) => {
  const review = await reviews.insert(workspaceId, outcome.review);
  await runs.markDone(runId, { reviewId: review.id, costUsd: outcome.costUsd });
});
```

The Drizzle implementation lives in the repository file (see
`drizzle-infrastructure.md` §4). This follows the Sentry "atomic
repositories" article: the transaction is created at the top and the same
executor is passed to every repository. Here the executor is hidden behind
store instances, so no `tx` parameter leaks into the ports.

Don't:
- open a transaction inside a repository method that another use case may
  also want to compose. That nests transactions or forces two commits;
- call an LLM, GitHub or any slow network API inside a transaction. That holds
  locks for seconds. Do the external call first, then open the transaction
  for the writes only.

## 4. Helpers and constants: the domain next door

- `helpers.ts` holds pure functions only: parse, validate, compute, map
  between **contract** types. No `await` on I/O. No `container`. No Drizzle
  row types (see the `repos/helpers.ts → db/schema` debt).
- `constants.ts` holds literals and tunables (job kinds, limits, secret names).
- If a helper is needed by two modules, move it to where both can see it
  without crossing module internals. For review-engine rules that is
  `reviewer-core`.
- Test these with plain vitest, with no container and no mocks. If you need
  mocks, it isn't a helper.

## 5. Background work and events

- **Enqueue, don't call.** One use case triggers another through the
  `JobRunner` (`jobs.enqueue(workspaceId, INDEX_JOB_KIND, payload)`), as
  `RepoService.runCloneJob` does. The handler is registered at wiring time.
  This keeps use cases decoupled and gives each one its own timeout and retry.
- **Publish, don't stream.** Progress goes to the `RunBus` (`publish(runId, kind, msg)`).
  Whether it reaches a browser over SSE is the route's business.
- **Degrade, don't throw, for optional capabilities.** `RepoIntel` returns
  `[]`/`degraded: true` when an index is missing. New optional capabilities
  should follow the same contract so the use case has a single fallback path.

## 6. Worked before → after

**Before** (a route that is also the service and the repository):

```ts
app.post('/pulls/:id/sync', async (req) => {
  const pr = await container.db.query.pullRequests.findFirst({ where: eq(t.pullRequests.id, req.params.id) });
  if (!pr) return reply.code(404).send();
  const { files } = await (await container.github()).getPullRequest(ref, pr.number);
  await container.db.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
  await container.db.insert(t.prFiles).values(files.map((f) => ({ prId: pr.id, ...f })));
  return { synced: files.length };
});
```

**After**:

```ts
// routes.ts: presentation
app.post('/pulls/:id/sync', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.syncFiles(workspaceId, req.params.id);
});

// service.ts: application
async syncFiles(workspaceId: string, prId: string) {
  const pr = await this.deps.pulls.findById(workspaceId, prId);
  if (!pr) throw new NotFoundError('Pull request not found');
  const github = await this.deps.github();                                    // key resolved on use
  const { files } = await github.getPullRequest(pr.repoRef, pr.number);       // external call first
  await this.deps.pulls.replaceFiles(pr.id, files);                       // one repo method
  return { synced: files.length };
}

// repository.ts: infrastructure (owns the delete + insert, and the workspace scoping)
```

What moved: the 404 became a domain error, the queries moved behind
`PullStore`, and the tenancy scope is enforced in the one place that talks to
the table.
