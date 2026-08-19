import { z } from 'zod';

/**
 * Structured UI blocks. These are the ONLY shapes the renderer accepts.
 * Free text (`text`, `summary`) is rendered as plain text — no HTML, no
 * script execution, ever. `sources` references indices into
 * `AnalyticalResponse.sources` so every value stays attributable.
 */

const finiteNumber = z.number().finite();
const sourceRefsSchema = z.array(z.string()).optional();

export const textBlockSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
  })
  .strict();

export type TextBlock = z.infer<typeof textBlockSchema>;

export const kpiBlockSchema = z
  .object({
    type: z.literal('kpi'),
    label: z.string(),
    value: z.union([finiteNumber, z.string()]),
    delta: finiteNumber.optional(),
    deltaDirection: z.enum(['up', 'down', 'flat']).optional(),
    sources: sourceRefsSchema,
  })
  .strict();

export type KpiBlock = z.infer<typeof kpiBlockSchema>;

export const tableColumnSchema = z
  .object({
    key: z.string().min(1),
    label: z.string(),
  })
  .strict();

export type TableColumn = z.infer<typeof tableColumnSchema>;

export const tableBlockSchema = z
  .object({
    type: z.literal('table'),
    title: z.string().optional(),
    columns: z.array(tableColumnSchema).min(1),
    rows: z.array(z.record(z.string(), z.unknown())),
    sources: sourceRefsSchema,
  })
  .strict()
  .superRefine((table, ctx) => {
    for (const row of table.rows) {
      for (const column of table.columns) {
        if (!(column.key in row)) {
          ctx.addIssue({
            code: 'custom',
            message: `column "${column.key}" is missing from a row`,
          });
          break;
        }
      }
    }
  });

export type TableBlock = z.infer<typeof tableBlockSchema>;

export const chartSeriesSchema = z
  .object({
    name: z.string(),
    data: z.array(finiteNumber),
  })
  .strict();

export type ChartSeries = z.infer<typeof chartSeriesSchema>;

/** Shared validation for line/bar charts: aligned categories, finite numbers. */
function chartRefine(
  chart: { x: (string | number)[]; series: ChartSeries[] },
  ctx: z.RefinementCtx,
) {
  for (const series of chart.series) {
    if (series.data.length !== chart.x.length) {
      ctx.addIssue({
        code: 'custom',
        message: `series "${series.name}" has ${series.data.length} values but x has ${chart.x.length} categories`,
      });
    }
  }
}

const chartXSchema = z.array(z.union([z.string(), finiteNumber]));

export const lineChartBlockSchema = z
  .object({
    type: z.literal('line_chart'),
    title: z.string().optional(),
    x: chartXSchema,
    series: z.array(chartSeriesSchema).min(1),
    sources: sourceRefsSchema,
  })
  .strict()
  .superRefine(chartRefine);

export type LineChartBlock = z.infer<typeof lineChartBlockSchema>;

export const barChartBlockSchema = z
  .object({
    type: z.literal('bar_chart'),
    title: z.string().optional(),
    x: chartXSchema,
    series: z.array(chartSeriesSchema).min(1),
    stacked: z.boolean().optional(),
    horizontal: z.boolean().optional(),
    sources: sourceRefsSchema,
  })
  .strict()
  .superRefine(chartRefine);

export type BarChartBlock = z.infer<typeof barChartBlockSchema>;

export const pieSliceSchema = z
  .object({
    name: z.string(),
    value: z.number().finite().nonnegative(),
  })
  .strict();

export type PieSlice = z.infer<typeof pieSliceSchema>;

export const pieChartBlockSchema = z
  .object({
    type: z.literal('pie_chart'),
    title: z.string().optional(),
    data: z.array(pieSliceSchema).min(1),
    sources: sourceRefsSchema,
  })
  .strict();

export type PieChartBlock = z.infer<typeof pieChartBlockSchema>;

export const errorBlockSchema = z
  .object({
    type: z.literal('error'),
    code: z.string().min(1),
    message: z.string(),
  })
  .strict();

export type ErrorBlock = z.infer<typeof errorBlockSchema>;

export const blockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  kpiBlockSchema,
  tableBlockSchema,
  lineChartBlockSchema,
  barChartBlockSchema,
  pieChartBlockSchema,
  errorBlockSchema,
]);

export type Block = z.infer<typeof blockSchema>;

export type BlockType = Block['type'];

/** Human-readable catalog of block types, used when building the system prompt. */
export const BLOCK_TYPES: readonly BlockType[] = [
  'text',
  'kpi',
  'table',
  'line_chart',
  'bar_chart',
  'pie_chart',
  'error',
] as const;
