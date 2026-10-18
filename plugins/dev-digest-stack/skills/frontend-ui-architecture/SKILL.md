---
name: frontend-ui-architecture
description: "Frontend UI architecture and code organization for React and Next.js (App Router): where components, hooks, constants, helpers, utils, types, API calls and business logic live, how to name them, and how to split them. Use whenever you create a new component, page, feature or hook; decide where a file or function belongs; extract a constant, helper or util; move logic out of a component; split a large component; set up or restructure folders; review a frontend PR for structure; or answer 'where should X go' questions. Trigger on phrases like folder structure, naming convention, file naming, project structure, colocation, feature folder, _components, lib vs utils, helpers.ts, constants.ts, barrel/index.ts, business logic in components, container/presentational, Data Access Layer, server actions placement, even when the user does not say 'architecture'. Not for render performance, hook-misuse bugs or RSC mechanics — those live in react-best-practices and next-best-practices."
metadata:
  version: "1.1.0"
  updated: "2026-09-19"
---

# Frontend UI Architecture

How to organize a React / Next.js codebase so that a reader can guess where
something lives, and a change touches as few folders as possible. The skill
covers placement and boundaries, not rendering behaviour.

**Sibling skills. Link to them, don't restate them:**
- `react-best-practices`: hook rules, derive-don't-store, memoization, effects.
- `next-best-practices`: RSC/`"use client"` mechanics, caching, metadata, route handlers.

**Reference files. Read only the one the task needs:**

| File | Read it when |
|---|---|
| [references/folder-structures.md](references/folder-structures.md) | Setting up a project, adding a new feature area, or restructuring; choosing flat vs feature vs FSD |
| [references/business-logic.md](references/business-logic.md) | Moving logic out of a component, designing a hook, building a domain/API layer; worked before/after example |
| [references/nextjs-app-router.md](references/nextjs-app-router.md) | Anything under `app/`: route-local `_components`, route groups, the server/client split as a *placement* decision, Data Access Layer, Server Actions |
| [references/boundaries.md](references/boundaries.md) | Import rules, public APIs, barrel files, ESLint boundary enforcement |

Sources for every rule: [README.md](README.md).

---

## Step 0: The project's conventions win

Before applying anything below, look at how *this* codebase already does it:

1. Read the project's `AGENTS.md` / `CLAUDE.md` (and the module's) for naming and folder rules.
2. Open two or three sibling features next to where you are working and copy their shape.
3. Only fall back to this skill's defaults where the project is silent.

Why: an inconsistent "better" structure costs more than a consistent mediocre
one. Readers navigate by pattern. If the project's convention is actually
harmful, say so and propose a change. Don't fork the convention quietly in one folder.

---

## Core principles

These five ideas generate almost every rule below. When a case isn't covered,
reason from them.

1. **Colocate by default.** Keep code as close as possible to where it is used.
   A constant, helper, hook, type, style or test starts in the folder of its
   only consumer. Things that change together live together, and deleting a
   feature should mean deleting one folder. *(Kent C. Dodds, "Colocation")*
2. **Promote on the second consumer, not before.** Move code up a level
   (component → feature → shared) only when a second real consumer exists.
   Guessing at reuse makes wrong abstractions, and duplicating once is cheaper
   than untangling a wrong shared helper. *(AHA: "prefer duplication over the wrong abstraction")*
3. **Dependencies point one way.** `shared → features → app/routes`. Shared
   code never imports a feature. A feature never imports another feature's
   internals. Features are composed together at the route/page level. This
   keeps a change in one feature from breaking another. *(bulletproof-react, FSD)*
4. **Separate what changes for different reasons.** Rendering, UI state and
   coordination, business rules, and I/O change at different rates and for
   different people. Give each its own place: component → hook → domain
   function → API/data layer. *(Fowler/Qiu, "Modularizing React Applications")*
5. **Name by what it does, not what it is.** `format-usd.ts`,
   `severity-counts.ts` and `useRunStatus.ts` say what they do. `utils.ts`,
   `helpers/index.ts` and `common.ts` say nothing and become dumping grounds.

---

## Where does it go? (placement table)

Use the narrowest row that fits. "Local" means the component's own folder.

| You have… | Put it in… | Promote to… when a 2nd consumer appears |
|---|---|---|
| A sub-component used by one parent | `<Parent>/_components/<Child>/` (or a sibling file if it's tiny) | the feature's `components/`, then shared `components/` |
| A literal / lookup table / config map used by one component | `<Name>/constants.ts` | feature `constants.ts` → shared `config/` or `constants/` |
| A pure function that only serves one component (formatting a row, building a label) | `<Name>/helpers.ts` | feature `lib/` (or `utils/`) |
| A pure, domain-free function (dates, strings, math, arrays) | shared `lib/<what-it-does>.ts` | already shared |
| A business rule (pricing, permissions, severity ranking, validation) | a **domain module**: `features/<f>/domain/` or `lib/<domain>.ts`. Pure, no React | stays in the domain module; import it from anywhere in that feature |
| Stateful UI logic for one component (open/close, form wiring, derived view state) | `<Name>/use<Thing>.ts` or inline if short | feature `hooks/` → shared `hooks/` |
| Server data fetching / mutations | feature `api/` (fetchers + query/mutation hooks), or `lib/hooks/<resource>.ts` | shared data layer |
| The HTTP client, auth headers, base URL | shared `lib/api.ts` (one place) | — |
| Types for one component's props | inside `<Name>.tsx` | — |
| Types for a feature's data | `features/<f>/types.ts` | shared `types/`. API contracts should come from the backend's schema, not be hand-copied |
| User-facing text | i18n message files, never `constants.ts` | — |
| Styles | beside the component (`styles.ts`, CSS module, or inline tokens) | design tokens in the shared theme |
| Tests | beside the source (`<Name>.test.tsx`) | — |
| Env / feature flags / app-wide config | `config/` (read `process.env` in one place) | — |

### Component folder anatomy

```
<Name>/
  <Name>.tsx        # the component: renders, wires hooks, handles events
  use<Name>.ts      # optional: its stateful logic
  helpers.ts        # optional: pure functions only this component uses
  constants.ts      # optional: literals / lookup tables only it uses
  styles.ts         # optional: its styles
  <Name>.test.tsx   # optional: tests
  index.ts          # optional: `export { Name } from "./Name"`, nothing else
  _components/      # optional: children used only by <Name>
```

Only create the optional files when they have content. An empty `helpers.ts` is noise.

### Naming conventions

Defaults, matching DevDigest's `client/` (Step 0 still wins where a project differs):

| Thing | Convention | DevDigest example |
|---|---|---|
| Route files (App Router) | Next.js reserved names only: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`. Dynamic segments in brackets | `app/repos/[repoId]/pulls/[number]/page.tsx` |
| Route-private folder | `_components/` (the `_` opts it out of routing) | `app/repos/[repoId]/pulls/[number]/_components/` |
| Component folder + file | PascalCase, folder and file share the name | `_components/FindingCard/FindingCard.tsx` |
| Shared (cross-route) component folder | kebab-case under `src/components/`; the file inside stays PascalCase | `components/run-cost-badge/RunCostBadge.tsx` |
| Hook | camelCase with a `use` prefix, one hook per file | `FindingsPanel/useFindingsFilter.ts` |
| Colocated support files | fixed lowercase names: `helpers.ts`, `constants.ts`, `styles.ts`, `index.ts`, `types.ts` | `FindingsPanel/helpers.ts` |
| Shared module in `lib/` | kebab-case, named for what it does (never `utils.ts`) | `lib/format-usd.ts`, `lib/severity.ts` |
| Test | the source file's name + `.test.ts(x)`, beside it | `RunCostBadge.test.tsx`, `lib/severity.test.ts` |
| Constant | `SCREAMING_SNAKE_CASE` for module-level literals and lookup tables | `SEVERITIES` (`lib/severity.ts`), `COLUMNS` (`pulls/constants.ts`) |
| Exports | named exports in new code; `export default` only where Next.js requires it (`page.tsx`, `layout.tsx`). `RunTraceDrawer` and `ReviewRunAccordion` still default-export — convert them when touched | `export function FindingCard(…)` |
| i18n | one namespace file per feature area, keys by dot path | `messages/en/prReview.json` → `t("list.columns.cost")` |

---

## Splitting components

**Split when you see one of these signals**, not at a fixed line count:
- The component does two jobs you can name separately ("renders the list *and* manages the filter").
- A block of JSX has its own state or its own conditional branch tree.
- The same JSX shape appears twice.
- You need to scroll to see the hooks and the return statement together (≈200+ lines is a smell, not a rule).
- A prop is only passed through to a child. Composition (`children`, slots) might remove the layer.

**How to split:**
1. **Extract logic first, then markup.** Move state + effects + handlers into a
   `useX` hook. That alone often shrinks a component to readable size, with no
   new props.
2. **Extract a child by responsibility** into `_components/<Child>/`. Pass the
   minimum props it needs, not the parent's whole object.
3. **Prefer composition over configuration.** Accept `children` / slot props
   instead of adding boolean flags (`showHeader`, `variant="compact"`) for
   every caller's needs.
4. **Push state down.** The state lives in the lowest component that reads it.
   Lift it only to the nearest common parent of the components that need it.

**Don't create `*Container` wrapper components** just to hold logic. Hooks
replaced that pattern (Dan Abramov retracted it in 2019). A component that
calls a hook and renders is fine. The split that matters is *hook vs markup*,
not *two components*.

---

## Where business logic lives

Four layers, each with one job. Details, a worked refactor and the rules for
each layer: [references/business-logic.md](references/business-logic.md).

| Layer | Holds | Knows React? | Example |
|---|---|---|---|
| **View** (component) | JSX, event → handler wiring, choosing which child to render | yes | `FindingsPanel.tsx` |
| **Hook** (view model) | UI state, derived view data, calling the data layer, orchestrating a user flow | yes | `useFindingsFilter()` |
| **Domain** | Business rules as pure functions: calculate, validate, rank, format-for-meaning, permissions | **no** | `countBySeverity(findings)` |
| **Data / API** | HTTP/DB calls, request/response mapping, cache keys | no (fetchers); query hooks sit on top | `fetchPrReviews(prId)` |

The practical tests:
- **Could a backend or CLI reuse this function?** → domain layer, no React imports.
- **Does it need `useState`/`useEffect`/context?** → hook.
- **Does it touch the network or storage?** → data layer, and only there.
- **Is it a conditional inside JSX that encodes a business rule** (`finding.confidence >= 0.7 && ...`)? → name it as a domain function (`isHighConfidence(finding)`) and call it.

Keep **server state** (fetched data) in the data layer's cache (TanStack Query,
SWR, RSC fetch), not copied into `useState` or a global store. The server owns
it and you are only borrowing it. Global client stores are for truly global
*UI* state (theme, open panels across routes, a multi-step draft). State
placement ladder, from cheapest to most expensive: local state → lifted to the
common parent → URL (search params: filters, tabs, pagination) → context
(stable, low-frequency values) → server cache → global store.

---

## Constants, helpers, utils: definitions

These names get used loosely. In this skill they mean:

| Name | What it is | Scope |
|---|---|---|
| `constants.ts` | Literal values and static lookup tables (`GRID`, `SEVERITY_ORDER`, `PAGE_SIZE`). No logic, no JSX, no user-facing strings | The folder it sits in |
| `helpers.ts` | Pure functions that exist to serve *this* component/feature | The folder it sits in |
| `lib/<name>.ts` | A shared module with a real name. Either domain-free utilities (`format-usd.ts`) or a configured library wrapper (`api.ts`, `query-client.ts`) | App-wide |
| `utils/` | Only if the project already uses it. Same rule: named files, domain-free functions | App-wide |
| `hooks/` | Reusable custom hooks | Feature or app-wide |
| `config/` | Env-derived values, feature flags | App-wide |

**Rules of thumb:**
- **Magic values get a name when they carry meaning** (`MAX_FINDINGS_SHOWN = 5`).
  They don't need one when the value is self-explanatory at the use site (`padding: 8`).
- **Keep keys and the code that consumes them together.** A column-key list
  and the cells that render those columns should derive from one array, not
  two lists you have to keep in sync by hand.
- **Type constants tightly:** `as const` + a derived union type beats a loose `string[]`.
- **A `helpers.ts` holds only pure functions.** If it starts importing React or
  calling APIs, it is a hook or a data module in disguise. Rename and move it.
- **No generic `utils.ts`.** One named file per concern. If a shared file keeps
  collecting unrelated functions, split it by domain.

---

## Boundaries and public API (summary)

Full rules + ESLint config: [references/boundaries.md](references/boundaries.md).

- A folder's **public API** is what other folders may import. Everything else is private.
- A small `index.ts` with **explicit named re-exports** is fine as a public API
  for a component folder or feature.
  - **No `export *`** and no barrels-of-barrels in shared folders: they defeat
    tree-shaking, slow dev servers and `tsc`, and cause circular-import bugs.
  - **Never import your own folder's `index.ts` from inside that folder.**
- Cross-feature needs are solved by (a) composing both features in the route/page,
  (b) moving the shared piece down to `shared/`/`lib/`, or (c) passing data via props.
  Don't solve them by reaching into another feature's internals.
- Enforce with lint (`import/no-restricted-paths`, `no-restricted-imports`,
  `eslint-plugin-boundaries`), not with code review alone.

---

## Next.js App Router (summary)

Full guide: [references/nextjs-app-router.md](references/nextjs-app-router.md).

- **`app/` is for routing.** `page.tsx` / `layout.tsx` stay thin: they read
  params, fetch or call a hook, and compose feature components.
- **Route-local code goes in private folders** (`_components/`, `_lib/`) next to
  the route. Shared code lives outside `app/` (`src/components`, `src/lib`,
  `src/features`).
- **Route groups `(name)`** organize routes by section or share a layout without changing the URL.
- **Server/client is a placement decision.** Keep `"use client"` at the leaves.
  Server-only modules (DB, secrets, DAL) get `import "server-only"`.
- **New full-stack projects: one Data Access Layer** (`server-only`, does
  authorization, returns minimal DTOs). If a separate backend already exists,
  call its HTTP API from one client module instead. Pick one approach and don't mix them.
- **Server Actions stay thin:** validate input, delegate to the DAL, revalidate, and return only what the UI needs.

---

## Reviewing structure: checklist

Use this when reviewing a frontend change for organization:

- [ ] New files follow the project's existing folder/naming pattern (Step 0).
- [ ] Every new constant/helper/hook sits at the lowest level that has a consumer; nothing was promoted "for future reuse".
- [ ] No feature imports another feature's internals; shared code imports no feature.
- [ ] Components render. Business rules are named pure functions. Network calls happen only in the data layer.
- [ ] Fetched data isn't mirrored into `useState` / a global store.
- [ ] No new `utils.ts` / `common.ts` / `export *` barrel.
- [ ] User-facing strings go through i18n, not constants.
- [ ] (Next.js) `page.tsx` is thin. `"use client"` is at the leaves. Server-only modules are marked.
- [ ] Lists that must stay in sync (keys ↔ renderers, count ↔ list) derive from one source.

## Anti-patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| God component (fetch + rules + 400 lines of JSX) | Every change risks everything; untestable rules | Hook for state, domain functions for rules, children for sections |
| `utils.ts` / `helpers/` dumping ground | Nobody knows what's inside; circular deps; dead code | Named modules by concern; colocate single-use helpers |
| Speculative shared component | A wrong abstraction gains boolean props until nobody can change it | Duplicate once, extract on the second real use |
| Cross-feature deep imports | Refactoring feature A breaks feature B | Compose at the route; move shared bits down |
| Server data copied into `useState`/Redux | Stale data, double sources of truth | Read from the query cache / RSC props |
| `*Container` + `*View` pairs by default | Extra layer, prop plumbing | A hook + one component |
| Deep folder nesting (>3–4 levels of `_components`) | Hard to navigate; usually a missing feature boundary | Flatten, or promote the subtree to its own feature folder |
| Business rule inlined in JSX conditionals | Rule is duplicated and drifts between screens | `isX(entity)` domain function |
