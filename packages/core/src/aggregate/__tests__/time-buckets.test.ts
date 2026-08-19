import { describe, expect, it } from 'vitest';
import { timeBucketKey } from '../time-buckets';

const utc = (iso: string) => Date.parse(iso);

describe('timeBucketKey', () => {
  it('buckets by day', () => {
    expect(timeBucketKey(utc('2026-08-16T10:00:00Z'), 'day', 'UTC')).toBe('2026-08-16');
  });

  it('buckets by month', () => {
    expect(timeBucketKey(utc('2026-08-16T10:00:00Z'), 'month', 'UTC')).toBe('2026-08');
  });

  it('buckets by quarter', () => {
    expect(timeBucketKey(utc('2026-08-16T10:00:00Z'), 'quarter', 'UTC')).toBe('2026-Q3');
    expect(timeBucketKey(utc('2026-02-10T10:00:00Z'), 'quarter', 'UTC')).toBe('2026-Q1');
  });

  it('buckets by year', () => {
    expect(timeBucketKey(utc('2026-08-16T10:00:00Z'), 'year', 'UTC')).toBe('2026');
  });

  it('buckets by ISO week', () => {
    expect(timeBucketKey(utc('2026-01-01T12:00:00Z'), 'week', 'UTC')).toBe('2026-W01');
  });

  it('respects the timezone at day boundaries', () => {
    // 2026-08-16T01:00:00Z is still Aug 15 in New York (UTC-4 in summer).
    expect(timeBucketKey(utc('2026-08-16T01:00:00Z'), 'day', 'America/New_York')).toBe(
      '2026-08-15',
    );
    expect(timeBucketKey(utc('2026-08-16T01:00:00Z'), 'day', 'UTC')).toBe('2026-08-16');
  });
});
