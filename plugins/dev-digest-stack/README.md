# dev-digest-stack

Stack skills for TypeScript web apps, used by the `sdd-engineering` and
`architecture-reviewer` agents and useful on their own. Claude loads each one
when the task matches its description.

## Install

```
/plugin marketplace add Saphirox/dev-digest-ai-marketplace
/plugin install dev-digest-stack@dev-digest
```

## Components

| Skill | Scope | Purpose |
|-------|-------|---------|
| `frontend-ui-architecture` | Frontend | Where components, hooks, constants and business logic live; Next.js placement |
| `react-best-practices` | Frontend | React anti-patterns, state, hooks rules |
| `next-best-practices` | Frontend | App Router, RSC boundaries, data patterns, metadata (background knowledge, not user-invocable) |
| `react-testing-library` | Frontend | React Testing Library with Vitest |
| `onion-architecture` | Backend | Onion rings, inward-only imports, ports/adapters, enforced by dependency-cruiser |
| `fastify-best-practices` | Backend | Fastify routes, plugins, schemas, error handling |
| `drizzle-orm-patterns` | Backend | Drizzle schema, queries, relations, transactions, migrations |
| `postgresql-table-design` | Backend | PostgreSQL types, indexing, constraints |
| `zod` | Full-stack | Zod schemas, parsing, errors, inference |
| `typescript-expert` | Full-stack | Type-level programming, performance, tooling |
| `dependency-checker` | Workflow | Read-only npm/pnpm dependency audit with a P0-P3 action list |

`onion-architecture`, `frontend-ui-architecture` and `dependency-checker`
are written for the dev-digest repo layout; the rest are general.

## Credits

Several skills are adapted from community skills (for example
`fastify-best-practices` from mcollina's skill, `typescript-expert` from a
community collection). Each skill lists its sources in its own files.
