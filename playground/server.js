'use strict';

const { createStrapi } = require('@strapi/strapi');

(async () => {
  const strapi = await createStrapi({ autoReload: false, serveAdminPanel: false }).load();
  await strapi.start();
})().catch((error) => {
  console.error('[server] failed', error);
  process.exit(1);
});