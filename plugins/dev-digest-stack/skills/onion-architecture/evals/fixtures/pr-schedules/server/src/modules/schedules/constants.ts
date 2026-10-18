export const SCHEDULE_TICK_JOB_KIND = 'schedules.tick';

/** Open PRs picked per schedule run; the rest wait for the next run. */
export const MAX_PRS_PER_RUN = 20;

export const DEFAULT_TIMEZONE = 'UTC';

/** Weekdays a schedule may name, Monday first (ISO 8601 numbering). */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** A schedule never looks further ahead than this when finding its next slot. */
export const MAX_LOOKAHEAD_DAYS = 31;
