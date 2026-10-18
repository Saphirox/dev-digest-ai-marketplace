import { describe, expect, it } from "vitest";
import { alignToPractices, MISSING_EVIDENCE } from "./llm-judge.js";

const practices = ["cites a rule", "quotes the line", "assigns severity"];

describe("alignToPractices", () => {
  it("a practice the judge skipped is a FAIL, and the denominator stays the practices asked", () => {
    const r = alignToPractices(
      [{ id: 1, practice: "cites a rule", passed: true, evidence: "rule: X" }, { id: 3, practice: "assigns severity", passed: true, evidence: "critical" }],
      practices,
    );
    expect(r).toHaveLength(3);
    expect(r[1]).toEqual({ practice: "quotes the line", passed: false, evidence: MISSING_EVIDENCE });
    expect(r.filter((x) => x.passed)).toHaveLength(2);
  });

  it("matches by id even when the judge reorders and paraphrases, keeping the input text", () => {
    const r = alignToPractices(
      [{ id: 2, practice: "Quotes line", passed: true, evidence: "q" }, { id: 1, practice: "Cites rule", passed: false, evidence: "" }, { id: 3, practice: "sev", passed: true, evidence: "s" }],
      practices,
    );
    expect(r.map((x) => [x.practice, x.passed])).toEqual([["cites a rule", false], ["quotes the line", true], ["assigns severity", true]]);
  });

  it("falls back to exact text, then to position when the counts match", () => {
    expect(alignToPractices([{ practice: "quotes the line", passed: true, evidence: "q" }], practices)[1].passed).toBe(true);
    const byPos = alignToPractices([{ passed: true }, { passed: false }, { passed: true }], practices);
    expect(byPos.map((x) => x.passed)).toEqual([true, false, true]);
  });

  it("only a literal true passes", () => {
    expect(alignToPractices([{ id: 1, passed: "true" }], ["p"])[0].passed).toBe(false);
  });
});
