/**
 * Onion-architecture import rules for `server/` + `reviewer-core/`.
 * Run: `pnpm arch:check`. Rationale for every rule:
 * `.claude/skills/onion-architecture/references/testing-and-enforcement.md`.
 *
 * Severity policy: `error` where the codebase is clean today (so it stays
 * clean), `warn` where known debt exists (new code must not add to it).
 * Promote a `warn` to `error` once its debt is paid down to zero.
 */

/** pnpm nests packages under node_modules/.pnpm/<pkg>@<v>/node_modules/<pkg>/ — match either layout. */
const NM = '(^|/)node_modules/';

/** Files allowed to import concrete adapters and module internals: the composition root. */
const COMPOSITION_ROOT = '^src/(app|server)\\.ts$|^src/platform/container\\.ts$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Clean today (error): keep it that way ────────────────────────────
    {
      name: 'shared-contracts-pure',
      severity: 'error',
      comment:
        'vendor/shared is the domain model + port interfaces (innermost ring). It may import only itself and zod.',
      from: { path: '^src/vendor/shared/' },
      to: { pathNot: ['^src/vendor/shared/', NM + 'zod/', NM + '@types/'] },
    },
    {
      name: 'reviewer-core-pure',
      severity: 'error',
      comment:
        'reviewer-core is a pure engine: no HTTP framework, DB, GitHub, git or server code. Side effects only through injected ports.',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: {
        path: [
          '^src/(?!vendor/shared/)',
          NM + '(fastify|@fastify|drizzle-orm|postgres|octokit|@octokit|simple-git)/',
        ],
      },
    },

    {
      name: 'reviewer-core-engine-no-sdk',
      severity: 'error',
      comment:
        'Inside reviewer-core only src/llm/ (the adapter corner) may touch the openai SDK or the OpenRouter implementation; the engine (review/, prompt, grounding, output/) talks to the injected LLMProvider port. index.ts re-exports the adapter as the public API.',
      from: {
        path: '^\\.\\./reviewer-core/src/',
        pathNot: ['^\\.\\./reviewer-core/src/llm/', '^\\.\\./reviewer-core/src/index\\.ts$'],
      },
      to: { path: [NM + 'openai/', '^\\.\\./reviewer-core/src/llm/openrouter\\.ts$'] },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        "A module must not import another module's routes/service/repository. Share through the container (composition root) or a port.",
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/(routes|service|repository|run-executor)',
        pathNot: '^src/modules/$1/',
      },
    },
    {
      name: 'platform-not-outward',
      severity: 'error',
      comment:
        'platform/* (except the composition root) is shared infrastructure; it must not depend on feature modules.',
      from: { path: '^src/platform/', pathNot: COMPOSITION_ROOT },
      to: { path: '^src/modules/' },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment:
        "An import that doesn't resolve is either a typo or a package the ring must not have (e.g. drizzle-orm inside reviewer-core, which doesn't install it).",
      from: {},
      to: { couldNotResolve: true },
    },

    // ── Known debt (warn): new code must not add to these ────────────────
    {
      name: 'adapters-not-inward-to-app',
      severity: 'warn',
      comment:
        'Adapters implement ports; they must not reach into application code (modules) or the composition root.',
      from: { path: '^src/adapters/' },
      to: { path: ['^src/modules/', '^src/platform/container\\.ts$', '^src/app\\.ts$'] },
    },
    {
      name: 'pure-module-files-no-io',
      severity: 'error',
      comment:
        'helpers.ts / constants.ts are domain-level pure code: no Fastify, Drizzle, DB schema, adapters or container.',
      from: { path: '^src/modules/[^/]+/(helpers|constants)\\.ts$' },
      to: {
        path: [
          NM + '(fastify|drizzle-orm|postgres)/',
          '^src/db/',
          '^src/adapters/',
          '^src/platform/container\\.ts$',
        ],
      },
    },
    {
      name: 'routes-no-persistence',
      severity: 'error',
      comment:
        'Presentation ring: routes validate, call a service, return a DTO. Queries belong in a repository.',
      from: {
        path: '^src/modules/[^/]+/routes\\.ts$',
        pathNot: '^src/modules/notifications/routes\\.ts$',
      },
      to: { path: [NM + 'drizzle-orm/', '^src/db/'] },
    },
    {
      name: 'application-no-drizzle',
      severity: 'warn',
      comment:
        'Application ring (services, executors, pipelines): persistence goes through a repository, not drizzle-orm/db schema.',
      from: {
        path: '^src/modules/',
        pathNot: ['/repository\\.ts$', '/repository/', '/routes\\.ts$'],
      },
      to: { path: [NM + 'drizzle-orm/', '^src/db/schema'] },
    },
    {
      name: 'modules-no-concrete-adapters',
      severity: 'warn',
      comment:
        'Modules depend on port interfaces (@devdigest/shared or a module ports.ts), resolved through the container — never on src/adapters/* files.',
      from: { path: '^src/modules/' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Cycles erase the ring order; break them with a port or by moving the shared type inward.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['^src/db/migrations/', '\\.d\\.ts$'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    // ESM-only packages (octokit, p-queue) resolve only via the `import`
    // condition. No `types` condition: it resolves to .d.ts files, which the
    // exclude above drops — that silently erased every drizzle-orm edge.
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
