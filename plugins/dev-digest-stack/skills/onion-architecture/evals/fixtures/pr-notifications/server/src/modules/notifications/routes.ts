import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq } from 'drizzle-orm';
import type { NotificationDto, NotificationList } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { toNotificationDto } from './helpers.js';
import { NotificationsRepository } from './repository.js';
import { NotificationsService } from './service.js';

/**
 * Notifications module.
 *   GET  /pulls/:id/notifications  → summary comments already posted for a PR
 *   POST /pulls/:id/notify         → post the latest review as a PR comment
 */
export default async function notificationsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new NotificationsService({
    store: new NotificationsRepository(container.db),
    secrets: container.secrets,
  });

  app.get(
    '/pulls/:id/notifications',
    { schema: { params: IdParams } },
    async (req): Promise<NotificationList> => {
      const { workspaceId } = await getContext(container, req);
      const rows = await container.db
        .select({
          id: t.notifications.id,
          prId: t.notifications.prId,
          reviewId: t.notifications.reviewId,
          commentUrl: t.notifications.commentUrl,
          createdAt: t.notifications.createdAt,
        })
        .from(t.notifications)
        .where(and(eq(t.notifications.workspaceId, workspaceId), eq(t.notifications.prId, req.params.id)))
        .orderBy(desc(t.notifications.createdAt));
      return { notifications: rows.map(toNotificationDto) };
    },
  );

  app.post(
    '/pulls/:id/notify',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req): Promise<NotificationDto> => {
      const { workspaceId } = await getContext(container, req);
      return service.notify(workspaceId, req.params.id);
    },
  );
}
