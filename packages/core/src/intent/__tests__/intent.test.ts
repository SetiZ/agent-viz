import { describe, expect, it } from 'vitest';
import { aggregationSpecSchema, intentSchema } from '../intent';

function validIntent() {
  return {
    kind: 'bar_chart',
    target: { uid: 'api::article.article', label: 'Article' },
    filters: { op: 'and', children: [] },
    aggregation: { fn: 'count', groupBy: [{ field: 'status' }] },
    limit: 100,
  };
}

describe('aggregationSpecSchema', () => {
  it('accepts count without a field', () => {
    expect(aggregationSpecSchema.safeParse({ fn: 'count' }).success).toBe(true);
  });

  it('requires a field for sum/avg/min/max/distinct', () => {
    for (const fn of ['sum', 'avg', 'min', 'max', 'distinct']) {
      expect(aggregationSpecSchema.safeParse({ fn }).success, fn).toBe(false);
    }
  });

  it('accepts at most two groupBy levels', () => {
    const two = { fn: 'count', groupBy: [{ field: 'a' }, { field: 'b' }] };
    expect(aggregationSpecSchema.safeParse(two).success).toBe(true);

    const three = { fn: 'count', groupBy: [{ field: 'a' }, { field: 'b' }, { field: 'c' }] };
    expect(aggregationSpecSchema.safeParse(three).success).toBe(false);
  });

  it('rejects "top" without groupBy or timeBucket', () => {
    expect(aggregationSpecSchema.safeParse({ fn: 'count', top: 5 }).success).toBe(false);
    expect(
      aggregationSpecSchema.safeParse({ fn: 'count', groupBy: [{ field: 'a' }], top: 5 }).success,
    ).toBe(true);
  });

  it('rejects an unknown aggregation function', () => {
    expect(aggregationSpecSchema.safeParse({ fn: 'median', field: 'views' }).success).toBe(false);
  });
});

describe('intentSchema', () => {
  it('accepts a well-formed intent', () => {
    expect(intentSchema.safeParse(validIntent()).success).toBe(true);
  });

  it('accepts a plain retrieval intent without aggregation', () => {
    const { aggregation: _dropped, ...intent } = validIntent();
    expect(intentSchema.safeParse(intent).success).toBe(true);
  });

  it('accepts every concrete block kind', () => {
    for (const kind of ['text', 'kpi', 'table', 'line_chart', 'bar_chart', 'pie_chart']) {
      expect(intentSchema.safeParse({ ...validIntent(), kind }).success, kind).toBe(true);
    }
  });

  it('rejects an unknown kind', () => {
    const intent = { ...validIntent(), kind: 'histogram' };
    expect(intentSchema.safeParse(intent).success).toBe(false);
  });

  it('rejects a non-positive limit', () => {
    expect(intentSchema.safeParse({ ...validIntent(), limit: 0 }).success).toBe(false);
    expect(intentSchema.safeParse({ ...validIntent(), limit: -5 }).success).toBe(false);
  });

  it('rejects an invalid sort direction', () => {
    expect(
      intentSchema.safeParse({ ...validIntent(), sort: [{ field: 'views', dir: 'sideways' }] })
        .success,
    ).toBe(false);
  });

  it('rejects an empty target uid', () => {
    expect(intentSchema.safeParse({ ...validIntent(), target: { uid: '' } }).success).toBe(false);
  });

  it('strips unknown top-level keys instead of rejecting (model-facing)', () => {
    const result = intentSchema.safeParse({ ...validIntent(), rawSql: 'SELECT 1' });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('rawSql');
    expect(result.data).toMatchObject({ kind: 'bar_chart', limit: 100 });
  });

  it('rejects an aggregation missing its required field', () => {
    expect(intentSchema.safeParse({ ...validIntent(), aggregation: { fn: 'sum' } }).success).toBe(
      false,
    );
  });
});
