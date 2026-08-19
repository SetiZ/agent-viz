import { describe, expect, it } from 'vitest';
import {
  analyticalResponseSchema,
  sourceMetadataSchema,
  type AnalyticalResponse,
} from '../response';

function validResponse(): unknown {
  return {
    summary: 'Top articles this month.',
    blocks: [
      { type: 'kpi', label: 'Articles', value: 42 },
      {
        type: 'bar_chart',
        title: 'Views per article',
        x: ['A', 'B'],
        series: [{ name: 'Views', data: [10, 20] }],
      },
    ],
    sources: [
      {
        contentType: { uid: 'api::article.article', label: 'Article' },
        tool: 'find_article',
        filters: {
          op: 'and',
          children: [{ field: 'publishedAt', op: 'gt', value: '2026-08-01T00:00:00Z' }],
        },
        dateRange: {
          start: '2026-08-01T00:00:00Z',
          end: '2026-08-31T23:59:59Z',
          granularity: 'month',
        },
        recordsReturned: 2,
        recordsMatching: 42,
        truncated: false,
        retrievedAt: '2026-08-16T10:00:00Z',
        user: { id: 1, roles: ['Super Admin'] },
        permission: 'plugin::mcp-viz.run',
      },
    ],
    filters: {
      op: 'and',
      children: [{ field: 'publishedAt', op: 'gt', value: '2026-08-01T00:00:00Z' }],
    },
    dateRange: { start: '2026-08-01T00:00:00Z', end: '2026-08-31T23:59:59Z', granularity: 'month' },
    caveats: [],
    generatedAt: '2026-08-16T10:00:01Z',
    runtime: { orchestrator: 'simple', stages: [{ name: 'intent', ms: 1200 }] },
  };
}

describe('analyticalResponseSchema', () => {
  it('accepts a well-formed response', () => {
    const result = analyticalResponseSchema.safeParse(validResponse());
    expect(result.success).toBe(true);
  });

  it('rejects a response without sources', () => {
    const response = validResponse() as Record<string, unknown>;
    delete response.sources;
    expect(analyticalResponseSchema.safeParse(response).success).toBe(false);
  });

  it('rejects missing effective filters', () => {
    const response = validResponse() as Record<string, unknown>;
    delete response.filters;
    expect(analyticalResponseSchema.safeParse(response).success).toBe(false);
  });

  it('rejects recordsReturned greater than recordsMatching', () => {
    const response = validResponse() as AnalyticalResponse;
    const source = response.sources[0];
    expect(source).toBeDefined();
    source!.recordsReturned = 50;
    expect(analyticalResponseSchema.safeParse(response).success).toBe(false);
  });

  it('rejects an invalid generatedAt date', () => {
    const response = validResponse() as AnalyticalResponse;
    response.generatedAt = 'not-a-date';
    expect(analyticalResponseSchema.safeParse(response).success).toBe(false);
  });

  it('rejects missing runtime info', () => {
    const response = validResponse() as Record<string, unknown>;
    delete response.runtime;
    expect(analyticalResponseSchema.safeParse(response).success).toBe(false);
  });

  it('rejects unknown top-level keys (strict)', () => {
    const response = validResponse() as Record<string, unknown>;
    response.rawHtml = '<div>escape hatch</div>';
    expect(analyticalResponseSchema.safeParse(response).success).toBe(false);
  });

  it('rejects a response containing an invalid block', () => {
    const response = validResponse() as AnalyticalResponse;
    response.blocks.push({ type: 'line_chart', x: ['a', 'b'], series: [{ name: 's', data: [1] }] });
    expect(analyticalResponseSchema.safeParse(response).success).toBe(false);
  });
});

describe('sourceMetadataSchema', () => {
  it('carries identity and permission provenance', () => {
    const source = {
      contentType: { uid: 'api::article.article' },
      tool: 'find_article',
      filters: { op: 'and', children: [] },
      recordsReturned: 0,
      recordsMatching: 0,
      truncated: false,
      retrievedAt: '2026-08-16T10:00:00Z',
      user: { id: 'u-1', roles: ['Editor'] },
      permission: 'plugin::mcp-viz.run',
    };
    expect(sourceMetadataSchema.safeParse(source).success).toBe(true);
  });

  it('rejects a source missing the user identity', () => {
    const source = {
      contentType: { uid: 'api::article.article' },
      tool: 'find_article',
      filters: { op: 'and', children: [] },
      recordsReturned: 0,
      recordsMatching: 0,
      truncated: false,
      retrievedAt: '2026-08-16T10:00:00Z',
      permission: 'plugin::mcp-viz.run',
    };
    expect(sourceMetadataSchema.safeParse(source).success).toBe(false);
  });
});
