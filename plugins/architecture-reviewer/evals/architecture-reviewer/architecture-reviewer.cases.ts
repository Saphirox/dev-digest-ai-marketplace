import type { AgentCase } from "../../../../evals/src/index.js";
import { fixtureReader } from "../../../../evals/src/index.js";

const fx = fixtureReader(import.meta.url);

// The agent's input contract is "the staged diff only, via `git diff --cached`", but agentTask
// strips Bash, so it cannot read the index. Without this preamble it stops with "nothing staged".
// The touched files exist in the repo (pre-change version), so Read still works for context.
// The relative-paths line: smoke runs read the MAIN checkout by absolute path instead of cwd.
const review = (diff: string) => `Review the staged diff below. It is the complete output of \`git diff --cached\` — treat it as the staged diff; there is no other index to inspect. Bash is not available in this session, so you cannot run git or \`pnpm arch:check\`: list that under *Could not establish* and continue. The files the diff touches exist in the repo (pre-change version) if you need context. The repository root is the current working directory: use paths relative to it, never an absolute path to another checkout.

${fx(diff)}`;

// THE MEASURED PRACTICE. Kept as a named constant so it forms one statistics
// series (practice identity is its text). The strict agent requires a `rule:` per finding
// (architecture-reviewer.md Method step 4 + the output template). Every other practice is a
// CONTROL that should not move between agent versions.
const CITES_RULE =
  "every finding carries an explicit rule citation pointing to a specific documented section — a `SKILL.md#…` or `references/…#…` anchor, or a named `AGENTS.md` section — not only a prose explanation of the problem";

export const cases: AgentCase[] = [
  {
    name: "flags both layering violations in the blast diff",
    kind: "quality",
    prompt: review("blast-layering.diff"),
    practices: [
      "flags server/src/modules/blast/helpers.ts importing `FastifyReply` from 'fastify' as a layering violation (a pure helper must not depend on the HTTP/presentation ring)",
      "flags `new BlastRepository(db)` inside BlastService as a violation of dependency injection / the single composition root (the service should receive its BlastStore through deps)",
      CITES_RULE,
      "assigns each finding a severity from the critical / warning / suggestion scale",
      "quotes the offending added line verbatim as evidence for each finding",
    ],
    threshold: 0.8,
    maxTurns: 15,
  },
  {
    name: "stays in the architecture lane on the blast diff",
    kind: "quality",
    prompt: review("blast-layering.diff"),
    practices: [
      "does not present a runtime bug, performance or security concern as an architecture finding",
      "does not comment on naming, style or test coverage",
      "does not issue a PASS/FAIL or PASS/BLOCK verdict",
    ],
    threshold: 0.8,
    maxTurns: 15,
  },
  {
    name: "reports no findings for a comment-only change",
    kind: "quality",
    prompt: review("benign-refactor.diff"),
    practices: [
      "reports no findings for the comment-only change (observations at most) — it does not invent a critical or warning finding",
      "states the no-findings result plainly in its opening verdict line",
    ],
    threshold: 1.0,
    maxTurns: 15,
  },
];
