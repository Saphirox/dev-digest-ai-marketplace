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

## Optimization (next)

Candidate for the next release: **trim what every review turn re-reads.** The reviewer preloads
`review-severity` and loads the whole `onion-architecture` `SKILL.md` for any `server/` diff.
Loading only the sections for the rings in the diff, and passing the severity scale as a short
table instead of the full skill, targets the cache-read tokens that make up most of the cost.

Before/after goes in this table:

| Version | Change | Pass rate | Cost per successful run (agent) | Δ |
|---|---|---|---|---|
| 1.0.0 | baseline | 5/6 (83%) | $0.211 | — |
| next | trimmed per-turn context | | | |

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
