import { z } from 'zod';
import { analyticalResponseSchema, blockSchema } from './zod';

/**
 * Machine-readable JSON Schema exports. These are embedded in the LLM system
 * prompt so the model sees the exact contract it must produce — validated
 * again by Zod before anything is rendered.
 */

export const blockJsonSchema = z.toJSONSchema(blockSchema, {
  reused: 'inline',
  unrepresentable: 'any',
});

export const analyticalResponseJsonSchema = z.toJSONSchema(analyticalResponseSchema, {
  reused: 'inline',
  unrepresentable: 'any',
});
