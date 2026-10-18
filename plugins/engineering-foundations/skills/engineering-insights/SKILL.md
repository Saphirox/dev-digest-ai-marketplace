---
name: engineering-insights
description: Reads and maintains the per-module INSIGHTS.md files (client, server, reviewer-core, repo-intel, e2e, repo root). Use at the start of every task — right after the user's prompt, before exploring, editing, or answering — to read the INSIGHTS.md of the module(s) the prompt concerns, questions and reviews included. Use again at the end of every task to append only substantive insights not already recorded (a gotcha, root cause, dead end, tool quirk, recurring error and its fix, or a decision and its reason); if nothing new was learned, write nothing. Also use when the user asks to wrap up or capture learnings. Not for a multi-agent workflow retrospective — that is the manual /workflow-retro skill, which writes to docs/retro/ledger/.
allowed-tools:
  - Read
  - Grep
  - Edit(**/INSIGHTS.md)
  - Write(**/INSIGHTS.md)
---

# Engineering Insights

Two mandatory moments in every task: **read** before starting, **write**
before finishing — and write only if there is something new and substantive.
Today: !`date +%F` — use this date in entries; never guess one.

## Which file

| Prompt concerns | Read at start | Write to |
|---|---|---|
| `client/**` | `client/INSIGHTS.md` | same |
| `server/src/modules/repo-intel/**` | `server/src/modules/repo-intel/INSIGHTS.md` + `server/INSIGHTS.md` | `server/src/modules/repo-intel/INSIGHTS.md` |
| rest of `server/**` | `server/INSIGHTS.md` | same |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` | same |
| `e2e/**` | `e2e/INSIGHTS.md` | same |
| ≥2 modules, `scripts/`, Docker, CI, `.claude/` | every module involved + root | `INSIGHTS.md` (repo root) |

The table is the dev-digest layout. In another project, apply the same rule
to its own modules: one `INSIGHTS.md` per top-level module, plus the repo root
for cross-cutting work.

Nothing is auto-loaded — every file above is read on demand, the root one
only for cross-cutting tasks. Write each insight to one file only: the module
where the *next* agent will need it. File missing → create it from
`${CLAUDE_SKILL_DIR}/template.md`.

## Reading a file lazily

Files grow, so never load one blindly:

1. `Grep -n '^## '` on the file — the section line numbers are your map.
2. Short file (last heading before line ~150) → Read it whole. Done.
3. Otherwise read only:
   - **Keyword hits** — Grep the file for the task's paths, file names,
     symbols, libraries, and error text, with 2 lines of context.
   - **Sections that fit the task**, in full via Read `offset`/`limit` from
     the map:

     | Task | Sections |
     |---|---|
     | bug, failing test, error | Recurring Errors & Fixes, What Doesn't Work |
     | feature, refactor | Codebase Patterns, What Works, What Doesn't Work |
     | dependency, tooling, CLI | Tool & Library Notes |
     | question, review | keyword hits only |

Never read Session Notes at task start — history, not guidance.

## 1. Read — start of every task

Right after the user's prompt, before exploring, editing, or answering:

1. Work out which module(s) the prompt concerns — the code to be changed
   *or* the code being asked about.
2. Read each of those `INSIGHTS.md` files lazily (above).
3. Say in one line what applies:
   `📖 Insights (server): 2 relevant — <gist>; <gist>` or
   `📖 Insights (server): nothing relevant`.
4. Follow the relevant entries unless the code or the user contradicts them
   — a contradiction is itself a candidate insight. An entry citing a path
   or symbol that no longer exists → mention it as a prune candidate; don't
   delete it.

Module unclear from the prompt → read its file as soon as exploration shows
where you are. Prompt unrelated to this repo → skip.

## 2. Write — end of every task

Before your final reply (and right away for anything non-obvious you just
confirmed mid-task, so compaction can't lose it):

1. **Collect candidates**, strongest signal first:
   - the user corrected you ("no, here we do X") — a fact about this
     codebase; personal work preferences belong in memory, not here;
   - something failed: an error, a rejected or failed tool call, an approach
     you abandoned. Always ask "what did I try that failed?" — What Doesn't
     Work is the most skipped and most valuable section;
   - it took several attempts to get right;
   - something surprised you, or you made a decision with a trade-off;
   - the user confirmed that a non-obvious approach worked.
2. **Filter** out every candidate that fails the quality bar below, then keep
   at most the 5 strongest.
3. **Re-read the target `INSIGHTS.md` now** — it may have changed since the
   start (another session, another worktree). Short file → whole. Long file
   → the entire section the candidate belongs to, plus a Grep of the whole
   file for the candidate's path, symbol, library, and error text. Drop any
   candidate already covered, even in different words. If an existing entry
   is now wrong, append a Supersedes line instead of a new insight.
4. **Append** the survivors at the end of their section. If at least one was
   written, add one Session Notes line.
5. **Report** one line per entry — `📝 server/INSIGHTS.md › What Doesn't
   Work — <gist>` — and per dropped duplicate — `⏭ <gist> — already in
   server/INSIGHTS.md` — or `📝 Insights: nothing new`.

**Nothing substantive and new → write nothing**: no Session Notes line, no
filler. For most small tasks this is the expected outcome.

## Quality bar — substantive means all four

1. **Not obvious** — anyone reading the code wouldn't see it. Skip generic
   programming knowledge and anything already in a AGENTS.md or README.
2. **Actionable cold** — an agent reading only this line knows what to do or
   avoid, and it would have saved real time or prevented a mistake in this
   task. It is likely to come up again, and the code it describes is stable
   (not mid-refactor).
3. **Verified** — you watched it work or fail. A hunch goes to Open
   Questions, nowhere else.
4. **Evidenced** — cite `path:line` plus the symbol name (lines drift, names
   less so).

| ❌ Noise | ✅ Insight |
|---|---|
| "Promises can be tricky" | "`Promise.all()` on the ingest pipeline times out past 30 items — use `Promise.allSettled()` in batches of 10" |
| "Be careful with async" | "Checkout state always goes through Zustand (`cartStore.ts`): 3 components share the cart, so local state desyncs it" |

## Sections — fixed, never add new ones

| Section | What goes there |
|---|---|
| What Works | an approach that solved a real problem here, and why it worked |
| What Doesn't Work | dead ends, failed approaches, antipatterns — and why they fail |
| Codebase Patterns | conventions and architectural decisions, with their reason |
| Tool & Library Notes | dependency, CLI, or API quirks |
| Recurring Errors & Fixes | exact error text → fix → root cause |
| Session Notes | one dated line per wrap-up that added entries |
| Open Questions | unverified hypotheses, unexplained behavior |

## Entry format

One bullet = one insight, at most 3 lines:

```
- YYYY-MM-DD · <what to do or avoid> — <why>. `path/to/file.ts:42` (`symbol`)
```

- Recurring Errors & Fixes: ``- YYYY-MM-DD · `<exact error>` → <fix> — <root cause>.``
- Session Notes: `- YYYY-MM-DD · <task> — <outcome>; +N insights (<sections>)`
- Open Questions: `- YYYY-MM-DD · <question>? Seen at <path:line>. Next step: <…>`

## Rules

- **Append-only.** Add bullets at the end of the right section. Never edit,
  reorder, or delete existing entries — pruning is the human's job.
- **Correct by appending**: `- YYYY-MM-DD · Supersedes YYYY-MM-DD "<first words>": <new truth>`.
- **Never write secrets** — no tokens, keys, `.env` values, or personal data.
- **Lesson → rule.** If the same insight comes up a second time, or you
  broke an entry you had already read, propose moving it into that module's
  AGENTS.md — or into a hook if it keeps being broken. Don't edit AGENTS.md
  unasked.
- **Oversized file** (~100 entries): tell the user it needs a prune; don't
  prune it yourself.
