import { z } from 'zod';
import type { ContentRecord } from '../aggregate';
import type { ContentTypeSchema, ToolDescriptor, ToolRegistry } from '../plan';
import type { McpToolInfo } from './mcp';

/**
 * Builds the typed ToolRegistry from Strapi MCP `tools/list` output plus the
 * host's content-type schemas. Content types and permissions come from the
 * host; tool descriptors and input schemas come from the MCP server.
 */

export interface RegistryBuildOptions {
  contentTypes: ContentTypeSchema[];
  permissionFor: (contentType: string) => string;
  /** Map a tool name to a content-type uid. Defaults to a name-based heuristic. */
  resolveContentType?: (toolName: string) => string | undefined;
  /** Only register read tools (`find_*`). */
  readOnly?: boolean;
}

const READ_PREFIXES = ['find_', 'find_one_'];

export function isReadTool(name: string): boolean {
  return READ_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function buildToolRegistry(
  tools: McpToolInfo[],
  options: RegistryBuildOptions,
): ToolRegistry {
  const schemas = new Map<string, ContentTypeSchema>();
  for (const contentType of options.contentTypes) schemas.set(contentType.uid, contentType);

  const descriptors: ToolDescriptor[] = [];
  for (const tool of tools) {
    if (options.readOnly && !isReadTool(tool.name)) continue;
    const contentType = options.resolveContentType
      ? options.resolveContentType(tool.name)
      : resolveContentTypeByToolName(tool.name, options.contentTypes);
    if (!contentType) continue;
    descriptors.push({
      name: tool.name,
      contentType,
      description: tool.description ?? '',
      permission: options.permissionFor(contentType),
      inputSchema: zodFromMcpSchema(tool.inputSchema),
    });
  }

  const allSchemas = [...schemas.values()];
  const allTools = [...descriptors];
  return {
    contentTypes: () => allSchemas,
    contentType: (uid) => schemas.get(uid),
    findTool: (name) => descriptors.find((entry) => entry.name === name),
    toolsForContentType: (uid) => descriptors.filter((entry) => entry.contentType === uid),
    tools: () => allTools,
  };
}

function resolveContentTypeByToolName(
  toolName: string,
  contentTypes: ContentTypeSchema[],
): string | undefined {
  const collectionName = toolName.split('_').slice(1).join('_');
  if (!collectionName) return undefined;
  return contentTypes.find((entry) => entry.uid.split('.').at(-1) === collectionName)?.uid;
}

function zodFromMcpSchema(schema?: Record<string, unknown>): z.ZodType<unknown> {
  if (!schema) return z.record(z.string(), z.unknown());
  try {
    return z.fromJSONSchema(schema) as z.ZodType<unknown>;
  } catch {
    return z.record(z.string(), z.unknown());
  }
}

/** Parses the JSON text content of a Strapi `find_*` tool response. */
export function parseFindResponse(text: string): { data: unknown[]; total?: number } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { data: [] };
  }
  if (!json || typeof json !== 'object') return { data: [] };
  const record = json as Record<string, unknown>;
  const data = Array.isArray(record.data) ? record.data : [];
  const meta = (record.meta ?? {}) as Record<string, unknown>;
  const pagination = (meta.pagination ?? {}) as Record<string, unknown>;
  const total = pagination.total;
  return typeof total === 'number' ? { data, total } : { data };
}

/** Normalizes Strapi REST-style items (with or without an `attributes` nest). */
export function normalizeRecords(data: unknown[]): ContentRecord[] {
  return data.flatMap((item): ContentRecord[] => {
    if (!item || typeof item !== 'object') return [];
    const obj = item as Record<string, unknown>;
    const id = obj.id;
    if (id === undefined || id === null) return [];
    if (obj.attributes && typeof obj.attributes === 'object') {
      return [{ id: id as string | number, attributes: obj.attributes as Record<string, unknown> }];
    }
    const { id: _id, ...attributes } = obj;
    return [{ id: id as string | number, attributes }];
  });
}
