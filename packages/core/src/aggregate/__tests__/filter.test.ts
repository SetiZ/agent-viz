import { describe, expect, it } from 'vitest';
import { filterRecords, sortRecords } from '../filter';
import type { ContentRecord } from '../types';

const record = (id: string | number, attributes: Record<string, unknown>): ContentRecord => ({
  id,
  attributes,
});

const articles = [
  record(1, { title: 'Alpha', views: 10, publishedAt: '2025-11-03T10:00:00Z' }),
  record(2, { title: 'Beta', views: 40, publishedAt: '2026-01-15T10:00:00Z' }),
  record(3, { title: 'Gamma', views: 20, publishedAt: '2026-03-02T10:00:00Z' }),
  record(4, { title: 'Delta', views: 30, publishedAt: null }),
];

describe('filterRecords', () => {
  it('returns records unchanged for an empty group', () => {
    expect(filterRecords(articles, { op: 'and', children: [] })).toEqual(articles);
  });

  it('filters by a date range (between)', () => {
    const result = filterRecords(articles, {
      op: 'and',
      children: [
        {
          field: 'publishedAt',
          op: 'between',
          value: ['2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z'],
        },
      ],
    });
    expect(result.map((entry) => entry.id)).toEqual([2, 3]);
  });

  it('combines multiple filters with and/or semantics', () => {
    const result = filterRecords(articles, {
      op: 'and',
      children: [
        { field: 'views', op: 'gte', value: 20 },
        { field: 'title', op: 'startsWith', value: 'G' },
      ],
    });
    expect(result.map((entry) => entry.id)).toEqual([3]);
  });

  it('handles isNotNull and nested groups', () => {
    const result = filterRecords(articles, {
      op: 'and',
      children: [
        { field: 'publishedAt', op: 'isNotNull', value: null },
        {
          op: 'or',
          children: [
            { field: 'views', op: 'lte', value: 10 },
            { field: 'views', op: 'gte', value: 30 },
          ],
        },
      ],
    });
    expect(result.map((entry) => entry.id)).toEqual([1, 2]);
  });
});

describe('sortRecords', () => {
  it('sorts ascending by a date field with nulls last', () => {
    const result = sortRecords(articles, [{ field: 'publishedAt', dir: 'asc' }]);
    expect(result.map((entry) => entry.id)).toEqual([1, 2, 3, 4]);
  });

  it('sorts descending by a numeric field', () => {
    const result = sortRecords(articles, [{ field: 'views', dir: 'desc' }]);
    expect(result.map((entry) => entry.id)).toEqual([2, 4, 3, 1]);
  });
});
