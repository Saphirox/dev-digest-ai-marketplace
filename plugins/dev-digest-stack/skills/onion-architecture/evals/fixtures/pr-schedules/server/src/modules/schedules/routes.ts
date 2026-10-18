import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Schedule, ScheduleList } from '@devdigest/shared';
import { ScheduleCreate, SchedulePatch } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SCHEDULE_TICK_JOB_KIND } from './constants.js';
import { SchedulesRepository } from './repository.js';
import { SchedulesService } from './service.js';

/**
 * Schedules module. Scheduled agent reviews per repo.
 *   GET    /schedules        → all schedules of the workspace
 *   POST   /schedules        → create
 *   PATCH  /schedules/:id    → change slot / timezone / enable
 *   DELETE /schedules/:id    → remove
 * Registers the `schedules.tick` job, which the cron trigger enqueues hourly.
 */
export default async function schedulesRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SchedulesService({
    store: new SchedulesRepository(container.db),
    db: container.db,
    github: () => container.github(),
  });

  container.jobs.register(SCHEDULE_TICK_JOB_KIND, async () => {
    await service.runDue();
  });

  app.get('/schedules', async (req): Promise<ScheduleList> => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.post('/schedules', { schema: { body: ScheduleCreate } }, async (req, reply): Promise<Schedule> => {
    const { workspaceId } = await getContext(container, req);
    const created = await service.create(workspaceId, req.body);
    reply.code(201);
    return created;
  });

  app.patch(
    '/schedules/:id',
    { schema: { params: IdParams, body: SchedulePatch } },
    async (req): Promise<Schedule> => {
      const { workspaceId } = await getContext(container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/schedules/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.delete(workspaceId, req.params.id);
    return { ok: true };
  });
}
