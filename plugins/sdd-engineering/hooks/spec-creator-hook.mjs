#!/usr/bin/env node
// Hook entry for `sdd-engineering:spec-creator`. Plugin agents cannot declare
// hooks in their frontmatter, so hooks/hooks.json runs this for every matching
// tool call; it acts only when the caller is spec-creator.
//
//   argv[2] = pre  -> PreToolUse Write/Edit/Bash scope (spec-creator-scope.mjs)
//   argv[2] = post -> PostToolUse Write/Edit spec lint (spec-writing lint.mjs)

import { main as scope } from './spec-creator-scope.mjs';
import { hook as lint } from '../skills/spec-writing/scripts/lint.mjs';

const AGENTS = new Set(['sdd-engineering:spec-creator', 'spec-creator']);

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {}
  if (!AGENTS.has(input.agent_type)) return;
  if (process.argv[2] === 'pre') scope(input);
  else if (process.argv[2] === 'post') lint(input);
});
