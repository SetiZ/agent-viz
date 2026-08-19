import type { Core } from '@strapi/strapi';
import setCreatorFields from '@strapi/utils/dist/set-creator-fields';

const SAVED_QUERY_UID = 'plugin::strapi-mcp-viz.saved-query';

type UpdateParams = NonNullable<Parameters<typeof strapi.entityService.update>[2]>;
type EntityData = NonNullable<UpdateParams['data']>;

interface QueryContext {
  request: { body?: Record<string, unknown> };
  state: { user?: { id: number | string } };
  status: number;
  body: unknown;
  params: Record<string, string>;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async list(ctx: QueryContext) {
    const entries = await strapi.entityService.findMany(SAVED_QUERY_UID, {
      sort: 'createdAt:desc',
    });
    ctx.body = entries;
  },

  async create(ctx: QueryContext) {
    const { title, question, resultBlocks, isPinned } = ctx.request.body ?? {};
    if (
      typeof title !== 'string' ||
      title.length === 0 ||
      typeof question !== 'string' ||
      question.length === 0
    ) {
      ctx.status = 400;
      ctx.body = { error: 'title and question are required' };
      return;
    }
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { error: 'unauthenticated' };
      return;
    }

    const data = setCreatorFields({ user: ctx.state.user })({
      title,
      question,
      ...(resultBlocks !== undefined ? { resultBlocks } : {}),
      ...(typeof isPinned === 'boolean' ? { isPinned } : {}),
    });
    ctx.body = await strapi.entityService.create(SAVED_QUERY_UID, { data });
  },

  async update(ctx: QueryContext) {
    const { title, question, resultBlocks, isPinned } = ctx.request.body ?? {};
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { error: 'unauthenticated' };
      return;
    }

    const data = setCreatorFields({ user: ctx.state.user, isEdition: true })({
      ...(typeof title === 'string' ? { title } : {}),
      ...(typeof question === 'string' ? { question } : {}),
      ...(resultBlocks !== undefined ? { resultBlocks } : {}),
      ...(typeof isPinned === 'boolean' ? { isPinned } : {}),
    }) as unknown as EntityData;
    ctx.body = await strapi.entityService.update(SAVED_QUERY_UID, ctx.params.id, { data });
  },

  async delete(ctx: QueryContext) {
    ctx.body = await strapi.entityService.delete(SAVED_QUERY_UID, ctx.params.id, {});
  },
});
