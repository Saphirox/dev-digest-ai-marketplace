/**
 * Discover the skills/agents in plugins/ and scaffold eval files for one of them, inside its plugin.
 *
 *   pnpm eval:scaffold                 # list every skill/agent and whether it has evals
 *   pnpm eval:scaffold <skill>         # create plugins/<plugin>/evals/<skill>/{<skill>.eval.ts, .cases.ts, fixtures/}
 *   pnpm eval:scaffold --agent <name>  # same for an agent (name or plugin:name)
 *
 * Refuses to overwrite existing files.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { GREEN, DIM, YELLOW, RESET } from "./ansi.js";
import { REPO_ROOT, listSkills, listAgents, findSkill, findAgent, evalPath, type Artifact } from "./artifacts/paths.js";

const ENGINE_IMPORT = "../../../../evals/src/index.js"; // from plugins/<plugin>/evals/<name>/
const rel = (f: string) => f.replace(REPO_ROOT + "/", "");

function list(): void {
  for (const [title, items] of [["Skills", listSkills()], ["Agents", listAgents()]] as const) {
    console.log(`\n${"=".repeat(56)}\n${title}\n${"=".repeat(56)}`);
    for (const a of items) {
      const mark = existsSync(evalPath(a)) ? `${GREEN}✓ evals${RESET}` : `${DIM}— no evals${RESET}`;
      console.log(`  ${`${a.plugin}:${a.name}`.padEnd(48)} ${mark}`);
    }
  }
  console.log(`\nScaffold one:  pnpm eval:scaffold <skill>   |   pnpm eval:scaffold --agent <agent>   (name or plugin:name)`);
}

function casesTemplate(kind: "Skill" | "Agent"): string {
  return `import type { ${kind}Case } from "${ENGINE_IMPORT}";

// To inline a fixture file into a prompt, uncomment these two lines and drop the file in
// fixtures/, then use fx("your-fixture.ext") inside a prompt string:
//   import { fixtureReader } from "${ENGINE_IMPORT}";
//   const fx = fixtureReader(import.meta.url);

export const cases: ${kind}Case[] = [
  {
    name: "TODO describe the good behavior this checks",
    kind: "quality",
    prompt: "TODO the user/task prompt the ${kind.toLowerCase()} should handle",
    practices: [
      "TODO a specific, binary, citable thing the answer must do",
      "TODO another one — keep each verifiable from a verbatim quote",
    ],
    // grounding: ["exact-substring-that-must-appear-before-judging"], // optional cheap gate
    // threshold: 0.6,
    // maxTurns: 8,
  },
  // Keep it minimal — one or two cases is enough to start.
];
`;
}

function evalTemplate(tier: "skills" | "agents", name: string): string {
  const describe = tier === "skills" ? "describeSkill" : "describeAgent";
  const run = tier === "skills" ? "runSkillCases" : "runAgentCases";
  return `import { ${describe}, ${run} } from "${ENGINE_IMPORT}";
import { cases } from "./${name}.cases.js";

${describe}("${name}", () => ${run}("${name}", cases));
`;
}

function scaffold(tier: "skills" | "agents", ref: string): void {
  const kind = tier === "skills" ? "Skill" : "Agent";
  let artifact: Artifact;
  try {
    artifact = tier === "skills" ? findSkill(ref) : findAgent(ref);
  } catch (e) {
    console.error(`${YELLOW}error:${RESET} ${(e as Error).message}`);
    process.exit(1);
  }
  const { name } = artifact;
  const dir = dirname(evalPath(artifact));
  const files: [string, string][] = [
    [join(dir, `${name}.eval.ts`), evalTemplate(tier, name)],
    [join(dir, `${name}.cases.ts`), casesTemplate(kind)],
    [join(dir, "fixtures", ".gitkeep"), ""],
  ];

  const existing = files.filter(([f]) => existsSync(f)).map(([f]) => f);
  if (existing.length) {
    console.error(`${YELLOW}refusing to overwrite:${RESET}\n  ${existing.join("\n  ")}`);
    process.exit(1);
  }

  mkdirSync(join(dir, "fixtures"), { recursive: true });
  for (const [f, content] of files) writeFileSync(f, content);

  console.log(`${GREEN}scaffolded ${artifact.plugin}:${name}:${RESET}`);
  for (const [f] of files) console.log(`  ${rel(f)}`);
  console.log(`\nNext: fill in ${name}.cases.ts, then run  pnpm vitest run ${rel(dir)}/`);
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 0) return list();
  const agentIdx = argv.indexOf("--agent");
  if (agentIdx !== -1) {
    const name = argv[agentIdx + 1];
    if (!name) return void console.error("usage: pnpm eval:scaffold --agent <agent-name>");
    return scaffold("agents", name);
  }
  scaffold("skills", argv[0]);
}

main();
