#!/usr/bin/env node
// PreToolUse hook (Bash) for the read-only subagents, wired in each agent's
// frontmatter as `readonly-allowlist.mjs <profile>`. An ALLOWLIST, not a
// denylist: every segment of the command (split on `|`, `&&`, `||`, `;`,
// `&`) must match a rule of the agent's profile, or the whole command is
// denied. Quoted text is data (separators and `>` inside quotes do not count).
//
// Profiles (the agent file's Bash table must match — change both together):
//   read          brainstorm, investigator, researcher, implementation-planner,
//                 insight-curator — git/file/search reads, docker ps, read-only SQL
//   architecture  architecture-reviewer — staged diff only + arch:check
//   security      security-reviewer — read + typecheck/arch:check
//   verify        plan-verifier — read + the project's test/typecheck/arch checks
//
//   stdin = Claude Code PreToolUse JSON; argv[2] = profile.
//   Prints a deny decision or nothing.

const noOutput = (s) => !/--output\b/.test(s);
const r = (cmd, ok, why) => ({ cmd, ok, why });

// Reading files and searching — shared by every profile.
const FILES = [
  r(/^(cat|head|tail|wc)\b/),
  r(/^sed\b/, (s) => /^sed -n '?\d+(,\d+|,\$)?p'?(\s|$)/.test(s), "only `sed -n '<a>,<b>p' <file>`"),
  r(/^rg\b/, (s) => !/--pre\b/.test(s), '`rg --pre` runs a program'),
  r(/^ls\b/),
  r(/^find\b/, (s) => !/\s-(exec|execdir|ok|okdir|delete|fprint0?|fprintf|fls)\b/.test(s), '`find` may not execute, delete or write'),
  r(/^diff\b/),
  r(/^jq\b/),
  r(/^(sort|uniq|cut|tr|column)\b/),
  r(/^cd \S+$/),
];

// git history and any diff (not only staged).
const GIT_READ = [
  r(/^git (status|blame|ls-files|rev-parse|merge-base|shortlog)\b/),
  r(/^git (log|show|diff)\b/, noOutput, '--output writes a file'),
  r(/^git (worktree list|submodule status|stash list|branch --show-current|remote -v)\b/),
  r(/^git config --get\b/),
  r(/^git symbolic-ref refs\/remotes\/origin\/HEAD$/),
];

// Read-only SQL against the dev DB: `\d…`, SELECT, WITH, EXPLAIN, SHOW — one statement.
const SQL_READ = /^\s*(\\d\S*|select|with|explain|show)\b[^;]*;?\s*$/i;
const DB_READ = [
  r(/^docker ps\b/),
  r(
    /^docker exec (-i )?devdigest-postgres psql\b/,
    (s) => {
      const m = /\s-c\s+(?:'([^']*)'|"((?:\\.|[^"\\])*)")/.exec(s);
      return !!m && SQL_READ.test(m[1] ?? m[2]);
    },
    'only a single read-only statement (`\\d…`, SELECT, WITH, EXPLAIN, SHOW) via `-c`',
  ),
];

const ARCH_CHECK = [
  r(/^pnpm (run )?arch:check$/),
  r(/^(\.\/)?node_modules\/\.bin\/depcruise\b/, (s) => !/--output-to\b/.test(s), '--output-to writes a file'),
];

const CHECKS = [
  ...ARCH_CHECK,
  r(/^pnpm (run )?(test|typecheck|lint)\b/),
  r(/^pnpm (exec )?vitest run\b/),
  r(/^npm (test|run (test|typecheck|lint))\b/),
  r(/^node --test\b/),
  r(/^(\.\/)?node_modules\/\.bin\/vitest run\b/),
  r(/^(\.\/)?node_modules\/\.bin\/tsc\b/, (s) => /--noEmit\b/.test(s), '`tsc` only with --noEmit'),
];

export const PROFILES = {
  read: [...FILES, ...GIT_READ, ...DB_READ, r(/^date\b/, (s) => !/\s-s\b|--set\b/.test(s), 'date may not set the clock')],
  architecture: [
    ...FILES,
    r(/^git diff\b/, (s) => /(^|\s)--(cached|staged)\b/.test(s) && noOutput(s), '`git diff` must be `--cached` (staged only) and must not use --output'),
    r(/^git status\b/),
    r(/^git (log|show)\b/, noOutput, '--output writes a file'),
    r(/^git (blame|ls-files)\b/),
    ...ARCH_CHECK,
  ],
  security: [
    ...FILES,
    ...GIT_READ,
    ...DB_READ,
    ...ARCH_CHECK,
    r(/^pnpm (run )?typecheck$/),
  ],
  verify: [...FILES, ...GIT_READ, ...DB_READ, ...CHECKS],
};

// Secrets are never read, whatever the command.
const SECRET = /(~|\$HOME)\/\.devdigest\b|(^|[\s/])\.devdigest\/(?!self-review\b)|\bsecrets\.json\b|(^|[\s/'"])\.env(?!\.example\b)(\.[\w-]+)?\b/;

/** Blank quoted spans (same length) so separators and `>` inside them are data. */
function maskQuotes(command) {
  return command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, (m) => m[0] + 'x'.repeat(m.length - 2) + m[0]);
}

const STREAM_MERGE = /\d?>&\d/g;
const DEV_NULL = /\d?>\s*\/dev\/null/g;

export function evaluate(command, profile) {
  const rules = PROFILES[profile];
  if (!rules) return `unknown allowlist profile "${profile}"`;
  const raw = (command ?? '').replace(/\\\r?\n\s*/g, ' ').trim();
  if (!raw) return null;
  if (SECRET.test(raw.replace(/['"]/g, ''))) return 'reading secrets (`~/.devdigest`, `secrets.json`, `.env`) is not allowed';

  const masked = maskQuotes(raw).replace(STREAM_MERGE, (m) => ' '.repeat(m.length));
  if (/\$\(|`|<\(|>\(/.test(masked)) return 'command substitution is not allowed';
  if (/>/.test(masked.replace(DEV_NULL, ''))) return 'output redirection (`>`, `>>`) is not allowed';

  const segments = [];
  let start = 0;
  const sep = /\|\||&&|[|;&]/g;
  let m;
  while ((m = sep.exec(masked))) {
    segments.push(raw.slice(start, m.index));
    start = m.index + m[0].length;
  }
  segments.push(raw.slice(start));

  for (const seg of segments.map((s) => s.trim()).filter(Boolean)) {
    const plain = seg.replace(STREAM_MERGE, '').replace(DEV_NULL, '').trim();
    const rule = rules.find((x) => x.cmd.test(plain));
    if (!rule) return `\`${plain.split(/\s+/).slice(0, 2).join(' ')}\` is not on the ${profile} allowlist`;
    if (rule.ok && !rule.ok(plain)) return rule.why;
  }
  return null;
}

export function main(input, profile) {
  const reason = evaluate(input.tool_input?.command, profile);
  if (!reason) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `This agent runs read commands only: ${reason}. Stop and name it under *Could not establish* — do not work around it.`,
      },
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const profile = process.argv[2];
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input = {};
    try {
      input = JSON.parse(raw);
    } catch {}
    main(input, profile);
  });
}
