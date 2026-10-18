// Run: node --test scripts/lint.test.mjs
// Every case mutates the reference example (which must lint clean) in one way
// and checks that exactly that problem is reported.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { lintSpec } from './lint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = readFileSync(join(HERE, '../references/spec-0000-example-onboarding.md'), 'utf8');
const PATH = 'specs/spec-0000-example-onboarding.md';

function errorsFor(text, path = PATH) {
  return lintSpec(text, path).errors;
}
function expectError(text, fragment, path = PATH) {
  const errors = errorsFor(text, path);
  assert.ok(
    errors.some((e) => e.includes(fragment)),
    `expected an error containing "${fragment}", got:\n${errors.join('\n')}`,
  );
}

test('the reference example lints clean', () => {
  assert.deepEqual(lintSpec(EXAMPLE, PATH), { errors: [], warnings: [] });
});

test('file name must be spec-NNNN-<slug>.md and match the Spec ID', () => {
  expectError(EXAMPLE, 'is not spec-NNNN-<kebab-slug>.md', 'specs/SPEC-01-onboarding.md');
  expectError(EXAMPLE, 'does not match file number 0007', 'specs/spec-0007-onboarding.md');
});

test('missing header and bad status', () => {
  expectError(EXAMPLE.replace(/^Supersedes:.*\n/m, ''), 'header "Supersedes:" missing');
  expectError(EXAMPLE.replace('Status: draft', 'Status: done'), 'must be one of');
});

test('approved spec with open clarifications', () => {
  const text = EXAMPLE.replace('Status: draft', 'Status: approved').replace(
    '## Open questions\n\nNone.',
    '## Open questions\n\n- [NEEDS CLARIFICATION] cache size',
  );
  expectError(text, 'approved but [NEEDS CLARIFICATION]');
});

test('missing and out-of-order sections', () => {
  expectError(EXAMPLE.replace('## Examples', '## Samples'), 'section "## Examples" missing');
  const swapped = EXAMPLE.replace('## Decisions', '## TMP').replace('## Inputs and provenance', '## Decisions').replace('## TMP', '## Inputs and provenance');
  expectError(swapped, 'out of order');
});

test('User stories may be omitted', () => {
  const text = EXAMPLE.replace(/## User stories\n[\s\S]*?(?=## Acceptance)/, '');
  assert.deepEqual(errorsFor(text), []);
});

test('requirement line shape, tags, priority', () => {
  expectError(EXAMPLE.replace('- **AC-2** `[server, client]` `must`', '- **AC-2** `[server, client]`'), 'item is not');
  expectError(EXAMPLE.replace('- **AC-5** `[mcp]`', '- **AC-5** `[e2e]`'), 'unknown tag "e2e"');
  expectError(EXAMPLE.replace('- **AC-5** `[mcp]` `should`', '- **AC-5** `[mcp]` `could`'), 'is not must | should');
});

test('ID sequence and duplicates', () => {
  expectError(EXAMPLE.replace('- **AC-3**', '- **AC-4**'), 'breaks the sequence');
  expectError(EXAMPLE.replace('- **EC-1**', '- **AC-9**'), 'is listed under "Edge cases"');
});

test('EARS: shall, IF without THEN', () => {
  expectError(EXAMPLE.replace('the API shall drop that link', 'the API drops that link'), 'AC-3 has no "shall"');
  expectError(EXAMPLE.replace('is not indexed, THEN the', 'is not indexed, the'), 'AC-2 starts with IF but has no THEN');
});

test('vague words are rejected, but not inside code spans', () => {
  expectError(EXAMPLE.replace('shall show a "Stale', 'shall quickly show a "Stale'), 'untestable word "quickly"');
  const inCode = EXAMPLE.replace('The `get_onboarding` tool', 'The `fast` tool');
  assert.deepEqual(errorsFor(inCode), []);
});

test('Modules header must equal the union of tags, owner first', () => {
  expectError(EXAMPLE.replace('Modules: server (owner), repo-intel, client, mcp', 'Modules: server (owner), client, mcp'), 'tag "repo-intel" is used but missing');
  expectError(EXAMPLE.replace('Modules: server (owner), repo-intel, client, mcp', 'Modules: server (owner), repo-intel, client, mcp, reviewer-core'), '"reviewer-core" is listed but no requirement');
  expectError(EXAMPLE.replace('Modules: server (owner),', 'Modules: server,'), 'marked "(owner)"');
});

test('traceability: every requirement has a row with source and hint', () => {
  expectError(EXAMPLE.replace(/^\| NFR-2 \|.*\n/m, ''), 'NFR-2 has no row');
  expectError(EXAMPLE.replace('| AC-2 | D-1 |', '| AC-2 |  |'), 'AC-2 has no source');
  expectError(EXAMPLE.replace('| AC-2 | D-1 |', '| AC-2 | D-9 |'), 'cites D-9');
  expectError(EXAMPLE.replace('| AC-2 | D-1 |', '| AC-8 | D-1 |'), 'row "AC-8" is not a defined');
});

test('examples may only reference defined requirements', () => {
  expectError(EXAMPLE.replace('| AC-3 | indexed tree', '| AC-9 | indexed tree'), 'Examples: row "AC-9"');
});

test('design: a link alone is not enough, listed frames must exist', () => {
  const design = /^Design:.*$/m;
  expectError(EXAMPLE.replace(design, 'Design: https://figma.com/file/abc'), 'a link alone is not enough');
  expectError(EXAMPLE.replace(design, 'Design: specs/images/spec-0000/missing.png'), 'does not exist');
});

test('--hook blocks on a spec with errors and ignores other files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spec-lint-'));
  const bad = join(dir, 'specs', 'spec-0000-example-onboarding.md');
  spawnSync('mkdir', ['-p', join(dir, 'specs')]);
  writeFileSync(bad, EXAMPLE.replace('`[mcp]` `should`', '`[mcp]` `could`'));
  const run = (file_path) =>
    spawnSync('node', [join(HERE, 'lint.mjs'), '--hook'], {
      input: JSON.stringify({ tool_input: { file_path } }),
      encoding: 'utf8',
    }).stdout;
  const out = JSON.parse(run(bad));
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /is not must \| should/);
  assert.equal(run(join(dir, 'notes.md')), '');
});

test('CLI: a missing file is reported as a lint error, not a crash', () => {
  const r = spawnSync('node', [join(HERE, 'lint.mjs'), 'specs/spec-9999-missing.md'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /file not found: specs\/spec-9999-missing\.md/);
});
