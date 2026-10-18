import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Digest, DigestList } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ReviewRepository } from '../reviews/repository.js';
import { DigestsRepository } from './repository.js';
import { DigestsService } from './service.js';

/**
 * Digests module.
 *   GET  /pulls/:id/digests  → digests of a PR, newest first
 *   POST /pulls/:id/digests  → generate a new digest from the PR's reviews
 */
export default async function digestsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new DigestsService({
    store: new DigestsRepository(container.db),
    reviews: new ReviewRepository(container.db),
  });

  app.get('/pulls/:id/digests', { schema: { params: IdParams } }, async (req): Promise<DigestList> => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post('/pulls/:id/digests', { schema: { params: IdParams } }, async (req): Promise<Digest> => {
    const { workspaceId } = await getContext(container, req);
    return service.generate(workspaceId, req.params.id);
  });
}
