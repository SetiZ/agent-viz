import { describe, expect, it } from 'vitest';
import {
  barChartBlockSchema,
  blockSchema,
  errorBlockSchema,
  kpiBlockSchema,
  lineChartBlockSchema,
  pieChartBlockSchema,
  tableBlockSchema,
  textBlockSchema,
  type Block,
} from '../blocks';

describe('textBlockSchema', () => {
  it('accepts a plain text block', () => {
    expect(textBlockSchema.safeParse({ type: 'text', text: 'hello' }).success).toBe(true);
  });

  it('rejects a missing text field', () => {
    expect(textBlockSchema.safeParse({ type: 'text' }).success).toBe(false);
  });

  it('rejects unknown keys (strict) so no HTML or scripts can hide there', () => {
    expect(
      textBlockSchema.safeParse({ type: 'text', text: 'x', html: '<script>alert(1)</script>' })
        .success,
    ).toBe(false);
  });
});

describe('kpiBlockSchema', () => {
  it('accepts a numeric value', () => {
    expect(kpiBlockSchema.safeParse({ type: 'kpi', label: 'Articles', value: 42 }).success).toBe(
      true,
    );
  });

  it('accepts a string value', () => {
    expect(
      kpiBlockSchema.safeParse({ type: 'kpi', label: 'Status', value: 'published' }).success,
    ).toBe(true);
  });

  it('accepts delta and direction', () => {
    expect(
      kpiBlockSchema.safeParse({
        type: 'kpi',
        label: 'Articles',
        value: 42,
        delta: -3,
        deltaDirection: 'down',
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid delta direction', () => {
    expect(
      kpiBlockSchema.safeParse({
        type: 'kpi',
        label: 'Articles',
        value: 42,
        delta: 1,
        deltaDirection: 'sideways',
      }).success,
    ).toBe(false);
  });

  it('rejects NaN values', () => {
    expect(
      kpiBlockSchema.safeParse({ type: 'kpi', label: 'Articles', value: Number.NaN }).success,
    ).toBe(false);
  });
});

describe('tableBlockSchema', () => {
  const valid = {
    type: 'table' as const,
    title: 'Top articles',
    columns: [
      { key: 'title', label: 'Title' },
      { key: 'views', label: 'Views' },
    ],
    rows: [
      { title: 'A', views: 10 },
      { title: 'B', views: 20 },
    ],
  };

  it('accepts a well-formed table', () => {
    expect(tableBlockSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a table with no columns', () => {
    expect(tableBlockSchema.safeParse({ ...valid, columns: [] }).success).toBe(false);
  });

  it('rejects a row missing a declared column', () => {
    expect(tableBlockSchema.safeParse({ ...valid, rows: [{ title: 'A' }] }).success).toBe(false);
  });

  it('accepts a table without sources', () => {
    expect(tableBlockSchema.safeParse({ ...valid, sources: undefined }).success).toBe(true);
  });
});

describe('line/bar chart schemas', () => {
  const validLine = {
    type: 'line_chart' as const,
    title: 'Views over time',
    x: ['2026-08-10', '2026-08-11', '2026-08-12'],
    series: [{ name: 'Views', data: [1, 2, 3] }],
  };

  it('accepts an aligned line chart', () => {
    expect(lineChartBlockSchema.safeParse(validLine).success).toBe(true);
  });

  it('rejects a misaligned series (data must line up with categories)', () => {
    const misaligned = { ...validLine, series: [{ name: 'Views', data: [1, 2] }] };
    expect(lineChartBlockSchema.safeParse(misaligned).success).toBe(false);
  });

  it('rejects an empty series list', () => {
    expect(lineChartBlockSchema.safeParse({ ...validLine, series: [] }).success).toBe(false);
  });

  it('rejects NaN in series data', () => {
    expect(
      lineChartBlockSchema.safeParse({
        ...validLine,
        series: [{ name: 'Views', data: [1, Number.NaN, 3] }],
      }).success,
    ).toBe(false);
  });

  it('rejects unknown keys on line charts (e.g. stacked)', () => {
    expect(lineChartBlockSchema.safeParse({ ...validLine, stacked: true }).success).toBe(false);
  });

  it('accepts bar charts with stacking/horizontal flags', () => {
    const valid = {
      type: 'bar_chart' as const,
      x: ['A', 'B'],
      series: [
        { name: 'x', data: [1, 2] },
        { name: 'y', data: [3, 4] },
      ],
      stacked: true,
      horizontal: false,
    };
    expect(barChartBlockSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a misaligned bar chart', () => {
    const valid = {
      type: 'bar_chart' as const,
      x: ['A', 'B'],
      series: [{ name: 'x', data: [1] }],
    };
    expect(barChartBlockSchema.safeParse(valid).success).toBe(false);
  });
});

describe('pieChartBlockSchema', () => {
  it('accepts a pie chart', () => {
    expect(
      pieChartBlockSchema.safeParse({ type: 'pie_chart', data: [{ name: 'A', value: 1 }] }).success,
    ).toBe(true);
  });

  it('rejects empty data', () => {
    expect(pieChartBlockSchema.safeParse({ type: 'pie_chart', data: [] }).success).toBe(false);
  });

  it('rejects negative slice values', () => {
    expect(
      pieChartBlockSchema.safeParse({ type: 'pie_chart', data: [{ name: 'A', value: -1 }] })
        .success,
    ).toBe(false);
  });

  it('rejects NaN slice values', () => {
    expect(
      pieChartBlockSchema.safeParse({ type: 'pie_chart', data: [{ name: 'A', value: Number.NaN }] })
        .success,
    ).toBe(false);
  });
});

describe('errorBlockSchema', () => {
  it('accepts an error block', () => {
    expect(
      errorBlockSchema.safeParse({ type: 'error', code: 'E_NO_DATA', message: 'nothing found' })
        .success,
    ).toBe(true);
  });
});

describe('blockSchema (discriminated union)', () => {
  it('accepts every block type', () => {
    const blocks: unknown[] = [
      { type: 'text', text: 'hi' },
      { type: 'kpi', label: 'a', value: 1 },
      { type: 'table', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 1 }] },
      { type: 'line_chart', x: ['a'], series: [{ name: 's', data: [1] }] },
      { type: 'bar_chart', x: ['a'], series: [{ name: 's', data: [1] }] },
      { type: 'pie_chart', data: [{ name: 'a', value: 1 }] },
      { type: 'error', code: 'E', message: 'm' },
    ];
    for (const block of blocks) {
      expect(blockSchema.safeParse(block).success, JSON.stringify(block)).toBe(true);
    }
  });

  it('rejects an unknown block type', () => {
    expect(blockSchema.safeParse({ type: 'histogram', data: [] }).success).toBe(false);
  });

  it('rejects a misaligned chart inside the union', () => {
    const bad: unknown = { type: 'line_chart', x: ['a', 'b'], series: [{ name: 's', data: [1] }] };
    expect(blockSchema.safeParse(bad).success).toBe(false);
  });

  it('infers a closed Block type', () => {
    const block: Block = { type: 'text', text: 'ok' };
    expect(block.type).toBe('text');
  });
});
