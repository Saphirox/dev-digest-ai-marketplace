import { readFileSync } from 'node:fs';

const HOLIDAYS: ReadonlySet<string> = new Set(
  JSON.parse(readFileSync(new URL('./holidays.json', import.meta.url), 'utf8')) as string[],
);

/** `YYYY-MM-DD` of a date in the given IANA timezone. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a date in the given timezone. */
export function localWeekday(at: Date, timeZone: string): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(short) + 1;
}

/** Hour of day (0–23) of a date in the given timezone. */
export function localHour(at: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(at));
}

export function isHoliday(at: Date, timeZone: string): boolean {
  return HOLIDAYS.has(localDate(at, timeZone));
}
