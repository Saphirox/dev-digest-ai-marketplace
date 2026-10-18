# Cost baseline

What one successful run of a plugin's workflow costs, measured with the eval suites in
`plugins/<plugin>/evals/` (engine: [`evals/`](../evals/README.md)). Every change that can move
cost or quality reruns the same suite and adds a row here.

## Metric

**Cost per successful run** = total agent cost of all runs ÷ number of runs that passed the
quality gate. Failed runs still count in the numerator: you pay for them.

- **Agent cost** is the SDK's `total_cost_usd` for the run under test: Claude Code's list-price
  estimate from token counts. The evals ran on a Claude Code subscription, so nothing was billed;
  the estimate is what the same run costs on the API.
- **Judge cost** (the LLM grading the output) is reported separately: it is the price of
  measuring, not of using the plugin.

## Quality gate

A run passes when its case's judge score reaches the case threshold:

| Case | Threshold |
|---|---|
| flags both layering violations in the blast diff | 0.8 |
| stays in the architecture lane on the blast diff | 0.8 |
| reports no findings for a comment-only change | 1.0 |

An optimization ships only if the suite's pass rate does not drop below the baseline and no case
that passed every run starts failing.

## architecture-reviewer 1.0.0 (baseline)

Setup:

| | |
|---|---|
| Plugin | `architecture-reviewer` 1.0.0 (files identical to tag `architecture-reviewer--v1.0.0`), with `engineering-foundations` 1.0.0 and `dev-digest-stack` 1.0.0 loaded |
| Suite | `plugins/architecture-reviewer/evals/architecture-reviewer`: 3 cases × 2 runs = 6 runs |
| Model under test | `claude-opus-5-5` (the agent's `model: opus`) |
| Judge | `claude-sonnet-5-5` |
| Runtime | Claude Code 2.1.302 via `@anthropic-ai/claude-agent-sdk` 0.3.198 |
| Target repo | `Saphirox/dev-digest` at `1d7b2ac` (the diffs touch its files) |
| Date | 2026-10-18 |
| Raw data | [`cost-baseline/architecture-reviewer-1.0.0.records.jsonl`](cost-baseline/architecture-reviewer-1.0.0.records.jsonl), [`.repeat.json`](cost-baseline/architecture-reviewer-1.0.0.repeat.json) |

Results (means per run):

| Case | Passed | Score | Agent $ | Judge $ | Turns | Tool calls | Cache read / write tokens | Output tokens | Time |
|---|---|---|---|---|---|---|---|---|---|
| flags both layering violations | 2/2 | 1.00 | 0.233 | 0.035 | 7.5 | 6.0 | 151.6k / 16.6k | 3.5k | 35 s |
| stays in the architecture lane | 1/2 | 0.83 | 0.251 | 0.039 | 8.0 | 6.5 | 177.3k / 16.8k | 4.0k | 44 s |
| reports no findings (comment-only) | 2/2 | 1.00 | 0.045 | 0.025 | 1.0 | 0.0 | 21.4k / 3.7k | 0.5k | 9 s |

| Total (6 runs) | Value |
|---|---|
| Passed | 5 / 6 (83%) |
| Agent cost | $1.057 ($0.176 per run) |
| Judge cost | $0.199 |
| **Cost per successful run** | **$0.211** (agent only), $0.251 including the judge |

Observations:

- Cost follows the diff. Reviews of a real violation cost about $0.23–0.25 and take 6–7 tool
  calls (read the touched files, load `dev-digest-stack:onion-architecture`, check
  `.dependency-cruiser.cjs`). The comment-only diff costs $0.05 with no tool calls.
- Cache reads dominate the input: 150–180k cached tokens per review against about 17k written.
  Each turn re-reads the agent prompt, the preloaded `review-severity` skill and the
  loaded `onion-architecture` skill.
- The one failure is a judge call, not a lane break. The reviewer noted that `.it.test.ts` naming
  was absent from the diff, and the judge counted it as a naming comment. That practice is the
  suite's least stable one (1/2).
- Two runs at n=2 give indicative numbers only; rerun with the same settings before comparing.

## Optimization 1: drop duplicated prompt instructions (rejected)

**Change** (one change, model and routing untouched): the agent prompt stopped restating what
the preloaded `review-severity` skill already says (severity scale, evidence, calibration),
stated the PASS/BLOCK and lane rules once instead of four times, and moved the Bash allowlist
table and the dev-digest hard repo rules to `references/` read on demand. Prompt: 1563 → 773
words. Commit `a3f9b05` on branch
[`experiment/architecture-reviewer-lean-prompt`](https://github.com/Saphirox/dev-digest-ai-marketplace/tree/experiment/architecture-reviewer-lean-prompt)
(released there as 1.1.0, not merged).

**Same eval set**, same settings as the baseline (3 cases × 2 runs, `claude-opus-5-5`, judge
`claude-sonnet-5-5`, Claude Code 2.1.302, dev-digest `1d7b2ac`), clean tree at `fc21fc9`.
Raw data: [`cost-baseline/architecture-reviewer-1.1.0-candidate.records.jsonl`](cost-baseline/architecture-reviewer-1.1.0-candidate.records.jsonl).

| Case | 1.0.0 passed | candidate passed | 1.0.0 agent $ per run | candidate agent $ per run | 1.0.0 time | candidate time |
|---|---|---|---|---|---|---|
| flags both layering violations | 2/2 | 2/2 | 0.277, 0.189 | 0.331, 0.330 | 32 s, 37 s | 38 s, 59 s |
| stays in the architecture lane | 1/2 | **0/2** | 0.228, 0.273 | 0.277, 0.251 | 39 s, 48 s | 42 s, 48 s |
| reports no findings (comment-only) | 2/2 | 2/2 | 0.073, 0.016 | 0.103, 0.015 | 6 s, 12 s | 9 s, 7 s |

| Total (6 runs) | 1.0.0 | candidate |
|---|---|---|
| Passed | 5/6 | 4/6 |
| Agent cost | $1.057 | $1.306 |
| **Cost per successful run** (agent) | **$0.211** | **$0.327** |
| Mean time per run | 29 s | 34 s |

**Verdict: rejected.**

- **Quality gate red.** The lane case dropped from 1/2 to 0/2. Both failures are the same
  practice ("does not comment on naming, style or test coverage"): the reviewer pointed at the
  eight `new BlastService({...})` calls in `server/test/blast-service.test.ts` that the DI fix
  would touch. No critical false negatives: both layering violations were found in 4/4 runs.
- **Cost and latency did not fall.** The comment-only and lane cases moved within the spread of
  their baseline runs (noise). The violation case rose beyond its baseline range ($0.33 twice vs
  $0.19–0.28) with more turns (10 vs 6–9) and more cache writes (27k vs 17k tokens): the leaner
  prompt led to extra reads (`server/AGENTS.md`, the test file). That last part is an inference
  from the traces; n=2 per case is indicative only.
- **Why the saving was small to begin with:** one turn carries about 25k tokens of context, and
  the prompt cut is about 1k of them. Output tokens and cache writes, not the prompt, drive the
  cost of a review.

Ledger:

| Version | Change | Pass rate | Cost per successful run (agent) | Δ | Result |
|---|---|---|---|---|---|
| 1.0.0 | baseline | 5/6 (83%) | $0.211 | — | shipped |
| 1.1.0 candidate | drop duplicated prompt instructions | 4/6 (67%) | $0.327 | +55% | rejected, not merged |

Next candidate: keep the lean prompt but state the lane rule with the case it broke ("do not
discuss which tests a fix would touch"), rerun the same set, and run more repetitions per
version before calling any difference smaller than the run-to-run spread.

## Reproduce

```bash
cd evals && pnpm install
export EVAL_TARGET_REPO=/path/to/dev-digest   # checkout at 1d7b2ac
export EVAL_CLAUDE_PATH="$(readlink -f "$(which claude)")"
EVAL_MODEL=claude-opus-5-5 EVAL_JUDGE_MODEL=claude-sonnet-5-5 \
  ./node_modules/.bin/tsx src/repeat.ts architecture-reviewer.eval -n 2 --label <label>
```

Records land in `evals/results/records.jsonl` (`metrics.costUsd`, `judge_cost_usd`, tokens).

## Known limits

- In the eval, the agent runs as the main session, so the plugin's read-only Bash guard (which
  keys on the subagent name) does not apply, and the SDK's `allowedTools` with
  `bypassPermissions` does not stop Bash: two runs called it. Run evals against a throwaway
  checkout until the engine restricts tools with the SDK's `tools` option.
- The reported cost is an estimate at list price, not a bill.
