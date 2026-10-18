# research-tools

The `researcher` agent answers questions that need the outside world (docs,
specs, changelogs, library behaviour, prior art) and, when relevant, how your
repo uses them. It returns cited conclusions and lists what it could not
establish. It is read-only.

## Install

```
/plugin marketplace add Saphirox/dev-digest-ai-marketplace
/plugin install research-tools@dev-digest
```

Installs `engineering-foundations` as a dependency (it enforces the agent's
read-only Bash allowlist).

## Components

| Type | Name | Purpose |
|------|------|---------|
| Agent | `research-tools:researcher` | Web + code research with cited evidence (`sonnet`) |

## Usage

Ask for research in plain words, or name the agent:
`@agent-research-tools:researcher how does Fastify 5 handle async hooks?`
