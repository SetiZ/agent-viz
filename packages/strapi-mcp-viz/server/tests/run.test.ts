import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import runFactory from '../src/controllers/run';
import { serializeEvent, type SSEEvent } from '@mcp-viz/core/agent';

const META: SSEEvent = {
  type: 'meta',
  runId: 'run-1',
  question: 'list articles',
  user: { id: 1, roles: ['Administrator'] },
};
const DONE: SSEEvent = {
  type: 'done',
  runId: 'run-1',
  response: {
    type: 'analytical_response',
    summary: '2 articles',
    blocks: [],
  } as never,
};

type FakeStrapi = ReturnType<typeof makeStrapi>;

function makeCtx(user?: { id: number; roles?: { name: string }[] }) {
  return {
    request: { body: { question: 'list articles' } },
    state: { user },
    set: vi.fn(),
    status: 200,
    body: undefined as unknown,
  };
}

function makeStrapi(events: AsyncIterable<SSEEvent>) {
  const run = vi.fn().mockResolvedValue(events);
  return {
    strapi: {
      log: { debug: vi.fn(), error: vi.fn() },
      entityService: { findOne: vi.fn().mockResolvedValue({ question: 'saved question' }) },
      plugin: vi.fn().mockReturnValue({ service: vi.fn().mockReturnValue({ run }) }),
    },
  };
}

function agentOf(s: FakeStrapi) {
  return s.strapi.plugin() as unknown as { service: () => { run: ReturnType<typeof vi.fn> } };
}

async function collect(body: unknown): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of body as Readable) {
    chunks.push(String(chunk));
  }
  return chunks.join('');
}

describe('run controller (SSE)', () => {
  it('streams events as SSE frames and closes the stream', async () => {
    async function* events() {
      yield META;
      yield DONE;
    }
    const strapi = makeStrapi(events());
    const controller = runFactory(strapi as never);
    const ctx = makeCtx({ id: 1, roles: [{ name: 'Administrator' }] });

    await controller.run(ctx);

    expect(ctx.set).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(ctx.set).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
    const raw = await collect(ctx.body);
    expect(raw).toBe(serializeEvent(META) + serializeEvent(DONE));
  });

  it('passes role names as the user context', async () => {
    async function* events() {
      yield META;
    }
    const strapi = makeStrapi(events());
    const controller = runFactory(strapi as never);
    const ctx = makeCtx({ id: 9, roles: [{ name: 'Editor' }, { name: 'Author' }] });

    await controller.run(ctx);
    await collect(ctx.body);

    expect(agentOf(strapi).service('agent').run).toHaveBeenCalledWith({
      question: 'list articles',
      user: { id: 9, roles: ['Editor', 'Author'] },
    });
  });

  it('returns 401 when the user is missing', async () => {
    const controller = runFactory(makeStrapi([]) as never);
    const ctx = makeCtx(undefined);
    await controller.run(ctx);
    expect(ctx.status).toBe(401);
    expect(ctx.body).toEqual({ error: 'unauthenticated' });
  });

  it('returns 400 when the question is empty', async () => {
    const controller = runFactory(makeStrapi([]) as never);
    const ctx = makeCtx({ id: 1 });
    ctx.request.body = {};
    await controller.run(ctx);
    expect(ctx.status).toBe(400);
    expect(ctx.body).toEqual({ error: 'question is required' });
  });

  it('resolves the question from a saved query', async () => {
    async function* events() {
      yield META;
    }
    const strapi = makeStrapi(events());
    const controller = runFactory(strapi as never);
    const ctx = makeCtx({ id: 1 });
    ctx.request.body = { savedQueryId: 'sq-1', question: 'list articles' };

    await controller.run(ctx);
    await collect(ctx.body);

    expect(strapi.strapi.entityService.findOne).toHaveBeenCalledWith(
      'plugin::strapi-mcp-viz.saved-query',
      'sq-1',
      {}
    );
    expect(agentOf(strapi).service('agent').run).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'saved question' })
    );
  });

  it('streams an error event and closes when the agent throws', async () => {
    const strapi = makeStrapi([]);
    agentOf(strapi)
      .service('agent')
      .run.mockRejectedValue(Object.assign(new Error('boom'), { code: 'CONFIG_INCOMPLETE' }));

    const controller = runFactory(strapi as never);
    const ctx = makeCtx({ id: 1 });

    await controller.run(ctx);
    const raw = await collect(ctx.body);

    expect(raw).toContain('event: error');
    expect(raw).toContain('"code":"CONFIG_INCOMPLETE"');
    expect(raw).toContain('"message":"boom"');
  });
});
