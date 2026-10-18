# Contributing

## Add a plugin

1. Copy the template:
   ```
   cp -R templates/plugin plugins/<plugin-name>
   ```
2. Rename `my-plugin` / `example-skill` everywhere in the new directory. Rename `skills/example-skill/` to your skill's name.
3. Fill in `.claude-plugin/plugin.json`, `README.md` and `CHANGELOG.md`.
4. Add an entry to `.claude-plugin/marketplace.json`, keeping `plugins` sorted by name:
   ```json
   {
     "name": "<plugin-name>",
     "source": "./plugins/<plugin-name>",
     "description": "…",
     "category": "…",
     "tags": []
   }
   ```
5. Add the plugin to the table in the root `README.md` and an owner line in `.github/CODEOWNERS`.
6. Validate and test locally (see below).

## Release a plugin

Every change to files under `plugins/<name>/` must raise `version` in that plugin's `plugin.json` and add a matching `## X.Y.Z` section to its `CHANGELOG.md`. Without a new version, users who already installed the plugin never receive the change. CI enforces both: the version must be greater than on the base branch, its tag must not exist yet, and the changelog must have the section. Versions are plain `X.Y.Z`; prereleases (`1.0.0-rc.1`) are not supported.

- patch: fixes and wording changes
- minor: new skills, agents, commands or options
- major: removed or renamed components, changed behavior users rely on

Commit your changes, then let the release script do the bump:

```
python3 scripts/release.py <plugin-name> patch|minor|major [-m "note"] [--dry-run]
```

It fetches release tags, bumps `version`, adds a `CHANGELOG.md` section (from `-m`, or from commit subjects since the last release, skipping merge/wip/fixup commits; check that they read well for users), validates, and commits `release(<plugin>): vX.Y.Z`. If any step fails, the plugin directory is restored to `HEAD`. Push it or open a PR. When the commit reaches `main` and validation passes there, the `Tag plugin releases` workflow tags the commit that introduced the version as `<plugin>--vX.Y.Z`.

## Roll back a plugin

```
python3 scripts/rollback.py <plugin-name> [--to X.Y.Z] [--dry-run]
```

Users only get an update when the version string changes, so a rollback rolls *forward*: the plugin directory is restored from tag `<plugin>--v<to>` and the version becomes a patch bump of the current one. For example, if 1.2.0 is broken, 1.2.1 ships the files of 1.1.0. `CHANGELOG.md` history is kept and records the rollback, so the default target (`--to` omitted) skips reverted versions: rolling back again from 1.2.1 goes to the release before 1.1.0, never back to 1.2.0. Push the commit to `main` as with a release.

Rollback needs release tags, so it can only restore versions that were merged to `main` after the tagging workflow was added.

## Rules

- **Names are permanent.** The plugin name is the install id (`name@dev-digest`) and the key in users' `enabledPlugins`. To relabel, use `displayName`. To rename or remove, add to the top-level `renames` map in `marketplace.json`.
- **Version lives only in `plugin.json`**, never in the marketplace entry.
- Names: lowercase kebab-case; must not start with `claude-` or `anthropic-`.
- All paths start with `./`, use forward slashes, and never contain `..`. Installed plugins are copied to a cache, so nothing outside the plugin directory exists at runtime.
- No top-level `bin/` directory (claude.ai rejects it); put scripts in `scripts/`.
- Reference plugin files as `${CLAUDE_PLUGIN_ROOT}/…` (quoted in shell hooks) or `${CLAUDE_SKILL_DIR}/…` in skills. Persistent state goes in `${CLAUDE_PLUGIN_DATA}`.
- No secrets in the repo. Use `userConfig` with `"sensitive": true`, or `${ENV_VAR}` in `.mcp.json`.
- `CLAUDE.md` inside a plugin is not loaded; put instructions in skills.
- External plugins (`github`, `url`, `git-subdir` sources) must pin a full 40-char `sha`.

## Writing skills

- `description`: third person, what it does plus `Use when …` with concrete triggers; most important part first (descriptions get truncated). Max 1024 chars.
- `SKILL.md` body under 500 lines; move detail to `references/*.md`, one level deep.
- Prefer small, focused plugins: every installed skill's description costs context on every turn. Use `disable-model-invocation: true` for skills that should only run when invoked manually.

## Validate and test locally

```
claude plugin validate . --strict
claude plugin validate plugins/<plugin-name> --strict
python3 scripts/check_invariants.py --base origin/main
```

Try the plugin in a session without installing:

```
claude --plugin-dir ./plugins/<plugin-name>
```

Or install the whole marketplace from your checkout:

```
claude plugin marketplace add ./
claude plugin install <plugin-name>@dev-digest
```
