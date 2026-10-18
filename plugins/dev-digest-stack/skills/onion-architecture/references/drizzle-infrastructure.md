# Drizzle and Postgres as infrastructure

In Onion terms, Postgres is an outer-ring detail. Drizzle is the adapter that
talks to it, and a repository is the class that implements an
application-owned store interface with Drizzle. Query syntax, relations and
migrations are in `drizzle-orm-patterns`, and table design is in
`postgresql-table-design`. This file covers the boundary.

## Contents
1. Where Drizzle may appear
2. Repository shape
3. Rows stop at the repository
4. Transactions: the Drizzle side of the unit of work
5. Translating database errors
6. Schema and migrations stay outside

---

## 1. Where Drizzle may appear

| Allowed | Not allowed |
|---|---|
| `modules/<f>/repository.ts`, `modules/reviews/repository/*.repo.ts` | `routes.ts` (`routes-no-persistence`) |
| `src/db/*` (schema, client, rows, migrate, seed) | `service.ts`, `run-executor.ts`, `pipeline/*`, `helpers.ts` (`application-no-drizzle`, `pure-module-files-no-io`) |
| `platform/jobs.ts` and other platform *infrastructure* | `vendor/shared/**`, `reviewer-core/**` (`shared-contracts-pure`, `reviewer-core-pure`) |

`import type { Db }` from `src/db/client.ts` is fine in a repository or at a
wiring point. Everywhere else, depend on the store interface.

## 2. Repository shape

Copy `modules/repos/repository.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { FooStore } from './ports.js';

/** F<n> — foo data-access layer. The ONLY place that touches the `foos` table. */
export class FooRepository implements FooStore {
  constructor(private db: DbExecutor) {}

  async findById(workspaceId: string, id: string): Promise<Foo | undefined> {
    const [row] = await this.db
      .select()
      .from(t.foos)
      .where(and(eq(t.foos.workspaceId, workspaceId), eq(t.foos.id, id)))
      .limit(1);
    return row && toFoo(row);
  }
}
```

Rules, with the reasons:
- **One table owner.** Each table has exactly one repository that writes to
  it. Cross-cutting entities (agents, reviews, runs) are shared through the
  container (`container.agentsRepo`, `container.reviewRepo`), not by
  importing another module's repository.
- **Every query is scoped by `workspaceId`.** The repository is the tenancy
  guard. A service can't forget the filter if it can't write the query.
- **`implements FooStore`.** The class conforms to the application's
  interface, and the dependency points inward.
- **Methods are named for intent, not SQL:** `replaceFiles(prId, files)`,
  `markDone(runId, outcome)`, not `deleteWhere` or `insertMany`.

## 3. Rows stop at the repository

`typeof t.foos.$inferSelect` is an infrastructure type: it changes when a
migration changes. Return **contract types** (`@devdigest/shared`) or a
module-level domain type from repository methods, and do the mapping in the
repository (a local `toFoo(row)` or a `mappers.ts` beside the repository).

Current state: repositories export `RepoRow`-style types, and some helpers
consume them (`repos/helpers.ts` `toRepoDto`). That is the debt behind
`pure-module-files-no-io`. `src/db/rows.ts` exists so cross-module *infra*
code can share row shapes. It is not a licence for services to use rows.

Why: when the application only sees contract types, a column rename touches
the schema, the migration and one mapper, not every service that happened to
read the row.

## 4. Transactions: the Drizzle side of the unit of work

The application declares `UnitOfWork` in `ports.ts` (see
`application-services.md` §3). The implementation lives with the
repositories:

```ts
// modules/runs/repository.ts
import type { Db } from '../../db/client.js';

/** Either the root client or a transaction handle; repositories accept both. */
export type DbExecutor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private db: Db) {}
  run<T>(work: (stores: RunStores) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      work({ runs: new RunRepository(tx), reviews: new ReviewRepository(tx) }),
    );
  }
}
```

- Repositories take a `DbExecutor`, so the same class works bound to `db`
  or to `tx`. This is the Sentry "atomic repositories" `tx ?? db` idea, done
  through the constructor instead of an optional method parameter.
- Drizzle rolls back when the callback throws. Let domain errors propagate,
  and don't catch-and-continue inside `run`.
- Keep the callback short and I/O-free apart from the writes (no LLM or
  GitHub calls inside).

## 5. Translating database errors

A raw `PostgresError` must not reach the application or the error handler.
Translate at the repository boundary into an `AppError` with a stable code:

| Postgres | Meaning | Throw |
|---|---|---|
| `23505` unique_violation | duplicate (e.g. same repo `fullName` in a workspace) | `new AppError('conflict', '…', 409)` |
| `23503` foreign_key_violation | referenced entity missing | `NotFoundError` or `ValidationError` |
| `23514` check_violation | invariant broken | `ValidationError` |

Prefer *preventing* the error when the use case expects it (the repos service
dedupes with `findByFullName` before insert). Translate as a backstop for races.

## 6. Schema and migrations stay outside

- `src/db/schema/<domain>.ts` and `src/db/migrations/*` are infrastructure
  and never imported by services or helpers.
- Migrations are append-only and not applied on boot. Unused tables are
  pre-created for future lessons (root `AGENTS.md`). None of that is an
  architecture concern, so don't "clean up" tables to fit a model.
- pgvector similarity queries (`<=>`, `cosineDistance`) belong in a
  repository method named for intent (`findSimilarChunks`), behind the port
  the feature needs. Never inline them in a pipeline.
