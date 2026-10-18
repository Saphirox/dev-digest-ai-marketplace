import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { NotificationRecord, NotificationsStore, PullTarget, SummaryFinding } from './ports.js';

/** Notifications data access. Every query is workspace-scoped. */
export class NotificationsRepository implements NotificationsStore {
  constructor(private db: Db) {}

  async findPull(workspaceId: string, prId: string): Promise<PullTarget | undefined> {
    const [row] = await this.db
      .select({
        prId: t.pullRequests.id,
        repoId: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        number: t.pullRequests.number,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async latestReviewFindings(
    workspaceId: string,
    prId: string,
  ): Promise<{ reviewId: string; findings: SummaryFinding[] } | undefined> {
    const [review] = await this.db
      .select({ id: t.reviews.id })
      .from(t.reviews)
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.prId, prId)))
      .orderBy(desc(t.reviews.createdAt))
      .limit(1);
    if (!review) return undefined;
    const findings = await this.db
      .select({
        severity: t.findings.severity,
        title: t.findings.title,
        file: t.findings.file,
        startLine: t.findings.startLine,
      })
      .from(t.findings)
      .where(eq(t.findings.reviewId, review.id));
    return { reviewId: review.id, findings };
  }

  async insert(
    workspaceId: string,
    n: Omit<NotificationRecord, 'id' | 'createdAt'>,
  ): Promise<NotificationRecord> {
    const [row] = await this.db
      .insert(t.notifications)
      .values({ workspaceId, ...n })
      .returning({
        id: t.notifications.id,
        prId: t.notifications.prId,
        reviewId: t.notifications.reviewId,
        commentUrl: t.notifications.commentUrl,
        createdAt: t.notifications.createdAt,
      });
    return row!;
  }
}
