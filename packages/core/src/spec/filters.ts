import { z } from 'zod';

/**
 * Filter AST used in both the model-facing Intent and the response envelope.
 * Ops are whitelisted and values shape-checked so a model can never smuggle
 * arbitrary query logic through.
 */

export const primitiveSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

export const primitiveArraySchema = z.array(primitiveSchema);

export const filterOpSchema = z.enum([
  'eq',
  'ne',
  'lt',
  'lte',
  'gt',
  'gte',
  'in',
  'notIn',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'isNull',
  'isNotNull',
  'between',
]);

export const filterSchema = z
  .object({
    field: z.string().min(1),
    op: filterOpSchema,
    value: z.union([primitiveSchema, primitiveArraySchema]),
  })
  .superRefine((filter, ctx) => {
    const arrayOps = new Set(['in', 'notIn', 'between']);
    const nullOps = new Set(['isNull', 'isNotNull']);

    if (arrayOps.has(filter.op) && !Array.isArray(filter.value)) {
      ctx.addIssue({ code: 'custom', message: `op "${filter.op}" requires an array value` });
    }
    if (filter.op === 'between' && Array.isArray(filter.value) && filter.value.length !== 2) {
      ctx.addIssue({ code: 'custom', message: 'op "between" requires exactly 2 values' });
    }
    if (!arrayOps.has(filter.op) && Array.isArray(filter.value)) {
      ctx.addIssue({ code: 'custom', message: `op "${filter.op}" does not accept an array value` });
    }
    if (nullOps.has(filter.op) && filter.value !== null) {
      ctx.addIssue({ code: 'custom', message: `op "${filter.op}" requires a null value` });
    }
  });

export type Filter = z.infer<typeof filterSchema>;

export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    op: z.enum(['and', 'or']),
    children: z.array(z.union([filterSchema, filterGroupSchema])),
  }),
);

export type FilterGroup = {
  op: 'and' | 'or';
  children: (Filter | FilterGroup)[];
};

export const granularitySchema = z.enum(['day', 'week', 'month', 'quarter', 'year']);

export type Granularity = z.infer<typeof granularitySchema>;

export const isoDateSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'must be an ISO 8601 date string',
});

export const dateRangeSchema = z.object({
  start: isoDateSchema.optional(),
  end: isoDateSchema.optional(),
  granularity: granularitySchema.optional(),
});

export type DateRange = z.infer<typeof dateRangeSchema>;

/** Normalized empty filter group: matches everything, no constraints applied. */
export const EMPTY_FILTER_GROUP: FilterGroup = { op: 'and', children: [] };
