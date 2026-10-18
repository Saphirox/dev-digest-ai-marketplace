// Run: node --test hooks/readonly-guard.test.mjs
// Commands are passed via stdin JSON, never run inline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profileFor } from './readonly-guard.mjs';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'readonly-guard.mjs');
const run = (input) => spawnSync('node', [HOOK], { input: JSON.stringify(input), encoding: 'utf8' }).stdout;

test('maps plugin and bare agent names to profiles', () => {
  assert.equal(profileFor('sdd-engineering:plan-verifier'), 'verify');
  assert.equal(profileFor('plan-verifier'), 'verify');
  assert.equal(profileFor('architecture-reviewer:architecture-reviewer'), 'architecture');
  assert.equal(profileFor('research-tools:researcher'), 'read');
});

test('ignores the main session, other agents and other plugins', () => {
  assert.equal(profileFor(undefined), null);
  assert.equal(profileFor('Explore'), null);
  assert.equal(profileFor('other-plugin:researcher'), null);
});

test('denies a write command for a guarded agent only', () => {
  const tool_input = { command: 'rm -rf build' };
  assert.match(run({ agent_type: 'research-tools:researcher', tool_name: 'Bash', tool_input }), /"permissionDecision":"deny"/);
  assert.equal(run({ tool_name: 'Bash', tool_input }), '');
  assert.equal(run({ agent_type: 'sdd-engineering:implementer', tool_name: 'Bash', tool_input }), '');
});

test('allows a read command for a guarded agent', () => {
  assert.equal(run({ agent_type: 'research-tools:researcher', tool_name: 'Bash', tool_input: { command: 'git log -5' } }), '');
});
