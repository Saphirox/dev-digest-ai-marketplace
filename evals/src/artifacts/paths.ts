/**
 * Filesystem anchors. The eval engine lives in `evals/`; the artifacts it measures live in the
 * marketplace's plugins (`plugins/<plugin>/agents/<name>.md`, `plugins/<plugin>/skills/<name>/`),
 * and each plugin keeps its own suites in `plugins/<plugin>/evals/<artifact>/<artifact>.eval.ts`.
 * These helpers are the single source of those locations.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EVALS_DIR = join(HERE, "..", "..");
export const REPO_ROOT = join(EVALS_DIR, "..");
export const PLUGINS_DIR = join(REPO_ROOT, "plugins");
export const RESULTS_DIR = join(EVALS_DIR, "results");
/** Where the model under test runs (its cwd). Fixtures that need a real codebase point this at one. */
export const TARGET_REPO = process.env.EVAL_TARGET_REPO ?? REPO_ROOT;

export interface Artifact {
  plugin: string;
  name: string;
  /** agents: the .md file; skills: the skill directory. */
  path: string;
}

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

export function listPlugins(): string[] {
  if (!isDir(PLUGINS_DIR)) return [];
  return readdirSync(PLUGINS_DIR).filter((d) => existsSync(join(PLUGINS_DIR, d, ".claude-plugin", "plugin.json"))).sort();
}

export function listAgents(): Artifact[] {
  return listPlugins().flatMap((plugin) => {
    const dir = join(PLUGINS_DIR, plugin, "agents");
    if (!isDir(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => ({ plugin, name: f.replace(/\.md$/, ""), path: join(dir, f) }));
  });
}

export function listSkills(): Artifact[] {
  return listPlugins().flatMap((plugin) => {
    const dir = join(PLUGINS_DIR, plugin, "skills");
    if (!isDir(dir)) return [];
    return readdirSync(dir)
      .filter((d) => existsSync(join(dir, d, "SKILL.md")))
      .sort()
      .map((d) => ({ plugin, name: d, path: join(dir, d) }));
  });
}

/** Resolve `name` or `plugin:name`. Throws when missing or ambiguous. */
function find(list: Artifact[], ref: string, kind: string): Artifact {
  const [plugin, name] = ref.includes(":") ? ref.split(":") : [undefined, ref];
  const hits = list.filter((a) => a.name === name && (!plugin || a.plugin === plugin));
  if (hits.length !== 1) {
    throw new Error(hits.length ? `${kind} '${ref}' is ambiguous: ${hits.map((h) => h.plugin).join(", ")}` : `${kind} not found: ${ref}`);
  }
  return hits[0];
}

export const findAgent = (ref: string) => find(listAgents(), ref, "agent");
export const findSkill = (ref: string) => find(listSkills(), ref, "skill");

/** The suite file for an artifact, inside its plugin. */
export const evalPath = (a: Artifact) => join(PLUGINS_DIR, a.plugin, "evals", a.name, `${a.name}.eval.ts`);

/** A plugin and, transitively, the local plugins it depends on (absolute dirs). */
export function pluginClosure(plugin: string, seen = new Set<string>()): string[] {
  if (seen.has(plugin)) return [];
  seen.add(plugin);
  const manifest = join(PLUGINS_DIR, plugin, ".claude-plugin", "plugin.json");
  if (!existsSync(manifest)) return [];
  const deps: Array<string | { name: string }> = JSON.parse(readFileSync(manifest, "utf8")).dependencies ?? [];
  const names = deps.map((d) => (typeof d === "string" ? d.split("@")[0] : d.name));
  return [join(PLUGINS_DIR, plugin), ...names.flatMap((n) => pluginClosure(n, seen))];
}
