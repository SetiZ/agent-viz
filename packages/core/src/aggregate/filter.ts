import type { SortField } from '../intent';
import type { Filter, FilterGroup } from '../spec';
import type { ContentRecord } from './types';

/**
 * Client-side record filtering and sorting. Applied after retrieval so date
 * fields that Strapi's MCP list_* tools refuse to query (publishedAt,
 * createdAt, updatedAt) can still be used as filters and sort keys.
 */

export function filterRecords(records: ContentRecord[], group: FilterGroup): ContentRecord[] {
  if (group.children.length === 0) return records;
  return records.filter((record) => matchesGroup(record, group));
}

export function sortRecords(records: ContentRecord[], sort: SortField[]): ContentRecord[] {
  if (sort.length === 0) return records;
  return [...records].sort((a, b) => {
    for (const entry of sort) {
      const cmp = compareValues(a.attributes[entry.field], b.attributes[entry.field]);
      if (cmp !== 0) return entry.dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}

function matchesGroup(record: ContentRecord, group: FilterGroup): boolean {
  if (group.children.length === 0) return true;
  const results = group.children.map((child) =>
    'children' in child ? matchesGroup(record, child) : matchesFilter(record, child),
  );
  return group.op === 'and' ? results.every(Boolean) : results.some(Boolean);
}

function matchesFilter(record: ContentRecord, filter: Filter): boolean {
  const value = record.attributes[filter.field];
  switch (filter.op) {
    case 'eq':
      return equals(value, filter.value);
    case 'ne':
      return !equals(value, filter.value);
    case 'lt':
      return compareValues(value, filter.value) < 0;
    case 'lte':
      return compareValues(value, filter.value) <= 0;
    case 'gt':
      return compareValues(value, filter.value) > 0;
    case 'gte':
      return compareValues(value, filter.value) >= 0;
    case 'in':
      return (
        Array.isArray(filter.value) && filter.value.some((candidate) => equals(value, candidate))
      );
    case 'notIn':
      return (
        !Array.isArray(filter.value) || !filter.value.some((candidate) => equals(value, candidate))
      );
    case 'contains':
      return String(value).includes(String(filter.value));
    case 'notContains':
      return !String(value).includes(String(filter.value));
    case 'startsWith':
      return String(value).startsWith(String(filter.value));
    case 'endsWith':
      return String(value).endsWith(String(filter.value));
    case 'isNull':
      return value === null || value === undefined;
    case 'isNotNull':
      return value !== null && value !== undefined;
    case 'between':
      return (
        Array.isArray(filter.value) &&
        filter.value.length === 2 &&
        compareValues(value, filter.value[0]) >= 0 &&
        compareValues(value, filter.value[1]) <= 0
      );
  }
}

function equals(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a === null || a === undefined) && (b === null || b === undefined);
  }
  const aNum = numeric(a);
  const bNum = numeric(b);
  if (aNum !== undefined && bNum !== undefined) return aNum === bNum;
  return String(a) === String(b);
}

function compareValues(a: unknown, b: unknown): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  const aNum = numeric(a);
  const bNum = numeric(b);
  if (aNum !== undefined && bNum !== undefined) return aNum - bNum;
  return String(a).localeCompare(String(b));
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
    const date = Date.parse(trimmed);
    return Number.isFinite(date) ? date : undefined;
  }
  return undefined;
}
