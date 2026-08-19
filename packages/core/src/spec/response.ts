import { z } from 'zod';
import { blockSchema } from './blocks';
import { dateRangeSchema, filterGroupSchema, isoDateSchema } from './filters';

/**
 * Response envelope and provenance. Every analytical response carries the
 * sources, effective filters and date range that produced its numbers so the
 * UI can show "where did this come from" without trusting the model.
 */

export const contentTypeRefSchema = z
  .object({
    uid: z.string().min(1),
    label: z.string().optional(),
  })
  .strict();

export type ContentTypeRef = z.infer<typeof contentTypeRefSchema>;

export const userRefSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    roles: z.array(z.string()),
  })
  .strict();

export type UserRef = z.infer<typeof userRefSchema>;

export const sourceMetadataSchema = z
  .object({
    contentType: contentTypeRefSchema,
    tool: z.string().min(1),
    filters: filterGroupSchema,
    dateRange: dateRangeSchema.optional(),
    recordsReturned: z.number().int().nonnegative(),
    recordsMatching: z.number().int().nonnegative(),
    truncated: z.boolean(),
    retrievedAt: isoDateSchema,
    user: userRefSchema,
    permission: z.string().min(1),
  })
  .strict()
  .superRefine((source, ctx) => {
    if (source.recordsReturned > source.recordsMatching) {
      ctx.addIssue({
        code: 'custom',
        message: 'recordsReturned must not exceed recordsMatching',
      });
    }
  });

export type SourceMetadata = z.infer<typeof sourceMetadataSchema>;

export const stageTraceSchema = z
  .object({
    name: z.string().min(1),
    ms: z.number().nonnegative(),
  })
  .strict();

export type StageTrace = z.infer<typeof stageTraceSchema>;

export const runtimeInfoSchema = z
  .object({
    orchestrator: z.string().min(1),
    stages: z.array(stageTraceSchema),
  })
  .strict();

export type RuntimeInfo = z.infer<typeof runtimeInfoSchema>;

export const analyticalResponseSchema = z
  .object({
    summary: z.string(),
    blocks: z.array(blockSchema),
    sources: z.array(sourceMetadataSchema),
    filters: filterGroupSchema,
    dateRange: dateRangeSchema.optional(),
    caveats: z.array(z.string()),
    generatedAt: isoDateSchema,
    runtime: runtimeInfoSchema,
  })
  .strict();

export type AnalyticalResponse = z.infer<typeof analyticalResponseSchema>;
