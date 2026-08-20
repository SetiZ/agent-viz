import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ToolRegistry } from '../../plan';
import { DataClient } from '../data-client';
import type { McpTransport } from '../mcp';

function makeRegistry(): ToolRegistry {
  return {
    contentTypes: () => [],
    contentType: () => undefined,
    findTool: (name) =>
      name === 'find_article'
        ? {
            name,
            contentType: 'api::article.article',
            description: 'Find articles',
            permission: 'plugin::mcp-viz.run',
            inputSchema: z.object({}),
          }
        : undefined,
    toolsForContentType: () => [],
    tools: () => [],
  };
}

function makeStep() {
  return {
    id: 'step-1',
    tool: 'find_article',
    contentType: 'api::article.article',
    permission: 'plugin::mcp-viz.run',
    args: {
      filters: {} as Record<string, unknown>,
      pagination: { page: 1, pageSize: 100 },
    },
  };
}

function pageResponse(items: { id: number }[], total: number): string {
  return JSON.stringify({
    data: items.map((item) => ({ id: item.id, attributes: item })),
    meta: { pagination: { page: 1, pageSize: 100, pageCount: 1, total } },
  });
}

/** The actual Strapi MCP `list_*` response shape: flat `{ results, pagination }`. */
function mcpListResponse(items: Record<string, unknown>[], total: number): string {
  return JSON.stringify({
    results: items,
    pagination: { page: 1, pageSize: 100, pageCount: 1, total },
  });
}

const user = { id: 7, roles: ['Admin'] };

describe('DataClient.executeStep', () => {
  it('returns records and stats on a successful call', async () => {
    const transport: McpTransport = {
      callTool: async () => ({ content: [{ type: 'text', text: pageResponse([{ id: 1 }], 1) }] }),
      listTools: async () => [],
      close: async () => {},
    };
    const client = new DataClient(transport, makeRegistry());
    const result = await client.executeStep(makeStep(), { user });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records).toEqual([{ id: 1, attributes: { id: 1 } }]);
    expect(result.stats).toMatchObject({
      tool: 'find_article',
      recordsReturned: 1,
      recordsMatching: 1,
      truncated: false,
      user,
    });
  });

  it('parses the Strapi MCP list response shape ({ results, pagination })', async () => {
    const transport: McpTransport = {
      callTool: async () => ({
        content: [
          {
            type: 'text',
            text: mcpListResponse(
              [
                { id: 7, documentId: 'a', title: 'One', publishedAt: '2025-11-14T09:00:00.000Z' },
                { id: 8, documentId: 'b', title: 'Two', publishedAt: '2025-11-28T09:00:00.000Z' },
              ],
              2,
            ),
          },
        ],
      }),
      listTools: async () => [],
      close: async () => {},
    };
    const client = new DataClient(transport, makeRegistry());
    const result = await client.executeStep(makeStep(), { user });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records).toEqual([
      { id: 7, attributes: { documentId: 'a', title: 'One', publishedAt: '2025-11-14T09:00:00.000Z' } },
      { id: 8, attributes: { documentId: 'b', title: 'Two', publishedAt: '2025-11-28T09:00:00.000Z' } },
    ]);
    expect(result.stats).toMatchObject({ recordsReturned: 2, recordsMatching: 2, truncated: false });
  });

  it('pages until the limit is reached', async () => {
    const calls: number[] = [];
    const transport: McpTransport = {
      callTool: async (_name, args) => {
        const page = args.page as number;
        calls.push(page);
        return {
          content: [{ type: 'text' as const, text: pageResponse([{ id: page }], 2) }],
        };
      },
      listTools: async () => [],
      close: async () => {},
    };
    const client = new DataClient(transport, makeRegistry());
    const step = {
      ...makeStep(),
      args: { ...makeStep().args, pagination: { page: 1, pageSize: 1 } },
    };
    const result = await client.executeStep(step, { user, limit: 2 });

    expect(calls).toEqual([1, 2]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records).toHaveLength(2);
  });

  it('denies when the permission gate rejects', async () => {
    const transport: McpTransport = {
      callTool: async () => {
        throw new Error('should not be called');
      },
      listTools: async () => [],
      close: async () => {},
    };
    const client = new DataClient(transport, makeRegistry());
    const result = await client.executeStep(makeStep(), {
      user,
      check: async () => false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PERMISSION_DENIED');
  });

  it('reports unknown tools without calling the transport', async () => {
    let called = false;
    const transport: McpTransport = {
      callTool: async () => {
        called = true;
        return { isError: false };
      },
      listTools: async () => [],
      close: async () => {},
    };
    const client = new DataClient(transport, makeRegistry());
    const result = await client.executeStep({ ...makeStep(), tool: 'create_article' }, { user });

    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UNKNOWN_TOOL');
  });

  it('surfaces MCP errors', async () => {
    const transport: McpTransport = {
      callTool: async () => ({ isError: true, content: [{ type: 'text', text: 'boom' }] }),
      listTools: async () => [],
      close: async () => {},
    };
    const client = new DataClient(transport, makeRegistry());
    const result = await client.executeStep(makeStep(), { user });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MCP_ERROR');
    expect(result.error.message).toBe('boom');
  });

  it('converts transport throws into MCP_CALL_FAILED', async () => {
    const transport: McpTransport = {
      callTool: async () => {
        throw new Error('connection refused');
      },
      listTools: async () => [],
      close: async () => {},
    };
    const client = new DataClient(transport, makeRegistry());
    const result = await client.executeStep(makeStep(), { user });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MCP_CALL_FAILED');
  });

  it('marks truncation when the server reports more matches than returned', async () => {
    const transport: McpTransport = {
      callTool: async () => ({ content: [{ type: 'text', text: pageResponse([{ id: 1 }], 500) }] }),
      listTools: async () => [],
      close: async () => {},
    };
    const client = new DataClient(transport, makeRegistry());
    const result = await client.executeStep(makeStep(), { user, limit: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.truncated).toBe(true);
    expect(result.stats.recordsMatching).toBe(500);
  });
});
