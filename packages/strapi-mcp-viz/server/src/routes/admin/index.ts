const requirePermission = (action: string) => ({
  name: 'admin::hasPermissions',
  config: { actions: [action] },
});

export default () => ({
  type: 'admin',
  routes: [
    {
      method: 'POST',
      path: '/run',
      handler: 'run.run',
      config: {
        policies: ['admin::isAuthenticatedAdmin', requirePermission('plugin::strapi-mcp-viz.run')],
      },
    },
    {
      method: 'GET',
      path: '/queries',
      handler: 'query.list',
      config: {
        policies: ['admin::isAuthenticatedAdmin', requirePermission('plugin::strapi-mcp-viz.run')],
      },
    },
    {
      method: 'POST',
      path: '/queries',
      handler: 'query.create',
      config: {
        policies: ['admin::isAuthenticatedAdmin', requirePermission('plugin::strapi-mcp-viz.run')],
      },
    },
    {
      method: 'PUT',
      path: '/queries/:id',
      handler: 'query.update',
      config: {
        policies: ['admin::isAuthenticatedAdmin', requirePermission('plugin::strapi-mcp-viz.run')],
      },
    },
    {
      method: 'DELETE',
      path: '/queries/:id',
      handler: 'query.delete',
      config: {
        policies: ['admin::isAuthenticatedAdmin', requirePermission('plugin::strapi-mcp-viz.run')],
      },
    },
    {
      method: 'GET',
      path: '/config',
      handler: 'config.get',
      config: {
        policies: [
          'admin::isAuthenticatedAdmin',
          requirePermission('plugin::strapi-mcp-viz.configure'),
        ],
      },
    },
    {
      method: 'PUT',
      path: '/config',
      handler: 'config.update',
      config: {
        policies: [
          'admin::isAuthenticatedAdmin',
          requirePermission('plugin::strapi-mcp-viz.configure'),
        ],
      },
    },
    {
      method: 'GET',
      path: '/tools',
      handler: 'tools.list',
      config: {
        policies: ['admin::isAuthenticatedAdmin', requirePermission('plugin::strapi-mcp-viz.run')],
      },
    },
  ],
});
