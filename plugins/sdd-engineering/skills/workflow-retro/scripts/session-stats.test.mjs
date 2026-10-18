// Run: node --test scripts/session-stats.test.mjs
// Builds a tiny fake session (main transcript + one subagent) in a temp dir
// and checks the numbers the retro relies on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyze, projectDir, resolveSession, waves } from './session-stats.mjs';

const usage = (input, out) => ({ input_tokens: input, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: out });
const asst = (ts, id, content, u, model = 'claude-opus-5-5') =>
  ({ type: 'assistant', timestamp: ts, message: { id, model, content, usage: u } });
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'retro-'));
  const sub = join(dir, 's1', 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(dir, 's1.jsonl'), jsonl([
    { type: 'user', timestamp: '2026-10-01T10:00:00Z', message: { content: 'earlier work' } },
    asst('2026-10-01T10:00:05Z', 'm0', [{ type: 'text', text: 'hi' }], usage(1, 5)),
    { type: 'user', timestamp: '2026-10-01T11:00:00Z', message: { content: '<command-name>/run-sdd</command-name>' } },
    // one response logged twice (one entry per content block): counted once
    asst('2026-10-01T11:00:01Z', 'm1', [{ type: 'text', text: 'go' }], usage(2, 20)),
    asst('2026-10-01T11:00:01Z', 'm1', [{ type: 'tool_use', id: 'tu1', name: 'Agent', input: { subagent_type: 'implementer', description: 'Wave 1', prompt: 'do it' } }], usage(2, 20)),
    { type: 'user', timestamp: '2026-10-01T11:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'launched' }] } },
    { type: 'queue-operation', timestamp: '2026-10-01T11:05:00Z', content: '<agent-message from="a1">REPORT</agent-message>' },
    { type: 'queue-operation', timestamp: '2026-10-01T11:05:00Z', content: '<task-notification><task-id>a1</task-id><status>completed</status><usage><subagent_tokens>4242</subagent_tokens></usage></task-notification>' },
    { type: 'system', subtype: 'turn_duration', durationMs: 120000, timestamp: '2026-10-01T11:06:00Z' },
  ]));
  writeFileSync(join(sub, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'implementer', description: 'Wave 1', toolUseId: 'tu1', requestShape: 'background' }));
  writeFileSync(join(sub, 'agent-a1.jsonl'), jsonl([
    { type: 'user', timestamp: '2026-10-01T11:00:03Z', message: { content: 'do it' } },
    asst('2026-10-01T11:00:10Z', 'x1', [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/repo/.claude/skills/zod/SKILL.md' } }], usage(3, 1), 'claude-sonnet-5-5'),
    asst('2026-10-01T11:00:10Z', 'x1', [{ type: 'thinking' }], usage(3, 9), 'claude-sonnet-5-5'),
    { type: 'user', timestamp: '2026-10-01T11:00:11Z', message: { content: [{ type: 'tool_result', tool_use_id: 'r1', is_error: true, content: 'PreToolUse hook denied this' }] } },
    asst('2026-10-01T11:04:00Z', 'x2', [{ type: 'text', text: 'done' }], usage(4, 2), 'claude-sonnet-5-5'),
  ]));
  return join(dir, 's1.jsonl');
}

test('dedupes usage per message id and keeps the largest output', () => {
  const r = analyze(fixture());
  assert.equal(r.main.usage.calls, 2);
  assert.equal(r.agents[0].usage.calls, 2);
  assert.equal(r.agents[0].usage.output, 9 + 2);
});

test('joins a subagent to its spawn, hand-back and notification', () => {
  const [a] = analyze(fixture()).agents;
  assert.equal(a.type, 'implementer');
  assert.equal(a.model, 'claude-sonnet-5-5');
  assert.equal(a.reportChars, 'REPORT'.length);
  assert.equal(a.harnessTokens, 4242);
  assert.equal(a.status, 'completed');
  assert.deepEqual(a.skills, ['zod (Read)']);
  assert.equal(a.errors, 1);
  assert.equal(a.blocked, 1);
});

test('--since cmd:<name> starts the window at the last invocation', () => {
  const r = analyze(fixture(), { since: 'cmd:run-sdd' });
  assert.equal(r.since, '2026-10-01T11:00:00Z');
  assert.equal(r.main.usage.calls, 1);
  assert.equal(r.activeMinutes, 2);
  assert.throws(() => analyze(fixture(), { since: 'cmd:nope' }), /no \/nope invocation/);
});

test('overlapping agents share a wave', () => {
  const ws = waves([
    { start: '10:00', end: '10:05' }, { start: '10:01', end: '10:03' }, { start: '10:06', end: '10:07' },
  ]).map((a) => a.wave);
  assert.deepEqual(ws, [1, 1, 2]);
});

test('an unexpanded ${CLAUDE_SESSION_ID} falls back to the newest transcript', () => {
  const path = fixture();
  assert.equal(resolveSession('${CLAUDE_SESSION_ID}', join(path, '..')), path);
  assert.match(projectDir('/a/b.c'), /projects\/-a-b-c$/);
});
