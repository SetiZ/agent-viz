import type { Core } from '@strapi/strapi';

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.log.info('strapi-mcp-viz: plugin registered');
  try {
    const config = await strapi.plugin('strapi-mcp-viz').service('config').get();
    const source = process.env.MCP_VIZ_ADMIN_TOKEN ? 'env' : config.adminToken ? 'settings' : 'none';
    strapi.log.info(
      `strapi-mcp-viz: mcpUrl=${config.mcpUrl || 'unset'} adminTokenSource=${source}` +
        (config.adminToken ? ` adminTokenLength=${config.adminToken.length}` : '')
    );
  } catch (error) {
    strapi.log.warn(
      `strapi-mcp-viz: could not read config at boot: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

export default bootstrap;
