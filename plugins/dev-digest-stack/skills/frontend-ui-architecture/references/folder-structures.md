# Folder structures

Pick the smallest structure that fits the app today, and know the signal that
tells you to move to the next one. Structure is cheap to grow and expensive to
over-build.

## Contents
1. Growth path
2. Stage A: flat / component folders
3. Stage B: features (default for real apps)
4. Stage C: Feature-Sliced Design
5. Next.js placement of these structures
6. Migrating between stages

---

## 1. Growth path

| Stage | Shape | Move on when… |
|---|---|---|
| A. Flat | `components/`, `hooks/`, `lib/` | You have ~3+ distinct domain areas, or `components/` mixes generic UI with domain screens |
| B. Features | `features/<domain>/…` + shared `components/`, `lib/`, `hooks/` | Several teams, features need strict layering, or "entity" code (user, repo, PR) is shared by many features |
| C. FSD | `app/pages/widgets/features/entities/shared` layers | — |

Default for a real product: **Stage B**. Choose FSD only if the project
already uses it or the team explicitly wants its stricter rules. It pays off
at scale and costs ceremony below that.

(Robin Wieruch walks the same path further: domains → packages → monorepo. Use that path when one app becomes several.)

## 2. Stage A: flat / component folders

```
src/
  components/
    Button/ Button.tsx, Button.test.tsx, index.ts
    UserCard/ UserCard.tsx, helpers.ts, constants.ts
  hooks/        useDebounce.ts
  lib/          api.ts, format-date.ts
  app/ or pages/
```

Grouping by file type works while the whole app fits in your head. Its failure
mode: `components/` holds 80 files with no hint of which belong together.

## 3. Stage B: features (bulletproof-react shape)

```
src/
  app/                 # routes / pages, providers, router: composes features
  components/          # shared, domain-free UI (Button, Modal, Table)
  config/              # env, feature flags
  features/
    reviews/
      api/             # fetchers + query/mutation hooks for this domain
      components/      # UI used only by this feature
      domain/          # pure business rules (optional; `lib/` also fine)
      hooks/           # feature-only hooks
      types.ts
      constants.ts
      index.ts         # optional explicit public API
    repos/
      ...
  hooks/               # shared hooks
  lib/                 # shared named modules: api client, formatters
  stores/              # truly global client state (if any)
  types/               # shared types
  testing/             # test utilities, mocks
```

Rules:
- **Only create the sub-folders a feature needs.** A feature with one component
  is just `features/x/XPanel.tsx`.
- **Dependencies flow `shared → features → app`.** Shared folders (`components`,
  `hooks`, `lib`, `types`, `config`) import no feature, and features never import
  each other. Compose features in `app/`.
- **When two features both need a piece, move it down** to shared, or to an
  "entity" feature both depend on. Don't let them import each other.

## 4. Stage C: Feature-Sliced Design

Layers, top to bottom. A module may import only from layers **strictly below** it:

| Layer | Holds |
|---|---|
| `app` | Providers, routing, global styles, entrypoint |
| `pages` | Full screens / routes |
| `widgets` | Large self-contained UI blocks composed of features + entities |
| `features` | User actions that bring business value (`add-to-cart`, `run-review`) |
| `entities` | Business nouns and their UI/model (`user`, `pull-request`, `finding`) |
| `shared` | Domain-free UI kit, api client, lib, config |

(`processes` is deprecated.)

Inside a slice (e.g. `entities/finding/`), code is grouped into segments:

| Segment | Holds |
|---|---|
| `ui` | Components |
| `model` | State, stores, schemas, business rules |
| `api` | Requests |
| `lib` | Slice-internal helpers |
| `config` | Constants, flags |

Slices on the same layer can't import each other, and each slice exposes a
public API (`index.ts`). FSD's own advice: "not everything needs to be a
feature". Don't slice prematurely.

## 5. Next.js placement of these structures

Next.js is unopinionated. The official docs list three strategies:

1. **Project files outside `app/`.** `app/` is routing only, and code lives in `src/components`, `src/lib`, `src/features`.
2. **Project files in top-level folders inside `app/`.**
3. **Split by feature or route.** Globally shared code lives at the root. Route-specific code lives in private folders (`_components`, `_lib`) inside the route segment that uses it.

A good hybrid, and what most mature App Router codebases converge on:
strategy 1 for shared code, plus strategy 3 for route-local code. The route
folder colocates what only that route uses, and anything used by two routes
moves out to `src/`. Details: [nextjs-app-router.md](nextjs-app-router.md).

## 6. Migrating between stages

- Move one domain at a time. Don't do a big-bang reshuffle.
- Move files with `git mv` so history follows.
- Add the lint boundary rule *after* a domain has moved, scoped to the new folders, so the migration can happen incrementally.
- Update the project's `AGENTS.md`/`CLAUDE.md` naming table in the same change, so the next contributor follows the new shape.
