// Run: node --test hooks/readonly-bash.test.mjs
// Feeds the hook its stdin JSON via spawnSync, never a gated phrase inline in
// a Bash call (root INSIGHTS.md:40 — a live PreToolUse hook sees this same
// session's raw command text).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from './readonly-bash.mjs';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'readonly-bash.mjs');

function run(command) {
  const r = spawnSync('node', [HOOK], { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' });
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null;
}

function denied(command) {
  const out = run(command);
  assert.equal(out?.permissionDecision, 'deny', `expected deny for: ${command}`);
  return out;
}

function allowed(command) {
  assert.equal(run(command), null, `expected allow for: ${command}`);
}

test('deny: git commit', () => {
  denied('git commit -m "wip"');
});

test('deny: git push', () => {
  denied('git push origin HEAD');
});

test('deny: gh pr create', () => {
  denied('gh pr create --title x');
});

test('deny: rm', () => {
  denied('rm -rf some/dir');
});

test('deny: curl', () => {
  denied('curl https://example.com');
});

test('deny: sed -i', () => {
  denied("sed -i '' 's/a/b/' file.txt");
});

test('deny: shell redirection', () => {
  denied('echo hi > file.txt');
});

test('deny: tee', () => {
  denied('echo hi | tee file.txt');
});

test('deny: npm install', () => {
  denied('npm install left-pad');
});

test('deny: pnpm add', () => {
  denied('pnpm add left-pad');
});

test('deny: drizzle-kit generate', () => {
  denied('./node_modules/.bin/drizzle-kit generate');
});

test('deny: pnpm db:migrate', () => {
  denied('pnpm db:migrate');
});

test('deny: docker compose down', () => {
  denied('docker compose down -v');
});

test('deny: docker volume rm', () => {
  denied('docker volume rm devdigest_pgdata');
});

test('deny: read secrets.json', () => {
  denied('cat ~/.devdigest/secrets.json');
});

test('deny: read a .env file', () => {
  denied('cat server/.env');
});

test('allow: git diff', () => {
  allowed('git diff origin/main...HEAD');
});

test('allow: git log/status/show/blame/rev-parse/merge-base', () => {
  allowed('git log --oneline -5');
  allowed('git status --short');
  allowed('git show HEAD:server/AGENTS.md');
  allowed('git blame server/AGENTS.md');
  allowed('git rev-parse --short HEAD');
  allowed('git merge-base origin/main HEAD');
});

test('allow: rg/cat/sed -n/ls/jq', () => {
  allowed("rg -n 'foo' server/src");
  allowed('cat AGENTS.md');
  allowed("sed -n '1,20p' AGENTS.md");
  allowed('ls .claude/agents');
  allowed("jq '.name' package.json");
});

test('allow: pnpm test/typecheck/arch:check, npm test, direct binaries', () => {
  allowed('pnpm test');
  allowed('pnpm typecheck');
  allowed('pnpm arch:check');
  allowed('npm test');
  allowed('./node_modules/.bin/vitest run');
  allowed('./node_modules/.bin/tsc --noEmit');
  allowed('./node_modules/.bin/depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --output-type err');
});

test('allow: docker ps, docker exec psql \\d', () => {
  allowed('docker ps');
  allowed(`docker exec devdigest-postgres psql -U devdigest -d devdigest -c '\\d agent_runs'`);
});

test('quoted-string false positive: a gated phrase inside quotes is data, not a command', () => {
  // grepping docs for the literal phrase "git push" must not trip the gate.
  allowed(`rg -n "git push" docs/README.md`);
  allowed(`rg -n 'gh pr create' .claude/agents/README.md`);
  allowed(`echo "rm -rf /"`);
});

test('quoted-string false positive: a commit message mentioning a gated verb', () => {
  allowed(`git log --grep="rm -rf" --oneline`);
});

// --- Regressions found by the pr-self-review security pass -------------------
// Each case below was ALLOWED before the quoted-path / boundary / redirection
// fixes. Keep them: they are the three ways the deny list was evaded.

test('deny: a quoted path still reads the file (quote-stripping must not blank path rules)', () => {
  // Quoting a $HOME path is ordinary shell style, not an evasion.
  denied('cat "$HOME/.devdigest/secrets.json"');
  denied(`cat ~/".devdigest"/secrets.json`);
  denied('cat "$HOME/.devdigest/secrets.json" | head -5');
  denied('cat "server/.env"');
  denied(`cat 'client/.env.local'`);
});

test('deny: the whole secrets dir, not just the named file', () => {
  denied('grep -r TOKEN "$HOME/.devdigest/"');
  denied('ls -la ~/.devdigest');
});

test('allow: this repo\'s own self-review run dir is not the secrets dir', () => {
  allowed('cat .devdigest/self-review/runs/abc123/report.md');
});

test('deny: a command word reached through an absolute or relative path', () => {
  denied('/bin/rm -rf build');
  denied('/usr/bin/curl https://example.com');
  denied('/usr/bin/git push origin HEAD');
});

test('deny: a shell wrapper, which re-enables the whole deny list in one hop', () => {
  denied('bash -c "rm -rf build"');
  denied(`sh -c 'git push'`);
  denied('echo hi | sh');
  denied('eval "$SOME_CMD"');
  denied('echo `rm -rf build`');
  denied('find . -name "*.tmp" | xargs rm');
});

test('deny: redirection without a leading space, and fd-to-file', () => {
  denied('echo x>notes.txt');
  denied('node x.mjs 2>log.txt');
  denied('echo x>>notes.txt');
});

test('allow: what redirection-like syntax must NOT catch', () => {
  allowed('pnpm test 2>&1 | head -20');   // fd duplication, writes no file
  allowed('rg -n "a->b" server/src');      // arrow inside a search pattern
  allowed('echo "1>=0"');                  // comparison operator as data
});

// --- Second self-review pass: defects introduced by the first round of fixes --

test('allow: the `.env` rule must not match `process.env` or `.env.example`', () => {
  // Anchoring the leading dot to a path segment. Without it the reviewer cannot
  // grep config at all, which is its most natural search.
  allowed(`rg -n 'process.env' server/src`);
  allowed('rg -n process.env.DATABASE_URL server/src');
  allowed('cat server/.env.example');
  allowed('git diff -- server/.env.example');
});

test('deny: real dotenv files are still denied', () => {
  denied('cat server/.env');
  denied('cat client/.env.local');
  denied('cat "server/.env"');
});

test('deny: a backslash line continuation must not defeat a multi-word rule', () => {
  // `\` is not `\s`, so without normalisation every two-word rule is evaded by
  // ordinary formatting — no intent to evade required.
  denied('git \\\n  push origin HEAD');
  denied('gh \\\n  pr create --fill');
  denied('npm \\\n  install');
  denied('sed \\\n  -i s/a/b/ f');
  denied('bash \\\n  -c "rm -rf build"');
});

test('deny: secrets by filename, not only by directory', () => {
  // Widening to the directory had dropped the filename match.
  denied('cat ~/.dev*/secrets.json');
  denied('cat ~/.devdigest/secrets.json');
});

test('deny: git subcommands that write but were not enumerated', () => {
  denied('git switch main');          // synonym of the already-denied checkout
  denied('git apply patch.diff');
  denied('git worktree add ../x');
  denied('git config --global user.name x');
  denied('git branch -D feature/x');
});

test('allow: the read-only git surface the reviewers depend on', () => {
  allowed('git branch --list');
  allowed('git config --get user.email');
  allowed('git config --list');
  allowed('git ls-tree HEAD .claude/');
});

test('deny: an inline interpreter script is an arbitrary program', () => {
  denied(`node -e "require('fs').rmSync('x')"`);
  denied(`python3 -c 'import os'`);
  denied(`perl -e 'unlink "x"'`);
});

test('deny: file-mutating utilities and destructive find', () => {
  denied('find . -name x -delete');
  denied('find . -name "*.tmp" -exec rm {} ;');
  denied('truncate -s 0 f');
  denied('ln -sf a b');
  denied('chmod 777 f');
  denied('touch newfile');
});

test('allow: a plain find is a read', () => {
  allowed('find . -name "*.test.ts"');
  allowed('find server/test -type f');
});

// --- Third self-review pass: 8 evasions + 4 over-deny classes ----------------

test('deny: shell wrapper flag clusters and --command forms', () => {
  denied('bash -lc "rm -rf build"');
  denied('bash -ic "rm -rf build"');
  denied('bash -xc "rm -rf build"');
  denied(`zsh -lc 'rm -rf build'`);
});

test('deny: running a shell script file directly or via a shell, source included', () => {
  denied('./scripts/dev.sh');
  denied('bash scripts/dev.sh');
  denied('sh scripts/e2e.sh');
  denied('source scripts/dev.sh');
});

test('allow: reading a shell script is not running it', () => {
  allowed('cat scripts/dev.sh');
  allowed('rg -n "pnpm install" scripts/dev.sh');
});

test('deny: interpreter print/eval/command/exec forms, long and short', () => {
  denied('node --eval=1');
  denied('node -p "1+1"');
  denied('node --print "1+1"');
  denied('python3 --command');
});

test('allow: `node --test` stays allowed (this task\'s own Verify command)', () => {
  allowed('node --test .claude/hooks/readonly-bash.test.mjs');
});

test('deny: package runners, allowlisted not enumerated', () => {
  denied('npx rimraf server/src');
  denied('pnpm dlx x');
  denied('npm exec -- x');
  denied('yarn dlx x');
  denied('bunx x');
  denied('deno run x.ts');
});

test('allow: the sanctioned alternative to a runner', () => {
  allowed('./node_modules/.bin/vitest run');
  allowed('pnpm test');
});

test('deny: secrets by glob shape, not only the literal path', () => {
  denied('cat ~/.dev*/*.json');
  denied('grep -r . ~/.dev*');
  denied('ls ~/.d*');
});

test('allow: a real secrets adapter file and the committed .env.example', () => {
  allowed('cat server/src/adapters/secrets/local.ts');
  allowed('cat server/.env.example');
});

test('deny: git worktree/submodule mutating subcommands, and bare/mutating stash', () => {
  denied('git worktree add ../x');
  denied('git submodule update --init');
  denied('git stash');
  denied('git stash push -m x');
});

test('deny: `git config` writes — a value argument, --unset, --edit', () => {
  denied('git config user.name x');
  denied('git config --unset x');
  denied('git config --edit');
});

test('allow: the read-only surface of worktree/submodule/stash/config', () => {
  allowed('git worktree list');
  allowed('git submodule status');
  allowed('git stash list');
  allowed('git stash show');
  allowed('git config user.email');
  allowed('git config --get user.email');
});

test('deny: a backslash escape before a command word, a keyword-gated command, sudo/time prefixes', () => {
  denied('\\rm -rf x');
  denied('if true; then rm -rf x; fi');
  denied('sudo rm -rf x');
  denied('time rm x');
});

test('allow: name-only rules must not fire on an argument, not even inside a keyword-adjacent path', () => {
  allowed('cat server/src/db/schema/eval.ts');
  allowed('cat client/messages/en/eval.json');
  allowed('diff server/src/vendor/shared/contracts/eval-ci.ts client/src/vendor/shared/contracts/eval-ci.ts');
  allowed('cat docs/install.md');
  allowed('ls client/src/app/touch/');
  allowed('rg -n mkdir .claude/hooks');
});

// --- `git ls-files` sweep: no tracked file may be unreadable by `cat` --------

test('sweep: evaluate(`cat <f>`) === null for every git-tracked file', () => {
  // Repo root, not `.claude/hooks/` — `git ls-files` scopes to cwd, and
  // `.claude/…` from cwd is banned (root AGENTS.md:111), so walk up from
  // this file's own URL instead of trusting process.cwd().
  const cwd = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const files = execFileSync('git', ['ls-files'], { cwd, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  assert.ok(files.length > 0, 'git ls-files returned nothing');
  const blocked = files.filter((f) => evaluate(`cat ${f}`) !== null);
  assert.deepEqual(blocked, [], `${blocked.length} tracked file(s) unreadable by cat: ${blocked.join(', ')}`);
});
