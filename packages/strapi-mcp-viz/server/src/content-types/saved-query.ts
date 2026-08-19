export default {
  schema: {
    collectionName: 'mcp_viz_saved_queries',
    info: {
      singularName: 'saved-query',
      pluralName: 'saved-queries',
      displayName: 'Saved Query',
      description: 'A saved natural-language question and the snapshot of its last answer.',
    },
    options: {
      draftAndPublish: false,
    },
    attributes: {
      title: { type: 'string', required: true },
      question: { type: 'text', required: true },
      resultBlocks: { type: 'json' },
      isPinned: { type: 'boolean', default: false },
    },
  },
};
