import type { Core } from '@strapi/strapi';

export type SettingsKey = 'mcpUrl' | 'adminToken' | 'llmBaseUrl' | 'llmApiKey' | 'llmModel';

export type Settings = Record<SettingsKey, string>;

const SECRET_FIELDS: readonly SettingsKey[] = ['adminToken', 'llmApiKey'];

/** Value used when a secret is read back through the admin API. */
export const MASKED_SECRET = '****';

const SETTINGS_UID = 'plugin::strapi-mcp-viz.settings';

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const defaults = (): Settings => {
    const serverUrl = strapi.config.get('server.url');
    return {
      mcpUrl:
        typeof serverUrl === 'string' && serverUrl.length > 0
          ? `${serverUrl.replace(/\/+$/, '')}/mcp`
          : '/mcp',
      adminToken: '',
      llmBaseUrl: '',
      llmApiKey: '',
      llmModel: '',
    };
  };

  const envOverrides = (): Partial<Settings> => {
    const env: Partial<Settings> = {};
    if (process.env.MCP_VIZ_ADMIN_TOKEN) env.adminToken = process.env.MCP_VIZ_ADMIN_TOKEN;
    if (process.env.MCP_VIZ_LLM_BASE_URL) env.llmBaseUrl = process.env.MCP_VIZ_LLM_BASE_URL;
    if (process.env.MCP_VIZ_LLM_API_KEY) env.llmApiKey = process.env.MCP_VIZ_LLM_API_KEY;
    if (process.env.MCP_VIZ_LLM_MODEL) env.llmModel = process.env.MCP_VIZ_LLM_MODEL;
    return env;
  };

  const readStored = async (): Promise<Record<string, unknown> | null> => {
    try {
      const records = await strapi.entityService.findMany(SETTINGS_UID, {});
      return (Array.isArray(records) ? records[0] : records) ?? null;
    } catch {
      return null;
    }
  };

  const toSettings = (record: unknown): Settings => {
    const result = defaults();
    if (record && typeof record === 'object') {
      const source = record as Record<string, unknown>;
      for (const key of Object.keys(result) as SettingsKey[]) {
        if (typeof source[key] === 'string') result[key] = source[key] as string;
      }
    }
    return result;
  };

  return {
    defaults,
    envOverrides,
    readStored,
    toSettings,

    /** Effective config: env overrides stored settings over defaults. */
    async get(): Promise<Settings> {
      const stored = (await readStored()) ?? {};
      const env = envOverrides();
      const result = defaults();
      for (const key of Object.keys(result) as SettingsKey[]) {
        const value = env[key] ?? stored[key];
        if (typeof value === 'string' && value.length > 0) result[key] = value;
      }
      return result;
    },

    /** Same as get(), but secrets are masked so they never reach the admin UI. */
    async getMasked(): Promise<Settings> {
      const config = await this.get();
      const masked = { ...config };
      for (const field of SECRET_FIELDS) {
        if (masked[field]) masked[field] = MASKED_SECRET;
      }
      return masked;
    },

    /** Persists config, keeping existing secrets when the masked placeholder is sent back. */
    async set(payload: Partial<Settings>): Promise<Settings> {
      const current = (await readStored()) ?? {};
      const data: Record<string, unknown> = {};
      for (const key of Object.keys(payload) as SettingsKey[]) {
        const value = payload[key];
        if (
          SECRET_FIELDS.includes(key) &&
          (value === MASKED_SECRET || value === undefined || value === '')
        ) {
          continue;
        }
        if (typeof value === 'string') data[key] = value;
      }
      type UpdateParams = NonNullable<Parameters<typeof strapi.entityService.update>[2]>;
      type EntityData = NonNullable<UpdateParams['data']>;
      if (current.id) {
        await strapi.entityService.update(SETTINGS_UID, current.id as number, {
          data: data as unknown as EntityData,
        });
      } else {
        await strapi.entityService.create(SETTINGS_UID, { data: data as unknown as EntityData });
      }
      return toSettings({ ...current, ...data });
    },
  };
};
