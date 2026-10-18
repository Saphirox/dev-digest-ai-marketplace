import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import TrendReporter from "./src/trend-reporter.js";

export default defineConfig({
  test: {
    // Suites live inside each plugin (plugins/<plugin>/evals/<artifact>/*.eval.ts), so vitest runs
    // from the repo root. src/**/*.test.ts + scripts/**/*.test.mjs = the engine's pure unit tests.
    root: fileURLToPath(new URL("..", import.meta.url)),
    include: ["plugins/*/evals/**/*.eval.ts", "evals/src/**/*.test.ts", "evals/scripts/**/*.test.mjs"],
    exclude: ["**/node_modules/**"],
    // Real Claude sessions (and a subagent dispatch) are slow — give them room.
    testTimeout: 240_000,
    hookTimeout: 240_000,
    // One session per test; a few files can run concurrently. Keep it modest to stay cheap.
    fileParallelism: true,
    reporters: ["default", new TrendReporter()],
  },
});
