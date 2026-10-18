import { and, asc, eq, isNotNull, lte } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { NewSchedule, ScheduleRecord, ScheduleRunRecord, SchedulesStore } from './ports.js';

const COLUMNS = {
  id: t.schedules.id,
  workspaceId: t.schedules.workspaceId,
  repoId: t.schedules.repoId,
  repoOwner: t.repos.owner,
  repoName: t.repos.name,
  agentId: t.schedules.agentId,
  weekdays: t.schedules.weekdays,
  hour: t.schedules.hour,
  timezone: t.schedules.timezone,
  skipHolidays: t.schedules.skipHolidays,
  enabled: t.schedules.enabled,
  nextRunAt: t.schedules.nextRunAt,
  createdAt: t.schedules.createdAt,
};

/** Schedules data access. Every per-workspace query is scoped by `workspaceId`. */
export class SchedulesRepository implements SchedulesStore {
  constructor(private db: Db) {}

  private base() {
    return this.db.select(COLUMNS).from(t.schedules).innerJoin(t.repos, eq(t.repos.id, t.schedules.repoId));
  }

  async list(workspaceId: string): Promise<ScheduleRecord[]> {
    return this.base().where(eq(t.schedules.workspaceId, workspaceId)).orderBy(asc(t.schedules.createdAt));
  }

  async find(workspaceId: string, id: string): Promise<ScheduleRecord | undefined> {
    const [row] = await this.base().where(and(eq(t.schedules.workspaceId, workspaceId), eq(t.schedules.id, id)));
    return row;
  }

  async repoExists(workspaceId: string, repoId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row !== undefined;
  }

  async insert(workspaceId: string, s: NewSchedule, nextRunAt: Date | null): Promise<ScheduleRecord> {
    const [row] = await this.db
      .insert(t.schedules)
      .values({ workspaceId, ...s, nextRunAt })
      .returning({ id: t.schedules.id });
    return (await this.find(workspaceId, row!.id))!;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: Partial<NewSchedule> & { enabled?: boolean; nextRunAt?: Date | null },
  ): Promise<ScheduleRecord | undefined> {
    const [row] = await this.db
      .update(t.schedules)
      .set(patch)
      .where(and(eq(t.schedules.workspaceId, workspaceId), eq(t.schedules.id, id)))
      .returning({ id: t.schedules.id });
    return row ? this.find(workspaceId, row.id) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.schedules)
      .where(and(eq(t.schedules.workspaceId, workspaceId), eq(t.schedules.id, id)))
      .returning({ id: t.schedules.id });
    return rows.length > 0;
  }

  async listDue(now: Date): Promise<ScheduleRecord[]> {
    return this.base()
      .where(and(eq(t.schedules.enabled, true), isNotNull(t.schedules.nextRunAt), lte(t.schedules.nextRunAt, now)))
      .orderBy(asc(t.schedules.nextRunAt));
  }

  async reviewedShas(workspaceId: string, repoId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ sha: t.pullRequests.lastReviewedSha })
      .from(t.pullRequests)
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          isNotNull(t.pullRequests.lastReviewedSha),
        ),
      );
    return new Set(rows.map((r) => r.sha!));
  }

  async insertRun(
    ex: DbExecutor,
    run: { workspaceId: string; scheduleId: string; prNumbers: number[] },
  ): Promise<ScheduleRunRecord> {
    const [row] = await ex
      .insert(t.scheduleRuns)
      .values(run)
      .returning({
        id: t.scheduleRuns.id,
        scheduleId: t.scheduleRuns.scheduleId,
        prNumbers: t.scheduleRuns.prNumbers,
        ranAt: t.scheduleRuns.ranAt,
      });
    return row!;
  }

  async setNextRun(ex: DbExecutor, workspaceId: string, id: string, at: Date | null): Promise<void> {
    await ex
      .update(t.schedules)
      .set({ nextRunAt: at })
      .where(and(eq(t.schedules.workspaceId, workspaceId), eq(t.schedules.id, id)));
  }
}
