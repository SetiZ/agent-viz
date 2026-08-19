export default {
  schema: {
    collectionName: 'mcp_viz_settings',
    info: {
      singularName: 'settings',
      pluralName: 'settings',
      displayName: 'MCP Viz Settings',
      description: 'Configuration for the MCP Viz plugin.',
    },
    kind: 'singleType',
    options: {
      draftAndPublish: false,
    },
    attributes: {
      mcpUrl: { type: 'string' },
      adminToken: { type: 'string', private: true },
      llmBaseUrl: { type: 'string' },
      llmApiKey: { type: 'string', private: true },
      llmModel: { type: 'string' },
    },
  },
};
