---
name: git-rebase-sync
description: "Rebasing the current branch onto the freshest origin/main before a commit, and handling what goes wrong: rebase conflicts, a denied `git commit` from the rebase-before-commit hook, stale review results after a rebase, force-push after a rebase, lock-file / migration / vendor-shared conflicts, recovering a bad rebase. Use whenever the user mentions rebase, sync with main, freshest master/main, merge conflict, or force push, and whenever the rebase-before-commit hook reports conflicts."
---

# Git rebase sync

A `PreToolUse` hook (`hooks/rebase-before-commit.mjs` in the `git-rebase-sync` plugin) fetches
`origin/<default>` and rebases the branch before every `git commit`. This skill
is what to do around it. The hook never commits.

## What the hook does

Up to date → silent. Behind and clean → rebases (`--autostash` if dirty),
re-stages what was staged, allows. Conflicting → changes **nothing** and denies
with `file:line` facts. Offline, detached HEAD, or a rebase already in progress
→ commit proceeds (warning where relevant). A hook crash never blocks a commit.

## Rules

- "Freshest main" is `git fetch origin main` + `origin/main`. Never
  `git pull` or `git checkout main` in a worktree: `main` is checked out in
  the primary clone.
- Push a rebased branch with `--force-with-lease`, never `--force`.
- Only stash with `git stash push -u -m <tag>`, then `apply` by SHA and drop
  the entry; the stack is shared by every worktree and session.
- Never rebase a branch someone else pushes to.
- Commit with a pathspec (`git commit -m … -- <paths>`): the index is shared
  with other processes.

## When the hook denies with conflicts

Nothing was changed; do not resolve anything unasked. Answer the user in
**exactly three sentences of medium length**, each citing `file:line`:
what conflicts, why (what main changed vs what this branch changed), and the
recommendation. If it cannot be resolved safely, do not guess: show both
implementations and ask which one they want. Examples:
[references/examples.md](references/examples.md).

## Resolution rules for this repo

| Conflict in | Do |
|---|---|
| lock files (`client/pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `reviewer-core/package-lock.json`, `e2e/package-lock.json`) | Never hand-merge. Take main's, re-run the package's own manager (pnpm for server/client, npm for reviewer-core/e2e). |
| `server/src/db/migrations/*` | Merged files are immutable and numbers are never renumbered. Keep main's; regenerate the branch's migration on top with `drizzle-kit generate`. |
| `server/src/vendor/shared/**` / `client/src/vendor/shared/**` | Resolve both copies together; diff them afterwards. |
| `INSIGHTS.md`, `e2e/specs/*.flow.json` | Append-only: keep both sides' entries. |

## After a rebase

- The diff changed, so earlier review results (`architecture-reviewer`,
  `plan-verifier`) are stale; re-run them before push.
- If the branch exists on `origin`, the next push needs `--force-with-lease`.
- Sanity check: `git range-diff origin/main ORIG_HEAD HEAD`.

## Recovery

`git rebase --abort` mid-rebase; afterwards `git reflog`, then
`git reset --hard <pre-rebase sha>` (only with a clean tree); single files via
`git show <sha>:<path>`. Rewritten commits stay reachable until gc.

## Testing the hook

`node --test ${CLAUDE_PLUGIN_ROOT}/hooks/rebase-before-commit.test.mjs`. Feed hooks JSON from
a script, never with the gated words inline in a Bash call.
