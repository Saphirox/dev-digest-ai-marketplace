# Business logic: layers and a worked refactor

Based on Juntao Qiu's "Modularizing React Applications with Established UI
Patterns" (martinfowler.com), react.dev's custom-hooks guidance, and TkDodo on
server state.

## Contents
1. The four layers
2. What counts as which kind of logic
3. Worked refactor
4. Hooks: design rules
5. Domain layer: functions first, objects when branching spreads
6. Data layer
7. Testing follows the layers

---

## 1. The four layers

```
View (component)        renders, wires events            ← React
   │ calls
Hook (view model)       UI state, derived view data,     ← React
   │                    orchestrates a user flow
   │ calls
Domain                  business rules, pure functions   ← no React, no I/O
Data / API              fetch, map DTO → model, cache    ← no JSX
```

Dependencies only point downward. Domain code imports nothing from the layers
above it, so it can be tested with plain unit tests and reused anywhere
(server, CLI, another screen).

## 2. What counts as which kind of logic

| Logic | Example | Layer |
|---|---|---|
| Presentation choice | "show skeleton while loading", which tab is active | View |
| UI state | open/closed, selected id, form draft | Hook (or local `useState`) |
| Derived view data | visible list after filters, grouped rows | Hook calls a domain function |
| Business rule | severity ranking, "can this user re-run?", price with tax, validation | **Domain** |
| Meaningful formatting | `formatUsd(null) → "—"` (null ≠ 0) | Domain / shared lib |
| Cosmetic formatting | truncating a label to fit a cell | Component helper |
| Fetching / mutations | `GET /reviews`, `POST /runs` | Data layer |
| Mapping API → UI model | snake_case → camelCase, parse dates | Data layer |
| Cache keys, invalidation | `['reviews', prId]` | Data layer (query-key factory) |

## 3. Worked refactor

**Before:** everything lives in the component.

```tsx
export function FindingsPanel({ prId }: { prId: string }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [hideLow, setHideLow] = useState(true);
  useEffect(() => {
    fetch(`/api/prs/${prId}/findings`).then(r => r.json()).then(setFindings);
  }, [prId]);

  const visible = findings.filter(f => !hideLow || f.confidence >= 0.7);
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of visible) counts[f.severity]++;

  return (/* 150 lines of JSX using visible + counts */);
}
```

The problems: the fetch lives in an effect and has no cache. The business
rule (`>= 0.7`) is inline and will be duplicated elsewhere. The counting can't
be tested without rendering. And the component changes for four different reasons.

**After:** one file per layer.

```ts
// features/findings/domain/findings.ts: pure, no React
export const HIGH_CONFIDENCE = 0.7;
export const isHighConfidence = (f: Finding) => f.confidence >= HIGH_CONFIDENCE;

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}
```

```ts
// features/findings/api/findings.ts: data layer
export const findingKeys = { byPr: (prId: string) => ["findings", prId] as const };

export const fetchFindings = (prId: string) =>
  api.get<Finding[]>(`/prs/${prId}/findings`);

export const useFindings = (prId: string) =>
  useQuery({ queryKey: findingKeys.byPr(prId), queryFn: () => fetchFindings(prId) });
```

```ts
// features/findings/components/FindingsPanel/useFindingsPanel.ts: view model
export function useFindingsPanel(prId: string) {
  const { data = [], isLoading } = useFindings(prId);
  const [hideLow, setHideLow] = useState(true);
  const visible = hideLow ? data.filter(isHighConfidence) : data;   // derived, not stored
  return { visible, counts: countBySeverity(visible), isLoading, hideLow, setHideLow };
}
```

```tsx
// FindingsPanel.tsx: view
export function FindingsPanel({ prId }: { prId: string }) {
  const { visible, counts, isLoading, hideLow, setHideLow } = useFindingsPanel(prId);
  if (isLoading) return <Skeleton />;
  return (/* JSX only */);
}
```

The count and the list come from the same `visible` array in the same hook,
so they can't disagree. That is a structural guarantee, not a convention.

## 4. Hooks: design rules

- **Extract a hook when a component's logic has a name**
  (`useFindingsFilter`, `useRunStatus`), not just to shorten the file.
- **A custom hook shares stateful *logic*, not state.** Two callers get two
  independent states. Shared state needs lifting, context, or a store.
- **Return what the view needs, named for the view.** Return
  `{ visible, counts, toggle }`, not raw setters for five state variables.
- **Keep a hook colocated** (`<Name>/use<Name>.ts`) until a second component needs it.
- **Most derived values need no state or effect.** Compute them during render.
  See `react-best-practices` for the effect rules.

## 5. Domain layer: functions first, objects when branching spreads

- **Default: plain pure functions over plain data** (`countBySeverity`,
  `isHighConfidence`, `canRerun(run, user)`). This is idiomatic in React/TS and
  trivially testable.
- **Switch to a strategy object or polymorphism** when the *same* `switch (kind)`
  / `if (country === …)` appears in several files. Fowler/Qiu call this
  shotgun surgery. Collect the variants behind one interface
  (`const severityStrategy: Record<Severity, { icon; order; label }>`) so that
  adding a variant is a one-place change.
- Domain modules must not import React, the router, the API client or i18n.
  Return data (keys, enums, numbers), and let the view translate them.

## 6. Data layer

- **One HTTP client module** (`lib/api.ts`) handles the base URL, auth
  headers, error type and JSON parsing.
- **Per-domain fetchers plus query/mutation hooks** go in `features/<f>/api/`
  or `lib/hooks/<resource>.ts`. Only this layer knows URLs.
- **Keep query keys in a factory** next to the fetchers, so invalidation isn't stringly-typed across the app.
- **Map API DTOs to UI models here** if they differ. Components shouldn't know about snake_case or wire formats.
- **Server state stays in the cache.** Don't copy query data into `useState`
  or a global store to "have it handy". Read it through the hook where it's needed.

## 7. Testing follows the layers

| Layer | Test with |
|---|---|
| Domain | Plain unit tests: fast, no DOM |
| Data | Mock the HTTP boundary (MSW or a fake `api`) |
| Hook | `renderHook` only when it has real orchestration; otherwise test via the component |
| View | React Testing Library, user-visible behaviour (see `react-testing-library`) |
