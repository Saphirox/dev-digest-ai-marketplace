#!/usr/bin/env node
// PreToolUse hook for the `spec-creator` subagent (wired in its frontmatter):
// makes its write scope mechanical instead of prompt-only.
//
//   Write / Edit -> only `specs/spec-NNNN-<slug>.md` and
//                   `specs/images/spec-NNNN/<frame>.png`; never specs/README.md.
//   Bash         -> read-only (reuses readonly-bash.mjs `evaluate`), plus
//                   exactly two write forms for saving design frames:
//                   `mkdir -p specs/images/spec-NNNN` and
//                   `cp <file> specs/images/spec-NNNN/<frame>.png`.
//                   Paths may be quoted (user attachments live under
//                   `~/Library/Application Support/…`), and segments may be
//                   chained with `&&` after an optional `cd <project root>`;
//                   every other segment still goes through `evaluate`.
//
//   stdin = Claude Code PreToolUse JSON; prints a deny decision or nothing.

import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from './readonly-bash.mjs';

const SPEC = /^specs\/spec-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const FRAME = /^specs\/images\/spec-\d{4}\/[a-z0-9]+(?:-[a-z0-9]+)*\.png$/;
// Unquoted shell syntax that could smuggle a second command into a segment.
const META = /[;|&<>$`(){}\n\\*?]/;

function repoRelative(path, root) {
  const abs = isAbsolute(path) ? path : resolve(root, path);
  return relative(root, abs);
}

export function checkWrite(filePath, root) {
  const rel = repoRelative(filePath ?? '', root);
  if (SPEC.test(rel) || FRAME.test(rel)) return null;
  return `spec-creator may only write specs/spec-NNNN-<slug>.md and specs/images/spec-NNNN/<frame>.png — "${rel}" is outside that scope. Stop and report it.`;
}

// Splits on `&&` outside quotes. Returns null on an unterminated quote.
function splitAnd(cmd) {
  const parts = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      cur += c;
    } else if (c === '&' && cmd[i + 1] === '&') {
      parts.push(cur.trim());
      cur = '';
      i++;
    } else cur += c;
  }
  if (quote) return null;
  parts.push(cur.trim());
  return parts;
}

// Words of a simple command, quotes removed. Returns null if any unquoted
// shell metacharacter appears, or a quoted word holds `$`/backtick expansion.
function words(segment) {
  const out = [];
  const re = /'([^']*)'|"([^"$`\\]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(segment))) {
    if (m[3] !== undefined && (META.test(m[3]) || /['"]/.test(m[3]))) return null;
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out.length ? out : null;
}

// `undefined` = not a write form (fall through to read-only rules),
// `null` = allowed write form, string = deny reason.
function checkWriteForm(segment, root) {
  const w = words(segment);
  if (!w) return undefined;
  if (w[0] === 'cd' && w.length === 2) return resolve(root, w[1]) === resolve(root) ? null : undefined;
  if (w[0] === 'mkdir') {
    return w.length === 3 && w[1] === '-p' && /^specs\/images\/spec-\d{4}$/.test(repoRelative(w[2], root))
      ? null
      : 'spec-creator may only `mkdir -p specs/images/spec-NNNN`. Stop and report it.';
  }
  if (w[0] === 'cp') {
    return w.length === 3 && FRAME.test(repoRelative(w[2], root))
      ? null
      : 'spec-creator may only `cp <screenshot> specs/images/spec-NNNN/<frame>.png`. Stop and report it.';
  }
  return undefined;
}

export function checkBash(command, root) {
  const cmd = (command ?? '').trim();
  const segments = splitAnd(cmd);
  if (!segments || segments.some((s) => !s)) return evaluate(cmd);
  const forms = segments.map((s) => checkWriteForm(s, root));
  if (forms.every((f) => f === undefined)) return evaluate(cmd);
  for (let i = 0; i < segments.length; i++) {
    const reason = forms[i] === undefined ? evaluate(segments[i]) : forms[i];
    if (reason) return reason;
  }
  return null;
}

export function main(input) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const tool = input.tool_name;
  let reason = null;
  if (tool === 'Write' || tool === 'Edit') reason = checkWrite(input.tool_input?.file_path, root);
  else if (tool === 'Bash') reason = checkBash(input.tool_input?.command, root);
  if (!reason) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }),
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
    main(input);
  });
}
