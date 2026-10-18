/**
 * LLM Message Pattern judge, on the subscription. Binary PASS/FAIL per practice, PASS only with
 * a verbatim evidence quote. The judge defaults to a stronger family than the task to soften
 * single-model self-preference; the structural mitigations (blind + binary + verbatim) do the
 * rest, since on a shared subscription the families overlap.
 */

import { EVAL_JUDGE_MODEL } from "../config.js";
import { runContent } from "../runtime/dispatch.js";

const JUDGE_RUBRIC =
  "You are a strict, blind evaluator. Given an OUTPUT and a list of PRACTICES, judge each " +
  "practice independently.\n" +
  "Rules: (1) exactly PASS or FAIL per practice, no scales. (2) PASS only when a direct " +
  "verbatim quote from the OUTPUT is evidence the practice was met — a keyword is not " +
  "evidence. (3) Return one result per practice, with its number as id. (4) Reply with ONLY " +
  "minified JSON:\n" +
  '{"results":[{"id":1,"practice":"<text>","passed":true,"evidence":"<verbatim quote>"}]}';

export interface Verdict {
  results: { practice: string; passed: boolean; evidence: string }[];
  passed: number;
  total: number;
  score: number;
  /** The judge call's own list-price estimate (USD), kept apart from the run under test. */
  costUsd?: number;
}

type RawResult = { id?: unknown; practice?: unknown; passed?: unknown; evidence?: unknown };

export const MISSING_EVIDENCE = "(judge returned no verdict for this practice)";

/**
 * Map the judge's results back onto the practices that were ASKED, in order: by `id`, then by
 * exact text, then by position when the counts match. A practice the judge skipped is a FAIL, and
 * every result carries the input practice text verbatim — stats group series by that text, so a
 * paraphrased echo would otherwise split one practice into two series.
 */
export function alignToPractices(raw: RawResult[], practices: string[]): Verdict["results"] {
  return practices.map((practice, i) => {
    const hit =
      raw.find((r) => Number(r.id) === i + 1) ??
      raw.find((r) => r.practice === practice) ??
      (raw.length === practices.length ? raw[i] : undefined);
    return hit
      ? { practice, passed: hit.passed === true, evidence: String(hit.evidence ?? "") }
      : { practice, passed: false, evidence: MISSING_EVIDENCE };
  });
}

function parseVerdict(text: string): RawResult[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
  const obj = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(obj.results)) throw new Error("judge JSON missing results[]");
  return obj.results;
}

/** Judge an output against a list of practices. Model defaults to the stronger judge family. */
export async function llmJudge(output: string, practices: string[], model = EVAL_JUDGE_MODEL): Promise<Verdict> {
  const listed = practices.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = `${JUDGE_RUBRIC}\n\n## PRACTICES\n${listed}\n\n## OUTPUT\n${output}\n\nReturn the JSON now.`;
  const res = await runContent(prompt, { allowedTools: [], maxTurns: 1, model });
  const results = alignToPractices(parseVerdict(res.text), practices);
  const total = results.length || 1;
  const passed = results.filter((r) => r.passed).length;
  return { results, passed, total, score: passed / total, costUsd: res.metrics.costUsd };
}
