import type { AggregationSpec } from '../intent';

/** A single retrieved Strapi record, normalized by the client entry. */
export interface ContentRecord {
  id: string | number;
  attributes: Record<string, unknown>;
}

/** One aggregated group. `key` is the primary dimension, `subKey` the second. */
export interface AggregateBucket {
  key: string | number;
  subKey?: string | number;
  value: number;
  /** Number of source records that landed in this bucket. */
  records: number;
}

export interface AggregationResult {
  spec: AggregationSpec;
  buckets: AggregateBucket[];
  totalRecords: number;
  provenance: {
    method: 'deterministic';
    fromRecords: number;
    computedAt: string;
  };
  caveats: string[];
}
