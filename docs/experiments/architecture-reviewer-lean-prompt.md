# Experiment: lean architecture-reviewer prompt

Status: **rejected, not merged.** Full numbers and method: [COST-BASELINE.md](../COST-BASELINE.md).

Change: removed instructions the prompt duplicated (severity rules from `review-severity`, repeated
PASS/BLOCK and lane rules); the Bash allowlist and repo rules moved to `references/`. Model and
routing unchanged. Same eval set: 3 cases × 2 runs, Opus 5.5, Sonnet 5.5 judge.

| | 1.0.0 (old) | 1.1.0 lean (new) |
|---|---|---|
| Prompt size | 1563 words | 773 words |
| Passed | 5/6 | 4/6 |
| Lane case | 1/2 | 0/2 |
| Violations found | 4/4 | 4/4 |
| Cost per successful run | $0.211 | $0.327 |
| Mean time per run | 29 s | 34 s |

Fails the quality gate; cost and latency did not drop.
