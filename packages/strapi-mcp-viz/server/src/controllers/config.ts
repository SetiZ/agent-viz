import type { Core } from '@strapi/strapi';
import { MASKED_SECRET, type Settings, type SettingsKey } from '../services/config';

export interface ConfigContext {
  request: { body?: Record<string, unknown> };
  status: number;
  body: unknown;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async get(ctx: ConfigContext) {
    const config = await strapi.plugin('strapi-mcp-viz').service('config').getMasked();
    ctx.body = { data: config, maskedSecret: MASKED_SECRET };
  },

  async update(ctx: ConfigContext) {
    const payload = ctx.request.body ?? {};
    const data: Partial<Settings> = {};
    for (const key of Object.keys(payload) as SettingsKey[]) {
      if (typeof payload[key] === 'string') data[key] = payload[key] as string;
    }
    await strapi.plugin('strapi-mcp-viz').service('config').set(data);
    const config = await strapi.plugin('strapi-mcp-viz').service('config').getMasked();
    ctx.body = { data: config, maskedSecret: MASKED_SECRET };
  },
});
