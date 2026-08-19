/** Hard bounds the planner enforces before any data access happens. */
export const PLANNER_LIMITS = {
  /** Absolute cap on records fetched per content type in one plan. */
  maxRecords: 500,
  /** Cap on records requested in a single tool call (Strapi pagination). */
  maxPageSize: 100,
  /** Cap on sort fields. */
  maxSortFields: 3,
  /** Max nesting depth of a filter group. */
  maxFilterDepth: 8,
} as const;

export type PlannerLimits = typeof PLANNER_LIMITS;
