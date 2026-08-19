import type { Intent } from '../intent';
import type { QueryPlan } from '../plan';
import type { Block, AnalyticalResponse } from '../spec';
import type { UserContext } from '../client';

/** Events streamed to the admin UI over SSE, in execution order. */
export type SSEEvent =
  | { type: 'meta'; runId: string; question: string; user: UserContext }
  | { type: 'intent'; intent: Intent }
  | { type: 'plan'; plan: QueryPlan }
  | { type: 'tool_call'; id: string; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; ok: true; records: number }
  | { type: 'block'; block: Block }
  | { type: 'done'; runId: string; response: AnalyticalResponse }
  | { type: 'error'; runId: string; code: string; message: string };

export function serializeEvent(event: SSEEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
