import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { DigestRecord, DigestsStore, NewDigest } from './ports.js';

const COLUMNS = {
  id: t.digests.id,
  prId: t.digests.prId,
  summary: t.digests.summary,
  reviewCount: t.digests.reviewCount,
  model: t.digests.model,
  createdAt: t.digests.createdAt,
};

/** Digests data access. Every query is workspace-scoped. */
export class DigestsRepository implements DigestsStore {
  constructor(private db: Db) {}

  async insertDigest(workspaceId: string, digest: NewDigest): Promise<DigestRecord> {
    const [row] = await this.db
      .insert(t.digests)
      .values({ workspaceId, ...digest })
      .returning(COLUMNS);
    return row!;
  }

  async markPullDigested(workspaceId: string, prId: string, digestId: string): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ lastDigestId: digestId, digestedAt: new Date() })
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  }

  async listForPull(workspaceId: string, prId: string): Promise<DigestRecord[]> {
    return this.db
      .select(COLUMNS)
      .from(t.digests)
      .where(and(eq(t.digests.workspaceId, workspaceId), eq(t.digests.prId, prId)))
      .orderBy(desc(t.digests.createdAt));
  }
}
