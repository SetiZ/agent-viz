import type { Granularity } from '../spec';

/**
 * Bucket labels are computed from the retrieved timestamp in the requested
 * timezone, so a model can never influence the category labels — they always
 * reflect real clock time in a real zone.
 */
export function timeBucketKey(ms: number, granularity: Granularity, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  const year = part('year');
  const month = part('month');
  const day = part('day');

  switch (granularity) {
    case 'year':
      return year;
    case 'quarter':
      return `${year}-Q${Math.ceil(Number(month) / 3)}`;
    case 'month':
      return `${year}-${month}`;
    case 'week':
      return `${year}-W${isoWeek(year, month, day)}`;
    case 'day':
      return `${year}-${month}-${day}`;
  }
}

/** ISO-8601 week number, treating the timezone-local calendar date as a UTC date. */
function isoWeek(year: string, month: string, day: string): string {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const target = new Date(date);
  const dayNumber = (date.getUTCDay() + 6) % 7; // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);

  const week =
    1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return String(week).padStart(2, '0');
}
