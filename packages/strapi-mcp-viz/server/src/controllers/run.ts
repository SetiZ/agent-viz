import { Readable } from 'node:stream';
import type { Core } from '@strapi/strapi';
import { serializeEvent, type SSEEvent } from '@mcp-viz/core/agent';

interface AdminUser {
  id: number | string;
  roles?: { name: string }[];
}

interface RunContext {
  request: { body?: Record<string, unknown> };
  state: { user?: AdminUser };
  set: (name: string, value: string) => void;
  status: number;
  body: unknown;
}

const SAVED_QUERY_UID = 'plugin::strapi-mcp-viz.saved-query';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Streams SSE events for an answer. Requires the `mcp-viz.run` permission
   * (enforced by the route policy). The agent service owns transport and
   * provider lifecycle; this controller only frames events as SSE.
   */
  async run(ctx: RunContext) {
    const body = ctx.request.body ?? {};
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const user = ctx.state.user;

    if (!user) {
      ctx.status = 401;
      ctx.body = { error: 'unauthenticated' };
      return;
    }
    if (!question) {
      ctx.status = 400;
      ctx.body = { error: 'question is required' };
      return;
    }

    let resolvedQuestion = question;
    const savedQueryId = typeof body.savedQueryId === 'string' ? body.savedQueryId : undefined;
    if (savedQueryId) {
      try {
        const saved = await strapi.entityService.findOne(SAVED_QUERY_UID, savedQueryId, {});
        if (!saved) {
          ctx.status = 404;
          ctx.body = { error: `saved query "${savedQueryId}" not found` };
          return;
        }
        resolvedQuestion = typeof saved.question === 'string' ? saved.question : question;
      } catch {
        ctx.status = 500;
        ctx.body = { error: 'failed to load saved query' };
        return;
      }
    }

    ctx.set('Content-Type', 'text/event-stream');
    ctx.set('Cache-Control', 'no-cache, no-transform');
    ctx.set('X-Accel-Buffering', 'no');

    const stream = new Readable({ read() {} });
    ctx.body = stream;

    const userContext = { id: user.id, roles: user.roles?.map((role) => role.name) ?? [] };

    void (async () => {
      try {
        const events = await strapi
          .plugin('strapi-mcp-viz')
          .service('agent')
          .run({ question: resolvedQuestion, user: userContext });
        for await (const event of events) {
          stream.push(serializeEvent(event));
        }
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? String((error as { code: unknown }).code)
            : 'INTERNAL';
        const fallback: SSEEvent = {
          type: 'error',
          runId: '',
          code,
          message: error instanceof Error ? error.message : 'unknown error',
        };
        stream.push(serializeEvent(fallback));
      } finally {
        stream.push(null);
      }
    })();
  },
});
