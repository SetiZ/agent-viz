import { aggregateRecords, type ContentRecord } from '../aggregate';
import type { StepResult } from '../client';
import { parseIntent } from '../intent/parser';
import { planQuery, type QueryPlan } from '../plan';
import { renderBlocks } from '../render';
import { analyticalResponseSchema, type AnalyticalResponse, type SourceMetadata } from '../spec';
import type { RuntimeContext } from './ctx';
import { StepExecutionError, toErrorCode } from './errors';
import type { SSEEvent } from './events';

/**
 * Simple sequential orchestration: parse intent → plan → retrieve →
 * aggregate → render. Framework-agnostic: a future Mastra/VoltAgent runtime
 * can implement the same `run(ctx, question)` contract over the same stages.
 */
export class SimpleOrchestrator {
  async *run(ctx: RuntimeContext, question: string): AsyncIterable<SSEEvent> {
    const runId = crypto.randomUUID();
    const stages: { name: string; ms: number }[] = [];
    yield { type: 'meta', runId, question, user: ctx.user };

    try {
      const intentStart = Date.now();
      const { intent } = await parseIntent(question, ctx.provider, ctx.registry);
      stages.push({ name: 'intent', ms: Date.now() - intentStart });
      yield { type: 'intent', intent };

      const planStart = Date.now();
      const plan = planQuery(intent, ctx.registry, {
        ...(ctx.limits ? { limits: ctx.limits } : {}),
      });
      stages.push({ name: 'plan', ms: Date.now() - planStart });
      yield { type: 'plan', plan };

      const retrieveStart = Date.now();
      const sources: SourceMetadata[] = [];
      let records: ContentRecord[] = [];
      for (const step of plan.steps) {
        yield { type: 'tool_call', id: step.id, tool: step.tool, args: step.args };
        const result = await ctx.data.executeStep(step, {
          user: ctx.user,
          ...(ctx.check ? { check: ctx.check } : {}),
          limit: plan.intent.limit,
        });
        if (!result.ok) {
          throw new StepExecutionError(result.error.code, result.error.message);
        }
        yield { type: 'tool_result', id: step.id, ok: true, records: result.records.length };
        sources.push(toSourceMetadata(result, plan, ctx));
        records = result.records;
      }
      stages.push({ name: 'retrieve', ms: Date.now() - retrieveStart });

      const aggregateStart = Date.now();
      let aggregation: ReturnType<typeof aggregateRecords> | undefined;
      if (plan.intent.aggregation) {
        const source = sources[0];
        aggregation = aggregateRecords(plan.intent.aggregation, records, {
          ...(source ? { source } : {}),
          ...(ctx.timezone ? { timezone: ctx.timezone } : {}),
        });
      }
      stages.push({ name: 'aggregate', ms: Date.now() - aggregateStart });

      const renderStart = Date.now();
      const rendered = renderBlocks({
        intent: plan.intent,
        sources,
        effectiveFilters: plan.effectiveFilters,
        ...(plan.dateRange ? { dateRange: plan.dateRange } : {}),
        ...(aggregation ? { aggregation } : {}),
        ...(!aggregation && records.length > 0 ? { records } : {}),
      });
      stages.push({ name: 'render', ms: Date.now() - renderStart });

      for (const block of rendered.blocks) {
        yield { type: 'block', block };
      }

      const response: AnalyticalResponse = {
        summary: rendered.summary,
        blocks: rendered.blocks,
        sources,
        filters: plan.effectiveFilters,
        ...(plan.dateRange ? { dateRange: plan.dateRange } : {}),
        caveats: rendered.caveats,
        generatedAt: (ctx.now?.() ?? new Date()).toISOString(),
        runtime: { orchestrator: 'simple', stages },
      };

      const validated = analyticalResponseSchema.safeParse(response);
      if (!validated.success) {
        throw new Error(
          `internal response failed validation: ${validated.error.issues[0]?.message ?? 'unknown'}`,
        );
      }

      yield { type: 'done', runId, response: validated.data };
    } catch (error) {
      yield {
        type: 'error',
        runId,
        code: toErrorCode(error),
        message: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }
}

function toSourceMetadata(
  result: StepResult,
  plan: QueryPlan,
  ctx: RuntimeContext,
): SourceMetadata {
  return {
    contentType: {
      uid: plan.contentType,
      ...(plan.intent.target.label ? { label: plan.intent.target.label } : {}),
    },
    tool: result.stats.tool,
    filters: plan.effectiveFilters,
    ...(plan.dateRange ? { dateRange: plan.dateRange } : {}),
    recordsReturned: result.stats.recordsReturned,
    recordsMatching: result.stats.recordsMatching,
    truncated: result.stats.truncated,
    retrievedAt: result.stats.retrievedAt,
    user: ctx.user,
    permission: result.stats.permission,
  };
}
