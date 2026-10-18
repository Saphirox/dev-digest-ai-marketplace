import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { AppContainer } from '../../platform/container.js';
import { DevDigestApiClient } from '../../adapters/devdigest-api/client.js';
import { BriefApiRepository } from './repository.js';
import { BriefService } from './service.js';
import { renderBrief } from './render.js';
import { ReviewsApiRepository } from '../reviews/repository.js';
import { ReviewsService } from '../reviews/service.js';
import { toToolResult } from '../_shared/messages.js';
import { RepoField, PrField } from '../_shared/schemas.js';

const InputSchema = z.object({ repo: RepoField, pr: PrField });

/** `get_pr_brief` — the PR's summary and top risks, plus the review finding count. Read-only, no LLM cost. */
export function registerGetPrBriefTool(server: McpServer, service: Pick<BriefService, 'getPrBrief'>): void {
  server.registerTool(
    'get_pr_brief',
    {
      description: 'PR summary and top risks from the DevDigest brief. Read-only, no LLM cost.',
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      try {
        const result = await service.getPrBrief({ repo: args.repo, pr: args.pr });
        if (!result.brief) {
          return {
            content: [
              {
                type: 'text',
                text: `No brief for ${result.pr} yet. Open the PR's Overview tab in DevDigest and click Generate, then retry get_pr_brief.`,
              },
            ],
          };
        }
        return { content: [{ type: 'text', text: renderBrief(result.pr, result.brief, result.findingCount) }] };
      } catch (err) {
        return toToolResult(err, { tool: 'get_pr_brief', repo: args.repo, pr: args.pr });
      }
    },
  );
}

export function registerBriefTools(server: McpServer, container: AppContainer): void {
  const client = new DevDigestApiClient(process.env.DEVDIGEST_API_URL ?? 'http://127.0.0.1:3001');
  const reviews = new ReviewsService({ store: new ReviewsApiRepository(client), resolver: container.resolver });
  const service = new BriefService({
    store: new BriefApiRepository(client),
    resolver: container.resolver,
    reviews,
  });
  registerGetPrBriefTool(server, service);
}
