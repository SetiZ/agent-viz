import type { Core } from '@strapi/strapi';

const destroy = ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.log.info('strapi-mcp-viz: plugin unregistered');
};

export default destroy;
