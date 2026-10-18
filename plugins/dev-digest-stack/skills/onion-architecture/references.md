# onion-architecture — sources

The sources behind the rules in `SKILL.md` and `references/*`. Keep adding to
this list. Don't delete entries: mark them `superseded` instead.

Collected 2026-09-19. **Tier**: A = primary author / official docs,
B = widely cited practitioner, C = supporting or opinion. **Checked** = page
fetched and read, not only seen in search results. Every link returned 200 on
2026-09-19, except Medium, betterprogramming.pub and spin.atomicobject.com,
which answer 403 to scripted requests but open in a browser.

---

## 1. Onion Architecture: the primary source

| # | Source | Tier | Checked | What it gives the skill |
|---|--------|------|---------|-------------------------|
| 1.1 | [Jeffrey Palermo — The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) | A | ✅ | Domain model at the centre, "coupling toward the center", repository interfaces in the first ring, "the database is not the center, it is external", reliance on dependency inversion. Notes it suits long-lived apps with complex behaviour, not small sites |
| 1.2 | [Palermo — The Onion Architecture, part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) | A | — | Worked example of the layers in a real solution |
| 1.3 | [Palermo — The Onion Architecture, part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) | A | ✅ | **The four tenets** quoted in `SKILL.md`: independent object model · inner layers define interfaces, outer layers implement them · coupling toward the centre · core compiles and runs separate from infrastructure |
| 1.4 | [Palermo — Onion Architecture, part 4: after four years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/) | A | — | Retrospective: what held up, and clarifications on DI and project structure |
| 1.5 | [Palermo — all posts tagged onion-architecture](https://jeffreypalermo.com/tag/onion-architecture/) | A | — | Index of the series |
| 1.6 | [Original Onion example code (GitHub fork)](https://github.com/Jordiag/Jeffrey-Palermo-Onion-Architecture) | A | — | Palermo's reference solution (.NET), useful for the folder shape |

## 2. The family: Hexagonal, Clean, Explicit Architecture

| # | Source | Tier | Checked | What it gives the skill |
|---|--------|------|---------|-------------------------|
| 2.1 | [Alistair Cockburn — Hexagonal Architecture (Ports & Adapters)](https://alistair.cockburn.us/hexagonal-architecture/) | A | — | The port/adapter mechanism Onion uses for "infrastructure is external". Basis of `ports-and-adapters.md` |
| 2.2 | [Robert C. Martin — The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) | A | — | The Dependency Rule ("source code dependencies can only point inwards"), entities → use cases → interface adapters → frameworks |
| 2.3 | [Herberto Graça — Onion Architecture](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85) | B | — | Onion as DDD layers inside a Ports & Adapters hexagon, and where application vs domain services sit |
| 2.4 | [Herberto Graça — DDD, Hexagonal, Onion, Clean, CQRS… How I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) | B | — | "Explicit Architecture": one synthesis of all of them, including primary/secondary adapters, application core and components |
| 2.5 | [CCD Akademie — Clean vs Onion vs Hexagonal](https://ccd-akademie.de/en/clean-architecture-vs-onion-architecture-vs-hexagonal-architecture/) | C | — | The differences are mostly naming. Onion doesn't prescribe *how* inversion is achieved |
| 2.6 | [buarki — Hexagonal x Onion x Clean: their differences](https://www.buarki.com/blog/onion-cleanarch-hexagonal) | C | — | Short side-by-side comparison |
| 2.7 | [Martin Fowler — PresentationDomainDataLayering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) | A | — | The three-layer baseline Onion refines, and why to layer by responsibility |

## 3. Onion in Node.js / TypeScript

| # | Source | Tier | Checked | What it gives the skill |
|---|--------|------|---------|-------------------------|
| 3.1 | [Remo Jansen — SOLID and the Onion Architecture in Node.js with TypeScript and InversifyJS](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad) | B | — | Onion in TS with interfaces and a DI container. We keep a hand-written container instead of decorators |
| 3.2 | [fastify-typescript-drizzle-starter-kit](https://github.com/256Taras/fastify-typescript-drizzle-starter-kit) | C | — | Fastify 5 + Drizzle with router → queries/mutations → repository → DB. A "Clean Architecture Lite" that grows toward full layering |

## 4. Fastify (presentation ring)

| # | Source | Tier | Checked | What it gives the skill |
|---|--------|------|---------|-------------------------|
| 4.1 | [Fastify — Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) | A | — | Why feature modules stay encapsulated plugins, and the encapsulation context as a boundary |
| 4.2 | [Fastify — Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) | A | — | `register` scopes, `fastify-plugin` only for cross-cutting concerns |
| 4.3 | [Fastify — The hitchhiker's guide to plugins](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) | A | — | Plugin order, and why cross-cutting plugins go before modules |
| 4.4 | [Fastify — Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) | A | — | Decorators as lightweight DI, and why only `container` is decorated here |
| 4.5 | [Fastify — Testing guide](https://fastify.dev/docs/latest/Guides/Testing/) | A | — | `app.inject()` for route tests without a port |
| 4.6 | [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod) | A | — | The zod contract as request validation + response serialization at the edge |
| 4.7 | [Snyk — Fastify plugins as building blocks for a backend Node.js API](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/) | B | — | Practical plugin-per-feature structure |

## 5. Drizzle, repositories, transactions (infrastructure ring)

| # | Source | Tier | Checked | What it gives the skill |
|---|--------|------|---------|-------------------------|
| 5.1 | [Sentry — Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) | B | ✅ | Drizzle-based: the transaction is created at the top and passed to every repository (`tx ?? db`), and repositories stay transaction-agnostic. Adapted into `UnitOfWork` + `DbExecutor` |
| 5.2 | [Drizzle ORM — Transactions](https://orm.drizzle.team/docs/transactions) | A | ✅ | `tx` behaves like `db`, throwing or `tx.rollback()` rolls back, nested `tx.transaction()` = savepoints |
| 5.3 | [Martin Fowler — Repository (PoEAA)](https://martinfowler.com/eaaCatalog/repository.html) | A | — | Repository as a collection-like interface that mediates between domain and data mapping |
| 5.4 | [Martin Fowler — Unit of Work (PoEAA)](https://martinfowler.com/eaaCatalog/unitOfWork.html) | A | — | The pattern behind the `UnitOfWork` port |
| 5.5 | [João Batista da Silva — Transactions with DDD and Repository Pattern in TypeScript, part 2](https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901) | C | — | The service owns the transaction boundary. Translate DB errors to domain errors at the repository |
| 5.6 | [vimulatus — Repository Pattern in Nest.js with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae) | C | — | Drizzle repository behind an interface, with DI |
| 5.7 | [Paul Serban — Drizzle ORM Best Practices](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/) | C | — | Keep Drizzle in a data layer and map to domain types |
| 5.8 | [PostgreSQL — Error codes (Appendix A)](https://www.postgresql.org/docs/current/errcodes-appendix.html) | A | — | `23505`/`23503`/`23514` used in the error-translation table |

## 6. Enforcement

| # | Source | Tier | Checked | What it gives the skill |
|---|--------|------|---------|-------------------------|
| 6.1 | [dependency-cruiser — rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | A | — | `forbidden` rules, `path`/`pathNot`, group back-references (`$1`), `circular`, `couldNotResolve` |
| 6.2 | [How to Actually Enforce Clean Architecture in TypeScript](https://dev.to/argsoftware/how-to-actually-enforce-clean-architecture-in-typescript-1o4a) | C | — | Layer-purity rules as a structural lint in CI |
| 6.3 | [Ken Miyashita — Validate Dependencies According to Clean Architecture](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c) | C | — | dependency-cruiser config for clean-architecture layers |
| 6.4 | [Atomic Object — Dependency Cruiser: Restrict Imports](https://spin.atomicobject.com/dependency-cruiser-imports/) | C | — | Forbid-list approach, and starting with warnings on legacy code |
| 6.5 | [DEV — Avoid Cross Module Dependencies with Dependency Cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b) | C | — | The `no-cross-module-internals` pattern |

## 7. Project-internal sources (the rules also derive from these)

- `server/AGENTS.md`: stack, "no hand-rolled `Schema.parse`", plugins-before-modules, no keys to boot.
- `reviewer-core/AGENTS.md`: pure engine, the single side effect through `LLMProvider`, no DB/fs/GitHub.
- Root `AGENTS.md`: adapter naming, secrets location, `vendor/shared` sync rule, test naming.
- `server/src/platform/container.ts`: "Services depend on these interfaces, not the concrete classes."
- `server/src/modules/repos/service.ts`: "No HTTP and no raw SQL live here."
- `server/src/modules/repo-intel/types.ts`: the facade-port model.

## Decisions taken (2026-09-19, with the user)

1. Scope is `server/` **and** `reviewer-core/`.
2. Module-local interfaces (repository/store contracts) go in `modules/<f>/ports.ts`,
   not `vendor/shared` (avoids client-sync drift).
3. Enforcement ships now as `server/.dependency-cruiser.cjs` + `arch:check`:
   `error` where clean, `warn` where debt exists.
4. Existing violations are documented debt. New code must comply. Refactors
   happen only on request or in passing when cheap.
