import type { Filter, FilterGroup } from '../spec';
import type { SortField } from '../intent';

/**
 * Deterministic encoding of the filter AST into Strapi's REST filter syntax,
 * the shape the Strapi MCP `find_*` tools accept. Values are copied verbatim
 * from validated filters — nothing is invented here.
 */

export const OPERATOR_TO_STRAPI: Record<Filter['op'], string> = {
  eq: '$eq',
  ne: '$ne',
  lt: '$lt',
  lte: '$lte',
  gt: '$gt',
  gte: '$gte',
  in: '$in',
  notIn: '$notIn',
  contains: '$contains',
  notContains: '$notContains',
  startsWith: '$startsWith',
  endsWith: '$endsWith',
  isNull: '$null',
  isNotNull: '$notNull',
  between: '$between',
};

export function encodeFilter(filter: Filter): Record<string, unknown> {
  return { [filter.field]: { [OPERATOR_TO_STRAPI[filter.op]]: filter.value } };
}

export function encodeFilters(group: FilterGroup): Record<string, unknown> {
  if (group.children.length === 0) return {};
  const encoded = group.children.map((child) =>
    'children' in child ? encodeFilters(child) : encodeFilter(child),
  );
  return { [group.op === 'and' ? '$and' : '$or']: encoded };
}

export function encodeSort(sort: SortField[]): string[] {
  return sort.map((entry) => `${entry.field}:${entry.dir}`);
}
