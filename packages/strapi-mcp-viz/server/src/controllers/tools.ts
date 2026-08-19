import type { Core } from '@strapi/strapi';

interface ToolsContext {
  status: number;
  body: unknown;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /** Cached MCP `tools/list` output, for the admin UI and debugging. */
  async list(ctx: ToolsContext) {
    try {
      const tools = await strapi.plugin('strapi-mcp-viz').service('mcp-client').getTools();
      ctx.body = { data: tools };
    } catch (error) {
      ctx.status = 502;
      ctx.body = { error: error instanceof Error ? error.message : 'failed to reach MCP server' };
    }
  },
});
