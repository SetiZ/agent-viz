import type { AggregationSpec, Intent } from '../intent';
import type { DateRange, Filter, FilterGroup } from '../spec';
import { encodeFilters, encodeSort } from './encode';
import { PLANNER_LIMITS, type PlannerLimits } from './limits';
import type { ContentTypeSchema, ContentTypeField, ToolDescriptor, ToolRegistry } from './registry';

export type PlanErrorCode =
  | 'UNKNOWN_CONTENT_TYPE'
  | 'UNKNOWN_FIELD'
  | 'INVALID_AGGREGATION'
  | 'INVALID_FILTER'
  | 'NO_READ_TOOL';

export class PlanError extends Error {
  readonly code: PlanErrorCode;

  constructor(code: PlanErrorCode, message: string) {
    super(message);
    this.name = 'PlanError';
    this.code = code;
  }
}

export interface PlanOptions {
  limits?: Partial<PlannerLimits>;
}

export interface ToolCall {
  id: string;
  tool: string;
  contentType: string;
  permission: string;
  args: {
    filters: Record<string, unknown>;
    sort?: string[];
    pagination: { page: number; pageSize: number };
    fields?: string[];
  };
}

export interface QueryPlan {
  contentType: string;
  permission: string;
  /** Effective intent after normalization, clamping and date-range merge. */
  intent: Intent;
  effectiveFilters: FilterGroup;
  dateRange?: DateRange;
  steps: ToolCall[];
}

const NUMERIC_TYPES = new Set(['number', 'integer', 'float', 'decimal', 'biginteger']);
const DATE_TYPES = new Set(['date', 'datetime', 'time', 'timestamp']);
const SCALAR_TYPES = new Set([
  'string',
  'text',
  'email',
  'uid',
  'number',
  'integer',
  'float',
  'decimal',
  'biginteger',
  'boolean',
  'date',
  'datetime',
  'time',
  'timestamp',
  'enumeration',
]);

export function planQuery(
  intent: Intent,
  registry: ToolRegistry,
  options: PlanOptions = {},
): QueryPlan {
  const limits: PlannerLimits = { ...PLANNER_LIMITS, ...options.limits };

  const schema = registry.contentType(intent.target.uid);
  if (!schema) {
    throw new PlanError('UNKNOWN_CONTENT_TYPE', `unknown content type "${intent.target.uid}"`);
  }

  const tool = findReadTool(registry, schema.uid);
  if (!tool) {
    throw new PlanError('NO_READ_TOOL', `no read tool for "${schema.uid}"`);
  }

  const filters = normalizeFilters(intent.filters, schema, limits);
  if (intent.aggregation) {
    validateAggregation(intent.aggregation, schema);
  }
  const sort = normalizeSort(intent.sort, schema, limits);

  const preferredDateField = intent.aggregation?.timeBucket?.field;
  const { filters: effectiveFilters, dateRange } = mergeTimeRange(
    filters,
    intent.timeRange,
    schema,
    preferredDateField,
  );

  const limit = clampLimit(intent.limit, limits.maxRecords);
  const pageSize = Math.min(limit, limits.maxPageSize);
  const fields = projectionFields(intent.aggregation);

  const step: ToolCall = {
    id: 'step-1',
    tool: tool.name,
    contentType: schema.uid,
    permission: tool.permission,
    args: {
      filters: encodeFilters(effectiveFilters),
      ...(sort.length > 0 ? { sort: encodeSort(sort) } : {}),
      pagination: { page: 1, pageSize },
      ...(fields.length > 0 ? { fields } : {}),
    },
  };

  const effectiveIntent: Intent = {
    kind: intent.kind,
    target: { uid: schema.uid, label: schema.label ?? intent.target.label },
    filters: effectiveFilters,
    limit,
    ...(dateRange ? { timeRange: dateRange } : {}),
    ...(intent.aggregation ? { aggregation: intent.aggregation } : {}),
    ...(sort.length > 0 ? { sort } : {}),
  };

  return {
    contentType: schema.uid,
    permission: tool.permission,
    intent: effectiveIntent,
    effectiveFilters,
    ...(dateRange ? { dateRange } : {}),
    steps: [step],
  };
}

function findReadTool(registry: ToolRegistry, uid: string): ToolDescriptor | undefined {
  const tools = registry.toolsForContentType(uid);
  return (
    tools.find(
      (entry) =>
        entry.name.startsWith('list_') ||
        (entry.name.startsWith('find_') && !entry.name.startsWith('find_one_')),
    ) ??
    tools.find((entry) => entry.name.startsWith('get_') || entry.name.startsWith('find_one_')) ??
    tools[0]
  );
}

function assertKnownField(
  schema: ContentTypeSchema,
  field: string,
  context: string,
): ContentTypeField {
  const entry = schema.fields[field];
  if (!entry) {
    throw new PlanError(
      'UNKNOWN_FIELD',
      `${context} references unknown field "${field}" on "${schema.uid}"`,
    );
  }
  return entry;
}

function normalizeFilters(
  group: FilterGroup,
  schema: ContentTypeSchema,
  limits: PlannerLimits,
  depth = 0,
): FilterGroup {
  if (depth > limits.maxFilterDepth) {
    throw new PlanError('INVALID_FILTER', 'filter group nesting exceeds the allowed depth');
  }
  return {
    op: group.op,
    children: group.children.map((child) => {
      if ('children' in child) {
        return normalizeFilters(child, schema, limits, depth + 1);
      }
      assertKnownField(schema, child.field, 'filter');
      return child;
    }),
  };
}

function validateAggregation(spec: AggregationSpec, schema: ContentTypeSchema): void {
  if (spec.fn !== 'count' && !spec.field) {
    throw new PlanError('INVALID_AGGREGATION', `aggregation "${spec.fn}" requires a field`);
  }
  if (spec.field) {
    const field = assertKnownField(schema, spec.field, 'aggregation');
    if (spec.fn === 'sum' || spec.fn === 'avg') {
      if (!NUMERIC_TYPES.has(field.type)) {
        throw new PlanError(
          'INVALID_AGGREGATION',
          `cannot ${spec.fn} on "${spec.field}" (type ${field.type})`,
        );
      }
    } else if (spec.fn === 'min' || spec.fn === 'max') {
      if (!NUMERIC_TYPES.has(field.type) && !DATE_TYPES.has(field.type)) {
        throw new PlanError(
          'INVALID_AGGREGATION',
          `cannot ${spec.fn} on "${spec.field}" (type ${field.type})`,
        );
      }
    } else if (spec.fn === 'distinct' && !SCALAR_TYPES.has(field.type)) {
      throw new PlanError(
        'INVALID_AGGREGATION',
        `cannot ${spec.fn} on "${spec.field}" (type ${field.type})`,
      );
    }
  }
  for (const groupBy of spec.groupBy ?? []) {
    const field = assertKnownField(schema, groupBy.field, 'groupBy');
    if (!SCALAR_TYPES.has(field.type)) {
      throw new PlanError(
        'INVALID_AGGREGATION',
        `cannot group by "${groupBy.field}" (type ${field.type})`,
      );
    }
  }
  if (spec.timeBucket) {
    const field = assertKnownField(schema, spec.timeBucket.field, 'timeBucket');
    if (!DATE_TYPES.has(field.type)) {
      throw new PlanError(
        'INVALID_AGGREGATION',
        `cannot time-bucket by "${spec.timeBucket.field}" (type ${field.type})`,
      );
    }
  }
}

function normalizeSort(
  sort: Intent['sort'],
  schema: ContentTypeSchema,
  limits: PlannerLimits,
): NonNullable<Intent['sort']> {
  if (!sort) return [];
  const clamped = sort.slice(0, limits.maxSortFields);
  for (const entry of clamped) {
    assertKnownField(schema, entry.field, 'sort');
  }
  return clamped;
}

function pickDateField(schema: ContentTypeSchema, preferred?: string): string | undefined {
  if (preferred) {
    const field = schema.fields[preferred];
    if (field && DATE_TYPES.has(field.type)) return preferred;
  }
  for (const candidate of ['publishedAt', 'createdAt', 'updatedAt']) {
    const field = schema.fields[candidate];
    if (field && DATE_TYPES.has(field.type)) return candidate;
  }
  return Object.entries(schema.fields).find(([, field]) => DATE_TYPES.has(field.type))?.[0];
}

function buildRangeFilter(field: string, start?: string, end?: string): Filter | undefined {
  if (start !== undefined && end !== undefined) {
    return { field, op: 'between', value: [start, end] };
  }
  if (start !== undefined) {
    return { field, op: 'gte', value: start };
  }
  if (end !== undefined) {
    return { field, op: 'lte', value: end };
  }
  return undefined;
}

function mergeTimeRange(
  filters: FilterGroup,
  timeRange: DateRange | undefined,
  schema: ContentTypeSchema,
  preferredDateField: string | undefined,
): { filters: FilterGroup; dateRange: DateRange | undefined } {
  if (!timeRange) return { filters, dateRange: undefined };
  if (timeRange.start === undefined && timeRange.end === undefined) {
    return { filters, dateRange: timeRange };
  }
  const dateField = pickDateField(schema, preferredDateField);
  if (!dateField) return { filters, dateRange: undefined };
  const rangeFilter = buildRangeFilter(dateField, timeRange.start, timeRange.end);
  if (!rangeFilter) return { filters, dateRange: timeRange };
  return {
    filters: { op: 'and', children: [...filters.children, rangeFilter] },
    dateRange: timeRange,
  };
}

function projectionFields(spec: AggregationSpec | undefined): string[] {
  if (!spec) return [];
  const fields = new Set<string>();
  if (spec.field && spec.fn !== 'count') fields.add(spec.field);
  for (const groupBy of spec.groupBy ?? []) fields.add(groupBy.field);
  if (spec.timeBucket) fields.add(spec.timeBucket.field);
  return [...fields];
}

function clampLimit(limit: number, max: number): number {
  return Math.min(Math.max(1, Math.floor(limit)), max);
}
