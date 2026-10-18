#!/usr/bin/env node
// PreToolUse hook (Bash) for the read-only subagents (architecture-reviewer,
// plan-verifier, brainstorm, investigator, insight-curator): denies anything
// that writes, installs, migrates, fetches the network, reads secrets, or
// commits/pushes. Everything not matched is allowed by default — this is the
// same shape as rebase-before-commit.mjs, scoped to "is this command read-only", not to a
// specific git ref or diff.
//
//   stdin = Claude Code PreToolUse JSON; prints a deny decision or nothing.
//
// Quoted text is data, not a command (same rule as
// rebase-before-commit.mjs): a command like `rg "git push" docs/` or a commit
// message that mentions `rm -rf` must not trip the gate.
//
// That holds for command WORDS only. A quoted *path* is still the file being
// opened -- `cat "$HOME/.devdigest/secrets.json"` reads the same secrets as the
// unquoted form -- so path rules match on a form with the quote characters
// removed but their contents kept. That deliberately over-denies a command that
// merely mentions a gated path as text (`rg "\.env" docs/`): for a read-only
// agent a false deny costs one reported command, a false allow costs the keys.
//
// Fix strategy behind every rule below (the generalisable lesson from the
// third self-review pass): enumerate the mutating *subcommand*
// (`worktree add`, never bare `worktree`), allowlist the *runner* (`npx`,
// `pnpm dlx`) instead of inspecting its payload, and never enumerate a binary
// NAME that a tracked file could also be called (`eval`, `install`, `touch`)
// unless the match is anchored to command POSITION, not to any whitespace —
// "whitelist, not blacklist" (`security/SKILL.md:171`), fail-closed (`:161`).
//
// Accepted limits (see `.claude/agents/README.md` "Known limits"): a shell
// variable indirection (`RM=rm; $RM x`) defeats name matching entirely — that
// needs variable tracking this hook does not do; a tracked `node <script>`
// (no `-e`/`-c`/`-p`) can still be run, since an arbitrary script's contents
// are opaque to a command-text gate.

// scope: 'command' -> matched with quoted spans blanked (words are commands)
//        'path'    -> matched with quote characters unwrapped (paths are files)
const RULE = (pattern, reason, scope = 'command') => ({ pattern, reason, scope });

// Command-position boundary: start of string, or right after `;` `&&` `||`
// `|` `(` `` ` `` `{`, or one of the shell keywords `then`/`do`/`else`/`elif`
// — deliberately NOT plain whitespace. The old boundary treated any single
// space as a valid command start, so a name-only rule (`eval`, `rm`, `mkdir`,
// …) matched that word anywhere it appeared after a space, including deep in
// an ARGUMENT (`cat server/src/db/schema/eval.ts`, `cat docs/install.md`) —
// the sweep test below found exactly four tracked files it broke this way.
// After the separator, walk through `sudo`/`env`/`time`/`nice`/`nohup`/
// `command`/`exec`/`builtin` (with their own flags or `VAR=val` prefixes) and
// an optional directory prefix (`/bin/rm`, `./node_modules/.bin/x`) before
// landing on the actual command word.
const SEP = '(?:^|;|&&|\\|\\||\\||\\(|`|\\{|\\bthen\\b|\\bdo\\b|\\belse\\b|\\belif\\b)';
const PREFIX =
  '(?:(?:sudo|env|time|nice|nohup|command|exec|builtin)\\b(?:\\s+(?:-\\S+|[A-Za-z_]\\w*=\\S+))*\\s+)*';
const CMD = SEP + '\\s*' + PREFIX + '(?:[\\w./-]*/)?';
const re = (body, flags) => new RegExp(CMD + body, flags);

const DENY_RULES = [
  RULE(
    re(
      String.raw`git\s+(?:(?:-C|-c)\s+\S+\s+|--[\w-]+(?:=\S+)?\s+)*(?:commit|push|reset|checkout|switch|restore|clean|rebase|cherry-pick|apply|am|revert|update-ref|filter-branch|gc)\b`,
    ),
    'mutating git command (commit/push/reset/checkout/switch/restore/clean/rebase/cherry-pick/apply/am/revert/update-ref/filter-branch/gc)',
  ),
  RULE(re(String.raw`gh\s+pr\b`), '`gh pr *`'),
  RULE(re(String.raw`git\s+branch\s+(?:-\S+\s+)*-[dDmMf]`), '`git branch -d/-D/-m/-f`'),
  // `git config <key> <value>` writes; a bare key or a --get/--list/-l form
  // reads. Detect a write by an explicit write flag OR a key immediately
  // followed by a second, non-flag token (the value) — `git config
  // --global user.name x` is the value form with `--global` skipped as a
  // generic flag on the way there.
  RULE(
    re(
      String.raw`git\s+config\b(?:(?:\s+--\S+)*\s+(?!-)[\w.-]+\s+[^\s;&|-]\S*|[^;&|]*(?:--(?:add|unset(?:-all)?|replace-all|rename-section|remove-section|edit)\b|\s-e\b))`,
    ),
    '`git config` (write)',
  ),
  // `worktree`/`submodule`/`stash` split out of the mutating-command list
  // above: only their mutating subcommands are denied, so `… list`/`…
  // status`/`… show` stay readable.
  RULE(re(String.raw`git\s+worktree\s+(?:add|remove|move|prune|lock|unlock|repair)\b`), '`git worktree` (mutating)'),
  RULE(
    re(String.raw`git\s+submodule\s+(?:add|update|init|deinit|set-url|set-branch|sync|foreach)\b`),
    '`git submodule` (mutating)',
  ),
  // Every `git stash` subcommand mutates except `list`/`show` — including
  // the bare form, which stashes. Deny by default within `stash` rather
  // than enumerate (`push`/`pop`/`apply`/`drop`/`clear`/`save`/`create`/
  // `store`/`branch`, …) so an unlisted future subcommand still fails closed.
  RULE(re(String.raw`git\s+stash\b(?!\s+(?:list|show)\b)`), '`git stash` (mutating, including the bare form)'),
  RULE(re(String.raw`rm\b`), '`rm`'),
  RULE(re(String.raw`mv\b`), '`mv` (into the repo)'),
  RULE(re(String.raw`cp\b`), '`cp` (into the repo)'),
  // A shell wrapper re-enables every rule below in one hop, and its payload is
  // usually quoted, so it is invisible to the rules themselves. `-c` may sit
  // inside a short-flag cluster (`-lc`, `-ic`, `-xc`) or arrive as
  // `--command`.
  RULE(
    re(String.raw`(?:ba|z|k|d)?sh\s+(?:-\S+\s+)*(?:-[A-Za-z]*c[A-Za-z]*\b|--command\b(?:=\S*)?)`),
    '`sh -c`/`bash -c` (wraps a denied command)',
  ),
  // Running a shell against a script FILE is the same hop as `-c`:
  // `scripts/dev.sh` runs `pnpm install`/`npm ci`/`pnpm db:migrate`/
  // `pnpm db:seed` (`scripts/dev.sh:79,86,90,94`). Deny the shell-plus-script
  // form and the script executed directly; `cat`/`rg` reading the file is an
  // argument, not a command word, so it stays allowed.
  RULE(
    re(String.raw`(?:ba|z|k|d)?sh\s+(?:-\S+\s+)*[\w./-]*\.(?:sh|bash|zsh)\b`),
    'running a shell script (`bash script.sh`)',
  ),
  RULE(re(String.raw`[\w-]+\.(?:sh|bash|zsh)\b`), 'executing a shell script (`*.sh`/`*.bash`/`*.zsh`) directly'),
  RULE(re(String.raw`source\b`), '`source` (sourcing a script)'),
  RULE(/\|\s*(?:[\w.\/-]*\/)?(?:ba|z|k|d)?sh\b/, 'piping into a shell'),
  RULE(re(String.raw`eval\b`), '`eval`'),
  // An inline interpreter script is an arbitrary program, not a read. `-p`
  // may also sit in a short cluster; `--eval`/`--print`/`--command`/`--exec`
  // arrive bare or `=`-attached. The negative lookbehind on the cluster
  // keeps `node --test` (this task's own Verify command) out of it — the
  // second `-` of `--test` never starts a bare short cluster.
  RULE(
    re(
      String.raw`(?:node|python3?|perl|ruby|deno|bun)\s+(?:-\S+\s+)*(?:(?<!-)-[A-Za-z]*[ecp][A-Za-z]*\b|--(?:eval|print|command|exec)\b(?:=\S*)?)`,
    ),
    'inline interpreter script (`-e`/`-c`/`-p`/`--eval`/`--print`/`--command`/`--exec`)',
  ),
  RULE(/\bfind\b[^;&|]*\s-(?:delete|exec|execdir)\b/, '`find -delete`/`-exec`'),
  RULE(re(String.raw`(?:truncate|dd|ln|chmod|chown|shred|install|mkdir|rmdir|touch)\b`), 'file-mutating utility'),
  RULE(re(String.raw`xargs\b`), '`xargs` (runs an arbitrary command)'),
  RULE(/\bsed\s+(?:-\S*\s+)*-i\b|\bsed\s+-\S*i\S*\b/, '`sed -i` (in-place edit)'),
  // `>`/`>>` anywhere, including `echo x>f` and `2>f`, but not `2>&1`, `>=`, `->`.
  RULE(/(?<![-=<>])>{1,2}(?!=)\s*(?!&)/, 'shell redirection (`>`/`>>`)'),
  RULE(re(String.raw`tee\b`), '`tee`'),
  RULE(/\b(?:npm|pnpm)\s+(?:install|i|add|remove|rm|uninstall|update|up)\b/, 'package install/add/remove/update'),
  // Runners are allowlisted by NAME, not by inspecting their payload — the
  // sanctioned alternative for a read-only agent is the direct binary
  // (`./node_modules/.bin/<bin>`, already how `pnpm test`/`vitest`/`tsc`/
  // `depcruise` are run here).
  RULE(re(String.raw`(?:npx|bunx)\b`), 'a package runner (npx/bunx) — use `./node_modules/.bin/<bin>` instead'),
  RULE(
    re(String.raw`(?:pnpm|npm|yarn)\s+(?:dlx|exec)\b`),
    'a package runner (pnpm/npm/yarn dlx|exec) — use `./node_modules/.bin/<bin>` instead',
  ),
  RULE(re(String.raw`deno\s+run\b`), '`deno run` — use `./node_modules/.bin/<bin>` instead'),
  RULE(re(String.raw`bun\s+(?:run|x)\b`), '`bun run`/`bun x` — use `./node_modules/.bin/<bin>` instead'),
  RULE(/drizzle-kit\s+generate\b/, '`drizzle-kit generate`'),
  RULE(/pnpm\s+db:(?:migrate|seed)\b/, '`pnpm db:migrate`/`db:seed`'),
  RULE(/\bdocker\b[^;&|]*\b(?:down|volume\s+rm|prune)\b/, '`docker … down/volume rm/prune`'),
  RULE(re(String.raw`docker\s+rm\b`), '`docker rm`'),
  RULE(re(String.raw`(?:curl|wget)\b`), 'network fetch (curl/wget)'),
  // The whole secrets dir, not just the file, and any HOME-anchored dotfile
  // path even when globbed (`~/.dev*/*.json`, `~/.d*`, `"$HOME"/.dev*`) —
  // `grep -r TOKEN ~/.devdigest/` leaks the same keys without ever naming
  // `secrets.json`. `.devdigest/self-review` (this repo's own run dir, with
  // or without a `~`/`$HOME` prefix) stays readable.
  RULE(
    /(?:~|\$HOME)\/\.(?!devdigest\/self-review\b)[\w.*-]*|\.devdigest\b(?!\/self-review)|\bsecrets\.json\b/,
    'read of `~/.devdigest` (secrets)',
    'path',
  ),
  // Anchor the leading dot to a path segment, or this matches `process.env`.
  // `.env.example` is committed and carries no secrets.
  RULE(/(?<![\w.])\.env(?!\.example\b)(?:\.[A-Za-z0-9_-]+)?\b/, 'read of a `.env` file', 'path'),
];

/** Blank quoted spans so gated words inside them don't trip a command rule. */
function stripQuotes(command) {
  return command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''");
}

/** Remove quote characters but keep their contents, so a quoted path still reads as one. */
function unquotePaths(command) {
  return command.replace(/['"]/g, '');
}

export function evaluate(command) {
  // A backslash line continuation is ordinary formatting, but `\` is not `\s`,
  // so without this every multi-word rule below is defeated by a line break.
  let raw = (command ?? '').replace(/\\\r?\n\s*/g, ' ');
  // A backslash escape immediately before a command word (`\rm`) bypasses a
  // shell alias but still runs the real binary — strip it so the word is
  // still recognised at command position. Only fires right at command
  // position itself (start, or after a separator/keyword), so an escape
  // inside a quoted string (`"line1\nfoo"`) is untouched.
  raw = raw.replace(/(^|[\s;&|(`{])\\(?=[a-zA-Z])/g, '$1');
  const forCommands = stripQuotes(raw);
  const forPaths = unquotePaths(raw);
  for (const { pattern, reason, scope } of DENY_RULES) {
    if (pattern.test(scope === 'path' ? forPaths : forCommands)) {
      return `This agent is read-only: ${reason} is denied. Stop and report it — do not work around it.`;
    }
  }
  return null;
}

function main(input) {
  const command = input.tool_input?.command ?? '';
  const reason = evaluate(command);
  if (!reason) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input = {};
    try {
      input = JSON.parse(raw);
    } catch {}
    main(input);
  });
}
