import { z } from 'zod';
import {
  contentTypeRefSchema,
  dateRangeSchema,
  filterGroupSchema,
  granularitySchema,
} from '../spec';

/**
 * The structured query a model is allowed to emit. It only describes WHAT to
 * fetch/aggregate/show — never how to compute it. The planner and the
 * deterministic engines own the "how".
 */

export const aggFnSchema = z.enum(['count', 'sum', 'avg', 'min', 'max', 'distinct']);

export type AggFn = z.infer<typeof aggFnSchema>;

export const groupByFieldSchema = z.object({ field: z.string().min(1) }).strict();

export type GroupByField = z.infer<typeof groupByFieldSchema>;

export const timeBucketSchema = z
  .object({
    field: z.string().min(1),
    granularity: granularitySchema,
    timezone: z.string().min(1).optional(),
  })
  .strict();

export type TimeBucket = z.infer<typeof timeBucketSchema>;

export const aggregationSpecSchema = z
  .object({
    fn: aggFnSchema,
    field: z.string().min(1).optional(),
    groupBy: z.array(groupByFieldSchema).min(1).max(2).optional(),
    timeBucket: timeBucketSchema.optional(),
    top: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((spec, ctx) => {
    if (spec.fn !== 'count' && !spec.field) {
      ctx.addIssue({ code: 'custom', message: `aggregation "${spec.fn}" requires a field` });
    }
    if (spec.top !== undefined && !spec.groupBy && !spec.timeBucket) {
      ctx.addIssue({ code: 'custom', message: '"top" requires a groupBy or timeBucket' });
    }
  });

export type AggregationSpec = z.infer<typeof aggregationSpecSchema>;

export const sortFieldSchema = z
  .object({ field: z.string().min(1), dir: z.enum(['asc', 'desc']) })
  .strict();

export type SortField = z.infer<typeof sortFieldSchema>;

export const intentSchema = z
  .object({
    kind: z.enum(['text', 'kpi', 'table', 'line_chart', 'bar_chart', 'pie_chart']),
    target: contentTypeRefSchema,
    timeRange: dateRangeSchema.optional(),
    filters: filterGroupSchema,
    aggregation: aggregationSpecSchema.optional(),
    sort: z.array(sortFieldSchema).min(1).optional(),
    limit: z.number().int().positive(),
  })
  .strict();

export type Intent = z.infer<typeof intentSchema>;

export const intentJsonSchema = z.toJSONSchema(intentSchema, {
  reused: 'inline',
  unrepresentable: 'any',
});
