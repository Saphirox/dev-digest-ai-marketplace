/**
 * Load a skill / agent artifact from its plugin as text, to inject as a system prompt. This is
 * what makes skillTask/agentTask measure the artifact's CONTENT in isolation — assembled the way
 * Claude Code assembles a plugin artifact (plugin-root substitution, preloaded skills).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { findAgent, findSkill, PLUGINS_DIR } from "./paths.js";

function splitFrontmatter(md: string): { frontmatter: string; body: string } {
  if (md.startsWith("---")) {
    const end = md.indexOf("\n---", 3);
    if (end !== -1) return { frontmatter: md.slice(0, end), body: md.slice(end + 4).replace(/^\n+/, "") };
  }
  return { frontmatter: "", body: md };
}

/** Claude Code substitutes these in plugin skill and agent bodies when it loads them. */
function substitute(text: string, plugin: string, skillDir?: string): string {
  let out = text.replaceAll("${CLAUDE_PLUGIN_ROOT}", join(PLUGINS_DIR, plugin));
  if (skillDir) out = out.replaceAll("${CLAUDE_SKILL_DIR}", skillDir);
  return out;
}

/**
 * SKILL.md plus a top-level template.md (the output skeleton a skill tells the model to fill)
 * plus every references/*.md — the full payload the harness would assemble.
 */
export function skillContent(ref: string): string {
  const { plugin, path: dir } = findSkill(ref);
  const parts = [readFileSync(join(dir, "SKILL.md"), "utf8")];
  const template = join(dir, "template.md");
  if (existsSync(template)) parts.push(`\n\n## Template: template.md\n\n${readFileSync(template, "utf8")}`);
  const refs = join(dir, "references");
  if (existsSync(refs)) {
    for (const f of readdirSync(refs).filter((f) => f.endsWith(".md")).sort()) {
      parts.push(`\n\n## Reference: ${f}\n\n${readFileSync(join(refs, f), "utf8")}`);
    }
  }
  return substitute(parts.join("\n"), plugin, dir);
}

/** Skills listed in an agent's `skills:` frontmatter (`plugin:skill` or a same-plugin name). */
function preloadedSkills(frontmatter: string, plugin: string): string[] {
  const block = frontmatter.match(/^skills:\n((?:\s+- .*\n?)+)/m);
  if (!block) return [];
  return [...block[1].matchAll(/- (\S+)/g)].map((m) => (m[1].includes(":") ? m[1] : `${plugin}:${m[1]}`));
}

/**
 * An agent's behavioral prompt: body with plugin paths substituted, followed by the SKILL.md of
 * every skill its frontmatter preloads (Claude Code injects their full content at start-up).
 */
export function agentContent(ref: string): string {
  const { plugin, path } = findAgent(ref);
  const { frontmatter, body } = splitFrontmatter(readFileSync(path, "utf8"));
  const parts = [substitute(body, plugin)];
  for (const s of preloadedSkills(frontmatter, plugin)) {
    const skill = findSkill(s);
    parts.push(`\n\n## Preloaded skill: ${s}\n\n${substitute(readFileSync(join(skill.path, "SKILL.md"), "utf8"), skill.plugin, skill.path)}`);
  }
  return parts.join("\n");
}

// Tools the eval refuses to hand a subagent: evals run with bypassPermissions against the LIVE
// repo, so a mutating tool could take real actions. An agent that declares these still runs — it
// just runs read-only, which is all an eval ever needs.
const MUTATING_TOOLS = new Set(["Write", "Edit", "NotebookEdit", "Bash"]);
const READONLY_FALLBACK = ["Read", "Grep", "Glob"];

/**
 * The tools an agent DECLARES in its frontmatter (`tools: Read, Glob, Grep`), so the eval can run
 * a tool-using agent the way production does instead of crippling it to content-only. Returns []
 * when the agent declares no tools. Mutating tools are stripped for safety; a `*` / "All tools"
 * grant collapses to the read-only fallback rather than handing over Write/Bash on the live repo.
 */
export function agentTools(ref: string): string[] {
  const { frontmatter } = splitFrontmatter(readFileSync(findAgent(ref).path, "utf8"));
  const line = frontmatter.match(/^tools:\s*(.+)$/m);
  if (!line) return [];
  const raw = line[1].trim();
  if (raw === "*" || /all tools/i.test(raw)) return [...READONLY_FALLBACK];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !MUTATING_TOOLS.has(t));
}
