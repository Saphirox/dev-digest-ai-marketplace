import type { Db, DbExecutor } from '../../db/client.js';

/**
 * Schedules ports. What SchedulesService needs from the outside world,
 * declared next to it: SchedulesRepository implements SchedulesStore;
 * tests pass a fake.
 */

export interface ScheduleRecord {
  id: string;
  workspaceId: string;
  repoId: string;
  repoOwner: string;
  repoName: string;
  agentId: string;
  weekdays: number[];
  hour: number;
  timezone: string;
  skipHolidays: boolean;
  enabled: boolean;
  nextRunAt: Date | null;
  createdAt: Date;
}

export interface NewSchedule {
  repoId: string;
  agentId: string;
  weekdays: number[];
  hour: number;
  timezone: string;
  skipHolidays: boolean;
}

export interface ScheduleRunRecord {
  id: string;
  scheduleId: string;
  prNumbers: number[];
  ranAt: Date;
}

export interface OpenPull {
  number: number;
  headSha: string;
  status: string;
}

export interface SchedulesStore {
  list(workspaceId: string): Promise<ScheduleRecord[]>;
  find(workspaceId: string, id: string): Promise<ScheduleRecord | undefined>;
  repoExists(workspaceId: string, repoId: string): Promise<boolean>;
  insert(workspaceId: string, s: NewSchedule, nextRunAt: Date | null): Promise<ScheduleRecord>;
  update(
    workspaceId: string,
    id: string,
    patch: Partial<NewSchedule> & { enabled?: boolean; nextRunAt?: Date | null },
  ): Promise<ScheduleRecord | undefined>;
  delete(workspaceId: string, id: string): Promise<boolean>;
  /** Enabled schedules of every workspace whose next run is due. */
  listDue(now: Date): Promise<ScheduleRecord[]>;
  reviewedShas(workspaceId: string, repoId: string): Promise<Set<string>>;
  insertRun(ex: DbExecutor, run: { workspaceId: string; scheduleId: string; prNumbers: number[] }): Promise<ScheduleRunRecord>;
  setNextRun(ex: DbExecutor, workspaceId: string, id: string, at: Date | null): Promise<void>;
}

export type TransactionRunner = Pick<Db, 'transaction'>;
