# Fastify as the presentation ring

Fastify is an outer-ring detail. A route translates HTTP into a use-case call
and a use-case result back into HTTP. Fastify mechanics (hooks, schemas,
plugin options) are in `fastify-best-practices`. This file covers only what
that skill doesn't: where the line between Fastify and the application sits.

## Contents
1. What a route may do
2. The exemplar
3. Module plugin = module wiring point
4. Errors cross the boundary once
5. SSE and background jobs
6. Plugins, decorators, encapsulation

---

## 1. What a route may do

A handler does four things, in this order:

1. **Validate.** Put the zod contract in `schema: { params, body, querystring, response }`.
   The type provider (`app.withTypeProvider<ZodTypeProvider>()`) types `req`.
   Never write `Schema.parse(req.body)` by hand (server `AGENTS.md`).
2. **Resolve context.** `const { workspaceId, userId } = await getContext(app.container, req)`.
   Tenancy comes from the `AuthProvider` port, never from a header the route reads itself.
3. **Call one service method.**
4. **Shape the reply.** Set the status code (`reply.status(created ? 201 : 200)`)
   and return a contract type. Serialization runs through the response schema.

It does **not** query the DB, call an adapter, loop over entities applying
business rules, or catch domain errors to rebuild them.

Why: when the route is this thin, the same use case can run from a job, a CLI
or a test without Fastify. That is the point of pushing HTTP to the edge.

## 2. The exemplar

`server/src/modules/repos/routes.ts` is the reference. Trimmed:

```ts
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RepoService(app.container);   // module wiring
  service.registerCloneJobHandler();                // module wiring

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });
}
```

Counter-example (the shape `pulls/routes.ts` had before its 2026-09-19 split; `routes-no-persistence` is now an `error` rule, so no route queries like this today):

```ts
// ❌ presentation reaching into infrastructure
await container.db.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
await container.db.insert(t.prFiles).values(files.map(...));
```

Fix: `PullRepository.replaceFiles(prId, files)`, called by
`PullService.sync(...)`, and the route calls the service. Once
the route no longer imports `drizzle-orm`/`db/schema`, `routes-no-persistence`
stops warning for that file.

## 3. Module plugin = module wiring point

Each `modules/<f>/routes.ts` default export is registered once in
`modules/index.ts`. Treat the top of that function as the module's
composition root:

- Construct the module's service(s) there, passing ports from `app.container`.
- Register job handlers there (`service.registerCloneJobHandler()`).
- For new code, pass the service a narrow deps object instead of the whole
  `Container`. See `application-services.md` §2:

```ts
const service = new FooService({
  store: new FooRepository(app.container.db), // concrete lives here, not in the service
  git: app.container.git,
  jobs: app.container.jobs,
});
```

This constructs a Drizzle-backed class but doesn't *query* through it.
`routes-no-persistence` allows it because the route imports the module's
`repository.ts`, not `drizzle-orm` or `src/db/*`.

## 4. Errors cross the boundary once

- Application and domain code throw `AppError` subclasses from
  `platform/errors.ts` (`NotFoundError`, `ValidationError`,
  `ExternalServiceError`, `ConfigError`, or `new AppError(code, msg, status)`).
- The single `app.setErrorHandler` in `app.ts` turns them into the
  `{ error: { code, message, details } }` envelope, and also handles zod
  request-validation and response-serialization failures.
- Routes don't `try/catch` just to translate errors. Services never receive
  `reply` and never `reply.code(...)`.
- Adapters translate *their* failures (Octokit 404, git exit code, Postgres
  `23505`) into `AppError`s before those failures leave the outer ring. See
  `drizzle-infrastructure.md` §5.

Why one place: a domain error must mean the same HTTP status on every route.
Mapping it per route drifts.

## 5. SSE and background jobs

- **SSE framing is presentation.** `reply.sse(...)` and subscribing to
  `container.runBus` live in the route (`reviews/routes.ts:55-66`).
- **Producing events is application.** `run-executor.ts` publishes to the
  `RunBus` it was given. It doesn't know whether anyone listens over HTTP.
- **Jobs are another entry point, like HTTP.** A job handler body is a
  use-case call (`service.runCloneJob(payload)`). The JobRunner is
  infrastructure, and registration happens at wiring time.

## 6. Plugins, decorators, encapsulation

- Cross-cutting plugins (helmet, cors, rate-limit, SSE, the error handler) are
  registered in `app.ts` **before** the modules, so every encapsulated module
  inherits them (server `AGENTS.md`).
- Feature modules stay **encapsulated**: don't wrap them in `fastify-plugin`.
  Encapsulation is Fastify's own boundary mechanism, and it keeps one
  module's hooks and decorators out of another.
- The only app-wide decoration is `container`. Don't `decorate` services,
  repositories or business functions onto the instance. That turns Fastify
  into a service locator, and the application starts depending on the framework.
