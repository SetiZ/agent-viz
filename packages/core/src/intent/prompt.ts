import type { ToolRegistry } from '../plan';
import { BLOCK_TYPES } from '../spec';
import { intentJsonSchema } from './intent';

/**
 * System prompt for the intent-parsing stage. Describes what content exists
 * and constrains the model to a structured, validated Intent — no data
 * access, no numbers, no code.
 */
export function buildIntentSystemPrompt(registry: ToolRegistry): string {
  const contentTypes = registry.contentTypes().map((contentType) => ({
    uid: contentType.uid,
    label: contentType.label,
    fields: Object.entries(contentType.fields).map(([name, field]) => ({
      name,
      type: field.type,
      enum: field.enum,
    })),
  }));
  const tools = registry.tools().map((tool) => ({
    name: tool.name,
    contentType: tool.contentType,
    description: tool.description,
  }));

  return [
    'You translate a natural-language question about Strapi content into a structured Intent object. You do not fetch data, compute numbers, or write code — a deterministic pipeline handles those.',
    'Rules:',
    `- "kind" must be one of: ${BLOCK_TYPES.join(', ')}. Choose the presentation the user asked for.`,
    '- "target.uid" must be one of the content types below.',
    '- "filters" may only reference fields that exist in the schema below, with whitelisted operators.',
    '- "aggregation.fn" is usually "count". Use sum/avg/min/max only on numeric fields, groupBy only on scalar fields, timeBucket only on date/datetime fields.',
    '- "limit" is the maximum number of records to fetch; keep it small (default 100).',
    '- Only set "timeRange" when the question implies one.',
    '- The output must be a single JSON object matching the Intent schema. No markdown fences, no commentary.',
    'Available content types:',
    JSON.stringify(contentTypes, null, 2),
    'Available read tools (data access happens behind these, not by you):',
    JSON.stringify(tools, null, 2),
    `Intent schema: ${JSON.stringify(intentJsonSchema)}`,
  ].join('\n\n');
}
