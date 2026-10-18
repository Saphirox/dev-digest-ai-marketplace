# Spec: AI onboarding tour for a repository

Spec ID: SPEC-0000
Status: draft
Supersedes: —
Modules: server (owner), repo-intel, client, mcp
Design: none — reference example (a real spec lists its saved frames here)

## Problem and user

A developer who opens an unfamiliar repository in DevDigest has no guided
starting point: the indexed facts exist (file tree, import graph), but
reading them is slow work. They need a short, generated tour of the codebase
that points at real files.

## Goals / Non-goals

Goals:
- Generate a sectioned onboarding tour for an indexed repository on demand.
- Every link in the tour points at a file that exists in the indexed tree.

Non-goals:
- Regenerating automatically when new commits are indexed (declined by user, D-2).
- Tours for repositories that are not indexed.

## User stories

- As a developer new to a repo, I want a tour of its architecture and entry
  points, so that I know which files to read first.

## Acceptance criteria (EARS)

- **AC-1** `[server, client]` `must` WHEN the user clicks "Generate tour" on an indexed repository, the API shall store a tour and the repository page shall show its sections in the order the onboarding contract defines.
- **AC-2** `[server, client]` `must` IF the repository is not indexed, THEN the repository page shall disable "Generate tour" and show "Index the repository first".
- **AC-3** `[server]` `must` IF a generated link points at a path that is not in the indexed tree, THEN the API shall drop that link and keep the section text.
- **AC-4** `[repo-intel, client]` `should` WHILE the stored tour is older than the repository's latest indexed commit, the tour page shall show a "Stale — regenerate" banner.
- **AC-5** `[mcp]` `should` The `get_onboarding` tool shall return the same sections as `GET /repos/:id/onboarding`.

## Edge cases

- **EC-1** `[server]` `must` WHEN two generate requests arrive for the same repository at once, the API shall run one generation and return its result to both callers.
- **EC-2** `[client]` `must` IF a section's Mermaid diagram fails to render, THEN the tour page shall show the diagram source as code instead of an empty box.

## Non-functional requirements

- **NFR-1** `[server]` `must` The API shall send at most 40,000 characters of repository facts to the model per generation.
- **NFR-2** `[client]` `should` The tour page shall let the user move between sections with the keyboard alone.

## Examples

| ID | Given | When | Then |
|---|---|---|---|
| AC-3 | indexed tree has `src/app.ts`; the model links `src/app.ts` and `src/missing.ts` | the tour is stored | the section keeps the `src/app.ts` link and has no `src/missing.ts` link |
| EC-1 | no tour exists | two POST requests arrive 50 ms apart | one model call is made; both responses carry the same tour |

## Traceability and verification

| ID | Source | Verification hint |
|---|---|---|
| AC-1 | brief "generate a tour on demand" | server `*.it.test.ts` for the route; client RTL test for section order |
| AC-2 | D-1 | client RTL test with an unindexed repo fixture |
| AC-3 | brief "links must be real files" | server unit test with a fake model response (Examples row AC-3) |
| AC-4 | D-2 | client RTL test with a stale fixture |
| AC-5 | D-3 | `mcp` tool test against a fake store |
| EC-1 | `server/INSIGHTS.md` 2026-09-20 (concurrent re-runs) | server `*.it.test.ts` firing two requests |
| EC-2 | design-gap analysis (render failure state) | client RTL test with invalid Mermaid source |
| NFR-1 | D-4 | server unit test on the prompt builder's output length |
| NFR-2 | UX proposal accepted in D-5 | manual: tab through the sections |

## Decisions

- **D-1** What happens on an unindexed repo? → disable the button with a hint (accepted).
- **D-2** Regenerate automatically on new commits? → no; show a stale banner instead (declined auto-regenerate).
- **D-3** Add an MCP `get_onboarding` tool? → yes, as `should`.
- **D-4** Budget for facts sent to the model? → 40,000 characters, matching the review prompt budget.
- **D-5** Keyboard navigation between sections? → yes (accepted UX proposal).

## Inputs and provenance

- `repo-intel` index (file tree, import graph) — produced by this app.
- Model output (tour JSON) — external, untrusted.
- Stored tour — the existing `onboarding` table (one row per repository).

## Untrusted inputs

- Repository file contents and README text are data sent to the model inside
  untrusted blocks; instructions inside them are ignored.
- Model output is untrusted: markdown is escaped before rendering, links are
  checked against the indexed tree (AC-3), and nothing in it is executed.

## Open questions

None.
