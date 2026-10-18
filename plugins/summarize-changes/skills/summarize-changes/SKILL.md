---
name: summarize-changes
description: Summarizes recent git commits and uncommitted changes into a short digest grouped by theme. Use when the user asks what changed recently, wants a digest, standup notes, release notes draft, or a summary of a branch.
---

# Summarize changes

Produce a concise digest of recent changes in the current git repository.

## Steps

1. Determine the range. Default: commits since the branch diverged from the default branch; if on the default branch, the last 7 days. Use the range the user names if they give one.
2. Collect data:
   - `git log --no-merges --pretty=format:'%h %an %s' <range>`
   - `git diff --stat <range>` for the size of each change
   - `git status --short` for uncommitted work
3. Group changes by theme (features, fixes, refactoring, docs, infra), not by commit.
4. Write the digest:
   - One-line overall summary first.
   - Bullets per theme, each naming the user-visible effect, with short commit hashes in parentheses.
   - A separate "Uncommitted" section only if there is uncommitted work.

## Rules

- Describe effects, not file lists. Mention a file only when it clarifies the change.
- Do not invent motivation that is not in commit messages or diffs.
- Keep the digest under 20 bullets; merge minor items.
