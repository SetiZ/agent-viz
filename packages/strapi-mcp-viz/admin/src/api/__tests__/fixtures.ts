import type { SSEEvent } from '@mcp-viz/core/agent';
import type { Block } from '@mcp-viz/core/spec';
import { EMPTY_FILTER_GROUP } from '@mcp-viz/core/spec';

export const blockEvent = (block: Block): SSEEvent => ({
  type: 'block',
  block,
});

export const toolCallEvent = (id: string, tool: string): SSEEvent => ({
  type: 'tool_call',
  id,
  tool,
  args: {},
});

export const toolResultEvent = (id: string): SSEEvent => ({
  type: 'tool_result',
  id,
  ok: true,
  records: 3,
});

export const doneEvent = (): SSEEvent => ({
  type: 'done',
  runId: 'run-1',
  response: {
    summary: '3 published articles',
    blocks: [],
    sources: [],
    filters: EMPTY_FILTER_GROUP,
    caveats: [],
    generatedAt: new Date().toISOString(),
    runtime: { orchestrator: 'mcp-viz', stages: [] },
  },
});

export const errorEvent = (code: string, message: string): SSEEvent => ({
  type: 'error',
  runId: 'run-1',
  code,
  message,
});
