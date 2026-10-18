#!/usr/bin/env node
// Deterministic lint for a feature spec `specs/spec-NNNN-<slug>.md`: the
// mechanical half of spec-creator's final self-check (template, IDs, tags,
// priorities, vague words, traceability, decisions, design frames). Judgement
// items — is the AC the right one, is the contract named — stay in the
// self-check; this only catches what a regex can.
//
//   node scripts/lint.mjs specs/spec-0001-x.md
//     -> prints errors/warnings; exit 0 clean, 1 on any error, 2 on usage
//   stdin = Claude Code PostToolUse JSON with --hook
//     -> lints only when the written file is a spec; on errors prints a
//        `decision: block` so the agent sees them and fixes the file.

import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The project being specified (the script itself lives in the plugin cache).
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Module tags: `specs/modules.json` ({ "modules": ["api", "web"] }) when the
// project has one; otherwise any kebab-case name. Tests are never a module.
const TAG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NOT_MODULES = ['e2e', 'test', 'tests'];

export function allowedTags(root = ROOT) {
  try {
    const { modules } = JSON.parse(readFileSync(join(root, 'specs/modules.json'), 'utf8'));
    if (Array.isArray(modules) && modules.length) return modules;
  } catch {}
  return null;
}

function tagProblem(tag, allowed) {
  if (NOT_MODULES.includes(tag)) return `unknown tag "${tag}" (tests are not a module)`;
  if (allowed) return allowed.includes(tag) ? null : `unknown tag "${tag}" (allowed: ${allowed.join(', ')})`;
  return TAG_RE.test(tag) ? null : `unknown tag "${tag}" (use a kebab-case module name)`;
}
export const PRIORITIES = ['must', 'should'];
const STATUSES = ['draft', 'approved', 'implemented'];

// Required sections in order; `optional` ones may be missing.
export const SECTIONS = [
  { name: 'Problem and user' },
  { name: 'Goals / Non-goals' },
  { name: 'User stories', optional: true },
  { name: 'Acceptance criteria (EARS)', ids: 'AC' },
  { name: 'Edge cases', ids: 'EC' },
  { name: 'Non-functional requirements', ids: 'NFR' },
  { name: 'Examples' },
  { name: 'Traceability and verification' },
  { name: 'Decisions' },
  { name: 'Inputs and provenance' },
  { name: 'Untrusted inputs' },
  { name: 'Open questions' },
];

// Words that make a requirement untestable: each one names a quality without
// a threshold a test could check ("fast" — how fast?). Matched as whole
// words/phrases outside code spans. Deliberately short: a word that also has a
// precise use here ("slow network", "simple mode") is left out to avoid false
// errors; the self-check catches the rest.
export const VAGUE = [
  'fast', 'quickly', 'properly', 'correctly', 'user-friendly', 'intuitive',
  'nice', 'easy', 'easily', 'seamless', 'seamlessly', 'robust',
  'should work', 'as needed', 'as appropriate', 'appropriate', 'reasonable',
  'efficient', 'efficiently', 'etc',
];

const REQ = /^- \*\*(AC|EC|NFR)-(\d+)\*\* `\[([^\]]*)\]` `([a-z]+)` (.+)$/;
const DECISION = /^- \*\*D-(\d+)\*\* \S/;

function splitSections(lines) {
  const found = [];
  lines.forEach((line, i) => {
    const m = /^## (.+?)\s*$/.exec(line);
    if (m) found.push({ name: m[1], start: i });
  });
  return found.map((s, k) => ({
    ...s,
    body: lines.slice(s.start + 1, k + 1 < found.length ? found[k + 1].start : lines.length),
  }));
}

function header(lines, key) {
  const line = lines.find((l) => l.startsWith(`${key}:`));
  return line === undefined ? undefined : line.slice(key.length + 1).trim();
}

function isNone(body) {
  return body.filter((l) => l.trim()).every((l) => /^none\.?$/i.test(l.trim()));
}

/** Lint spec text. `path` is repo-relative or absolute; returns { errors, warnings }. */
export function lintSpec(text, path = '') {
  const allowed = allowedTags();
  const errors = [];
  const warnings = [];
  const lines = text.split(/\r?\n/);

  // --- file name and header ---
  const file = basename(path);
  const fileNo = /^spec-(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.exec(file)?.[1];
  if (path && !fileNo) errors.push(`file name "${file}" is not spec-NNNN-<kebab-slug>.md`);
  if (!/^# Spec: \S/.test(lines[0] ?? '')) errors.push('first line must be "# Spec: <feature name>"');

  const specId = header(lines, 'Spec ID');
  if (!specId || !/^SPEC-\d{4}$/.test(specId)) errors.push('header "Spec ID: SPEC-NNNN" missing or malformed');
  else if (fileNo && specId !== `SPEC-${fileNo}`) errors.push(`Spec ID ${specId} does not match file number ${fileNo}`);

  const status = header(lines, 'Status');
  if (!STATUSES.includes(status)) errors.push(`header "Status:" must be one of ${STATUSES.join(' | ')}`);
  for (const key of ['Supersedes', 'Modules', 'Design']) {
    if (header(lines, key) === undefined) errors.push(`header "${key}:" missing`);
  }
  if (status === 'approved' && text.includes('[NEEDS CLARIFICATION]')) {
    errors.push('Status is approved but [NEEDS CLARIFICATION] items remain');
  }

  // --- sections and order ---
  const sections = splitSections(lines);
  const byName = new Map(sections.map((s) => [s.name, s]));
  let last = -1;
  for (const spec of SECTIONS) {
    const s = byName.get(spec.name);
    if (!s) {
      if (!spec.optional) errors.push(`section "## ${spec.name}" missing`);
      continue;
    }
    if (s.start < last) errors.push(`section "## ${spec.name}" is out of order`);
    last = s.start;
  }
  const known = new Set(SECTIONS.map((s) => s.name));
  for (const s of sections) if (!known.has(s.name)) warnings.push(`unexpected section "## ${s.name}"`);

  // --- requirements: AC / EC / NFR ---
  const ids = new Map(); // "AC-1" -> { tags, priority, text }
  const usedTags = new Set();
  for (const spec of SECTIONS.filter((x) => x.ids)) {
    const s = byName.get(spec.name);
    if (!s) continue;
    let expected = 1;
    for (const line of s.body) {
      if (!line.startsWith('- ')) continue;
      const m = REQ.exec(line);
      if (!m) {
        errors.push(`${spec.name}: item is not "- **${spec.ids}-n** \`[tags]\` \`must|should\` <text>": ${line.slice(0, 80)}`);
        continue;
      }
      const [, kind, num, tagList, priority, body] = m;
      const id = `${kind}-${num}`;
      if (kind !== spec.ids) errors.push(`${id} is listed under "${spec.name}", which holds ${spec.ids}-n`);
      if (ids.has(id)) errors.push(`${id} is defined twice`);
      if (Number(num) !== expected) errors.push(`${id} breaks the sequence (expected ${spec.ids}-${expected})`);
      expected = Number(num) + 1;

      const tags = tagList.split(',').map((t) => t.trim()).filter(Boolean);
      if (!tags.length) errors.push(`${id} has no module tag`);
      for (const t of tags) {
        const problem = tagProblem(t, allowed);
        if (problem) errors.push(`${id} has ${problem}`);
        usedTags.add(t);
      }
      if (!PRIORITIES.includes(priority)) errors.push(`${id} priority "${priority}" is not must | should`);

      if (kind !== 'EC' && !/\bshall\b/.test(body)) errors.push(`${id} has no "shall" (EARS)`);
      if (/^IF\b/.test(body) && !/\bTHEN\b/.test(body)) errors.push(`${id} starts with IF but has no THEN`);
      const low = body.toLowerCase().replace(/`[^`]*`/g, '');
      for (const word of VAGUE) {
        if (new RegExp(`(^|[^a-z-])${word.replace(/[-]/g, '\\-')}([^a-z-]|$)`).test(low)) {
          errors.push(`${id} uses the untestable word "${word}"`);
        }
      }
      ids.set(id, { tags, priority, body });
    }
    if (expected === 1 && spec.ids === 'AC') errors.push('no acceptance criteria (AC-1 …)');
  }

  // --- Modules header == union of tags, owner first ---
  const modules = header(lines, 'Modules');
  if (modules !== undefined) {
    const parts = modules.split(',').map((p) => p.trim()).filter(Boolean);
    const names = parts.map((p) => p.replace(/\s*\(owner\)\s*$/, ''));
    if (!/\(owner\)$/.test(parts[0] ?? '')) errors.push('Modules: the first module must be marked "(owner)"');
    for (const n of names) if (!usedTags.has(n)) errors.push(`Modules: "${n}" is listed but no requirement is tagged with it`);
    for (const t of usedTags) if (!names.includes(t)) errors.push(`Modules: tag "${t}" is used but missing from the header`);
  }

  // --- Decisions ---
  const decisions = new Set();
  const dec = byName.get('Decisions');
  if (dec && !isNone(dec.body)) {
    let expected = 1;
    for (const line of dec.body) {
      if (!line.startsWith('- ')) continue;
      const m = DECISION.exec(line);
      if (!m) {
        errors.push(`Decisions: item is not "- **D-n** <question> → <answer>": ${line.slice(0, 80)}`);
        continue;
      }
      if (Number(m[1]) !== expected) errors.push(`D-${m[1]} breaks the sequence (expected D-${expected})`);
      expected = Number(m[1]) + 1;
      decisions.add(`D-${m[1]}`);
    }
  }

  // --- Traceability: one row per requirement, source + hint filled ---
  const trace = byName.get('Traceability and verification');
  if (trace) {
    const traced = new Set();
    for (const line of trace.body) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.length < 3 || /^-+$/.test(cells[0]) || cells[0] === 'ID') continue;
      const [id, source, hint] = cells;
      if (!ids.has(id)) {
        errors.push(`Traceability: row "${id}" is not a defined AC/EC/NFR`);
        continue;
      }
      traced.add(id);
      if (!source) errors.push(`Traceability: ${id} has no source`);
      if (!hint) errors.push(`Traceability: ${id} has no verification hint`);
      for (const d of source.match(/\bD-\d+\b/g) ?? []) {
        if (!decisions.has(d)) errors.push(`Traceability: ${id} cites ${d}, which is not in Decisions`);
      }
    }
    for (const id of ids.keys()) if (!traced.has(id)) errors.push(`Traceability: ${id} has no row`);
  }

  // --- Examples: only reference defined ACs ---
  const ex = byName.get('Examples');
  if (ex && !isNone(ex.body)) {
    for (const line of ex.body) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.length < 2 || /^-+$/.test(cells[0]) || cells[0] === 'ID') continue;
      if (!ids.has(cells[0])) errors.push(`Examples: row "${cells[0]}" is not a defined AC/EC/NFR`);
    }
  }

  // --- Design frames exist ---
  const design = header(lines, 'Design') ?? '';
  for (const img of design.match(/specs\/images\/[^\s,`)]+\.png/g) ?? []) {
    if (!existsSync(join(ROOT, img))) errors.push(`Design: ${img} does not exist`);
  }
  if (/figma\.com|https?:\/\//i.test(design) && !/specs\/images\//.test(design)) {
    errors.push('Design: a link alone is not enough — save the frames to specs/images/spec-NNNN/ and list them');
  }

  return { errors, warnings };
}

function format(path, { errors, warnings }) {
  const out = [];
  for (const e of errors) out.push(`error: ${e}`);
  for (const w of warnings) out.push(`warning: ${w}`);
  return `${path}: ${errors.length} error(s), ${warnings.length} warning(s)\n${out.join('\n')}`.trim();
}

function lintFile(path) {
  const abs = resolve(ROOT, path);
  if (!existsSync(abs)) {
    // Report it like any other lint error instead of a stack trace, so the
    // agent sees what to fix (usually a typo in the NNNN or the slug).
    return { errors: [`file not found: ${path} (run \`ls specs/spec-*.md\` for the real names)`], warnings: [] };
  }
  return lintSpec(readFileSync(abs, 'utf8'), abs);
}

function isSpecPath(p) {
  return /(^|\/)specs\/spec-[^/]*\.md$/.test(p ?? '');
}

/** PostToolUse handler: lints a written spec and blocks with its errors. */
export function hook(input) {
  const path = input.tool_input?.file_path;
  if (!isSpecPath(path) || !existsSync(path)) return;
  const result = lintFile(path);
  if (!result.errors.length) return;
  process.stdout.write(
    JSON.stringify({ decision: 'block', reason: `Spec lint failed — fix these before continuing:\n${format(path, result)}` }),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  if (process.argv[2] === '--hook') {
    let raw = '';
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => {
      let input = {};
      try {
        input = JSON.parse(raw);
      } catch {}
      hook(input);
    });
  } else {
    const paths = process.argv.slice(2);
    if (!paths.length) {
      console.error('usage: lint.mjs <specs/spec-NNNN-slug.md>… | --hook');
      process.exit(2);
    }
    let failed = false;
    for (const p of paths) {
      const result = lintFile(p);
      console.log(format(p, result));
      if (result.errors.length) failed = true;
    }
    process.exit(failed ? 1 : 0);
  }
}
