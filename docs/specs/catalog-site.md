# Spec: dev-digest catalog site (GitHub Pages)

Status: implemented (MVP) · Owner: @Saphirox · Design: [canvas](https://claude.ai/artifact/15Q2zGYBUeSYpuwagSfwdA) · Plan: [catalog-site-plan.md](catalog-site-plan.md)

## 1. Problem

Users of the `dev-digest` marketplace can only discover plugins by reading `README.md` and browsing `plugins/` on GitHub. Nothing answers "I need a skill for X", nothing shows what a plugin's skills, agents or hooks do before installing it, and team setup (`extraKnownMarketplaces` + `enabledPlugins`) is written by hand.

## 2. Goals

1. Search every artifact in the repo (plugins, skills, agents, commands, hooks, MCP servers) from a plain-language query, in English or Ukrainian, and show matches as cards.
2. Show a plugin's components, trigger conditions, README, changelog and what it touches on the user's machine.
3. Generate ready-to-paste install snippets for one person or a whole team.
4. Expose the catalog to agents as static files.
5. Need zero maintenance per plugin: everything comes from files the repo already has.

### Non-goals (MVP)

- Ratings, comments, accounts, analytics.
- Hosting plugins from other marketplaces.
- Editing plugins from the site.

## 3. Constraints

- **GitHub Pages: static files only.** No server code, no secrets at runtime, no server-side search. Anything dynamic is computed at build time in GitHub Actions or in the browser.
- **Unauthenticated GitHub API is limited to 60 requests/hour per visitor.** The site makes no GitHub API calls at runtime; git metadata (e.g. last-updated dates) is collected at build time.
- **No SPA fallback** (no rewrite to `index.html`). Routing must work from a single `index.html`.
- **Project-site URL** (`https://<owner>.github.io/<repo>/`). All asset URLs must be relative.
- Repo rules from `CLAUDE.md` still hold. The site lives outside `plugins/`, so it never requires plugin version bumps.

## 4. Architecture

```
push to main
  └─ .github/workflows/pages.yml
       1. python3 scripts/build_catalog.py   → site/public/api/catalog.json, site/public/llms.txt
       2. node site/scripts/embed.mjs        → site/public/api/embeddings.json
       3. vite build                         → site/dist/   (static SPA + ONNX runtime wasm)
       4. actions/deploy-pages
browser
  ├─ fetch api/catalog.json      → MiniSearch keyword index (built client-side)
  ├─ fetch api/embeddings.json   → artifact vectors              (only when semantic is on)
  └─ Web Worker: transformers.js → embeds the query with the same model (only when semantic is on)
```

| Concern | Choice |
|---|---|
| Frontend | Vite 8 + React 19 + TypeScript, in `site/` |
| Routing | Hash routing (`#/…`), relative `base: './'` |
| Keyword search | MiniSearch 7 (prefix, fuzzy, field boosts) |
| Semantic search | `@huggingface/transformers` 4 in a Web Worker; model `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, `q8` |
| Markdown | `marked` + `DOMPurify` |
| Catalog builder | `scripts/build_catalog.py`, Python stdlib only (same toolchain as `check_invariants.py`) |
| Deploy | `actions/upload-pages-artifact` + `actions/deploy-pages`, all actions pinned by SHA |

## 5. Data pipeline

### 5.1 Sources

For each entry in `.claude-plugin/marketplace.json`:

| Artifact | Source | Notes |
|---|---|---|
| plugin | marketplace entry + `.claude-plugin/plugin.json` | entry fields win over manifest fields for `displayName` and `description` |
| skill | `skills/*/SKILL.md` + paths in `plugin.json` `skills` | frontmatter `name`, `description`, `allowed-tools` |
| agent | `agents/*.md` + `plugin.json` `agents` | frontmatter `name`, `description`, `tools` |
| command | `commands/*.md` + `plugin.json` `commands` | file stem is the name; frontmatter `description`, `argument-hint`, `allowed-tools` |
| hook | `hooks/hooks.json`, or `plugin.json` `hooks` (inline object or path) | one artifact per event |
| mcp | `.mcp.json`, or `plugin.json` `mcpServers` (inline object or path) | one artifact per server |
| README / CHANGELOG | `README.md`, `CHANGELOG.md` | changelog split on `## <version> [- YYYY-MM-DD]` |
| updatedAt | `git log -1 --format=%cI -- <plugin dir>` | needs full history in CI |

External plugin sources (`github`, `url`, `git-subdir`) can't be read locally. They produce a plugin card from the marketplace entry only, with `external: true` and no components.

**Robustness rules:**
- Every component, hook and MCP path is resolved, symlinks included, and ignored if it lands outside the plugin directory.
- Hooks may be given with or without the `{"hooks": {…}}` wrapper.
- Malformed hook and MCP entries are skipped.
- A missing `plugin.json` is treated as `{}`.
- Files are read as UTF-8 with replacement, so a bad byte never fails the deploy.
- Frontmatter lists may be indented or not.

**Description split.** A description of the form `Does X. Use when Y.` is split into `description = "Does X."` and `trigger = "Y."`. This matches the repo's skill-writing rule, and the cards show `trigger` as "Use when…".

### 5.2 `api/catalog.json` (schemaVersion 1)

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-18T12:00:00+00:00",
  "marketplace": { "name": "dev-digest", "description": "…", "owner": {…}, "repo": "Saphirox/dev-digest-ai-marketplace" },
  "plugins": [{
    "name": "summarize-changes", "displayName": null, "description": "…",
    "category": "productivity", "tags": ["git"], "keywords": ["git"],
    "version": "0.1.0", "author": { "name": "…", "url": "…" }, "license": "MIT",
    "homepage": "…", "external": false, "path": "plugins/summarize-changes",
    "updatedAt": "…|null", "readme": "<markdown>",
    "changelog": [{ "version": "0.1.0", "date": null, "body": "<markdown>" }],
    "counts": { "skill": 1 },
    "touches": { "hooks": [{ "event", "matcher", "command" }], "mcpServers": [{ "name", "launch" }],
                 "scripts": ["scripts/x.sh"], "allowedTools": ["Read"] }
  }],
  "artifacts": [{
    "id": "<plugin>/<type>/<name>", "type": "skill|agent|command|hook|mcp|plugin",
    "name": "…", "plugin": "…", "description": "…", "trigger": "…",
    "invoke": "/summarize-changes:summarize-changes", "url": "<GitHub blob URL>|null",
    "body": "<first 4000 chars of Markdown body>", "allowedTools": []
  }]
}
```

Artifact ids are unique. A repeated `<plugin>/<type>/<name>` gets a `~2`, `~3`… suffix, because MiniSearch rejects duplicate ids. Hook and MCP artifacts configured inline in `plugin.json` link (`url`) to `plugin.json`.

This file is a public contract. Breaking changes bump `schemaVersion`.

`invoke` values:

| type | invoke |
|---|---|
| skill | `/<plugin>:<skill>` |
| command | `/<plugin>:<command> [argument-hint]` |
| agent | `<plugin>:<agent>` |
| hook | `Runs automatically on <Event>` |
| mcp | `MCP server <name>` |
| plugin | `/plugin install <plugin>@dev-digest` |

### 5.3 `api/embeddings.json`

`{ model, dtype, dim, ids[], vectors[][] }`. Each vector is the mean-pooled, L2-normalized embedding of `passageText(artifact, plugin)` (`site/src/search/passage.js`), rounded to 5 decimals. The browser ignores the file if `model` differs from `site/src/search/model.json`.

### 5.4 `llms.txt`

The same catalog as Markdown: install commands, then one section per plugin listing each component with its description and trigger.

## 6. Search

### 6.1 Query parsing (`search/keyword.ts`)

1. Tokenize on non-letter/digit (Unicode-aware) and lowercase.
2. Drop EN/UK stop words ("I need a…", "мені треба… для… щоб").
3. Turn type words (`skill/скіл/навичка`, `agent/агент`, `command/команда`, `hook/хук`, `mcp/server/сервер`) into a **type hint**: a soft ×1.3 score boost, not a filter.

### 6.2 Keyword search

MiniSearch over these fields:

| Field | Boost |
|---|---|
| `name` (with `-_:` turned into spaces) | 4 |
| `description` | 3 |
| `trigger` | 2 |
| `topics` (plugin tags + keywords + category) | 2 |
| `plugin` | 1.5 |
| `body` | 1 |

Settings: `combineWith: OR`; prefix matching for terms longer than 2 characters; fuzzy matching (0.2) for terms longer than 4.

### 6.3 Semantic search

- **Opt-in.** The "Semantic" toggle is off by default, and the choice persists in `localStorage` (`dd.semantic`). Turning it on fetches `embeddings.json` and loads the model in a worker (≈135 MB once, then served from the browser cache). The page shows download progress, and keyword results stay visible meanwhile.
- **Query embedding.** The query is embedded (debounced 250 ms), and the cosine similarity is the dot product with every artifact vector.
- **Thresholds.** A semantic-only hit (one with no keyword match) is kept if `sim ≥ 0.28` **and** `sim ≥ best − 0.15`. These values were measured on this model: unrelated text scores ≤ ~0.2, relevant UK/EN queries score ≥ 0.3.
- **Fallbacks:**
  - Missing or mismatched `embeddings.json`: the toggle shows "Semantic: unavailable" with the reason. It is never disabled, so users can always switch it off.
  - Model load error: a message is shown and keyword search keeps working.

### 6.4 Ranking

Reciprocal rank fusion with `k = 60`: `score = Σ 1/(60 + rank)` over the keyword ranking and the semantic ranking. Then:
- The type-hint boost is applied.
- An explicit type filter is applied.
- Results are sorted by the chosen sort: Best match (score), Recently updated (plugin `updatedAt`), or Name.
- An empty query lists everything, by name.
- Filter-chip counts are computed before the type filter.

Each card explains why it matched: either "Matched" with the matched terms, or "Related by meaning".

When there are no results:
- If semantic is off, offer to turn it on.
- Always link to a prefilled "Plugin request" issue.

## 7. UI

The visual language follows the design canvas:
- Ground `#F3F4F6`, ink `#15171C`, accent `#2348E0`.
- IBM Plex Sans for UI text, IBM Plex Mono for names and code.
- Type badges are distinguished by lightness as well as hue, and always carry a text label.
- Light and dark color schemes.

### 7.1 Routes (hash)

| Route | Page |
|---|---|
| `#/?q=&type=&sort=` | Search (home). URL params are optional; `type` and `sort` are omitted at their defaults |
| `#/plugin/<name>` | Plugin detail |
| `#/install` and `#/install?p=a,b` | Install builder. A shared link adds `p` to the local selection, then cleans the URL |

The search box and the URL stay in sync both ways: typing replaces the history entry, while back/forward and links update the box. Malformed escapes (e.g. `#/plugin/%E0`) render "Plugin not found" instead of crashing.

**Focus on navigation:**
- After the first load, every route change moves focus to `<main>`.
- ⌘K from another page navigates to search and focuses the input.

### 7.2 Search page

- **Hero:** query input with ⌘K/Ctrl+K focus from anywhere, the Semantic toggle with status text, and a hint line. Toggle labels: "Semantic: off", "Loading model N%", "Semantic: on", "Semantic: unavailable".
- **Controls:** type filter chips (only types that occur, with counts) and a sort select.
- **Result cards:** type badge, "Best match" on the first result when it has a positive score (never in browse or all-stop-word mode), version, name, parent plugin link, description, "Use when", match explanation, invoke line with a copy button, Details, and Add to install.
- **Bottom band:** "Add the marketplace" command, and links to `api/catalog.json` and `llms.txt`.

### 7.3 Plugin page

- **Header:** breadcrumb; category and tags (each tag runs a search); name, description, version, author, license, updated date; Add to install; install command with a copy button.
- **Components:** each with type, name, description, "When Claude uses it", invoke line, and a source link.
- **README / Changelog tabs.** Markdown is sanitized, and relative links resolve to the GitHub blob (images to raw).
- **Sidebar:**
  - **What it touches:** hooks (event, matcher, command), MCP servers (launch command), files under `scripts/`, and the union of allowed tools. The last shows "Not restricted" if no component restricts tools.
  - **Latest release** and **Report an issue** (prefilled title).

### 7.4 Install builder

- **Selection:** stored in `localStorage` (`dd.cart`). Names that aren't in the catalog are dropped.
- **Tabs** (remembered in `dd.installTab`):
  - **In Claude Code:** `/plugin marketplace add …` + `/plugin install …`
  - **Shell:** `claude plugin …`
  - **Team settings.json:** `extraKnownMarketplaces` + `enabledPlugins`
- **Actions:** copy the snippet; copy a share link (`#/install?p=…`); a note about running `/plugin marketplace update`.

### 7.5 Storage

Every `localStorage` access is wrapped in try/catch, and stored values are validated: `dd.cart` must be a string array, `dd.semantic` a boolean, `dd.installTab` a known key. Validation matters because all sites on `<owner>.github.io` share one origin. Invalid values fall back to their defaults. With storage blocked, the site works for the current page view.

## 8. Agent access

- `api/catalog.json` (§5.2) and `llms.txt` (§5.4) are served at stable paths.
- They are linked in the header and the bottom band, and advertised with `<link rel="alternate" type="text/markdown">`.

## 9. Quality bars

- **Accessibility:**
  - Text contrast ≥ 4.5:1 (3:1 for 24px+) in both schemes.
  - All controls are real `<button>`, `<a href>`, `<input>` or `<select>` elements; labels on inputs.
  - `aria-pressed` on toggles and chips, `aria-live` on the result count and copy status.
  - Skip link, visible focus ring, touch targets ≥ 44px.
- **Responsive:** no horizontal page scroll at 375px. Two-column layouts stack, toolbars wrap, and code scrolls inside its own box.
- **Performance:**
  - The main bundle (≈110 kB gzip) loads without the model.
  - Model, worker and wasm load only on opt-in; the ONNX wasm is self-hosted in `dist/assets`, not on a CDN.
  - The keyword index is built once per page load.
- **Security:**
  - Plugin content is untrusted. All repo Markdown goes through DOMPurify, which additionally strips `<style>`, `style=`, `<form>`, `<input>`, `<button>`, `<select>` and `<textarea>`, so a README can't restyle the site or show fake forms.
  - Every link gets `rel="noopener noreferrer"`. In-README `#anchor` links go to GitHub instead of hijacking the router. URLs from manifests (e.g. `author.url`) render as links only if they are http(s).
  - No runtime secrets, no third-party calls except Google Fonts and the Hugging Face model download (after opt-in).
  - Workflow actions are pinned by SHA, with least-privilege permissions per job.

## 10. CI and deploy

- **`pages.yml`:** runs on push to `main` and on manual dispatch.
  - Build job (read-only): checkout with full history, Node 22 with npm cache, cache `site/.model-cache` keyed by `model.json`, `npm ci` with `ONNXRUNTIME_NODE_INSTALL=skip` (avoids the CUDA download; the CPU binaries ship in the package), `npm run data`, `npm run build`, upload `site/dist`.
  - Deploy job: `pages: write` and `id-token: write`.
- **`validate.yml`:** also runs `build_catalog.py` on every PR, so a malformed plugin fails review rather than the deploy.
- **Setup and local files:**
  - One-time: Settings → Pages → Source: GitHub Actions.
  - Generated data (`site/public/api`, `site/public/llms.txt`), `site/dist`, `site/node_modules` and `site/.model-cache` are git-ignored.
  - The hidden-Unicode scan in `check_invariants.py` skips `node_modules` and `.model-cache`. It does not skip `dist`, so `plugins/*/dist` is still scanned.

## 11. Acceptance criteria

1. Adding a plugin under `plugins/` and listing it in `marketplace.json` makes it searchable on the next deploy, with no change to `site/`.
2. "release notes draft" returns the `summarize-changes` skill first, with matched terms shown.
3. With semantic on, "підготуй нотатки до стендапу" returns `summarize-changes` as "Related by meaning", and an unrelated query (e.g. "перекласти текст німецькою") returns no cards.
4. Turning semantic on shows download progress; reloading reuses the cached model.
5. Add to install → Install builder shows correct snippets in all three tabs; the share link reproduces the selection in another browser.
6. Back/forward and pasted `#/?q=…` links restore the query, filter and sort.
7. The plugin page renders README and changelog with relative links resolved to GitHub, and the "What it touches" panel matches the plugin files.
8. `api/catalog.json` and `llms.txt` are reachable at the site root.
9. Missing `embeddings.json` → the toggle shows "unavailable" with a reason and can be switched off; keyword search still works.
10. No horizontal scroll at 375px; keyboard-only users can reach every control.
11. A README containing `<style>`, a form or a `javascript:` link can't change the site's styling or run script.

## 12. Later phases

| Feature | Notes |
|---|---|
| What's new feed + RSS/Atom | From the CHANGELOG entries collected at build time; requires dated changelog headings |
| Discussions per plugin | giscus (GitHub Discussions), no backend |
| Plugin scaffold generator | Browser form → ZIP of `templates/plugin` with validated name, semver and frontmatter (JSZip) |
| Privacy-friendly analytics | GoatCounter or Plausible; needs a decision |
| Ukrainian UI | The UI is English; queries already work in both languages |
| Smaller model download | Evaluate a distilled multilingual model, or int8 vectors, if 135 MB proves a barrier |

## 13. Open questions

- Should the site be the marketplace's `homepage` in `marketplace.json`, and should it be linked from every plugin README?
- Should changelog headings require dates (`## 1.2.0 - 2026-10-18`), so the feed and sorting can use them?
