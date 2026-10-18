#!/usr/bin/env node
// PreToolUse hook (Bash): before a `git commit`, fetch the default branch and
// rebase the current branch onto `origin/<default>`.
//
//   up to date / offline / detached HEAD  -> silent (offline + detached warn)
//   behind, clean merge                   -> rebase, allow, tell Claude what moved
//   conflicts                             -> change NOTHING, deny with facts
//
// The hook never commits. Conflicts are probed with `git merge-tree
// --write-tree` first (no index / worktree writes); a real rebase that still
// conflicts is aborted, so the tree is always left as it was found.
// Playbook: skills/git-rebase-sync/SKILL.md (this plugin)

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FETCH_TIMEOUT_MS = 20_000;

// `git commit`, also as `git -C dir commit` / `git -c k=v commit`.
const COMMIT = /(?:^|[;&|(\s])git\s+(?:(?:-C|-c)\s+\S+\s+|--[\w-]+(?:=\S+)?\s+)*commit\b/;

let cwd = process.cwd();

function git(args, { allowFail = false, timeout } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    }).trimEnd();
  } catch (err) {
    if (allowFail) return null;
    throw err;
  }
}

const lines = (s) => (s ? s.split('\n').filter(Boolean) : []);

function emit(permissionDecision, reason, additionalContext) {
  const out = { hookEventName: 'PreToolUse' };
  if (permissionDecision) {
    out.permissionDecision = permissionDecision;
    out.permissionDecisionReason = reason;
  }
  if (additionalContext) out.additionalContext = additionalContext;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: out }));
}

const gitPathExists = (name) => existsSync(resolve(cwd, git(['rev-parse', '--git-path', name])));

function defaultBranch() {
  const ref = git(['symbolic-ref', '-q', 'refs/remotes/origin/HEAD'], { allowFail: true });
  return ref ? ref.replace('refs/remotes/origin/', '') : 'main';
}

/** Line ranges of conflict-marker blocks in `text`, e.g. ["88-104"]. */
export function conflictRanges(text) {
  const ranges = [];
  let start = 0;
  text.split('\n').forEach((line, i) => {
    if (line.startsWith('<<<<<<< ')) start = i + 1;
    else if (line.startsWith('>>>>>>> ') && start) {
      ranges.push(start === i + 1 ? `${start}` : `${start}-${i + 1}`);
      start = 0;
    }
  });
  return ranges;
}

const subject = (range, file) =>
  git(['log', '-1', '--format=%h "%s"', range, '--', file], { allowFail: true }) || 'n/a';

const INSTRUCTION =
  'Tell the user in exactly three sentences of medium length (no fragments, no essay), each citing file:line, ' +
  'what conflicts and why. If you cannot resolve it safely, do not guess: show both implementations and ask ' +
  'which one they want. Do not commit until the conflict is resolved.';

function conflictReport({ target, files, read, base }) {
  const range = `${base}..${target}`;
  const facts = files.map((file) => {
    const blob = read(file);
    const where = blob ? conflictRanges(blob).join(', ') : '';
    return `- ${file}${where ? `:${where}` : ''} · ${target}: ${subject(range, file)} · ours: ${subject(`${base}..HEAD`, file)}`;
  });
  return (
    `Rebase onto ${target} was NOT applied (${files.length} conflicting file(s)); the working tree is unchanged.\n` +
    `${facts.join('\n')}\n${INSTRUCTION}`
  );
}

function main(input) {
  const command = input.tool_input?.command ?? '';
  // Quoted text is data, not a command (same rule as readonly-bash.mjs).
  if (!COMMIT.test(command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''"))) return;
  if (input.cwd) cwd = input.cwd;

  if (gitPathExists('rebase-merge') || gitPathExists('rebase-apply')) return;

  const branch = git(['symbolic-ref', '-q', '--short', 'HEAD'], { allowFail: true });
  if (!branch) return emit(null, null, 'rebase-before-commit skipped: detached HEAD.');

  const def = defaultBranch();
  const target = `origin/${def}`;
  if (git(['fetch', 'origin', def], { allowFail: true, timeout: FETCH_TIMEOUT_MS }) === null) {
    return emit(null, null, `rebase-before-commit: could not fetch origin/${def} (offline?); committing without a rebase.`);
  }
  if (git(['rev-parse', '--verify', '-q', target], { allowFail: true }) === null) return;
  if (git(['merge-base', '--is-ancestor', target, 'HEAD'], { allowFail: true }) !== null) return;

  const base = git(['merge-base', target, 'HEAD']);
  const before = git(['rev-parse', 'HEAD']);

  // Dry run: exit 1 = conflicts; stdout = tree oid, then conflicted paths.
  let probe;
  try {
    probe = { code: 0, out: git(['merge-tree', '--write-tree', '--name-only', '--no-messages', 'HEAD', target]) };
  } catch (err) {
    probe = { code: err.status, out: String(err.stdout ?? '').trimEnd() };
  }
  if (probe.code === 1) {
    const [treeOid, ...files] = lines(probe.out);
    const read = (f) => git(['show', `${treeOid}:${f}`], { allowFail: true });
    return emit('deny', conflictReport({ target, files, read, base }));
  }

  // Partial stages can't survive an autostash round trip: stop and say so.
  const staged = lines(git(['diff', '--cached', '--name-only']));
  const unstaged = new Set(lines(git(['diff', '--name-only'])));
  const partial = staged.filter((f) => unstaged.has(f));
  if (partial.length) {
    return emit(
      'deny',
      `Branch is behind ${target} but ${partial.join(', ')} is only partly staged, so an automatic rebase would lose the staging. ` +
        `Commit or stash those files deliberately, run \`git rebase ${target}\`, then commit again.`,
    );
  }

  const dirty = git(['status', '--porcelain', '--untracked-files=no']) !== '';
  const ahead = Number(git(['rev-list', '--count', `${target}..HEAD`]));
  try {
    git(['rebase', ...(dirty ? ['--autostash'] : []), target]);
  } catch {
    const files = lines(git(['diff', '--name-only', '--diff-filter=U'], { allowFail: true }));
    // Marker ranges live in the worktree files: read them BEFORE aborting.
    const text = new Map(files.map((f) => [f, readFileSync(resolve(cwd, f), 'utf8')]));
    git(['rebase', '--abort'], { allowFail: true });
    return emit('deny', conflictReport({ target, files: files.length ? files : ['(unknown)'], read: (f) => text.get(f) ?? null, base }));
  }

  // `rebase --autostash` exits 0 even when re-applying the stash conflicts.
  const stashConflicts = lines(git(['diff', '--name-only', '--diff-filter=U']));
  if (stashConflicts.length) {
    return emit(
      'deny',
      `Rebased onto ${target}, but re-applying your uncommitted changes conflicted in: ${stashConflicts.join(', ')}. ` +
        `They are still saved in \`git stash list\`; ${INSTRUCTION}`,
    );
  }
  if (staged.length) git(['add', '-A', '--', ...staged], { allowFail: true });

  const after = git(['rev-parse', 'HEAD']);
  const pushed = git(['rev-parse', '--verify', '-q', `origin/${branch}`], { allowFail: true }) !== null;
  emit(
    null,
    null,
    `rebase-before-commit: rebased ${ahead} commit(s) of ${branch} onto ${target} (${before.slice(0, 7)} -> ${after.slice(0, 7)}; ` +
      `pre-rebase HEAD stays in \`git reflog\`). Earlier review results are stale: the diff changed.` +
      (pushed ? ` ${branch} exists on origin, so the next push needs --force-with-lease.` : ''),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input = {};
    try {
      input = JSON.parse(raw);
    } catch {}
    try {
      main(input);
    } catch (err) {
      // Fail open: a broken hook must never block committing.
      emit(null, null, `rebase-before-commit hook error (commit not blocked): ${err.message}`);
    }
  });
}
