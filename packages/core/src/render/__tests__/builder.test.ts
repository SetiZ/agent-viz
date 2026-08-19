import { describe, expect, it } from 'vitest';
import { aggregateRecords, type ContentRecord } from '../../aggregate';
import type { Intent } from '../../intent';
import { type SourceMetadata, blockSchema } from '../../spec';
import { renderBlocks } from '../builder';

const record = (id: string | number, attributes: Record<string, unknown>): ContentRecord => ({
  id,
  attributes,
});

const source: SourceMetadata = {
  contentType: { uid: 'api::article.article', label: 'Article' },
  tool: 'find_article',
  filters: { op: 'and', children: [] },
  recordsReturned: 3,
  recordsMatching: 3,
  truncated: false,
  retrievedAt: '2026-08-16T10:00:00Z',
  user: { id: 1, roles: ['Super Admin'] },
  permission: 'plugin::mcp-viz.run',
};

function render(
  intent: Intent,
  aggregation?: ReturnType<typeof aggregateRecords>,
  records?: ContentRecord[],
) {
  return renderBlocks({
    intent,
    sources: [source],
    effectiveFilters: { op: 'and', children: [] },
    ...(aggregation ? { aggregation } : {}),
    ...(records ? { records } : {}),
  });
}

function intent(overrides: Partial<Intent> = {}): Intent {
  return {
    kind: 'bar_chart',
    target: { uid: 'api::article.article', label: 'Article' },
    filters: { op: 'and', children: [] },
    limit: 100,
    ...overrides,
  };
}

const groupedRecords = [
  record(1, { status: 'published', views: 10 }),
  record(2, { status: 'published', views: 20 }),
  record(3, { status: 'draft', views: 5 }),
];

describe('renderBlocks — KPI', () => {
  it('renders a single-value count as a KPI', () => {
    const aggregation = aggregateRecords({ fn: 'count' }, groupedRecords);
    const output = render(intent({ kind: 'kpi' }), aggregation);
    expect(output.blocks[0]).toMatchObject({
      type: 'kpi',
      label: 'Article',
      value: 3,
      sources: ['0'],
    });
  });

  it('degrades a grouped KPI to a bar chart instead of inventing a single number', () => {
    const aggregation = aggregateRecords(
      { fn: 'count', groupBy: [{ field: 'status' }] },
      groupedRecords,
    );
    const output = render(intent({ kind: 'kpi' }), aggregation);
    expect(output.blocks[0]!.type).toBe('bar_chart');
  });
});

describe('renderBlocks — charts', () => {
  it('renders a grouped count as an aligned bar chart', () => {
    const aggregation = aggregateRecords(
      { fn: 'count', groupBy: [{ field: 'status' }] },
      groupedRecords,
    );
    const output = render(intent({ kind: 'bar_chart' }), aggregation);
    const block = output.blocks[0]!;
    expect(block.type).toBe('bar_chart');
    expect(blockSchema.safeParse(block).success).toBe(true);
    if (block.type === 'bar_chart') {
      expect(block.x).toEqual(['published', 'draft']);
      expect(block.series[0]!.data).toEqual([2, 1]);
    }
  });

  it('renders a sum grouped by two levels as a multi-series bar chart', () => {
    const records = [
      record(1, { status: 'published', views: 10 }),
      record(2, { status: 'draft', views: 5 }),
    ];
    const aggregation = aggregateRecords(
      { fn: 'sum', field: 'views', groupBy: [{ field: 'status' }] },
      records,
    );
    const output = render(intent({ kind: 'bar_chart' }), aggregation);
    const block = output.blocks[0]!;
    expect(blockSchema.safeParse(block).success).toBe(true);
    if (block.type === 'bar_chart') {
      expect(block.series[0]!.name).toBe('views');
      expect(block.series[0]!.data).toEqual([10, 5]);
    }
  });

  it('renders a time series as a line chart in chronological order', () => {
    const records = [
      record(1, { publishedAt: '2026-09-01T10:00:00Z' }),
      record(2, { publishedAt: '2026-08-16T10:00:00Z' }),
      record(3, { publishedAt: '2026-08-10T10:00:00Z' }),
    ];
    const aggregation = aggregateRecords(
      { fn: 'count', timeBucket: { field: 'publishedAt', granularity: 'day' } },
      records,
    );
    const output = render(intent({ kind: 'line_chart' }), aggregation);
    const block = output.blocks[0]!;
    expect(block.type).toBe('line_chart');
    if (block.type === 'line_chart') {
      expect(block.x).toEqual(['2026-08-10', '2026-08-16', '2026-09-01']);
      expect(block.series[0]!.data).toEqual([1, 1, 1]);
    }
  });

  it('renders a single-dimension count as a pie chart', () => {
    const aggregation = aggregateRecords(
      { fn: 'count', groupBy: [{ field: 'status' }] },
      groupedRecords,
    );
    const output = render(intent({ kind: 'pie_chart' }), aggregation);
    const block = output.blocks[0]!;
    expect(block.type).toBe('pie_chart');
    if (block.type === 'pie_chart') {
      expect(block.data).toEqual([
        { name: 'published', value: 2 },
        { name: 'draft', value: 1 },
      ]);
    }
  });

  it('degrades a pie request over a time axis to a bar chart', () => {
    const records = [
      record(1, { publishedAt: '2026-08-16T10:00:00Z' }),
      record(2, { publishedAt: '2026-08-17T10:00:00Z' }),
    ];
    const aggregation = aggregateRecords(
      { fn: 'count', timeBucket: { field: 'publishedAt', granularity: 'day' } },
      records,
    );
    const output = render(intent({ kind: 'pie_chart' }), aggregation);
    expect(output.blocks[0]!.type).toBe('bar_chart');
  });
});

describe('renderBlocks — table and text', () => {
  it('renders aggregated buckets as a table', () => {
    const aggregation = aggregateRecords(
      { fn: 'count', groupBy: [{ field: 'status' }] },
      groupedRecords,
    );
    const output = render(intent({ kind: 'table' }), aggregation);
    const block = output.blocks[0]!;
    expect(block.type).toBe('table');
    if (block.type === 'table') {
      expect(block.columns.map((column) => column.key)).toEqual(['key', 'value', 'records']);
      expect(block.rows[0]).toEqual({ key: 'published', value: 2, records: 2 });
    }
  });

  it('renders raw records as a table with an id column', () => {
    const output = render(intent({ kind: 'table' }), undefined, [
      record(1, { title: 'A', views: 10 }),
      record(2, { title: 'B', views: 20 }),
    ]);
    const block = output.blocks[0]!;
    if (block.type === 'table') {
      expect(block.columns).toEqual([
        { key: 'id', label: 'ID' },
        { key: 'title', label: 'title' },
        { key: 'views', label: 'views' },
      ]);
      expect(block.rows[0]).toEqual({ id: 1, title: 'A', views: 10 });
      expect(blockSchema.safeParse(block).success).toBe(true);
    }
  });

  it('renders a text kind as a text block', () => {
    const output = render(intent({ kind: 'text' }), undefined, groupedRecords);
    const block = output.blocks[0]!;
    expect(block.type).toBe('text');
    if (block.type === 'text') {
      expect(block.text).toMatch(/3 Articles/);
    }
  });

  it('falls back to an explanatory text block when nothing matched', () => {
    const output = render(intent({ kind: 'bar_chart' }), aggregateRecords({ fn: 'count' }, []));
    expect(output.blocks[0]).toMatchObject({
      type: 'text',
      text: 'No Article matched the filters.',
    });
  });
});

describe('renderBlocks — honesty', () => {
  it('summaries quote only real values', () => {
    const aggregation = aggregateRecords({ fn: 'count' }, groupedRecords);
    const output = render(intent({ kind: 'kpi' }), aggregation);
    expect(output.summary).toMatch(/3 Articles matched the filters/);
  });

  it('surfaces skipped and truncated caveats', () => {
    const records = [record(1, { views: 10 }), record(2, {}), record(3, { views: 'nope' })];
    const aggregation = aggregateRecords({ fn: 'sum', field: 'views' }, records, { source });
    const output = render(intent({ kind: 'kpi' }), aggregation);
    expect(output.caveats.join(' ')).toMatch(/skipped 2 record/);
  });

  it('adds a truncation caveat for plain tables', () => {
    const truncated = { ...source, recordsReturned: 2, recordsMatching: 10, truncated: true };
    const output = renderBlocks({
      intent: intent({ kind: 'table' }),
      sources: [truncated],
      effectiveFilters: { op: 'and', children: [] },
      records: [record(1, { title: 'A' }), record(2, { title: 'B' })],
    });
    expect(output.caveats.join(' ')).toMatch(/showing 2 of 10 matching records/);
  });
});
