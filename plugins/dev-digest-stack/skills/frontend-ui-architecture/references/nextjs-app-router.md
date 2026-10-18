# Next.js App Router: architecture and placement

This file covers *where code goes* in an App Router project. For how RSC,
caching, `"use client"` semantics and route handlers behave, use
`next-best-practices`.

## Contents
1. `app/` is for routing
2. Route-local vs shared code
3. Route groups and layouts
4. Server/client split as placement
5. Data access: pick one approach
6. Server Actions placement
7. Example tree

---

## 1. `app/` is for routing

- **A route segment becomes public only when it has `page.tsx` or `route.ts`.**
  Other files in `app/` are safely colocated and never served.
- **`page.tsx` and `layout.tsx` stay thin.** They read `params`/`searchParams`,
  get data (a server fetch, a DAL call, or a hook in a client page), handle
  loading/error/not-found, and compose feature components. Anything else,
  including business rules, big JSX trees and fetch URLs, lives elsewhere.
- **Use the special files for their job**, not ad-hoc JSX: `loading.tsx`
  (Suspense boundary), `error.tsx` (error boundary), `not-found.tsx`.

## 2. Route-local vs shared code

| Used by | Location |
|---|---|
| One route segment only | Private folders inside it: `app/<route>/_components/<Name>/`, `app/<route>/_lib/` |
| Several routes | Outside `app/`: `src/components/`, `src/features/<f>/`, `src/lib/` |

- **The `_` prefix opts a folder out of routing.** It also marks the code as a
  private implementation detail, sorts it together in editors, and avoids
  clashes with future Next.js file names.
- **When a second route needs something from `_components`, move it out** to
  `src/components` or `src/features`. Don't import one route's private folder
  from another route. That is a cross-feature deep import.
- **Keep the `src/` folder** so application code is separate from root config files.

## 3. Route groups and layouts

- **`(group)` folders organize routes without changing the URL:** by site
  section (`(marketing)`, `(app)`), by team, or by intent.
- **Use a group to opt a subset of routes into a shared layout** or
  `loading.tsx`, or to create multiple root layouts.
- Don't use groups to fake feature folders for non-route code. Feature code belongs in `src/features`.

## 4. Server/client split as placement

- **Default to Server Components and push `"use client"` down to the leaves**
  that need interactivity: event handlers, state, browser APIs. A client
  boundary pulls everything it imports into the client bundle.
- **Pass server-rendered content into client components as `children` or slot
  props**, rather than importing server code into client files.
- **Mark modules that must never reach the browser with `import "server-only"`:**
  DB access, secrets, the DAL. A wrong import then fails the build instead of leaking.
- **Props that cross into a client component should be minimal, serializable
  view data.** Pass `{ name }`, not a whole user record. A broad prop type
  encourages over-sharing.
- **An all-client app** (every page `"use client"`, data via TanStack Query
  from a separate API) is a legitimate architecture. The rest of this skill's
  layering (view / hook / domain / data) applies unchanged, and the DAL
  section below doesn't.

## 5. Data access: pick one approach

Next.js recommends choosing **one** approach per project and not mixing them:

| Approach | When | Where the code lives |
|---|---|---|
| **External HTTP API** | A separate backend already exists (any language / team) | One client module (`lib/api.ts`) + per-domain fetchers; Zero Trust: the backend authorizes every call |
| **Data Access Layer (DAL)** | New full-stack Next.js project | `src/data/` or `src/server/data/`, marked `server-only`; only this layer touches the DB and `process.env` secrets |
| Component-level access | Prototypes / learning only | Queries inside Server Components. Easy to leak fields to the client |

A DAL should:
- **Run only on the server** (`import "server-only"`).
- **Do authorization inside each function.** Don't rely on page-level checks.
- **Return minimal DTOs:** only the fields the caller needs, never raw rows.
- **Cache per-request helpers** with React `cache()` (e.g. `getCurrentUser`)
  instead of passing them through props.

## 6. Server Actions placement

- **Put actions in their own `"use server"` files**, one per domain
  (`app/<route>/_actions.ts` for route-local ones, `src/server/actions/<domain>.ts`
  for shared ones). Define an action inline only for a trivial,
  single-use case.
- **Keep actions thin:** validate input (e.g. zod) → call the DAL (which does
  auth + authz) → `revalidatePath`/`revalidateTag` → return a minimal result
  (`{ ok: true }` or field errors). Never return a raw DB record.
- **Every exported action is a public POST endpoint.** Re-check authentication
  *and* resource ownership inside it (or inside the DAL function it calls). A
  page-level auth check doesn't protect the actions on that page.
- **Mutations never happen during render.** They go through actions or route handlers.

## 7. Example tree (hybrid: shared in `src/`, route-local in `app/`)

```
src/
  app/
    (marketing)/page.tsx
    (app)/
      layout.tsx
      repos/[repoId]/pulls/[number]/
        page.tsx                 # thin: params → data → compose
        loading.tsx
        error.tsx
        _components/
          FindingsPanel/
            FindingsPanel.tsx
            useFindingsPanel.ts
            helpers.ts
            constants.ts
            FindingsPanel.test.tsx
            index.ts
        _actions.ts              # "use server", thin, delegates to data/
  components/                    # shared UI kit, domain-free
  features/
    findings/
      domain/findings.ts         # pure rules
      api/findings.ts            # fetchers + query hooks (client-side data)
  server/                        # only if the app owns its data
    data/findings.ts             # import "server-only"; authz; DTOs
  lib/
    api.ts                       # HTTP client (when calling an external API)
    format-usd.ts
  config/env.ts
```
