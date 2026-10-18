# Dev Digest AI Marketplace

A [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugins/create-marketplace) with plugins for everyday engineering work.

## Install

```
/plugin marketplace add Saphirox/dev-digest-ai-marketplace
/plugin install <plugin-name>@dev-digest
```

Or from a shell:

```
claude plugin marketplace add Saphirox/dev-digest-ai-marketplace
claude plugin install <plugin-name>@dev-digest
```

Third-party marketplaces do not auto-update by default. Enable it in `/plugin` → Marketplaces, or run `/plugin marketplace update dev-digest` and then `/reload-plugins`.

### For a team

Add to the project's committed `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "dev-digest": {
      "source": { "source": "github", "repo": "Saphirox/dev-digest-ai-marketplace" },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "summarize-changes@dev-digest": true
  }
}
```

## Plugins

| Plugin | Description | Components |
|--------|-------------|------------|
| [summarize-changes](plugins/summarize-changes) | Summarizes recent git changes into a short digest | 1 skill |

## Repository layout

```
.claude-plugin/marketplace.json   catalog of plugins
plugins/<name>/                   one directory per plugin
templates/plugin/                 copy this to start a new plugin
scripts/check_invariants.py       repo checks beyond `claude plugin validate`
scripts/release.py                bump version + changelog for a release
scripts/rollback.py               restore a plugin from an earlier release tag
scripts/build_catalog.py          catalog data for the site (api/catalog.json, llms.txt)
site/                             catalog site on GitHub Pages (Vite + React)
.github/workflows/                CI validation, release tagging, site deploy
```

## Catalog site

`site/` is a static catalog published to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`). It searches every plugin, skill, agent, command, hook and MCP server: keyword search out of the box, and optional semantic search that matches by meaning across languages. The model runs in the browser; artifact vectors are precomputed at build time. It also has an install builder (slash commands, shell, or a team `settings.json`) and serves the catalog to agents as `api/catalog.json` and `llms.txt`.

All data comes from the repo at build time, so new plugins appear without touching `site/`. One-time setup: Settings → Pages → Source: **GitHub Actions**.

Local development:

```
cd site
npm ci
npm run data      # scripts/build_catalog.py + embeddings (downloads the model once)
npm run dev
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
