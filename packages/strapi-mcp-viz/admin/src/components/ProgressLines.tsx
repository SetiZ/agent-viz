import { Box, Typography } from '@strapi/design-system';
import type { SSEEvent } from '@mcp-viz/core/agent';

export function ProgressLines({ events }: { events: SSEEvent[] }) {
  const calls = events.filter((event): event is Extract<SSEEvent, { type: 'tool_call' }> => {
    return event.type === 'tool_call';
  });
  const finishedIds = new Set(
    events
      .filter(
        (event): event is Extract<SSEEvent, { type: 'tool_result' }> => event.type === 'tool_result'
      )
      .map((event) => event.id)
  );

  if (calls.length === 0) return null;

  return (
    <Box paddingBottom={2}>
      {calls.map((call) => {
        const done = finishedIds.has(call.id);
        return (
          <Typography key={call.id} variant="pi" textColor={done ? 'neutral600' : 'primary600'}>
            {done ? '✓' : '…'} {call.tool}
          </Typography>
        );
      })}
    </Box>
  );
}
