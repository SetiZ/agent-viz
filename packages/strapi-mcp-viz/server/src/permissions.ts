import type { Core } from '@strapi/strapi';

/**
 * Plugin permission actions. Full action ids become
 * `plugin::strapi-mcp-viz.run` and `plugin::strapi-mcp-viz.configure`.
 * Saved-query management is covered by the content-manager explorer
 * permissions generated from the `saved-query` content type.
 */
export const pluginPermissions = [
  {
    section: 'settings' as const,
    category: 'MCP Viz',
    subCategory: 'General',
    pluginName: 'strapi-mcp-viz',
    displayName: 'Run queries',
    uid: 'run',
  },
  {
    section: 'settings' as const,
    category: 'MCP Viz',
    subCategory: 'General',
    pluginName: 'strapi-mcp-viz',
    displayName: 'Configure plugin',
    uid: 'configure',
  },
];

export const registerPermissions = async ({ strapi }: { strapi: Core.Strapi }) => {
  const actionProvider = strapi.service('admin::permission').actionProvider;
  if (!actionProvider) return;
  await actionProvider.registerMany(pluginPermissions);
};
