import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Intent } from '../../intent';
import { PLANNER_LIMITS } from '../limits';
import { PlanError, planQuery } from '../planner';
import type { ContentTypeSchema, ToolDescriptor, ToolRegistry } from '../registry';

function makeRegistry(readTool = true): ToolRegistry {
  const article: ContentTypeSchema = {
    uid: 'api::article.article',
    label: 'Article',
    fields: {
      title: { type: 'string' },
      views: { type: 'number' },
      status: { type: 'enumeration', enum: ['draft', 'published'] },
      publishedAt: { type: 'datetime', filterable: false },
      createdAt: { type: 'datetime', filterable: true },
      author: { type: 'relation', target: 'admin::user' },
      body: { type: 'richtext' },
    },
  };
  const schemas = new Map<string, ContentTypeSchema>([[article.uid, article]]);
  const tools: ToolDescriptor[] = [];
  if (readTool) {
    tools.push({
      name: 'find_article',
      contentType: article.uid,
      description: 'Find articles',
      permission: 'plugin::mcp-viz.run',
      inputSchema: z.object({}),
    });
  }
  return {
    contentTypes: () => [...schemas.values()],
    contentType: (uid) => schemas.get(uid),
    findTool: (name) => tools.find((entry) => entry.name === name),
    toolsForContentType: (uid) => tools.filter((entry) => entry.contentType === uid),
    tools: () => [...tools],
  };
}

function baseIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    kind: 'table',
    target: { uid: 'api::article.article', label: 'Article' },
    filters: { op: 'and', children: [] },
    limit: 100,
    ...overrides,
  };
}

function makeStrapi52Registry(): ToolRegistry {
  const article: ContentTypeSchema = {
    uid: 'api::article.article',
    label: 'Article',
    fields: {
      title: { type: 'string' },
      views: { type: 'number' },
      status: { type: 'enumeration', enum: ['draft', 'published'] },
      publishedAt: { type: 'datetime', filterable: false },
      createdAt: { type: 'datetime', filterable: true },
    },
  };
  const schemas = new Map<string, ContentTypeSchema>([[article.uid, article]]);
  const tools: ToolDescriptor[] = [
    {
      name: 'list_article',
      contentType: article.uid,
      description: 'List articles',
      permission: 'plugin::content-manager.explorer.read',
      inputSchema: z.object({}),
    },
    {
      name: 'get_article',
      contentType: article.uid,
      description: 'Get one article',
      permission: 'plugin::content-manager.explorer.read',
      inputSchema: z.object({}),
    },
  ];
  return {
    contentTypes: () => [...schemas.values()],
    contentType: (uid) => schemas.get(uid),
    findTool: (name) => tools.find((entry) => entry.name === name),
    toolsForContentType: (uid) => tools.filter((entry) => entry.contentType === uid),
    tools: () => [...tools],
  };
}

describe('planQuery', () => {
  it('plans a single read step against the read tool', () => {
    const plan = planQuery(baseIntent(), makeRegistry());
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      tool: 'find_article',
      contentType: 'api::article.article',
      permission: 'plugin::mcp-viz.run',
      args: { pagination: { page: 1, pageSize: 100 }, filters: {} },
    });
  });

  it('clamps the record limit to maxRecords', () => {
    const plan = planQuery(baseIntent({ limit: 10000 }), makeRegistry());
    expect(plan.intent.limit).toBe(PLANNER_LIMITS.maxRecords);
    expect(plan.steps[0]!.args.pagination.pageSize).toBe(PLANNER_LIMITS.maxPageSize);
  });

  it('merges timeRange into the effective filters on a date field', () => {
    const plan = planQuery(
      baseIntent({
        timeRange: {
          start: '2026-08-01T00:00:00Z',
          end: '2026-08-31T23:59:59Z',
          granularity: 'month',
        },
      }),
      makeRegistry(),
    );
    expect(plan.dateRange).toEqual({
      start: '2026-08-01T00:00:00Z',
      end: '2026-08-31T23:59:59Z',
      granularity: 'month',
    });
    expect(plan.effectiveFilters.children).toContainEqual({
      field: 'createdAt',
      op: 'between',
      value: ['2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z'],
    });
  });

  it('throws NOT_FILTERABLE for a filter on a non-filterable field', () => {
    const run = () =>
      planQuery(
        baseIntent({
          filters: {
            op: 'and',
            children: [{ field: 'publishedAt', op: 'isNotNull', value: null }],
          },
        }),
        makeRegistry(),
      );
    try {
      run();
    } catch (error) {
      expect((error as PlanError).code).toBe('NOT_FILTERABLE');
      expect((error as PlanError).message).toMatch(/publishedAt/);
    }
  });

  it('throws NOT_FILTERABLE for a sort on a non-filterable field', () => {
    const run = () =>
      planQuery(baseIntent({ sort: [{ field: 'publishedAt', dir: 'desc' }] }), makeRegistry());
    try {
      run();
    } catch (error) {
      expect((error as PlanError).code).toBe('NOT_FILTERABLE');
    }
  });

  it('time-buckets by a non-filterable date field without filtering on it', () => {
    const plan = planQuery(
      baseIntent({
        aggregation: {
          fn: 'sum',
          field: 'views',
          timeBucket: { field: 'publishedAt', granularity: 'month' },
        },
        timeRange: { start: '2026-01-01T00:00:00Z' },
      }),
      makeRegistry(),
    );
    expect(plan.intent.aggregation?.timeBucket?.field).toBe('publishedAt');
    expect(plan.dateRange).toEqual({ start: '2026-01-01T00:00:00Z' });
    expect(plan.effectiveFilters.children).toContainEqual({
      field: 'createdAt',
      op: 'gte',
      value: '2026-01-01T00:00:00Z',
    });
    expect(plan.effectiveFilters.children).not.toContainEqual(
      expect.objectContaining({ field: 'publishedAt' }),
    );
  });

  it('prefers the timeBucket field for the date-range merge', () => {
    const plan = planQuery(
      baseIntent({
        aggregation: { fn: 'count', timeBucket: { field: 'createdAt', granularity: 'day' } },
        timeRange: { start: '2026-08-01T00:00:00Z' },
      }),
      makeRegistry(),
    );
    expect(plan.effectiveFilters.children).toContainEqual({
      field: 'createdAt',
      op: 'gte',
      value: '2026-08-01T00:00:00Z',
    });
  });

  it('does not invent a date filter for granularity-only ranges', () => {
    const plan = planQuery(baseIntent({ timeRange: { granularity: 'month' } }), makeRegistry());
    expect(plan.dateRange).toEqual({ granularity: 'month' });
    expect(plan.effectiveFilters.children).toHaveLength(0);
  });

  it('projects the aggregation field and groupBy fields', () => {
    const plan = planQuery(
      baseIntent({ aggregation: { fn: 'sum', field: 'views', groupBy: [{ field: 'status' }] } }),
      makeRegistry(),
    );
    expect(plan.steps[0]!.args.fields).toEqual(['views', 'status']);
  });

  it('encodes sort as Strapi field:dir pairs', () => {
    const plan = planQuery(baseIntent({ sort: [{ field: 'views', dir: 'desc' }] }), makeRegistry());
    expect(plan.steps[0]!.args.sort).toEqual(['views:desc']);
  });

  it('throws UNKNOWN_CONTENT_TYPE for a missing content type', () => {
    let caught: PlanError | undefined;
    try {
      planQuery(baseIntent({ target: { uid: 'api::nope.nope' } }), makeRegistry());
    } catch (error) {
      caught = error as PlanError;
    }
    expect(caught).toBeDefined();
    expect(caught!.code).toBe('UNKNOWN_CONTENT_TYPE');
    expect(caught!.message).toMatch(/unknown content type/);
  });

  it('throws UNKNOWN_FIELD for a filter on a missing field', () => {
    const run = () =>
      planQuery(
        baseIntent({ filters: { op: 'and', children: [{ field: 'wat', op: 'eq', value: 1 }] } }),
        makeRegistry(),
      );
    try {
      run();
    } catch (error) {
      expect((error as PlanError).code).toBe('UNKNOWN_FIELD');
    }
  });

  it('throws UNKNOWN_FIELD for a sort on a missing field', () => {
    const run = () =>
      planQuery(baseIntent({ sort: [{ field: 'wat', dir: 'asc' }] }), makeRegistry());
    try {
      run();
    } catch (error) {
      expect((error as PlanError).code).toBe('UNKNOWN_FIELD');
    }
  });

  it('throws UNKNOWN_FIELD for an aggregation on a missing field', () => {
    const run = () =>
      planQuery(baseIntent({ aggregation: { fn: 'sum', field: 'wat' } }), makeRegistry());
    try {
      run();
    } catch (error) {
      expect((error as PlanError).code).toBe('UNKNOWN_FIELD');
    }
  });

  it('throws INVALID_AGGREGATION for sum on a non-numeric field', () => {
    const run = () =>
      planQuery(baseIntent({ aggregation: { fn: 'sum', field: 'body' } }), makeRegistry());
    try {
      run();
    } catch (error) {
      expect((error as PlanError).code).toBe('INVALID_AGGREGATION');
    }
  });

  it('throws INVALID_AGGREGATION for groupBy on a relation field', () => {
    const run = () =>
      planQuery(
        baseIntent({ aggregation: { fn: 'count', groupBy: [{ field: 'author' }] } }),
        makeRegistry(),
      );
    try {
      run();
    } catch (error) {
      expect((error as PlanError).code).toBe('INVALID_AGGREGATION');
    }
  });

  it('throws NO_READ_TOOL when no read tool exists', () => {
    const run = () => planQuery(baseIntent(), makeRegistry(false));
    try {
      run();
    } catch (error) {
      expect((error as PlanError).code).toBe('NO_READ_TOOL');
    }
  });

  it('plans against the Strapi 5.52 list_* tool, preferring it over get_*', () => {
    const plan = planQuery(baseIntent(), makeStrapi52Registry());
    expect(plan.steps[0]!.tool).toBe('list_article');
    expect(plan.steps[0]!.permission).toBe('plugin::content-manager.explorer.read');
  });

  it('carries the clamped, effective intent', () => {
    const plan = planQuery(
      baseIntent({
        aggregation: { fn: 'count', groupBy: [{ field: 'status' }] },
        sort: [{ field: 'views', dir: 'desc' }],
      }),
      makeRegistry(),
    );
    expect(plan.intent.aggregation).toEqual({ fn: 'count', groupBy: [{ field: 'status' }] });
    expect(plan.intent.sort).toEqual([{ field: 'views', dir: 'desc' }]);
    expect(plan.intent.target).toEqual({ uid: 'api::article.article', label: 'Article' });
  });
});
