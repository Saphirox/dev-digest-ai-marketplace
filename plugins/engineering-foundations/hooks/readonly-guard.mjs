#!/usr/bin/env node
// PreToolUse hook (Bash) for the read-only agents of the dev-digest plugins.
// Plugin agents cannot declare hooks in their frontmatter, so hooks/hooks.json
// runs this for every Bash call; it picks the allowlist profile from the
// calling agent (`agent_type`) and stays silent for anyone else, including
// the main session.
//
//   stdin = Claude Code PreToolUse JSON; prints a deny decision or nothing.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { main } from './readonly-allowlist.mjs';

// `<plugin>:<agent>` -> readonly-allowlist.mjs profile.
export const AGENT_PROFILES = {
  'research-tools:researcher': 'read',
  'sdd-engineering:implementation-planner': 'read',
  'architecture-reviewer:architecture-reviewer': 'architecture',
  'sdd-engineering:security-reviewer': 'security',
  'sdd-engineering:plan-verifier': 'verify',
};

/** Profile for a hook input's agent, accepting `plugin:agent` or a bare `agent`. */
export function profileFor(agentType) {
  if (!agentType) return null;
  if (AGENT_PROFILES[agentType]) return AGENT_PROFILES[agentType];
  if (agentType.includes(':')) return null;
  const match = Object.keys(AGENT_PROFILES).find((k) => k.split(':')[1] === agentType);
  return match ? AGENT_PROFILES[match] : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input = {};
    try {
      input = JSON.parse(raw);
    } catch {}
    const profile = profileFor(input.agent_type);
    if (profile) main(input, profile);
  });
}
