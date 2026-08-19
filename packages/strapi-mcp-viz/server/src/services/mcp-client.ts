import type { Core } from '@strapi/strapi';
import {
  buildToolRegistry,
  StreamableHttpMcpTransport,
  type ContentTypeSchema,
  type ContentTypeField,
  type McpToolInfo,
  type ToolRegistry,
} from '@mcp-viz/core/client';

const CACHE_TTL_MS = 60_000;

interface RegistryCache {
  registry: ToolRegistry;
  at: number;
}

interface ToolsCache {
  tools: McpToolInfo[];
  at: number;
}

/** Maps a Strapi content-type uid to the RBAC read action used by the gate. */
export function permissionFor(contentTypeUid: string): string {
  return `${contentTypeUid}.read`;
}

/** Extracts a planner-friendly schema from Strapi's content-type attributes. */
export function contentTypeSchemas(strapi: Core.Strapi): ContentTypeSchema[] {
  const result: ContentTypeSchema[] = [];
  const allContentTypes = strapi.contentTypes as unknown as Record<
    string,
    { info?: { displayName?: string }; attributes?: Record<string, unknown> }
  >;
  for (const uid of Object.keys(allContentTypes)) {
    if (uid.startsWith('admin::') || uid.startsWith('plugin::') || uid.startsWith('strapi::')) {
      continue;
    }
    const ct = allContentTypes[uid];
    if (!ct?.attributes) continue;

    const fields: Record<string, ContentTypeField> = {};
    for (const [name, raw] of Object.entries(ct.attributes)) {
      const attr = raw as { type?: string; enum?: unknown; target?: string } | undefined;
      if (!attr || typeof attr.type !== 'string') continue;
      fields[name] = {
        type: attr.type as ContentTypeField['type'],
        ...(attr.enum !== undefined ? { enum: attr.enum as (string | number)[] } : {}),
        ...(attr.target !== undefined ? { target: attr.target } : {}),
      };
    }

    result.push({
      uid,
      ...(ct.info?.displayName ? { label: ct.info.displayName } : {}),
      fields,
    });
  }
  return result;
}

export default ({ strapi }: { strapi: Core.Strapi }) => {
  let registryCache: RegistryCache | undefined;
  let toolsCache: ToolsCache | undefined;

  return {
    permissionFor,

    /** Creates a transport bound to the current MCP settings (one per run). */
    async createTransport(): Promise<StreamableHttpMcpTransport> {
      const config = await strapi.plugin('strapi-mcp-viz').service('config').get();
      return new StreamableHttpMcpTransport({ url: config.mcpUrl, token: config.adminToken });
    },

    /** Cached `tools/list` output from the Strapi MCP server. */
    async getTools(force = false): Promise<McpToolInfo[]> {
      if (!force && toolsCache && Date.now() - toolsCache.at < CACHE_TTL_MS) {
        return toolsCache.tools;
      }
      const transport = await this.createTransport();
      try {
        const tools = await transport.listTools();
        toolsCache = { tools, at: Date.now() };
        return tools;
      } finally {
        await transport.close();
      }
    },

    /** Cached typed registry of read tools + content-type schemas. */
    async getRegistry(force = false): Promise<ToolRegistry> {
      if (!force && registryCache && Date.now() - registryCache.at < CACHE_TTL_MS) {
        return registryCache.registry;
      }
      const tools = await this.getTools(force);
      const registry = buildToolRegistry(tools, {
        contentTypes: contentTypeSchemas(strapi),
        permissionFor,
        readOnly: true,
      });
      registryCache = { registry, at: Date.now() };
      return registry;
    },
  };
};
