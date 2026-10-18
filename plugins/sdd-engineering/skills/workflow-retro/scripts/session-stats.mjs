#!/usr/bin/env node
// Deterministic numbers for /workflow-retro: reads one Claude Code session
// transcript (~/.claude/projects/<munged cwd>/<session>.jsonl) and its
// subagent transcripts (<session>/subagents/agent-*.jsonl + .meta.json) and
// prints token usage, the agent timeline (with parallel waves), tool calls,
// tool errors and compactions. Judgement — what went well, what to change —
// stays with the model; this only counts.
//
//   node scripts/session-stats.mjs
//     [--session <id|path.jsonl>]   default: newest transcript of this cwd
//     [--since <ISO time | cmd:<name>>]  cmd:run-sdd = from the last /run-sdd
//     [--detail]                    deep mode: errors, repeated reads/commands
//     [--json]                      machine-readable output
//     [--project-dir <dir>]         transcript folder override
//   exit 0 ok, 2 on usage / missing transcript
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export function readJsonl(path) {
  const out = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* torn last line while the session writes */ }
  }
  return out;
}

const blocks = (e) => (Array.isArray(e?.message?.content) ? e.message.content : []);
const textOf = (c) =>
  typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => b?.text ?? '').join('') : '';

// One API response is logged once per content block, so usage repeats:
// count each message.id once, keeping the largest value seen per field.
// Subagent transcripts log usage at stream start, so their output_tokens
// is a LOWER BOUND; the input/cache fields are exact.
export function sumUsage(entries) {
  const byId = new Map();
  for (const e of entries) {
    if (e.type !== 'assistant' || !e.message?.usage) continue;
    const id = e.message.id ?? e.requestId ?? e.uuid;
    const m = e.message.usage, prev = byId.get(id);
    const cur = { input: m.input_tokens ?? 0, cacheWrite: m.cache_creation_input_tokens ?? 0,
      cacheRead: m.cache_read_input_tokens ?? 0, output: m.output_tokens ?? 0, model: e.message.model ?? 'unknown' };
    byId.set(id, prev ? { ...cur, input: Math.max(prev.input, cur.input), cacheWrite: Math.max(prev.cacheWrite, cur.cacheWrite),
      cacheRead: Math.max(prev.cacheRead, cur.cacheRead), output: Math.max(prev.output, cur.output) } : cur);
  }
  const u = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, calls: byId.size, models: {} };
  for (const c of byId.values()) {
    u.input += c.input; u.cacheWrite += c.cacheWrite; u.cacheRead += c.cacheRead; u.output += c.output;
    u.models[c.model] = (u.models[c.model] ?? 0) + 1;
  }
  u.total = u.input + u.cacheWrite + u.cacheRead + u.output;
  u.cacheHit = u.total ? +(u.cacheRead / (u.input + u.cacheWrite + u.cacheRead || 1)).toFixed(2) : 0;
  return u;
}

export function toolStats(entries) {
  const tools = {}, skills = [], reads = [], bash = [], errors = [];
  const names = new Map();
  for (const e of entries) {
    for (const b of blocks(e)) {
      if (e.type === 'assistant' && b.type === 'tool_use') {
        names.set(b.id, b.name);
        tools[b.name] = (tools[b.name] ?? 0) + 1;
        if (b.name === 'Skill') skills.push(b.input?.skill);
        if (b.name === 'Read' && b.input?.file_path) {
          reads.push(b.input.file_path);
          const m = b.input.file_path.match(/skills\/([^/]+)\/SKILL\.md$/);
          if (m) skills.push(`${m[1]} (Read)`);
        }
        if (b.name === 'Bash' && b.input?.command) bash.push(b.input.command);
      }
      if (e.type === 'user' && b.type === 'tool_result' && b.is_error) {
        const text = textOf(b.content).replace(/\s+/g, ' ').trim();
        errors.push({
          tool: names.get(b.tool_use_id) ?? '?',
          blocked: /hook|denied|not allowed|permission/i.test(text),
          text: text.slice(0, 200),
        });
      }
    }
  }
  return { tools, skills, reads, bash, errors };
}

function span(entries) {
  const ts = entries.map((e) => e.timestamp).filter(Boolean).sort();
  return { start: ts[0] ?? null, end: ts.at(-1) ?? null };
}
const minutes = (a, b) => (a && b ? +((Date.parse(b) - Date.parse(a)) / 60000).toFixed(1) : null);

export function sinceFrom(arg, main) {
  if (!arg) return null;
  if (!arg.startsWith('cmd:')) return arg;
  const tag = `<command-name>/${arg.slice(4)}</command-name>`;
  const hits = main.filter((e) => e.type === 'user' && textOf(e.message?.content).includes(tag));
  if (!hits.length) throw new Error(`no /${arg.slice(4)} invocation in this session`);
  return hits.at(-1).timestamp;
}

// The main session receives, per background agent, a <task-notification>
// (harness usage: tokens, tool uses, duration) and an <agent-message> hand-back
// (the final report). Both arrive as queue-operation or user entries.
export function handbacks(entries) {
  const out = new Map();
  const get = (id) => out.get(id) ?? out.set(id, { reportChars: 0 }).get(id);
  for (const e of entries) {
    const text = typeof e.content === 'string' ? e.content : textOf(e.message?.content);
    if (!text) continue;
    for (const m of text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
      const id = m[1].match(/<task-id>([^<]+)<\/task-id>/)?.[1];
      if (!id) continue;
      const h = get(id);
      const num = (tag) => { const v = m[1].match(new RegExp(`<${tag}>(\\d+)</${tag}>`))?.[1]; return v ? +v : undefined; };
      h.harnessTokens = num('subagent_tokens') ?? num('total_tokens') ?? h.harnessTokens;
      h.toolUses = num('tool_uses') ?? h.toolUses;
      h.durationMs = num('duration_ms') ?? h.durationMs;
      h.status = m[1].match(/<status>([^<]+)<\/status>/)?.[1] ?? h.status;
    }
    for (const m of text.matchAll(/<agent-message from="([^"]+)">([\s\S]*?)(?:<\/agent-message>|$)/g)) {
      get(m[1]).reportChars = Math.max(get(m[1]).reportChars, m[2].length);
    }
  }
  return out;
}

// Group agents whose runs overlap in time into one wave.
export function waves(agents) {
  const sorted = [...agents].filter((a) => a.start).sort((a, b) => a.start.localeCompare(b.start));
  let wave = 0, waveEnd = null;
  for (const a of sorted) {
    if (!waveEnd || a.start >= waveEnd) { wave += 1; waveEnd = a.end; }
    else if (a.end > waveEnd) waveEnd = a.end;
    a.wave = wave;
  }
  return sorted;
}

export function analyze(sessionPath, { since = null, detail = false } = {}) {
  const allMain = readJsonl(sessionPath);
  const from = sinceFrom(since, allMain);
  const inWindow = (e) => !from || !e.timestamp || e.timestamp >= from;
  const main = allMain.filter(inWindow);

  const spawns = new Map(); // toolUseId -> spawn info from the main session
  for (const e of main) {
    for (const b of blocks(e)) {
      if (e.type === 'assistant' && b.type === 'tool_use' && b.name === 'Agent') {
        spawns.set(b.id, { at: e.timestamp, type: b.input?.subagent_type ?? 'general-purpose',
          description: b.input?.description ?? '', model: b.input?.model ?? null,
          promptChars: (b.input?.prompt ?? '').length });
      }
    }
  }

  const backs = handbacks(allMain);
  const dir = join(dirname(sessionPath), basename(sessionPath, '.jsonl'), 'subagents');
  const agents = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => /^agent-.*\.jsonl$/.test(n))) {
      const id = f.slice(6, -6);
      const metaPath = join(dir, `agent-${id}.meta.json`);
      const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
      const entries = readJsonl(join(dir, f));
      const { start, end } = span(entries);
      const spawn = spawns.get(meta.toolUseId);
      if (from && !spawn && (!start || start < from)) continue;
      const t = toolStats(entries);
      const hb = backs.get(id) ?? {};
      agents.push({
        id, type: meta.agentType ?? spawn?.type ?? '?', description: meta.description ?? spawn?.description ?? '',
        background: meta.requestShape === 'background', model: entries.find((e) => e.message?.model)?.message.model ?? null,
        start, end, minutes: minutes(start, end), promptChars: spawn?.promptChars ?? null,
        usage: sumUsage(entries), tools: t.tools, toolCalls: Object.values(t.tools).reduce((a, b) => a + b, 0),
        skills: [...new Set(t.skills)], errors: t.errors.length, blocked: t.errors.filter((x) => x.blocked).length,
        reportChars: hb.reportChars ?? 0, harnessTokens: hb.harnessTokens ?? null, status: hb.status ?? null,
        ...(detail ? { errorSamples: t.errors.slice(0, 5), reads: t.reads, bash: t.bash } : {}),
      });
    }
  }
  waves(agents);

  const mt = toolStats(main);
  const mainUsage = sumUsage(main);
  const total = agents.reduce((s, a) => s + a.usage.total, mainUsage.total);
  const { start, end } = span(main);
  const result = {
    session: basename(sessionPath, '.jsonl'), since: from, start, end, wallMinutes: minutes(start, end),
    activeMinutes: +(main.filter((e) => e.subtype === 'turn_duration').reduce((s, e) => s + (e.durationMs ?? 0), 0) / 60000).toFixed(1),
    userPrompts: main.filter((e) => e.type === 'user' && typeof e.message?.content === 'string').length,
    compactions: main.filter((e) => e.type === 'system' && e.subtype === 'compact_boundary').length,
    main: { usage: mainUsage, tools: mt.tools, skills: [...new Set(mt.skills)], errors: mt.errors.length,
      blocked: mt.errors.filter((x) => x.blocked).length, resumes: mt.tools.SendMessage ?? 0 },
    agents: agents.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')),
    totals: { tokens: total, output: agents.reduce((s, a) => s + a.usage.output, mainUsage.output),
      agents: agents.length, byType: agents.reduce((m, a) => ({ ...m, [a.type]: (m[a.type] ?? 0) + 1 }), {}) },
  };
  if (detail) {
    result.main.errorSamples = mt.errors.slice(0, 8);
    result.duplication = duplication([{ id: 'main', reads: mt.reads, bash: mt.bash }, ...agents]);
    for (const a of agents) { delete a.reads; delete a.bash; }
  }
  return result;
}

// Files read by more than one context and commands run 3+ times: the cheap
// signal for "the same information was gathered twice".
export function duplication(contexts, cwd = process.cwd()) {
  const rel = (p) => (p.startsWith(cwd + '/') ? p.slice(cwd.length + 1) : p);
  const readers = new Map(), cmds = new Map();
  for (const c of contexts) {
    for (const p of new Set(c.reads ?? [])) readers.set(rel(p), [...(readers.get(rel(p)) ?? []), c.type ?? c.id]);
    for (const b of c.bash ?? []) cmds.set(b, (cmds.get(b) ?? 0) + 1);
  }
  return {
    filesReadByManyContexts: [...readers].filter(([, r]) => r.length > 1)
      .sort((a, b) => b[1].length - a[1].length).slice(0, 15).map(([path, by]) => ({ path, by })),
    repeatedCommands: [...cmds].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([command, n]) => ({ command: command.slice(0, 160), n })),
  };
}

const tally = (xs) => Object.entries(xs.reduce((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {}))
  .map(([x, n]) => (n > 1 ? `${x} ×${n}` : x)).join(', ');
const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`);

export function toMarkdown(r) {
  const L = [];
  L.push(`## Session ${r.session}${r.since ? ` (since ${r.since})` : ''}`, '');
  L.push(`Wall time ${r.wallMinutes ?? '?'} min (active ${r.activeMinutes}) · user prompts ${r.userPrompts} · compactions ${r.compactions} · agents ${r.totals.agents} · tokens ${k(r.totals.tokens)} (output ${k(r.totals.output)})`, '');
  L.push('| Context | Tokens | in / cache-write / cache-read / out* | Cache hit | Calls | Tool calls | Errors (blocked) |', '|---|---|---|---|---|---|---|');
  const row = (name, u, calls, err, blk) =>
    `| ${name} | ${k(u.total)} | ${k(u.input)} / ${k(u.cacheWrite)} / ${k(u.cacheRead)} / ${k(u.output)} | ${u.cacheHit} | ${u.calls} | ${calls} | ${err} (${blk}) |`;
  const mainCalls = Object.values(r.main.tools).reduce((a, b) => a + b, 0);
  L.push(row('main', r.main.usage, mainCalls, r.main.errors, r.main.blocked));
  for (const a of r.agents) L.push(row(`${a.type} \`${a.id.slice(0, 7)}\``, a.usage, a.toolCalls, a.errors, a.blocked));
  L.push('', '\\* subagent output tokens are a lower bound (logged at stream start); input/cache are exact.');
  L.push('', '### Timeline', '', '| # | Wave | Start | Min | Agent | Task | Model | Skills | Harness tokens | Status | Report chars |', '|---|---|---|---|---|---|---|---|---|---|---|');
  r.agents.forEach((a, i) => L.push(`| ${i + 1} | ${a.wave ?? '-'} | ${a.start?.slice(11, 19) ?? '?'} | ${a.minutes ?? '?'} | ${a.type} | ${a.description} | ${a.model ?? '?'} | ${a.skills.join(', ') || '-'} | ${a.harnessTokens != null ? k(a.harnessTokens) : '-'} | ${a.status ?? 'no hand-back'} | ${a.reportChars} |`));
  L.push('', `Main-session tools: ${Object.entries(r.main.tools).map(([n, c]) => `${n} ${c}`).join(' · ') || '-'}; skills: ${r.main.skills.join(', ') || '-'}; agent resumes (SendMessage): ${r.main.resumes}`);
  if (r.duplication) {
    L.push('', '### Duplication (deep)', '');
    for (const d of r.duplication.filesReadByManyContexts) L.push(`- read by ${d.by.length}: \`${d.path}\` — ${tally(d.by)}`);
    for (const c of r.duplication.repeatedCommands) L.push(`- run ${c.n}×: \`${c.command}\``);
    L.push('', '### Error samples (deep)', '');
    for (const [who, list] of [['main', r.main.errorSamples], ...r.agents.map((a) => [a.type, a.errorSamples])]) {
      for (const e of list ?? []) L.push(`- ${who} · ${e.tool}${e.blocked ? ' · BLOCKED' : ''}: ${e.text}`);
    }
  }
  return L.join('\n');
}

export function projectDir(cwd = process.cwd()) {
  const root = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  return join(root, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
}

export function resolveSession(arg, dir) {
  if (arg && !arg.startsWith('${')) { // an unexpanded ${CLAUDE_SESSION_ID} counts as absent
    if (arg.endsWith('.jsonl')) return arg;
    return join(dir, `${arg}.jsonl`);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error(`no transcripts in ${dir}`);
  return join(dir, files[0].f);
}

function main(argv) {
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    const dir = opt('--project-dir') ?? projectDir();
    const path = resolveSession(opt('--session'), dir);
    if (!existsSync(path)) throw new Error(`transcript not found: ${path}`);
    const r = analyze(path, { since: opt('--since'), detail: argv.includes('--detail') });
    process.stdout.write(argv.includes('--json') ? JSON.stringify(r, null, 2) + '\n' : toMarkdown(r) + '\n');
  } catch (err) {
    process.stderr.write(`session-stats: ${err.message}\n`);
    process.exit(2);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
