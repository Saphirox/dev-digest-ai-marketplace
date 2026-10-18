# Boundaries, public APIs and barrel files

## Contents
1. The dependency rule
2. Public API of a folder
3. Barrel files: what's allowed
4. Enforcing with ESLint
5. Fixing a boundary violation

---

## 1. The dependency rule

```
shared (components, hooks, lib, types, config)
   ↑ imported by
features/<a>   features/<b>      ← never import each other
   ↑ imported by
app / routes / pages             ← composes features
```

- **Shared code never imports a feature or a route.**
- **A feature never imports another feature.** If it seems to need one, see §5.
- **Routes compose features.** A route may import several features and wire them together through props.
- **Route-private folders (`_components`, `_lib`) are only imported from inside their own route subtree.**

## 2. Public API of a folder

A feature's or component folder's public API is the set of names other folders may import:
- Keep it small: the components, hooks and types that callers actually use.
- Everything else (sub-components, helpers, constants) is private and may change freely.
- Declare it with a small `index.ts` of explicit named re-exports, or by
  convention: "import only `<Name>.tsx`". Pick one per project.

## 3. Barrel files: what's allowed

A barrel is an `index.ts` that re-exports other modules.

**Allowed:** a tiny explicit public API for one component folder or feature.
```ts
// components/run-cost-badge/index.ts
export { RunCostBadge } from "./RunCostBadge";
export type { RunCostBadgeProps } from "./RunCostBadge";
```

**Avoid:**
- **`export * from "./x"`.** It hides what is public, defeats tree-shaking
  and makes circular imports likely.
- **Barrels of barrels** (`components/index.ts` re-exporting every component
  folder). Importing one button then loads the whole UI kit into the module
  graph, which slows the dev server, HMR, `tsc` and test startup. The Next.js
  `optimizePackageImports` option exists because of this problem.
- **Importing your own barrel from inside the folder** (`import { X } from "."`).
  That is the classic source of `Cannot access 'X' before initialization`.
  Inside a folder, import siblings by file path.

Rule of thumb: a barrel should be short enough to read at a glance, and
removing it should only change import paths, never behaviour.

## 4. Enforcing with ESLint

Code review misses boundary violations, so make them lint errors.

**Option A: `import/no-restricted-paths`** (eslint-plugin-import; the bulletproof-react approach)

```js
// eslint.config.mjs (flat config excerpt)
import importPlugin from "eslint-plugin-import";

export default [
  {
    plugins: { import: importPlugin },
    rules: {
      "import/no-restricted-paths": ["error", {
        zones: [
          // features don't import each other
          { target: "./src/features/reviews", from: "./src/features", except: ["./reviews"] },
          { target: "./src/features/repos",   from: "./src/features", except: ["./repos"] },
          // unidirectional: shared → features → app
          { target: "./src/features", from: "./src/app" },
          {
            target: ["./src/components", "./src/hooks", "./src/lib", "./src/types"],
            from: ["./src/features", "./src/app"],
          },
        ],
      }],
    },
  },
];
```

**Option B: `no-restricted-imports`** (core ESLint, no plugin). Good for forbidding deep imports into a feature's internals.

```js
rules: {
  "no-restricted-imports": ["error", {
    patterns: [{
      // "@/features/reviews" (its index.ts) is allowed; anything deeper is not.
      // Inside a feature, import siblings with relative paths so this rule doesn't fire.
      group: ["@/features/*/*"],
      message: "Import a feature through its public index, not its internals.",
    }],
  }],
}
```

**Option C: `eslint-plugin-boundaries`.** Declares element types (`app`,
`feature`, `shared`) and an allow-matrix between them, plus an `entry-point`
rule that forces imports to go through `index.ts`. It is the most expressive
option and fits FSD-style layering best. It needs
`eslint-import-resolver-typescript` for path aliases.

Adopt boundary rules incrementally: scope `target` to folders that already
follow the structure, then widen it as you migrate.

## 5. Fixing a boundary violation

When feature A needs something from feature B:

| Situation | Fix |
|---|---|
| A needs B's *data* on the same screen | Compose at the route: the page renders both and passes data via props |
| A and B both need the same *entity* UI or logic (a `UserAvatar`, `Finding` type, `countBySeverity`) | Move it down into shared, or into an entity-level module both depend on |
| A triggers an action in B | Lift the handler to the route and pass it as a callback prop, or use an event/store owned by the app layer |
| It's really one feature split in two | Merge them |
