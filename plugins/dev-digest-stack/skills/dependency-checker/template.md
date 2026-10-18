<!-- Report skeleton for the dependency-checker skill. Keep headings and order; replace <…>. -->
<!-- With `save`, the first line is: Status: final · Date: <YYYY-MM-DD> · Scope: <packages> · Online: <yes|no> -->

# Dependency audit — <YYYY-MM-DD>

## TL;DR

- **<N> packages**, <total node_modules size> on disk, <prod tree pkgs> production / <full tree pkgs> total packages.
- **Heaviest:** <dep> in <pkg> — <exclusive MB> exclusive.
- **Top risks:** <one line per P0/P1, max 3>.
- **Quick wins:** <S-effort actions with their gain, max 3>.

## 1. Overview

| Package | Dir | PM | prod / dev deps | node_modules | Prod tree | Full tree | Lock entries |

## 2. Dependency map

<Mermaid map + one-line legend (solid = prod, dashed = dev, thick = alias link, dotted = forked copy)>

## 3. Dependencies per package

| Dependency | Type | Category | Declared | Installed | Own | Tree | Exclusive | Used in |
<per package, sorted by tree size; top 10 + every row with a finding — say if trimmed>

## 4. Cross-package alignment

<drift table (dependency × package) + forked-alias verdicts (what differs)>

## 5. Findings

| ID | Code | Package | Dependency | Verdict | Evidence |
|---|---|---|---|---|---|
| F01 | <code> | <pkg> | <dep> | ✅ / ⚠️ / ❌ <reason if not ✅> | `<path:line>` or command output |

## 6. Prioritised actions

| # | Priority | Action | Packages | Impact | Effort | Command / edit | From |
|---|---|---|---|---|---|---|---|
| 1 | P0 | <verb + object> | <pkg> | <MB freed / what breaks> | S | `pnpm --dir server …` | F03 |

## 7. Advice

- <max 5 bullets, each citing finding IDs — see references/prioritization.md>

## 8. Not checked

- <packages not installed (+ install command), online checks skipped, bundle size not measured, …; never omit this section>
