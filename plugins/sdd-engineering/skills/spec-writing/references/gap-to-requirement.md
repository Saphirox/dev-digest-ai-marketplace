# Gap → requirement: worked examples

Each example shows the whole path one gap takes: what the design leaves
out, the question put to the user, the decision, and the lines it becomes
in the spec. Match this shape when you convert your own gaps.

## Example 1 — an unshown state becomes an AC

**Gap (states checklist):** the design shows the tour, but not a
repository that has not been indexed yet.

**Question:** What should the repository page do when the repo is not
indexed? · Disable "Generate tour" with a hint (Recommended) · Hide the
button · Generate anyway from the file tree only.

**Decision:** `- **D-1** Unindexed repo? → disable the button with a hint (accepted).`

**Spec lines:**

```markdown
- **AC-2** `[server, client]` `must` IF the repository is not indexed, THEN the repository page shall disable "Generate tour" and show "Index the repository first".

| AC-2 | D-1 | client RTL test with an unindexed repo fixture |
```

## Example 2 — a declined proposal becomes a non-goal

**Gap (UX checklist):** the tour could regenerate itself when new commits
are indexed.

**Question:** Regenerate the tour automatically on new commits? · No — show
a stale banner instead (Recommended) · Yes, on the next visit.

**Decision:** `- **D-2** Regenerate automatically? → no; stale banner instead (declined auto-regenerate).`

**Spec lines:** a non-goal, plus the requirement the user chose instead:

```markdown
Non-goals:
- Regenerating automatically when new commits are indexed (declined by user, D-2).

- **AC-4** `[repo-intel, client]` `should` WHILE the stored tour is older than the repository's latest indexed commit, the tour page shall show a "Stale — regenerate" banner.

| AC-4 | D-2 | client RTL test with a stale fixture |
```

## Example 3 — a cross-module hop becomes a contract requirement

**Gap (cross-module checklist):** the model's output crosses from `server`
to `client`, and nothing says what happens to a link that points at a file
that does not exist.

**Question:** What should happen to a generated link that points at a file
not in the indexed tree? · Drop the link, keep the text (Recommended) ·
Show it as broken · Reject the whole tour.

**Decision:** `- **D-3** Link to a missing file? → drop the link, keep the text (accepted).`

**Spec lines:** the requirement names where the rule applies, with a
concrete example row because the input is easy to get wrong:

```markdown
- **AC-3** `[server]` `must` IF a generated link points at a path that is not in the indexed tree, THEN the API shall drop that link and keep the section text.

| AC-3 | indexed tree has `src/app.ts`; the model links `src/app.ts` and `src/missing.ts` | the tour is stored | the section keeps the `src/app.ts` link and has no `src/missing.ts` link |

| AC-3 | D-3 | server unit test with a fake model response (Examples row AC-3) |
```
