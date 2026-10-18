import type { Schedule } from '@devdigest/shared';
import { isHoliday, localHour, localWeekday } from './calendar.js';
import { MAX_LOOKAHEAD_DAYS, MAX_PRS_PER_RUN } from './constants.js';
import type { OpenPull, ScheduleRecord } from './ports.js';

const HOUR_MS = 60 * 60 * 1000;
const CLOSED = new Set(['closed', 'merged']);

export interface ScheduleSpec {
  weekdays: number[];
  hour: number;
  timezone: string;
  skipHolidays: boolean;
}

/** Weekdays deduplicated and sorted; out-of-range values dropped. */
export function normalizeWeekdays(days: number[]): number[] {
  return [...new Set(days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * First whole hour strictly after `from` that falls on one of the schedule's
 * weekdays at its hour (in its timezone), skipping holidays when asked.
 * Null when nothing matches within the lookahead window.
 */
export function nextRunAt(spec: ScheduleSpec, from: Date): Date | null {
  if (spec.weekdays.length === 0) return null;
  const start = new Date(Math.floor(from.getTime() / HOUR_MS) * HOUR_MS + HOUR_MS);
  for (let h = 0; h < MAX_LOOKAHEAD_DAYS * 24; h++) {
    const at = new Date(start.getTime() + h * HOUR_MS);
    if (localHour(at, spec.timezone) !== spec.hour) continue;
    if (!spec.weekdays.includes(localWeekday(at, spec.timezone))) continue;
    if (spec.skipHolidays && isHoliday(at, spec.timezone)) continue;
    return at;
  }
  return null;
}

/** Still-open PRs whose head commit hasn't been reviewed yet, oldest first, capped. */
export function pickPullsToReview(pulls: OpenPull[], reviewedShas: Set<string>): OpenPull[] {
  return pulls
    .filter((p) => !CLOSED.has(p.status) && !reviewedShas.has(p.headSha))
    .sort((a, b) => a.number - b.number)
    .slice(0, MAX_PRS_PER_RUN);
}

export function toScheduleDto(r: ScheduleRecord): Schedule {
  return {
    id: r.id,
    repo_id: r.repoId,
    agent_id: r.agentId,
    weekdays: r.weekdays,
    hour: r.hour,
    timezone: r.timezone,
    skip_holidays: r.skipHolidays,
    enabled: r.enabled,
    next_run_at: r.nextRunAt?.toISOString() ?? null,
    created_at: r.createdAt.toISOString(),
  };
}
