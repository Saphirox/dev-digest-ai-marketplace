// Run: node --test hooks/spec-creator-scope.test.mjs
// Feeds the hook its stdin JSON via spawnSync, never a gated command inline in
// a Bash call (root INSIGHTS.md — a live PreToolUse hook sees this session's
// raw command text).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkWrite, checkBash } from './spec-creator-scope.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = '/repo';

test('write: spec files and design frames are allowed', () => {
  assert.equal(checkWrite('specs/spec-0001-repo-onboarding.md', ROOT), null);
  assert.equal(checkWrite('/repo/specs/spec-0001-repo-onboarding.md', ROOT), null);
  assert.equal(checkWrite('specs/images/spec-0001/error-state.png', ROOT), null);
});

test('write: everything else is denied', () => {
  for (const p of [
    'specs/README.md',
    'specs/SPEC-01-x.md',
    'specs/spec-1-x.md',
    'specs/images/spec-0001/Error State.png',
    'specs/images/spec-0001/frame.jpg',
    'server/specs/spec-0001-x.md',
    'e2e/specs/01-app-boot.flow.json',
    'server/src/app.ts',
    'server/INSIGHTS.md',
    '/repo/../etc/passwd',
    'specs/../AGENTS.md',
  ]) {
    assert.ok(checkWrite(p, ROOT), `expected deny for ${p}`);
  }
});

test('bash: read-only commands pass, writes are denied', () => {
  assert.equal(checkBash('ls specs/spec-*.md', ROOT), null);
  assert.equal(checkBash('git log --all --oneline', ROOT), null);
  assert.ok(checkBash('rm specs/spec-0001-x.md', ROOT));
  assert.ok(checkBash('echo hi > specs/spec-0001-x.md', ROOT));
});

test('bash: the two frame-saving forms are allowed only into specs/images/spec-NNNN', () => {
  assert.equal(checkBash('mkdir -p specs/images/spec-0001', ROOT), null);
  assert.equal(checkBash('cp /tmp/shot.png specs/images/spec-0001/empty-state.png', ROOT), null);
  assert.ok(checkBash('mkdir -p server/src/x', ROOT));
  assert.ok(checkBash('cp /tmp/shot.png server/src/x.png', ROOT));
  assert.ok(checkBash('cp /tmp/shot.png specs/images/spec-0001/x.png && rm -rf server', ROOT));
});

test('bash: quoted paths with spaces and `cd <root> &&` chains are allowed', () => {
  const src = '"/Users/me/Library/Application Support/emdash/a b/content.png"';
  assert.equal(checkBash(`cp ${src} specs/images/spec-0001/agent-context.png`, ROOT), null);
  assert.equal(checkBash(`cp '/tmp/a b.png' "specs/images/spec-0001/x.png"`, ROOT), null);
  assert.equal(checkBash('cd /repo && mkdir -p specs/images/spec-0001', ROOT), null);
  assert.equal(
    checkBash(`mkdir -p /repo/specs/images/spec-0001 && cp ${src} /repo/specs/images/spec-0001/x.png`, ROOT),
    null,
  );
  assert.equal(checkBash('cd /repo && ls specs', ROOT), null);
});

test('bash: quoting and chaining never widen the write scope', () => {
  assert.ok(checkBash(`cp "/tmp/a b.png" "server/src/x.png"`, ROOT));
  assert.ok(checkBash(`cp "/tmp/a b.png" specs/images/spec-0001/x.jpg`, ROOT));
  assert.ok(checkBash('cd /repo && mkdir -p server/x', ROOT));
  assert.ok(checkBash('cd /other && cp /tmp/a.png specs/images/spec-0001/x.png && rm -rf server', ROOT));
  assert.ok(checkBash(`cp "$(rm -rf server)" specs/images/spec-0001/x.png`, ROOT));
  assert.ok(checkBash('cp /tmp/a.png specs/images/spec-0001/x.png; rm -rf server', ROOT));
  assert.ok(checkBash('cp /tmp/a.png specs/images/spec-0001/x.png || rm -rf server', ROOT));
  assert.ok(checkBash('cp -r /tmp specs/images/spec-0001/x.png', ROOT));
  assert.ok(checkBash(`cp "/tmp/a.png specs/images/spec-0001/x.png`, ROOT));
});

test('hook process: denies a Write outside scope, stays silent inside', () => {
  const run = (input) =>
    spawnSync('node', [join(HERE, 'spec-creator-scope.mjs')], {
      input: JSON.stringify(input),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    }).stdout;
  const denied = JSON.parse(run({ tool_name: 'Write', tool_input: { file_path: '/repo/server/src/app.ts' } }));
  assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(run({ tool_name: 'Write', tool_input: { file_path: '/repo/specs/spec-0002-x.md' } }), '');
});
