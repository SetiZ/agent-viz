import { useIntl } from 'react-intl';
import { Alert, Box, Typography } from '@strapi/design-system';
import type { SSEEvent } from '@mcp-viz/core/agent';
import { BlockRenderer } from '@mcp-viz/core/react';
import { pluginId } from '../pluginId';
import { ProgressLines } from './ProgressLines';

export interface AssistantMessageModel {
  events: SSEEvent[];
  status: 'streaming' | 'done' | 'error';
  errorMessage?: string;
  errorCode?: string;
}

export function AssistantMessage({ message }: { message: AssistantMessageModel }) {
  const { formatMessage } = useIntl();
  const blocks = message.events
    .filter((event): event is Extract<SSEEvent, { type: 'block' }> => event.type === 'block')
    .map((event) => event.block);

  const done = message.events.find(
    (event): event is Extract<SSEEvent, { type: 'done' }> => event.type === 'done'
  );

  const errorEvent = message.events.find(
    (event): event is Extract<SSEEvent, { type: 'error' }> => event.type === 'error'
  );

  const errorMessage =
    (message.status === 'error' && message.errorMessage) || errorEvent?.message || null;
  const errorCode = (message.status === 'error' && message.errorCode) || errorEvent?.code;

  const thinking = message.status === 'streaming' && blocks.length === 0 && !done && !errorEvent;

  return (
    <Box padding={4} background="neutral0" borderColor="neutral150" hasRadius>
      {thinking && (
        <Typography variant="pi">
          {formatMessage({ id: `${pluginId}.thinking`, defaultMessage: 'Thinking…' })}
        </Typography>
      )}
      <ProgressLines events={message.events} />
      {done && <Typography paddingBottom={3}>{done.response.summary}</Typography>}
      {blocks.length > 0 && (
        <BlockRenderer blocks={blocks} sources={done?.response.sources} showSources />
      )}
      {errorMessage && (
        <Alert
          title={
            errorCode
              ? `${formatMessage({ id: `${pluginId}.error.title`, defaultMessage: 'Error' })}: ${errorCode}`
              : formatMessage({ id: `${pluginId}.error.title`, defaultMessage: 'Error' })
          }
          variant="danger"
          closeLabel={formatMessage({ id: `${pluginId}.error.close`, defaultMessage: 'Close' })}
        >
          {errorMessage}
        </Alert>
      )}
    </Box>
  );
}
