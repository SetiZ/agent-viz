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
      filterable: field.filterable !== false,
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
    '- "filters" and "sort" may reference fields with "filterable": true (pushed to Strapi). Date fields with "filterable": false (e.g. createdAt, updatedAt, publishedAt) may ALSO be used in "filters" and "sort" — they are applied to the fetched records afterwards. Other non-filterable fields cannot be used in "filters" or "sort".',
    '- "aggregation.fn" is usually "count". Use sum/avg/min/max only on numeric fields, groupBy only on scalar fields, timeBucket only on date/datetime fields. timeBucket may reference any date field, including non-filterable ones like "publishedAt".',
    '- "limit" is the maximum number of records to fetch; keep it small (default 100).',
    '- "sort" and "aggregation.groupBy" may be empty arrays or omitted entirely — never emit placeholder values.',
    '- Only set "timeRange" when the user names specific dates or a period (e.g. "last week", "in March"). Never invent date ranges.',
    '- The output must be a single JSON object matching the Intent schema. No markdown fences, no commentary.',
    'Available content types:',
    JSON.stringify(contentTypes, null, 2),
    'Available read tools (data access happens behind these, not by you):',
    JSON.stringify(tools, null, 2),
    `Intent schema: ${JSON.stringify(intentJsonSchema)}`,
  ].join('\n\n');
}
