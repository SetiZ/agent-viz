import { describe, expect, it } from 'vitest';
import type { SourceMetadata } from '../../spec';
import { aggregateRecords, TOTAL_KEY } from '../engine';
import type { ContentRecord } from '../types';

const record = (id: string | number, attributes: Record<string, unknown>): ContentRecord => ({
  id,
  attributes,
});

const truncatedSource: SourceMetadata = {
  contentType: { uid: 'api::article.article' },
  tool: 'find_article',
  filters: { op: 'and', children: [] },
  recordsReturned: 10,
  recordsMatching: 40,
  truncated: true,
  retrievedAt: '2026-08-16T10:00:00Z',
  user: { id: 1, roles: ['Super Admin'] },
  permission: 'plugin::mcp-viz.run',
};

describe('aggregateRecords — value functions', () => {
  it('counts records into a single total bucket', () => {
    const result = aggregateRecords({ fn: 'count' }, [record(1, {}), record(2, {}), record(3, {})]);
    expect(result.buckets).toEqual([{ key: TOTAL_KEY, value: 3, records: 3 }]);
    expect(result.totalRecords).toBe(3);
    expect(result.provenance.method).toBe('deterministic');
  });

  it('sums a numeric field', () => {
    const records = [record(1, { views: 10 }), record(2, { views: 20 }), record(3, { views: 5 })];
    const result = aggregateRecords({ fn: 'sum', field: 'views' }, records);
    expect(result.buckets).toEqual([{ key: TOTAL_KEY, value: 35, records: 3 }]);
  });

  it('averages a numeric field', () => {
    const records = [record(1, { views: 10 }), record(2, { views: 30 })];
    const result = aggregateRecords({ fn: 'avg', field: 'views' }, records);
    expect(result.buckets[0]!.value).toBe(20);
  });

  it('computes min and max', () => {
    const records = [record(1, { views: 10 }), record(2, { views: 30 }), record(3, { views: 5 })];
    expect(aggregateRecords({ fn: 'min', field: 'views' }, records).buckets[0]!.value).toBe(5);
    expect(aggregateRecords({ fn: 'max', field: 'views' }, records).buckets[0]!.value).toBe(30);
  });

  it('counts distinct raw values', () => {
    const records = [
      record(1, { status: 'draft' }),
      record(2, { status: 'published' }),
      record(3, { status: 'draft' }),
    ];
    const result = aggregateRecords({ fn: 'distinct', field: 'status' }, records);
    expect(result.buckets[0]!.value).toBe(2);
  });
});

describe('aggregateRecords — grouping', () => {
  it('groups by a field, ordered by value descending', () => {
    const records = [
      record(1, { status: 'published' }),
      record(2, { status: 'published' }),
      record(3, { status: 'draft' }),
    ];
    const result = aggregateRecords({ fn: 'count', groupBy: [{ field: 'status' }] }, records);
    expect(result.buckets).toEqual([
      { key: 'published', value: 2, records: 2 },
      { key: 'draft', value: 1, records: 1 },
    ]);
  });

  it('supports two grouping levels via subKey', () => {
    const records = [
      record(1, { category: 'a', region: 'north' }),
      record(2, { category: 'a', region: 'south' }),
      record(3, { category: 'a', region: 'north' }),
    ];
    const result = aggregateRecords(
      { fn: 'count', groupBy: [{ field: 'category' }, { field: 'region' }] },
      records,
    );
    expect(result.buckets).toEqual([
      { key: 'a', subKey: 'north', value: 2, records: 2 },
      { key: 'a', subKey: 'south', value: 1, records: 1 },
    ]);
  });

  it('groups by time bucket chronologically', () => {
    const records = [
      record(1, { publishedAt: '2026-09-01T10:00:00Z' }),
      record(2, { publishedAt: '2026-08-16T10:00:00Z' }),
      record(3, { publishedAt: '2026-08-16T11:00:00Z' }),
      record(4, { publishedAt: '2026-08-10T10:00:00Z' }),
    ];
    const result = aggregateRecords(
      { fn: 'count', timeBucket: { field: 'publishedAt', granularity: 'day' } },
      records,
    );
    expect(result.buckets.map((bucket) => bucket.key)).toEqual([
      '2026-08-10',
      '2026-08-16',
      '2026-09-01',
    ]);
    expect(result.buckets.map((bucket) => bucket.value)).toEqual([1, 2, 1]);
  });

  it('buckets by the timezone at day boundaries', () => {
    const records = [record(1, { publishedAt: '2026-08-16T01:00:00Z' })];
    const newYork = aggregateRecords(
      {
        fn: 'count',
        timeBucket: { field: 'publishedAt', granularity: 'day', timezone: 'America/New_York' },
      },
      records,
    );
    expect(newYork.buckets[0]!.key).toBe('2026-08-15');

    const utc = aggregateRecords(
      { fn: 'count', timeBucket: { field: 'publishedAt', granularity: 'day', timezone: 'UTC' } },
      records,
    );
    expect(utc.buckets[0]!.key).toBe('2026-08-16');
  });

  it('supports a secondary series on a time axis', () => {
    const records = [
      record(1, { publishedAt: '2026-08-16T10:00:00Z', status: 'published' }),
      record(2, { publishedAt: '2026-08-16T11:00:00Z', status: 'draft' }),
      record(3, { publishedAt: '2026-08-17T10:00:00Z', status: 'published' }),
    ];
    const result = aggregateRecords(
      {
        fn: 'count',
        timeBucket: { field: 'publishedAt', granularity: 'day' },
        groupBy: [{ field: 'status' }],
      },
      records,
    );
    expect(result.buckets).toEqual([
      { key: '2026-08-16', subKey: 'published', value: 1, records: 1 },
      { key: '2026-08-16', subKey: 'draft', value: 1, records: 1 },
      { key: '2026-08-17', subKey: 'published', value: 1, records: 1 },
    ]);
  });

  it('keeps only the top-N primary categories when requested', () => {
    const records = [
      record(1, { status: 'a' }),
      record(2, { status: 'a' }),
      record(3, { status: 'b' }),
      record(4, { status: 'c' }),
    ];
    const result = aggregateRecords(
      { fn: 'count', groupBy: [{ field: 'status' }], top: 2 },
      records,
    );
    expect(result.buckets.map((bucket) => bucket.key)).toEqual(['a', 'b']);
  });
});

describe('aggregateRecords — honesty guards', () => {
  it('skips records without a usable value and reports a caveat', () => {
    const records = [record(1, { views: 10 }), record(2, { views: 'not-a-number' }), record(3, {})];
    const result = aggregateRecords({ fn: 'sum', field: 'views' }, records);
    expect(result.buckets[0]!.value).toBe(10);
    expect(result.caveats.join(' ')).toMatch(/skipped 2 record/);
  });

  it('reports truncation from the source metadata', () => {
    const records = [record(1, {}), record(2, {})];
    const result = aggregateRecords({ fn: 'count' }, records, { source: truncatedSource });
    expect(result.caveats.join(' ')).toMatch(/first 10 of 40 matching records/);
  });

  it('throws when a value function has no field', () => {
    expect(() => aggregateRecords({ fn: 'sum' } as never, [record(1, {})])).toThrow(
      /requires a field/,
    );
  });
});
