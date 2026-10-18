# frontend-ui-architecture

**Version 1.0.0** · updated 2026-09-19

An agent skill for **frontend UI architecture and code organization** in React
and Next.js (App Router). It answers placement questions:
- where components, hooks, constants, helpers, utils, types and API calls live;
- how to split components;
- where business logic belongs;
- how features stay decoupled.

It deliberately does **not** cover rendering performance, hook-misuse bugs or
RSC mechanics. Those live in the sibling skills `react-best-practices` and
`next-best-practices`, and this skill links to them instead of repeating them.

## Files

| File | Loaded | Contents |
|---|---|---|
| `SKILL.md` | when the skill triggers | Principles, placement table, component splitting, logic layers, constants/helpers/utils definitions, boundary + Next.js summaries, review checklist, anti-patterns |
| `references/folder-structures.md` | on demand | Growth path flat → features → FSD, templates, Next.js placement strategies, migration |
| `references/business-logic.md` | on demand | View / hook / domain / data layers, worked before→after refactor, hook and domain design rules |
| `references/nextjs-app-router.md` | on demand | Thin routes, `_private` folders, route groups, server/client as placement, DAL vs external API, Server Actions placement, example tree |
| `references/boundaries.md` | on demand | Dependency rule, public APIs, barrel-file policy, ESLint configs, fixing violations |

## Versioning

Semantic versioning, recorded in `SKILL.md` frontmatter (`metadata.version`) and here:
- **major:** a recommendation is reversed (e.g. barrel policy changes).
- **minor:** a new section / reference file / rule.
- **patch:** wording, examples, links.

### Changelog

- **1.0.0 (2026-09-19)**: initial release.

## Decisions taken in 1.0.0

Where the sources disagree, the skill takes these positions:

| Question | Decision | Why |
|---|---|---|
| Default structure | Feature folders (bulletproof-style) + colocation; FSD only if the project already uses it or explicitly wants it | FSD pays off at scale but adds ceremony; FSD itself says "not everything needs to be a feature" |
| Barrel files | Small explicit `index.ts` per component/feature allowed; no `export *`, no barrels-of-barrels, never import your own barrel | Keeps a public API (Wieruch, FSD) without the tree-shaking / dev-speed / circular-import costs (TkDodo, bulletproof) |
| Domain logic shape | Pure functions by default; strategy objects when the same branching spreads across files | Idiomatic in React/TS; Fowler/Qiu's polymorphism targets shotgun surgery specifically |
| ESLint enforcement | Ship example configs in `references/boundaries.md` | Boundaries enforced only by review erode |
| Container/presentational | Not recommended as a default split; use hooks | Dan Abramov's 2019 retraction; hooks give the same separation without the extra layer |
| Next.js data access | One approach per project: DAL for new full-stack apps, external HTTP API when a backend exists | Official Next.js data-security guide |

## Sources

Collected 2026-09-19. **Tier**: A = official docs / primary author, B = widely
cited practitioner, C = supporting / opinion. ✅ = the page was fetched and
read in full while writing the skill. The rest were reviewed through search
summaries and are well known in the community.

### Project & folder structure
| Source | Tier | | Used for |
|---|---|---|---|
| [bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | B | ✅ | `src/` + per-feature layout, no cross-feature imports, `shared → features → app`, avoid barrels |
| [bulletproof-react (repo)](https://github.com/alan2207/bulletproof-react) | B | | Reference app, API layer, state docs |
| [Robin Wieruch — React Folder Structure](https://www.robinwieruch.de/react-folder-structure/) | B | ✅ | Growth path, per-component files, `components/` vs `features/` |
| [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) | A | | Layers → slices → segments |
| [FSD — Layers](https://feature-sliced.design/docs/reference/layers) | A | ✅ | Layer list, strictly-lower import rule, segments |
| [FSD — Slices and segments](https://feature-sliced.design/docs/reference/slices-segments) | A | | Same-layer isolation, public API |
| [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | B | | Component folders, `constants`/`helpers` split |
| [profy.dev — Popular React Folder Structures and Screaming Architecture](https://profy.dev/article/react-folder-structure) | B | | Group-by-type vs by-feature |
| [Infinum Frontend Handbook — React project structure](https://infinum.com/handbook/frontend/react/project-structure) | B | | Production convention, second opinion |
| [React Handbook — Project Standards](https://reacthandbook.dev/project-standards) | C | | Overview of options |
| [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/) | C | | Variations on bulletproof |
| [legacy.reactjs.org — File Structure FAQ](https://legacy.reactjs.org/docs/faq-structure.html) | A | | "Don't overthink it", avoid deep nesting |

### Colocation
| Source | Tier | | Used for |
|---|---|---|---|
| [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | B | | Principle 1 |
| [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | B | | Push state down, state ladder |

### Components & business logic
| Source | Tier | | Used for |
|---|---|---|---|
| [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) | A | | Component hierarchy, minimal state |
| [react.dev — Keeping Components Pure](https://react.dev/learn/keeping-components-pure) | A | | Views render, side effects elsewhere |
| [react.dev — Components and Hooks must be pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure) | A | | Formal rules |
| [react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | A | | Hook extraction, "logic not state" |
| [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | A | | Derive in render |
| [Juntao Qiu / martinfowler.com — Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) | A | ✅ | Four layers, refactoring steps, strategy for spreading branches |
| [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | A | | 2019 retraction: use hooks |
| [patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/) | B | | Pattern + hooks replacement |
| [profy.dev — Clean React Architecture: Business Logic Separation](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection) | B | | Domain layer refactor |
| [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/) | C | | Hook extraction example |
| [Alex Kondov — Tao of React](https://alexkondov.com/tao-of-react/) | B | | Module-based architecture, component rules |

### State placement
| Source | Tier | | Used for |
|---|---|---|---|
| [react.dev — Managing State](https://react.dev/learn/managing-state) | A | | Lifting, reducers, context |
| [react.dev — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | A | | No redundant/duplicated state |
| [TkDodo — Practical React Query](https://tkdodo.eu/blog/practical-react-query) | A | | Server state is borrowed |
| [TkDodo — Thinking in React Query](https://tkdodo.eu/blog/thinking-in-react-query) | A | | Query hooks as data layer, key factories |
| [TkDodo — You Might Not Need React Query](https://tkdodo.eu/blog/you-might-not-need-react-query) | A | | RSC vs client cache |

### Constants, utils, abstractions
| Source | Tier | | Used for |
|---|---|---|---|
| [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) | B | | Principle 2 |
| [Yanglin Zhao — The utility module antipattern](https://www.yanglinzhao.com/posts/utils-antipattern/) | C | | No `utils.ts` dumping ground |
| [Matti Lehtinen — Dunghill Anti-Pattern](https://mattilehtinen.com/articles/dunghill-anti-pattern-why-utility-classes-and-modules-smell/) | C | | Same, more depth |
| [Semaphore — Organize Constants in a Dedicated Layer](https://semaphore.io/blog/constants-layer-javascript) | C | | Counter-position (central constants) |

### Boundaries & barrels
| Source | Tier | | Used for |
|---|---|---|---|
| [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | A | | Barrel policy |
| [ReactUse — Barrel Files: tree shaking, Next.js dev memory, tsc](https://reactuse.com/blog/barrel-files-tree-shaking/) | C | | Failure modes |
| [eslint-plugin-import — no-restricted-paths](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) | A | | Config option A |
| [ESLint — no-restricted-imports](https://eslint.org/docs/latest/rules/no-restricted-imports) | A | | Config option B |
| [eslint-plugin-boundaries](https://www.npmjs.com/package/eslint-plugin-boundaries) | A | | Config option C |
| [Steve Kinney — Enterprise UI: Architectural Linting](https://stevekinney.com/courses/enterprise-ui/architectural-linting-exercise) | B | | Worked exercise |

### Next.js App Router
| Source | Tier | | Used for |
|---|---|---|---|
| [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) | A | ✅ | Safe colocation, `_private`, `(groups)`, three organization strategies |
| [Next.js — How to think about data security](https://nextjs.org/docs/app/guides/data-security) | A | ✅ | One data approach per project, DAL + DTOs, `server-only`, Server Action rules |
| [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | A | | `"use client"` at leaves, children composition, environment poisoning |
| [Next.js — Server Actions guide](https://nextjs.org/docs/app/guides/server-actions) | A | | Action placement and behaviour |
| [Next.js blog — How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions) | A | | Origin of the DAL recommendation |
| [Next.js — Colocation (v13, archived)](https://nextjs.org/docs/13/app/building-your-application/routing/colocation) | A | | Original `_private` rationale |
| [OWASP — Next.js Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Nextjs_Security_Cheat_Sheet.html) | B | | DAL cross-check |

### Naming & style
| Source | Tier | | Used for |
|---|---|---|---|
| [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react) | B | | Filename = component name, one component per file |
| [Mozilla Ecosystem Platform — React Style Guide](https://mozilla.github.io/ecosystem-platform/reference/style-guides/react-style-guide) | B | | Second style guide |

### Skill authoring
| Source | Tier | | Used for |
|---|---|---|---|
| Anthropic `skill-creator` skill (bundled with Claude Code) | A | ✅ | Frontmatter, pushy description, progressive disclosure via `references/`, SKILL.md < 500 lines, explain the *why* |

## Maintaining this skill

- **New rule:** cite its source in the relevant table above and bump the
  version (minor).
- **Keep `SKILL.md` short:** move long material into `references/` and link it from the table at the top of `SKILL.md`.
- **Keep scope tight:** if content drifts into performance or RSC mechanics,
  move it to `react-best-practices` / `next-best-practices` instead.
