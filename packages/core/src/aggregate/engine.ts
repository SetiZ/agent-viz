import type { AggregationSpec } from '../intent';
import type { SourceMetadata } from '../spec';
import { timeBucketKey } from './time-buckets';
import type { AggregateBucket, AggregationResult, ContentRecord } from './types';

/**
 * Deterministic aggregation engine. Every number in the result is computed
 * from retrieved records (or metadata about them) — never from the model.
 */

export const TOTAL_KEY = '_all';

export interface AggregateOptions {
  timezone?: string;
  source?: SourceMetadata;
}

type Dimension = { kind: 'time' | 'field'; field: string };

interface Group {
  primary: string | number;
  sub?: string | number;
  records: ContentRecord[];
  values: number[];
  rawValues: unknown[];
}

export function aggregateRecords(
  spec: AggregationSpec,
  records: ContentRecord[],
  options: AggregateOptions = {},
): AggregationResult {
  const timezone = options.timezone ?? spec.timeBucket?.timezone ?? 'UTC';
  const primary = primaryDimension(spec);
  const secondary = secondaryDimension(spec);
  const needField = spec.fn !== 'count';
  const needValue = spec.fn !== 'count' && spec.fn !== 'distinct';
  const needRaw = spec.fn === 'distinct';
  const field = needField ? spec.field : undefined;
  if (needField && !field) {
    throw new Error(`aggregation "${spec.fn}" requires a field`);
  }

  const groups = new Map<string, Group>();
  let skipped = 0;

  for (const record of records) {
    const primaryKey = primary ? dimensionValue(record, primary, spec, timezone) : undefined;
    const subKey = secondary ? dimensionValue(record, secondary, spec, timezone) : undefined;
    if (primary && primaryKey === undefined) {
      skipped++;
      continue;
    }
    if (secondary && subKey === undefined) {
      skipped++;
      continue;
    }

    const value = needValue ? toNumber(record.attributes[field as string]) : undefined;
    const raw = needRaw ? record.attributes[field as string] : undefined;
    if (needValue && value === undefined) {
      skipped++;
      continue;
    }

    const groupKey = `${String(primaryKey ?? TOTAL_KEY)}\u0000${String(subKey ?? '')}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        primary: primaryKey ?? TOTAL_KEY,
        ...(subKey !== undefined ? { sub: subKey } : {}),
        records: [],
        values: [],
        rawValues: [],
      };
      groups.set(groupKey, group);
    }
    group.records.push(record);
    if (value !== undefined) group.values.push(value);
    if (raw !== undefined) group.rawValues.push(raw);
  }

  const buckets: AggregateBucket[] = [];
  for (const group of groups.values()) {
    const value = computeValue(spec, group);
    const bucket: AggregateBucket = { key: group.primary, value, records: group.records.length };
    if (group.sub !== undefined) bucket.subKey = group.sub;
    buckets.push(bucket);
  }

  const caveats: string[] = [];
  if (skipped > 0) {
    caveats.push(`skipped ${skipped} record(s) without a usable value for "${field ?? 'count'}"`);
  }
  if (
    options.source?.truncated &&
    options.source.recordsMatching > options.source.recordsReturned
  ) {
    caveats.push(
      `aggregated from first ${options.source.recordsReturned} of ${options.source.recordsMatching} matching records`,
    );
  }

  return {
    spec,
    buckets: orderBuckets(buckets, spec),
    totalRecords: records.length,
    provenance: {
      method: 'deterministic',
      fromRecords: records.length,
      computedAt: new Date().toISOString(),
    },
    caveats,
  };
}

function computeValue(spec: AggregationSpec, group: Group): number {
  switch (spec.fn) {
    case 'count':
      return group.records.length;
    case 'sum':
      return sum(group.values);
    case 'avg':
      return group.values.length > 0 ? sum(group.values) / group.values.length : 0;
    case 'min':
      return group.values.length > 0 ? Math.min(...group.values) : 0;
    case 'max':
      return group.values.length > 0 ? Math.max(...group.values) : 0;
    case 'distinct':
      return new Set(group.rawValues).size;
  }
}

function orderBuckets(buckets: AggregateBucket[], spec: AggregationSpec): AggregateBucket[] {
  const timePrimary = spec.timeBucket !== undefined;
  const ordered = [...buckets];
  if (timePrimary) {
    ordered.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  } else {
    ordered.sort((a, b) => b.value - a.value || String(a.key).localeCompare(String(b.key)));
  }

  if (spec.top !== undefined && !timePrimary && spec.top < ordered.length) {
    return topBuckets(ordered, spec.top);
  }
  return ordered;
}

function topBuckets(buckets: AggregateBucket[], top: number): AggregateBucket[] {
  const totals = new Map<string | number, number>();
  for (const bucket of buckets) {
    totals.set(bucket.key, (totals.get(bucket.key) ?? 0) + bucket.value);
  }
  const allowed = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, top)
    .map(([key]) => key);
  const allowedSet = new Set(allowed);
  return buckets.filter((bucket) => allowedSet.has(bucket.key));
}

function dimensionValue(
  record: ContentRecord,
  dimension: Dimension,
  spec: AggregationSpec,
  timezone: string,
): string | number | undefined {
  const raw = record.attributes[dimension.field];
  if (dimension.kind === 'time') {
    const ms = toNumber(raw);
    if (ms === undefined) return undefined;
    return timeBucketKey(ms, spec.timeBucket!.granularity, timezone);
  }
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'string' || typeof raw === 'number') return raw;
  if (typeof raw === 'boolean') return String(raw);
  return undefined;
}

function primaryDimension(spec: AggregationSpec): Dimension | undefined {
  if (spec.timeBucket) return { kind: 'time', field: spec.timeBucket.field };
  const groupBy = spec.groupBy?.[0];
  return groupBy ? { kind: 'field', field: groupBy.field } : undefined;
}

function secondaryDimension(spec: AggregationSpec): Dimension | undefined {
  if (spec.timeBucket) {
    const groupBy = spec.groupBy?.[0];
    return groupBy ? { kind: 'field', field: groupBy.field } : undefined;
  }
  const groupBy = spec.groupBy?.[1];
  return groupBy ? { kind: 'field', field: groupBy.field } : undefined;
}

function toNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : undefined;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return undefined;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
    const date = Date.parse(trimmed);
    return Number.isFinite(date) ? date : undefined;
  }
  return undefined;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
