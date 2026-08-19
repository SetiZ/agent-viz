import type { AggregationResult, ContentRecord } from '../aggregate';
import type { Intent } from '../intent';
import {
  type Block,
  blockSchema,
  type ChartSeries,
  type DateRange,
  type FilterGroup,
  type SourceMetadata,
} from '../spec';

/**
 * Deterministic block builder. Maps an intent plus a computed aggregation (or
 * retrieved records) onto validated UI blocks. No value, label or number here
 * is invented: everything derives from the aggregation result or the records,
 * and the intent only decides the presentation shape.
 */

export interface RenderInput {
  intent: Intent;
  sources: SourceMetadata[];
  effectiveFilters: FilterGroup;
  dateRange?: DateRange;
  aggregation?: AggregationResult;
  records?: ContentRecord[];
}

export interface RenderOutput {
  blocks: Block[];
  summary: string;
  caveats: string[];
}

const MAX_TABLE_ROWS = 200;
const MAX_TABLE_COLUMNS = 12;
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function renderBlocks(input: RenderInput): RenderOutput {
  const { intent } = input;
  const sources = input.sources.map((_, index) => String(index));
  const label = intent.target.label ?? intent.target.uid;
  const caveats = collectCaveats(input);

  const emptyBlocks: Block[] = [{ type: 'text', text: `No ${label} matched the filters.` }];

  const blocks = buildBlocks(input, label, sources);
  const effectiveBlocks = blocks.length > 0 ? blocks : emptyBlocks;

  return {
    blocks: effectiveBlocks.map(guardBlock),
    summary: buildSummary(input),
    caveats,
  };
}

function buildBlocks(input: RenderInput, label: string, sources: string[]): Block[] {
  const { intent, aggregation, records } = input;

  switch (intent.kind) {
    case 'text':
      return [{ type: 'text', text: buildSummary(input) }];
    case 'kpi':
      return aggregation
        ? buildKpiOrDegrade(input, label, sources)
        : records
          ? [{ type: 'kpi', label, value: records.length, sources }]
          : [];
    case 'table':
      return buildTable(input, label, sources);
    case 'line_chart':
      return aggregation ? buildLineChart(input, label, sources) : [];
    case 'bar_chart':
      return aggregation ? buildBarChart(input, label, sources) : [];
    case 'pie_chart':
      return aggregation ? buildPieChart(input, label, sources) : [];
  }
}

function buildKpiOrDegrade(input: RenderInput, label: string, sources: string[]): Block[] {
  const result = input.aggregation!;
  const single =
    result.buckets.length === 1 &&
    result.buckets[0]!.subKey === undefined &&
    !result.spec.groupBy &&
    !result.spec.timeBucket;
  if (!single) {
    return buildBarChart(input, label, sources);
  }
  const kpiLabel = result.spec.field ? fieldName(result.spec.field) : label;
  return [{ type: 'kpi', label: kpiLabel, value: result.buckets[0]!.value, sources }];
}

function buildBarChart(input: RenderInput, label: string, sources: string[]): Block[] {
  const result = input.aggregation!;
  if (result.buckets.length === 0) return [];
  const { x, series } = toChartData(result, label);
  const block: Block = {
    type: 'bar_chart',
    title: chartTitle(input, label),
    x,
    series,
    sources,
  };
  return [block];
}

function buildLineChart(input: RenderInput, label: string, sources: string[]): Block[] {
  const result = input.aggregation!;
  if (result.buckets.length === 0) return [];
  if (!result.spec.timeBucket) {
    return buildBarChart(input, label, sources);
  }
  const { x, series } = toChartData(result, label);
  const block: Block = {
    type: 'line_chart',
    title: chartTitle(input, label),
    x,
    series,
    sources,
  };
  return [block];
}

function buildPieChart(input: RenderInput, label: string, sources: string[]): Block[] {
  const result = input.aggregation!;
  if (result.buckets.length === 0) return [];
  const multiSeries = result.buckets.some((bucket) => bucket.subKey !== undefined);
  const timeSeries = result.spec.timeBucket !== undefined;
  if (multiSeries || timeSeries) {
    return buildBarChart(input, label, sources);
  }
  const block: Block = {
    type: 'pie_chart',
    title: chartTitle(input, label),
    data: result.buckets.map((bucket) => ({ name: String(bucket.key), value: bucket.value })),
    sources,
  };
  return [block];
}

function buildTable(input: RenderInput, label: string, sources: string[]): Block[] {
  const result = input.aggregation;
  if (result) {
    if (result.buckets.length === 0) return [];
    const hasSubKey = result.buckets.some((bucket) => bucket.subKey !== undefined);
    const columns = [
      { key: 'key', label: 'Category' },
      ...(hasSubKey ? [{ key: 'subKey', label: 'Group' }] : []),
      { key: 'value', label: result.spec.field ? fieldName(result.spec.field) : 'Count' },
      { key: 'records', label: 'Records' },
    ];
    const rows = result.buckets.map((bucket) => ({
      key: String(bucket.key),
      ...(hasSubKey ? { subKey: String(bucket.subKey) } : {}),
      value: bucket.value,
      records: bucket.records,
    }));
    return [{ type: 'table', title: chartTitle(input, label), columns, rows, sources }];
  }

  const entries = input.records ?? [];
  if (entries.length === 0) return [];
  const first = entries[0]!;
  const attributeKeys = Object.keys(first.attributes).slice(0, MAX_TABLE_COLUMNS - 1);
  const columns = [
    { key: 'id', label: 'ID' },
    ...attributeKeys.map((key) => ({ key, label: key })),
  ];
  const rows = entries.slice(0, MAX_TABLE_ROWS).map((entry) => {
    const row: Record<string, unknown> = { id: entry.id };
    for (const key of attributeKeys) row[key] = entry.attributes[key];
    return row;
  });
  return [{ type: 'table', title: label, columns, rows, sources }];
}

function toChartData(
  result: AggregationResult,
  label: string,
): { x: (string | number)[]; series: ChartSeries[] } {
  const keys: string[] = [];
  const keySet = new Set<string>();
  const subKeys: string[] = [];
  const subSet = new Set<string>();
  for (const bucket of result.buckets) {
    const key = String(bucket.key);
    if (!keySet.has(key)) {
      keySet.add(key);
      keys.push(key);
    }
    if (bucket.subKey !== undefined) {
      const sub = String(bucket.subKey);
      if (!subSet.has(sub)) {
        subSet.add(sub);
        subKeys.push(sub);
      }
    }
  }

  const multi = subKeys.length > 0;
  const seriesNames = multi ? subKeys : [result.spec.field ? fieldName(result.spec.field) : label];
  const values = new Map<string, number>();
  for (const bucket of result.buckets) {
    const sub = bucket.subKey !== undefined ? String(bucket.subKey) : '';
    values.set(`${String(bucket.key)}\u0000${sub}`, bucket.value);
  }

  const series: ChartSeries[] = seriesNames.map((name) => ({
    name,
    data: keys.map((key) => values.get(`${key}\u0000${multi ? name : ''}`) ?? 0),
  }));

  return { x: keys, series };
}

function chartTitle(input: RenderInput, label: string): string {
  const spec = input.aggregation?.spec;
  if (spec?.timeBucket) {
    return `${fieldName(spec.timeBucket.field)} by ${spec.timeBucket.granularity}`;
  }
  const groupBy = spec?.groupBy?.[0];
  if (groupBy) {
    return `${fieldName(groupBy.field)} for ${label}`;
  }
  return label;
}

function fieldName(field: string): string {
  return field.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
}

function collectCaveats(input: RenderInput): string[] {
  const caveats = [...(input.aggregation?.caveats ?? [])];
  const sources = input.sources.filter(
    (source) => source.truncated && source.recordsMatching > source.recordsReturned,
  );
  for (const source of sources) {
    caveats.push(
      `showing ${source.recordsReturned} of ${source.recordsMatching} matching records (truncated)`,
    );
  }
  return caveats;
}

function buildSummary(input: RenderInput): string {
  const { intent, aggregation, records } = input;
  const targetLabel = intent.target.label ?? intent.target.uid;

  if (!aggregation) {
    const count = records?.length ?? 0;
    return `${formatNumber(count)} ${targetLabel}${count === 1 ? '' : 's'} matched the filters.`;
  }

  const first = aggregation.buckets[0];
  const primary = aggregation.spec.groupBy?.[0] ?? aggregation.spec.timeBucket;
  if (!primary) {
    const value = first?.value ?? 0;
    const field = aggregation.spec.field ? fieldName(aggregation.spec.field) : targetLabel;
    switch (aggregation.spec.fn) {
      case 'count':
        return `${formatNumber(value)} ${targetLabel}${value === 1 ? '' : 's'} matched the filters.`;
      case 'sum':
        return `Total ${field}: ${formatNumber(value)} (across ${formatNumber(aggregation.totalRecords)} ${targetLabel}s).`;
      case 'avg':
        return `Average ${field} per ${targetLabel}: ${formatNumber(value)}.`;
      case 'min':
        return `Minimum ${field}: ${formatNumber(value)}.`;
      case 'max':
        return `Maximum ${field}: ${formatNumber(value)}.`;
      case 'distinct':
        return `${formatNumber(value)} distinct ${field} values.`;
    }
  }

  const bucketCount = new Set(aggregation.buckets.map((bucket) => String(bucket.key))).size;
  if (aggregation.spec.timeBucket) {
    return `${formatNumber(bucketCount)} time periods (${aggregation.spec.timeBucket.granularity}) for ${targetLabel}.`;
  }
  const groupBy = aggregation.spec.groupBy?.[0];
  const top = aggregation.spec.top;
  const prefix = top ? `Top ${formatNumber(top)}` : `${formatNumber(bucketCount)}`;
  return `${prefix} ${groupBy ? fieldName(groupBy.field) : 'categories'} for ${targetLabel}.`;
}

function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** Final safety net: every emitted block must validate; otherwise degrade. */
function guardBlock(block: Block): Block {
  const result = blockSchema.safeParse(block);
  if (result.success) return result.data;
  return {
    type: 'error',
    code: 'INVALID_BLOCK',
    message: `An internal block failed validation: ${result.error.issues[0]?.message ?? 'unknown'}`,
  };
}
