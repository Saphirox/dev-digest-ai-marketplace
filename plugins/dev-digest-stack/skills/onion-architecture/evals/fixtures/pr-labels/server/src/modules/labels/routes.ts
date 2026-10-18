import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { asc, eq } from 'drizzle-orm';
import type { Label, LabelList } from '@devdigest/shared';
import { LabelCreate, LabelPatch } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { toLabelDto } from './helpers.js';
import { LabelsRepository } from './repository.js';
import { LabelsService } from './service.js';

/**
 * Labels module. Workspace-defined labels that can be attached to pull requests.
 *   GET    /labels        → all labels of the workspace, by name
 *   POST   /labels        → create
 *   PATCH  /labels/:id    → rename / recolor
 *   DELETE /labels/:id    → remove
 */
export default async function labelsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new LabelsService({ store: new LabelsRepository(container.db) });

  app.get('/labels', async (req): Promise<LabelList> => {
    const { workspaceId } = await getContext(container, req);
    const rows = await container.db
      .select()
      .from(t.labels)
      .where(eq(t.labels.workspaceId, workspaceId))
      .orderBy(asc(t.labels.name));
    return { labels: rows.map(toLabelDto) };
  });

  app.post('/labels', { schema: { body: LabelCreate } }, async (req): Promise<Label> => {
    const { workspaceId } = await getContext(container, req);
    return service.create(workspaceId, req.body);
  });

  app.patch(
    '/labels/:id',
    { schema: { params: IdParams, body: LabelPatch } },
    async (req, reply): Promise<Label> => {
      const { workspaceId } = await getContext(container, req);
      return service.update(workspaceId, req.params.id, req.body, reply);
    },
  );

  app.delete('/labels/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.delete(workspaceId, req.params.id);
    return { ok: true };
  });
}
