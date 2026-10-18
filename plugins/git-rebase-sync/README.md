# git-rebase-sync

Before every `git commit` Claude runs, a hook fetches the default branch and
rebases the current branch onto `origin/<default>`, so commits never land on
a stale base. The skill is the playbook for what goes wrong: conflicts, a
denied commit, recovery.

Opt-in: this changes how commits behave in every project where the plugin is
enabled.

## Install

```
/plugin marketplace add Saphirox/dev-digest-ai-marketplace
/plugin install git-rebase-sync@dev-digest
```

## Components

| Type | Name | Purpose |
|------|------|---------|
| Hook | `PreToolUse` Bash -> `hooks/rebase-before-commit.mjs` | Rebase before `git commit` (60 s timeout) |
| Skill | `git-rebase-sync` | Conflict summaries, resolution rules, recovery |

## Behaviour

| State | Result |
|-------|--------|
| Up to date, offline or detached HEAD | Silent (offline and detached warn) |
| Behind, clean rebase | Rebases, allows the commit, reports what moved |
| Conflicts | Changes nothing, denies the commit with the facts |

The hook never commits and fails open: if it breaks, the commit goes ahead.
Requires Node.js 20+.
