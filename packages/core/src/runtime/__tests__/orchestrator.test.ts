import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DataClient,
  type ExecuteStepOptions,
  type PermissionCheck,
  type UserContext,
} from '../../client';
import type { Intent } from '../../intent';
import type { ToolCall, ToolRegistry } from '../../plan';
import type { LLMProvider } from '../../provider';
import { SimpleOrchestrator } from '../orchestrator';
import type { SSEEvent } from '../events';

const user: UserContext = { id: 1, roles: ['Admin'] };

function makeRegistry(): ToolRegistry {
  const article = {
    uid: 'api::article.article',
    label: 'Article',
    fields: {
      title: { type: 'string' as const },
      views: { type: 'number' as const },
      status: { type: 'enumeration' as const, enum: ['draft', 'published'] },
      publishedAt: { type: 'datetime' as const },
      createdAt: { type: 'datetime' as const },
    },
  };
  const schemas = new Map([[article.uid, article]]);
  const tools = [
    {
      name: 'find_article',
      contentType: article.uid,
      description: 'Find articles',
      permission: 'plugin::mcp-viz.run',
      inputSchema: z.object({}),
    },
  ];
  return {
    contentTypes: () => [...schemas.values()],
    contentType: (uid) => schemas.get(uid),
    findTool: (name) => tools.find((entry) => entry.name === name),
    toolsForContentType: (uid) => tools.filter((entry) => entry.contentType === uid),
    tools: () => [...tools],
  };
}

function makeDataClient(records = [{ id: 1 }, { id: 2 }, { id: 3 }]): DataClient {
  return {
    executeStep: async (step: ToolCall, options: ExecuteStepOptions) => ({
      ok: true as const,
      records: records.map((r) => ({ id: r.id, attributes: r })),
      stats: {
        tool: step.tool,
        contentType: step.contentType,
        permission: step.permission,
        user: options.user,
        recordsReturned: records.length,
        recordsMatching: records.length,
        truncated: false,
        retrievedAt: '2026-08-16T00:00:00.000Z',
      },
    }),
  } as unknown as DataClient;
}

function makeProvider(output: string): LLMProvider {
  return {
    async *streamText() {
      yield output;
    },
  };
}

function kpiCountIntent(): Intent {
  return {
    kind: 'kpi',
    target: { uid: 'api::article.article', label: 'Article' },
    filters: { op: 'and', children: [] },
    limit: 100,
    aggregation: { fn: 'count' },
  };
}

async function collect(iterable: AsyncIterable<SSEEvent>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe('SimpleOrchestrator', () => {
  it('streams meta, intent, plan, tool_call, tool_result, block, done in order', async () => {
    const orchestrator = new SimpleOrchestrator();
    const events = await collect(
      orchestrator.run(
        {
          user,
          registry: makeRegistry(),
          data: makeDataClient(),
          provider: makeProvider(JSON.stringify(kpiCountIntent())),
          now: () => new Date('2026-08-16T00:00:00.000Z'),
        },
        'How many articles are there?',
      ),
    );

    expect(events.map((event) => event.type)).toEqual([
      'meta',
      'intent',
      'plan',
      'tool_call',
      'tool_result',
      'block',
      'done',
    ]);

    const done = events.at(-1);
    expect(done?.type).toBe('done');
    if (done?.type !== 'done') return;
    expect(done.response.summary).toContain('Article');
    expect(done.response.blocks).toHaveLength(1);
    expect(done.response.blocks[0]).toMatchObject({ type: 'kpi', value: 3 });
    expect(done.response.sources).toHaveLength(1);
    expect(done.response.sources[0]).toMatchObject({
      contentType: { uid: 'api::article.article' },
      recordsReturned: 3,
    });
    expect(done.response.generatedAt).toBe('2026-08-16T00:00:00.000Z');
    expect(done.response.runtime.stages.map((stage) => stage.name)).toEqual([
      'intent',
      'plan',
      'retrieve',
      'aggregate',
      'render',
    ]);
  });

  it('emits a validated error event when the model output is not a valid Intent', async () => {
    const orchestrator = new SimpleOrchestrator();
    const events = await collect(
      orchestrator.run(
        {
          user,
          registry: makeRegistry(),
          data: makeDataClient(),
          provider: makeProvider('I cannot do that.'),
        },
        'How many articles?',
      ),
    );

    expect(events.map((event) => event.type)).toEqual(['meta', 'error']);
    const error = events.at(-1);
    expect(error?.type).toBe('error');
    if (error?.type !== 'error') return;
    expect(error.code).toBe('INTENT_PARSE_FAILED');
  });

  it('enforces the permission gate through the data client', async () => {
    let called = false;
    const check: PermissionCheck = async () => {
      called = true;
      return false;
    };
    const transport = {
      callTool: async () => {
        throw new Error('should not be called');
      },
      listTools: async () => [],
      close: async () => {},
    };
    const orchestrator = new SimpleOrchestrator();
    const events = await collect(
      orchestrator.run(
        {
          user,
          registry: makeRegistry(),
          data: new DataClient(transport, makeRegistry()),
          provider: makeProvider(JSON.stringify(kpiCountIntent())),
          check,
        },
        'How many articles?',
      ),
    );

    expect(called).toBe(true);
    expect(events.map((event) => event.type)).toEqual([
      'meta',
      'intent',
      'plan',
      'tool_call',
      'error',
    ]);
    const error = events.at(-1);
    expect(error?.type).toBe('error');
    if (error?.type !== 'error') return;
    expect(error.code).toBe('PERMISSION_DENIED');
  });
});
