// Run: node --test hooks/rebase-before-commit.test.mjs
// Each case builds a throwaway origin + clone and feeds the hook its stdin JSON.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'rebase-before-commit.mjs');
const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
};
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8' }).trim();

/** origin (bare) + `work` clone on branch `feat` with one own commit. */
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'rbc-'));
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  const other = join(dir, 'other');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env: ENV });
  execFileSync('git', ['clone', '-q', origin, other], { env: ENV });
  writeFileSync(join(other, 'a.txt'), 'one\ntwo\nthree\n');
  sh(other, 'add', '.'); sh(other, 'commit', '-qm', 'base'); sh(other, 'push', '-q', 'origin', 'HEAD:main');
  execFileSync('git', ['clone', '-q', origin, work], { env: ENV });
  sh(work, 'checkout', '-qb', 'feat');
  writeFileSync(join(work, 'own.txt'), 'mine\n');
  sh(work, 'add', '.'); sh(work, 'commit', '-qm', 'own work');
  /** push a commit to origin/main from the other clone */
  const upstream = (file, body, msg) => {
    writeFileSync(join(other, file), body);
    sh(other, 'add', '.'); sh(other, 'commit', '-qm', msg); sh(other, 'push', '-q', 'origin', 'HEAD:main');
  };
  return { work, upstream };
}

function run(cwd, command) {
  const r = spawnSync('node', [HOOK], { input: JSON.stringify({ cwd, tool_input: { command } }), env: ENV, encoding: 'utf8' });
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null;
}

const COMMIT = 'git commit -m x';

test('up to date: silent', () => {
  const { work } = fixture();
  assert.equal(run(work, COMMIT), null);
});

test('non-commit and quoted "git commit" text are ignored', () => {
  const { work, upstream } = fixture();
  upstream('b.txt', 'b\n', 'up');
  const before = sh(work, 'rev-parse', 'HEAD');
  assert.equal(run(work, 'git status'), null);
  assert.equal(run(work, 'echo "git commit"'), null);
  assert.equal(sh(work, 'rev-parse', 'HEAD'), before);
});

test('behind + clean: rebased, allowed, context set', () => {
  const { work, upstream } = fixture();
  upstream('b.txt', 'b\n', 'up');
  const out = run(work, COMMIT);
  assert.equal(out.permissionDecision, undefined);
  assert.match(out.additionalContext, /rebased 1 commit\(s\) of feat onto origin\/main/);
  assert.equal(sh(work, 'merge-base', '--is-ancestor', 'origin/main', 'HEAD') ?? '', '');
});

test('behind + staged file: rebased and the file is still staged', () => {
  const { work, upstream } = fixture();
  upstream('b.txt', 'b\n', 'up');
  writeFileSync(join(work, 'new.txt'), 'x\n');
  sh(work, 'add', 'new.txt');
  writeFileSync(join(work, 'own.txt'), 'edited, unstaged\n');
  run(work, COMMIT);
  assert.equal(sh(work, 'diff', '--cached', '--name-only'), 'new.txt');
  assert.equal(readFileSync(join(work, 'own.txt'), 'utf8'), 'edited, unstaged\n');
});

test('partial stage: denied, nothing changed', () => {
  const { work, upstream } = fixture();
  upstream('b.txt', 'b\n', 'up');
  writeFileSync(join(work, 'own.txt'), 'staged\n'); sh(work, 'add', 'own.txt');
  writeFileSync(join(work, 'own.txt'), 'staged\nplus unstaged\n');
  const before = sh(work, 'rev-parse', 'HEAD');
  const out = run(work, COMMIT);
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /own\.txt is only partly staged/);
  assert.equal(sh(work, 'rev-parse', 'HEAD'), before);
});

test('conflict: denied with file:line facts, tree untouched', () => {
  const { work, upstream } = fixture();
  writeFileSync(join(work, 'a.txt'), 'one\nOURS\nthree\n');
  sh(work, 'add', '.'); sh(work, 'commit', '-qm', 'ours edits a');
  upstream('a.txt', 'one\nTHEIRS\nthree\n', 'theirs edits a');
  const before = sh(work, 'rev-parse', 'HEAD');
  const out = run(work, COMMIT);
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /- a\.txt:2-6 · origin\/main: \w+ "theirs edits a" · ours: \w+ "ours edits a"/);
  assert.match(out.permissionDecisionReason, /exactly three sentences/);
  assert.equal(sh(work, 'rev-parse', 'HEAD'), before);
  assert.equal(sh(work, 'status', '--porcelain'), '');
});

test('offline: allowed with a warning', () => {
  const { work } = fixture();
  sh(work, 'remote', 'set-url', 'origin', '/nonexistent/repo.git');
  assert.match(run(work, COMMIT).additionalContext, /could not fetch/);
});
