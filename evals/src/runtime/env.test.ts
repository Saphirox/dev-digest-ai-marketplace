import { afterEach, describe, expect, it, vi } from "vitest";
import { openRouterBearer } from "./env.js";

const saved = process.env.EVAL_PROXY_KEY;
afterEach(() => {
  if (saved === undefined) delete process.env.EVAL_PROXY_KEY;
  else process.env.EVAL_PROXY_KEY = saved;
});

describe("openRouterBearer", () => {
  it("uses the OpenRouter key when no proxy key is set", () => {
    delete process.env.EVAL_PROXY_KEY;
    expect(openRouterBearer("http://localhost:4000", "sk-or")).toBe("sk-or");
  });

  it("uses the proxy key for the local proxy", () => {
    process.env.EVAL_PROXY_KEY = "sk-proxy";
    expect(openRouterBearer("http://localhost:4000", "sk-or")).toBe("sk-proxy");
  });

  it("never sends a leftover proxy key to openrouter.ai", () => {
    process.env.EVAL_PROXY_KEY = "sk-proxy";
    expect(openRouterBearer("https://openrouter.ai/api", "sk-or")).toBe("sk-or");
    expect(openRouterBearer("https://openrouter.ai/api/v1", "sk-or")).toBe("sk-or");
  });
});

describe("subscriptionEnv", () => {
  const KEYS = ["EVAL_BACKEND", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"] as const;
  const before = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of KEYS) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  });

  // BACKEND is read at module load, so re-import after setting the env.
  async function envFor(vars: Partial<Record<(typeof KEYS)[number], string>>) {
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, vars);
    vi.resetModules();
    return (await import("./env.js")).subscriptionEnv;
  }

  it("anthropic keeps the API key and drops any redirect", async () => {
    const subscriptionEnv = await envFor({
      EVAL_BACKEND: "anthropic",
      ANTHROPIC_API_KEY: "sk-ant",
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      ANTHROPIC_AUTH_TOKEN: "sk-or",
    });
    const env = subscriptionEnv();
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant");
    expect(env).not.toHaveProperty("ANTHROPIC_BASE_URL");
    expect(env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
  });

  it("anthropic without a key throws", async () => {
    const subscriptionEnv = await envFor({ EVAL_BACKEND: "anthropic" });
    expect(() => subscriptionEnv()).toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it("subscription (default) strips the API key so local runs never bill it", async () => {
    const subscriptionEnv = await envFor({ ANTHROPIC_API_KEY: "sk-ant", ANTHROPIC_AUTH_TOKEN: "t" });
    const env = subscriptionEnv();
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
  });
});
