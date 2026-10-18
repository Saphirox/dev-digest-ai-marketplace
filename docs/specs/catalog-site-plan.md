# Implementation plan: catalog site (as executed)

Spec: [catalog-site.md](catalog-site.md) · Date: 2026-10-18

This records the plan that was implemented, the order it was done in, the decisions made along the way and how each step was verified.

## Agreed scope

From the proposal discussion:
- **Stack:** Vite + React.
- **Semantic search:** required.
- **MVP features:** cart / install builder, copy buttons, plugin page, filters, shareable URLs, agent API.
- **Deferred:** what's new/RSS, giscus, scaffold generator, analytics.

## Steps

### 1. Design

- Built a three-screen design canvas: Search & results, Plugin detail, Install builder.
- Search and Install are interactive prototypes.
- Look: cool neutral ground, IBM Plex, one blue accent, type badges.
- Placeholder cards (`[agent-name]`, etc.) show component types the repo doesn't have yet.

### 2. Catalog builder (`scripts/build_catalog.py`)

- Stdlib-only parser for the frontmatter subset the repo uses: scalars, quotes, `- item` lists, `>` / `|` blocks.
- Inline `[a, b]` lists are parsed only where a list is expected (tools), so `argument-hint: [target]` stays a string.
- Reads skills, agents, commands, hooks and MCP servers, both default locations and `plugin.json` overrides (inline or path). Paths outside the plugin dir are ignored.
- Splits "Use when…" triggers out of descriptions.
- Parses the changelog, collects `updatedAt` from git, and builds the "touches" summary.
- External sources become marketplace-only cards.
- Writes `catalog.json` and `llms.txt`.
- **Verified:** ran on the real repo, and on a throwaway fixture plugin with an agent, a command, a hook and an MCP server. That fixture run found and fixed the `argument-hint` list bug.

### 3. Semantic index (`site/scripts/embed.mjs`, `src/search/passage.js`, `model.json`)

- The same model config file is shared by the build script and the browser worker, so vectors are comparable.
- Passage text: type + name + description + "Use when" + plugin + topics.
- **Verified:** measured similarities for 10 UK/EN queries against 5 artifacts (2 real + 3 synthetic).

### 4. Search core

- `keyword.ts`: MiniSearch, EN/UK stop words, type-word hints.
- `search.ts`: reciprocal rank fusion, thresholds, sorting, chip counts.
- `semantic.ts`: React hook that owns the worker and the vectors.
- `semantic.worker.ts`: model loading with aggregated progress, plus query embedding.

### 5. UI

- **Shell and data:**
  - `App.tsx`: catalog fetch, cart, ⌘K, header and footer, routing.
  - `lib.ts`: hash router, safe storage, snippets.
- **Pages:**
  - `SearchPage.tsx`: URL sync, debounced semantic queries, cards, empty state.
  - `PluginPage.tsx`: components, README/Changelog, touches, latest release.
  - `InstallPage.tsx`: tabs, share link.
- **Shared pieces:**
  - `components/ui.tsx`: badges, icons, copy button, code line.
  - `components/Markdown.tsx`: sanitized Markdown with link rewriting.
- **Styling:** `styles.css` with tokens from the design, plus a dark scheme.

### 6. Browser verification (local `vite preview`)

- **Keyword search:** "release notes draft" → skill marked Best match, with matched terms.
- **Semantic search:** progress shown during download; "підготуй нотатки до стендапу" → skill "Related by meaning", and the plugin card is correctly excluded (sim 0.20).
- **Cart → plugin page → install builder:** snippets checked in two tabs.
- **URL sync:** checked.
- **Bugs found and fixed:**
  1. The query box ignored external hash changes. Fixed by syncing it from the URL.
  2. A crash on every route change. The `scrollTo` effect returned a non-function cleanup; fixed by giving it a block body.

### 7. Repo integration

- `.github/workflows/pages.yml`: build + deploy, SHA-pinned, model cache.
- `validate.yml`: added a catalog-build step.
- `check_invariants.py`: added `SKIP_DIRS` so the Unicode scan ignores `node_modules` and `.model-cache`. `dist` was dropped during review.
- `.gitignore`, `README.md` ("Catalog site" section, layout) and `CODEOWNERS` (`/site/`).
- **Verified:** `claude plugin validate . --strict`, per-plugin validation and `check_invariants.py` all pass.

### 8. Review

- A separate review pass over the site, builder and workflows, fixing Critical and Warning findings.
- Results are recorded in [Review results](#review-results).

## Decisions and deviations

| Decision | Why |
|---|---|
| Model `paraphrase-multilingual-MiniLM-L12-v2` instead of `multilingual-e5-small` | e5-small compressed all similarities into 0.73–0.91: "deploy kubernetes cluster" scored 0.81 against the git-digest skill, the same as relevant queries. The paraphrase model separates them: relevant ≥ 0.30, unrelated ≤ ~0.2. Same download size. |
| Semantic toggle off by default | The model is ≈135 MB. The design showed it on; downloading that without consent, especially on mobile, is a bad default. The empty state offers to enable it. |
| Plugin-namespaced invoke lines (`/plugin:skill`) | Plugin components are namespaced in Claude Code; the design's bare `/summarize-changes` was wrong. |
| Hash routing + `base: './'` | No SPA fallback on Pages; works at any project-site path. |
| ONNX wasm self-hosted | transformers.js would otherwise fetch it from a CDN; bundling removes that runtime dependency (≈27 MB, gzip ≈6.8 MB, loaded only on opt-in). |
| Package versions at least two weeks old | Supply-chain hygiene: vite 8.3.2, transformers 4.3.0, marked 18.0.14, dompurify 3.4.16, plugin-react 6.1.1, typescript 6.0.3. |
| "Plugin" is a searchable type | So plugins with no components, or external ones, are still findable. The cost is that a one-skill plugin shows two cards. |
| "What's new" left out of the nav | It isn't in the MVP; tracked in spec §12. |

## Review results

A separate review agent covered correctness, security, accessibility, mobile layout, performance and CI. It found **0 Critical and 20 Warnings, all fixed**. Search constants are unchanged.

| # | Area | Finding | Fix |
|---|---|---|---|
| W1 | build_catalog | `hooks` / `mcpServers` paths could read outside the plugin dir; non-dict JSON crashed the build | Path containment check; non-dict becomes `{}`; inline config links to plugin.json |
| W2 | build_catalog | Bare inline event maps dropped; malformed hooks crashed; string `args` split into characters | Wrapper optional; junk entries skipped; values coerced to strings |
| W3 | build_catalog | Unindented `- item` YAML lists and empty frontmatter mis-parsed | Both handled |
| W4 | build_catalog | Duplicate component names gave duplicate ids, so MiniSearch threw and blanked the site | `~N` id suffix |
| W5 | build_catalog | Symlinked components could pull in files from outside the plugin | Resolved paths must stay inside |
| W6 | build_catalog | Missing plugin.json or a non-UTF-8 byte failed the deploy | Manifest `{}`; `errors="replace"` |
| W7 | Markdown | README could inject `<style>`, `style=` or forms (site overlay, fake forms) | DOMPurify forbids them |
| W8 | Markdown | Global DOMPurify hook not exception-safe; absolute images rewritten | try/finally, specific `removeHook`; rewrite relative images only; `rel` on all links |
| W9 | Markdown | `#anchor` links hijacked the hash router | Resolve to GitHub URL + fragment |
| W10 | PluginPage | `author.url` could be `javascript:` | `safeUrl()`: http(s) only |
| W11 | App | Malformed `#/plugin/%E0` threw and blanked the app | `safeDecode()` → "Plugin not found" |
| W12 | lib/App | Shared-origin localStorage values trusted (non-array cart crashed the app) | Validators on `load` / `useStored` |
| W13 | App | ⌘K from another page focused nothing | Focus applied after the route renders |
| W14 | App (a11y) | Focus stayed on `<body>` after navigation | Focus `<main>` on route change |
| W15 | SearchPage | "Best match" shown for all-stop-word queries | Requires a positive score |
| W16 | SearchPage | Unavailable toggle stuck pressed and disabled; label kept showing progress after turning it off | Never disabled; label checks `enabled` first |
| W17 | CSS (a11y) | Focus ring in the header at 2.6:1 | Header uses `--header-accent` (≈7:1) |
| W18 | CSS (mobile) | Wide README images caused horizontal scroll | `max-width: 100%` |
| W19 | CI | `npm ci` downloaded onnxruntime CUDA binaries on linux | `ONNXRUNTIME_NODE_INSTALL=skip` |
| W20 | Invariants | `dist` in `SKIP_DIRS` also skipped `plugins/*/dist` in the trojan-source scan | Removed |

**Verification:**
- `npm run build` passes.
- `claude plugin validate` (marketplace and each plugin) and `check_invariants.py` pass.
- Catalog output for the real repo is unchanged.
- A fixture covered every parser edge case above.
- 375px checks on all routes showed no horizontal scroll.

**Info items left open (follow-ups):**
- Tab state persists across plugins.
- Root-relative Markdown links resolve to github.com.
- Labels change on buttons that use `aria-pressed`.
- Cart count `aria-label` is on a span.
- No placeholder color in dark mode.
- Light badges in dark mode.
- No error boundary.
- No cross-tab cart sync.
- Scroll position isn't restored on back.
- Worker ref isn't reset on terminate.
- `cancel-in-progress: true` and no `configure-pages` step in `pages.yml`.
- `git_updated` assumes git is installed.
- Newlines in llms.txt list items.
- Third-party fonts and README images.
- ⌘K shown on non-Mac keyboards.
- A bare type-word query with semantic on shows only the semantic window.
