// Run: node --test hooks/readonly-allowlist.test.mjs
// Commands are passed as data to `evaluate` (and once via stdin), never run
// inline — a live PreToolUse hook sees this session's raw command text.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, PROFILES } from './readonly-allowlist.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const allowed = (p, c) => assert.equal(evaluate(c, p), null, `[${p}] expected allow: ${c}`);
const denied = (p, c) => assert.ok(evaluate(c, p), `[${p}] expected deny: ${c}`);
const ALL = Object.keys(PROFILES);

// --- shared by every profile -------------------------------------------------

test('every profile: file reads and search are allowed', () => {
  for (const p of ALL) {
    allowed(p, "sed -n '1,80p' server/src/app.ts");
    allowed(p, 'cat server/AGENTS.md | head -40');
    allowed(p, 'rg -n "from .*/db/" server/src/modules');
    allowed(p, 'find server/src -name "*.ts" | wc -l');
    allowed(p, 'ls server/src/modules');
    allowed(p, 'diff -r server/src/vendor/shared client/src/vendor/shared');
    allowed(p, 'jq .scripts server/package.json');
    allowed(p, 'git status --short');
    allowed(p, 'git log --oneline -- server/src/app.ts');
  }
});

test('every profile: writing, running, fetching and secrets are denied', () => {
  for (const p of ALL) {
    for (const c of [
      'echo hi > notes.md',
      'cat a.ts >> b.ts',
      'git log | tee out.txt',
      "sed -i 's/a/b/' server/src/app.ts",
      "sed -n '1,5w out.txt' server/src/app.ts",
      'find . -name "*.tmp" -delete',
      'find . -exec rm {} ;',
      'rg --pre ./x.sh foo',
      'rm -rf server',
      'mkdir x',
      'git commit -m wip',
      'git checkout main',
      'git stash push -m x',
      'git reset --hard',
      'pnpm install',
      'npx depcruise src',
      'node -e "1"',
      'python3 -c "1"',
      'bash -c "ls"',
      'curl https://example.com',
      'cat $(echo x)',
      'ls `pwd`',
      'cat ~/.devdigest/secrets.json',
      'cat "$HOME/.devdigest/secrets.json"',
      'cat server/.env',
      'pnpm db:migrate',
      'docker compose down -v',
    ]) {
      denied(p, c);
    }
  }
});

test('every profile: quoted text is data', () => {
  for (const p of ALL) {
    allowed(p, 'rg -n "a && b > c" server/src');
    allowed(p, "rg -n 'x | y; rm -rf /' server/src");
    allowed(p, 'rg -n "process.env" server/src');
    allowed(p, 'cat server/.env.example');
  }
});

// --- read --------------------------------------------------------------------

test('read: history, any diff, DB reads', () => {
  allowed('read', 'git diff origin/main...HEAD --stat');
  allowed('read', "git log --all --oneline -S'onboarding'");
  allowed('read', 'git worktree list');
  allowed('read', 'git config --get user.name');
  allowed('read', 'docker ps');
  allowed('read', `docker exec devdigest-postgres psql -U devdigest -d devdigest -c '\\d onboarding'`);
  allowed('read', `docker exec devdigest-postgres psql -U devdigest -d devdigest -c "SELECT count(*) FROM findings"`);
  allowed('read', 'date +%F');
});

test('read: writing SQL, config writes and checks are denied', () => {
  denied('read', `docker exec devdigest-postgres psql -U devdigest -d devdigest -c "DELETE FROM findings"`);
  denied('read', `docker exec devdigest-postgres psql -U devdigest -d devdigest -c "SELECT 1; DROP TABLE x"`);
  denied('read', 'docker exec devdigest-postgres psql -U devdigest -d devdigest');
  denied('read', 'git config user.name x');
  denied('read', 'git diff --output=x.patch');
  denied('read', 'pnpm test');
  denied('read', 'pnpm arch:check');
  denied('read', 'date -s "2020-01-01"');
});

// --- architecture ------------------------------------------------------------

test('architecture: staged diff only, plus the boundary check', () => {
  allowed('architecture', 'git diff --cached');
  allowed('architecture', 'git diff --staged --name-only -- server/src');
  allowed('architecture', 'git diff --cached --quiet');
  allowed('architecture', 'git diff --cached | rg "^\\+" | wc -l');
  allowed('architecture', 'pnpm arch:check');
  allowed('architecture', 'cd server && pnpm arch:check 2>&1');
  allowed('architecture', './node_modules/.bin/depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --output-type err');
  allowed('architecture', 'git show HEAD:server/src/app.ts');
  denied('architecture', 'git diff');
  denied('architecture', 'git diff origin/main...HEAD');
  denied('architecture', 'git diff --cached --output=/tmp/x.patch');
  denied('architecture', './node_modules/.bin/depcruise src --output-to out.txt');
  denied('architecture', 'docker ps');
  denied('architecture', 'pnpm test');
});

// --- security ----------------------------------------------------------------

test('security: reads plus typecheck and arch:check, no tests', () => {
  allowed('security', 'git diff origin/main...HEAD');
  allowed('security', 'cd server && pnpm typecheck');
  allowed('security', 'pnpm arch:check');
  denied('security', 'pnpm test');
});

// --- verify ------------------------------------------------------------------

test('verify: the project checks a plan Verify step names', () => {
  allowed('verify', 'cd server && pnpm test');
  allowed('verify', 'pnpm test -- test/onboarding.it.test.ts');
  allowed('verify', 'pnpm typecheck');
  allowed('verify', 'pnpm vitest run src/app/x.test.tsx');
  allowed('verify', 'cd mcp && npm test');
  allowed('verify', 'yarn test');
  allowed('verify', 'python3 -m pytest tests/test_api.py');
  allowed('verify', 'go test ./...');
  allowed('verify', 'cargo test');
  allowed('verify', 'npm run typecheck');
  allowed('verify', 'node --test .claude/hooks/readonly-allowlist.test.mjs');
  allowed('verify', './node_modules/.bin/tsc --noEmit');
  denied('verify', './node_modules/.bin/tsc');
  denied('verify', 'pnpm db:migrate');
  denied('verify', 'npm run e2e');
  denied('verify', 'go test -exec sh ./...');
  denied('verify', 'pnpm add left-pad');
});

test('unknown profile is denied', () => {
  denied('nope', 'ls');
});

test('hook process: denies with a reason, silent on allowed', () => {
  const run = (profile, command) =>
    spawnSync('node', [join(HERE, 'readonly-allowlist.mjs'), profile], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
      encoding: 'utf8',
    }).stdout;
  assert.equal(JSON.parse(run('architecture', 'git diff')).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(run('architecture', 'git diff --cached'), '');
  assert.equal(run('read', 'git diff'), '');
});
