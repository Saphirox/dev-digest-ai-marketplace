import type { GitHubClient, Schedule, ScheduleCreate, ScheduleList, SchedulePatch } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { DEFAULT_TIMEZONE } from './constants.js';
import {
  isValidTimezone,
  nextRunAt,
  normalizeWeekdays,
  pickPullsToReview,
  toScheduleDto,
  type ScheduleSpec,
} from './helpers.js';
import type { NewSchedule, ScheduleRecord, SchedulesStore, TransactionRunner } from './ports.js';

export interface SchedulesServiceDeps {
  store: SchedulesStore;
  db: TransactionRunner;
  github: () => Promise<GitHubClient>;
  now?: () => Date;
}

export interface RunDueResult {
  ran: number;
  failed: number;
}

/**
 * Scheduled reviews: a repo + agent + weekly slot. Each tick picks the open
 * PRs whose head commit hasn't been reviewed yet, records them as one run,
 * and moves the schedule to its next slot.
 */
export class SchedulesService {
  constructor(private deps: SchedulesServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async list(workspaceId: string): Promise<ScheduleList> {
    const rows = await this.deps.store.list(workspaceId);
    return { schedules: rows.map(toScheduleDto) };
  }

  async create(workspaceId: string, input: ScheduleCreate): Promise<Schedule> {
    const { store } = this.deps;
    if (!(await store.repoExists(workspaceId, input.repo_id))) {
      throw new NotFoundError(`Repo ${input.repo_id} not found`);
    }
    const s = this.toNewSchedule(input);
    const row = await store.insert(workspaceId, s, nextRunAt(s, this.now()));
    return toScheduleDto(row);
  }

  async update(workspaceId: string, id: string, patch: SchedulePatch): Promise<Schedule> {
    const { store } = this.deps;
    const existing = await store.find(workspaceId, id);
    if (!existing) throw new NotFoundError(`Schedule ${id} not found`);

    const spec: ScheduleSpec = {
      weekdays: patch.weekdays !== undefined ? normalizeWeekdays(patch.weekdays) : existing.weekdays,
      hour: patch.hour ?? existing.hour,
      timezone: patch.timezone ?? existing.timezone,
      skipHolidays: patch.skip_holidays ?? existing.skipHolidays,
    };
    this.validate(spec);
    const enabled = patch.enabled ?? existing.enabled;
    const row = await store.update(workspaceId, id, {
      ...spec,
      enabled,
      nextRunAt: enabled ? nextRunAt(spec, this.now()) : null,
    });
    if (!row) throw new NotFoundError(`Schedule ${id} not found`);
    return toScheduleDto(row);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    if (!(await this.deps.store.delete(workspaceId, id))) throw new NotFoundError(`Schedule ${id} not found`);
  }

  /** One scheduler tick, across every workspace. A failing schedule doesn't stop the others. */
  async runDue(): Promise<RunDueResult> {
    const now = this.now();
    const due = await this.deps.store.listDue(now);
    let ran = 0;
    let failed = 0;
    for (const schedule of due) {
      try {
        await this.runOne(schedule, now);
        ran++;
      } catch {
        failed++;
      }
    }
    return { ran, failed };
  }

  private async runOne(schedule: ScheduleRecord, now: Date): Promise<void> {
    const { store, db, github } = this.deps;
    const reviewed = await store.reviewedShas(schedule.workspaceId, schedule.repoId);
    await db.transaction(async (tx) => {
      const gh = await github();
      const open = await gh.listPullRequests({ owner: schedule.repoOwner, name: schedule.repoName });
      const picked = pickPullsToReview(
        open.map((p) => ({ number: p.number, headSha: p.head_sha, status: p.status })),
        reviewed,
      );
      await store.insertRun(tx, {
        workspaceId: schedule.workspaceId,
        scheduleId: schedule.id,
        prNumbers: picked.map((p) => p.number),
      });
      await store.setNextRun(tx, schedule.workspaceId, schedule.id, nextRunAt(schedule, now));
    });
  }

  private toNewSchedule(input: ScheduleCreate): NewSchedule {
    const s: NewSchedule = {
      repoId: input.repo_id,
      agentId: input.agent_id,
      weekdays: normalizeWeekdays(input.weekdays),
      hour: input.hour,
      timezone: input.timezone ?? DEFAULT_TIMEZONE,
      skipHolidays: input.skip_holidays ?? false,
    };
    this.validate(s);
    return s;
  }

  private validate(spec: ScheduleSpec): void {
    if (spec.weekdays.length === 0) throw new ValidationError('Pick at least one weekday.');
    if (!Number.isInteger(spec.hour) || spec.hour < 0 || spec.hour > 23) {
      throw new ValidationError('Hour must be a whole number from 0 to 23.');
    }
    if (!isValidTimezone(spec.timezone)) throw new ValidationError(`Unknown timezone "${spec.timezone}".`);
  }
}
