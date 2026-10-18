# CLAUDE.md

This repo is a Claude Code plugin marketplace named `dev-digest`. The catalog is `.claude-plugin/marketplace.json`; plugins live in `plugins/<name>/`.

## When adding or changing plugins

- Start new plugins from `templates/plugin/`. Follow CONTRIBUTING.md.
- Any change under `plugins/<name>/` (except its `evals/`) requires a semver bump of `version` in that plugin's `.claude-plugin/plugin.json` and a `CHANGELOG.md` entry. Use `python3 scripts/release.py <plugin> patch|minor|major` after committing the change; don't edit the version by hand.
- To undo a bad release use `python3 scripts/rollback.py <plugin>`; never move or delete `<plugin>--vX.Y.Z` tags.
- Never put `version` in a marketplace entry. Never rename an existing plugin's `name`; use `displayName` or the `renames` map.
- Keep `plugins` in `marketplace.json` sorted by name; entry `name` must equal `plugin.json` `name`.
- Component directories (`skills/`, `agents/`, `commands/`, `hooks/`) go at the plugin root, not inside `.claude-plugin/`.
- Paths start with `./`, use `/`, never `..`. No top-level `bin/` in a plugin.
- Update the plugin table in `README.md` and `.github/CODEOWNERS` when adding a plugin.

## Before finishing

Run and make sure all pass:

```
claude plugin validate . --strict
for d in plugins/*/ templates/plugin/; do claude plugin validate "$d" --strict; done
python3 scripts/check_invariants.py --base origin/main
node --test plugins/*/hooks/*.test.mjs plugins/*/skills/*/scripts/*.test.mjs
```
