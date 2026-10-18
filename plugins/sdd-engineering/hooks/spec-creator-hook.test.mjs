// Run: node --test hooks/spec-creator-hook.test.mjs
// Inputs are passed via stdin JSON, never run inline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'spec-creator-hook.mjs');
const run = (mode, input) =>
  spawnSync('node', [HOOK, mode], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: tmpdir() } }).stdout;
const write = { tool_name: 'Write', tool_input: { file_path: join(tmpdir(), 'src/app.ts') } };

test('limits spec-creator writes to specs', () => {
  assert.match(run('pre', { ...write, agent_type: 'sdd-engineering:spec-creator' }), /"permissionDecision":"deny"/);
  assert.match(run('pre', { ...write, agent_type: 'spec-creator' }), /"permissionDecision":"deny"/);
});

test('leaves the main session and other agents alone', () => {
  assert.equal(run('pre', write), '');
  assert.equal(run('pre', { ...write, agent_type: 'sdd-engineering:implementer' }), '');
  assert.equal(run('post', write), '');
});
