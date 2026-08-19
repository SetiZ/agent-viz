import type { Core } from '@strapi/strapi';

const bootstrap = ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.log.info('strapi-mcp-viz: plugin registered');
};

export default bootstrap;
