import { describe, it, expect, vi } from 'vitest';
import configFactory from '../src/services/config';
import { MASKED_SECRET } from '../src/services/config';

const SETTINGS_UID = 'plugin::strapi-mcp-viz.settings';

function makeStrapi(overrides: Record<string, unknown> = {}) {
  const entityService = {
    findMany: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (_uid: string, { data }: { data: unknown }) => ({
      id: 1,
      ...(data as object),
    })),
    update: vi
      .fn()
      .mockImplementation(async (_uid: string, id: number, { data }: { data: unknown }) => ({
        id,
        ...(data as object),
      })),
  };
  const strapi = {
    config: { get: vi.fn().mockReturnValue('http://localhost:1337') },
    entityService,
    ...overrides,
  };
  return { strapi, entityService };
}

describe('config service', () => {
  it('derives mcpUrl default from server.url', () => {
    const { strapi } = makeStrapi();
    const config = configFactory({ strapi } as never);
    expect(config.defaults()).toEqual({
      mcpUrl: 'http://localhost:1337/mcp',
      adminToken: '',
      llmBaseUrl: '',
      llmApiKey: '',
      llmModel: '',
    });
  });

  it('strips a trailing slash when building the mcpUrl default', () => {
    const { strapi } = makeStrapi();
    (strapi.config.get as ReturnType<typeof vi.fn>).mockReturnValue('https://example.com/');
    const config = configFactory({ strapi } as never);
    expect(config.defaults().mcpUrl).toBe('https://example.com/mcp');
  });

  it('applies env overrides on top of stored values', async () => {
    process.env.MCP_VIZ_ADMIN_TOKEN = 'env-secret';
    process.env.MCP_VIZ_LLM_MODEL = 'env-model';
    const { strapi, entityService } = makeStrapi();
    entityService.findMany.mockResolvedValue({
      id: 1,
      mcpUrl: 'http://mcp.local',
      adminToken: 'stored-secret',
      llmModel: 'stored-model',
    });
    const config = configFactory({ strapi } as never);
    const effective = await config.get();
    expect(effective.mcpUrl).toBe('http://mcp.local');
    expect(effective.adminToken).toBe('env-secret');
    expect(effective.llmModel).toBe('env-model');
    delete process.env.MCP_VIZ_ADMIN_TOKEN;
    delete process.env.MCP_VIZ_LLM_MODEL;
  });

  it('masks secrets in getMasked', async () => {
    const { strapi, entityService } = makeStrapi();
    entityService.findMany.mockResolvedValue({
      id: 1,
      adminToken: 'real-secret',
      llmApiKey: 'real-key',
    });
    const config = configFactory({ strapi } as never);
    const masked = await config.getMasked();
    expect(masked.adminToken).toBe(MASKED_SECRET);
    expect(masked.llmApiKey).toBe(MASKED_SECRET);
  });

  it('set() skips masked/empty secrets and preserves the stored secret', async () => {
    const { strapi, entityService } = makeStrapi();
    entityService.findMany.mockResolvedValue({
      id: 7,
      adminToken: 'real-secret',
      llmBaseUrl: 'http://llm',
    });
    const config = configFactory({ strapi } as never);
    const result = await config.set({
      mcpUrl: 'http://new-mcp',
      adminToken: MASKED_SECRET,
      llmModel: 'gpt-x',
    });

    expect(entityService.update).toHaveBeenCalledWith(
      SETTINGS_UID,
      7,
      expect.objectContaining({ data: { mcpUrl: 'http://new-mcp', llmModel: 'gpt-x' } })
    );
    expect(result.adminToken).toBe('real-secret');
    expect(result.mcpUrl).toBe('http://new-mcp');
  });

  it('set() creates the record when none exists', async () => {
    const { strapi, entityService } = makeStrapi();
    const config = configFactory({ strapi } as never);
    await config.set({ mcpUrl: 'http://first', llmModel: 'm' });
    expect(entityService.create).toHaveBeenCalledWith(
      SETTINGS_UID,
      expect.objectContaining({ data: { mcpUrl: 'http://first', llmModel: 'm' } })
    );
  });
});
