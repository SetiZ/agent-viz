import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { Layouts } from '@strapi/admin/strapi-admin';
import { Box, Button, Field, Flex, Typography } from '@strapi/design-system';
import { Magic, Plus } from '@strapi/icons';
import type { SSEEvent } from '@mcp-viz/core/agent';
import type { Block } from '@mcp-viz/core/spec';
import { createQuery, deleteQuery, listQueries, streamRun, updateQuery } from '../api/client';
import type { SavedQuery } from '../api/types';
import { pluginId } from '../pluginId';
import { AssistantMessage, type AssistantMessageModel } from '../components/AssistantMessage';
import { SavedQueriesPanel } from '../components/SavedQueriesPanel';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  question?: string;
  assistant?: AssistantMessageModel;
}

const toAssistantModel = (message: Message): AssistantMessageModel => ({
  events: message.assistant?.events ?? [],
  status: message.assistant?.status ?? 'streaming',
  errorMessage: message.assistant?.errorMessage,
  errorCode: message.assistant?.errorCode,
});

export function HomePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { formatMessage } = useIntl();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [queriesLoading, setQueriesLoading] = useState(true);
  const activeController = useRef<AbortController | null>(null);

  const refreshQueries = useCallback(async () => {
    try {
      setQueriesLoading(true);
      const data = await listQueries();
      setQueries(data);
    } catch {
      // keep previous list
    } finally {
      setQueriesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshQueries();
  }, [refreshQueries]);

  useEffect(() => {
    return () => activeController.current?.abort();
  }, []);

  useEffect(() => {
    const question = searchParams.get('question');
    if (question) {
      void run(question, searchParams.get('savedQueryId') ?? undefined);
      setSearchParams({}, { replace: true });
    }
  }, []);

  const run = useCallback(
    async (question: string, savedQueryId?: string) => {
      const trimmed = question.trim();
      if (!trimmed || running) return;

      const userMessageId = crypto.randomUUID();
      const assistantMessageId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: userMessageId, role: 'user', question: trimmed },
        {
          id: assistantMessageId,
          role: 'assistant',
          question: trimmed,
          assistant: { events: [], status: 'streaming' },
        },
      ]);
      setInput('');
      setRunning(true);

      const controller = new AbortController();
      activeController.current = controller;

      const updateAssistant = (
        updater: (model: AssistantMessageModel) => AssistantMessageModel
      ) => {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId && message.assistant
              ? { ...message, assistant: updater(message.assistant) }
              : message
          )
        );
      };

      try {
        await streamRun(
          { question: trimmed, savedQueryId },
          {
            onEvent: (event: SSEEvent) => {
              updateAssistant((model) => ({ ...model, events: [...model.events, event] }));
            },
            onDone: () => {
              updateAssistant((model) => ({ ...model, status: 'done' }));
              setRunning(false);
            },
            onError: (message, code) => {
              updateAssistant((model) => ({
                ...model,
                status: 'error',
                errorMessage: message,
                errorCode: code,
              }));
              setRunning(false);
            },
          },
          controller.signal
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          updateAssistant((model) => ({
            ...model,
            status: 'error',
            errorMessage: formatMessage({
              id: `${pluginId}.page.cancelled`,
              defaultMessage: 'Cancelled',
            }),
          }));
        } else {
          const message = error instanceof Error ? error.message : String(error);
          updateAssistant((model) => ({
            ...model,
            status: 'error',
            errorMessage: message,
            errorCode: 'NETWORK',
          }));
        }
        setRunning(false);
      }
    },
    [running, formatMessage]
  );

  const saveCurrent = useCallback(
    async (message: Message) => {
      if (!message.assistant) return;
      const blocks = message.assistant.events
        .filter((event): event is Extract<SSEEvent, { type: 'block' }> => event.type === 'block')
        .map((event) => event.block);
      const done = message.assistant.events.find(
        (event): event is Extract<SSEEvent, { type: 'done' }> => event.type === 'done'
      );
      if (!done && blocks.length === 0) return;

      const title = (message.question ?? 'Saved answer').slice(0, 80);
      await createQuery({
        title,
        question: message.question ?? '',
        resultBlocks: blocks.length > 0 ? blocks : (done?.response.blocks as Block[] | undefined),
      });
      await refreshQueries();
    },
    [refreshQueries]
  );

  const togglePin = useCallback(
    async (query: SavedQuery) => {
      await updateQuery(query.id, { isPinned: !query.isPinned });
      await refreshQueries();
    },
    [refreshQueries]
  );

  const removeQuery = useCallback(
    async (query: SavedQuery) => {
      await deleteQuery(query.id);
      await refreshQueries();
    },
    [refreshQueries]
  );

  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant');
  const canSave =
    lastAssistantMessage?.assistant?.status === 'done' &&
    lastAssistantMessage.assistant.events.some(
      (event) => event.type === 'block' || event.type === 'done'
    );
  const canRetry = lastAssistantMessage?.assistant?.status === 'error';

  return (
    <Layouts.Root>
      <Layouts.Header
        title={formatMessage({ id: `${pluginId}.page.title`, defaultMessage: 'Ask your data' })}
        subtitle={formatMessage({
          id: `${pluginId}.page.subtitle`,
          defaultMessage:
            'Ask questions in plain English and get tables and charts from your Strapi content.',
        })}
        primaryAction={
          <Button variant="tertiary" onClick={() => navigate('settings')}>
            {formatMessage({ id: `${pluginId}.page.settings`, defaultMessage: 'Settings' })}
          </Button>
        }
      />
      <Layouts.Content>
        <Flex gap={4} alignItems="flex-start">
          <Box flex="1" style={{ minWidth: 0 }}>
            <Box
              padding={4}
              background="neutral100"
              borderColor="neutral200"
              hasRadius
              style={{ minHeight: 420 }}
            >
              {messages.length === 0 && (
                <Typography variant="pi" textColor="neutral600">
                  {formatMessage({
                    id: `${pluginId}.thread.empty`,
                    defaultMessage: 'Ask your first question to get started.',
                  })}
                </Typography>
              )}
              {messages.map((message) =>
                message.role === 'user' ? (
                  <Flex key={message.id} justifyContent="flex-end" paddingBottom={3}>
                    <Box
                      padding={3}
                      background="primary100"
                      borderColor="primary200"
                      hasRadius
                      maxWidth="80%"
                    >
                      <Typography>{message.question}</Typography>
                    </Box>
                  </Flex>
                ) : (
                  <Box key={message.id} paddingBottom={4}>
                    <AssistantMessage message={toAssistantModel(message)} />
                    {message.id === lastAssistantMessage?.id && canSave && (
                      <Flex justifyContent="flex-end" paddingTop={2}>
                        <Button
                          size="S"
                          startIcon={<Plus />}
                          onClick={() => void saveCurrent(message)}
                        >
                          {formatMessage({
                            id: `${pluginId}.saved.save`,
                            defaultMessage: 'Save this answer',
                          })}
                        </Button>
                      </Flex>
                    )}
                    {message.id === lastAssistantMessage?.id && canRetry && (
                      <Flex justifyContent="flex-end" paddingTop={2}>
                        <Button
                          size="S"
                          variant="secondary"
                          startIcon={<Magic />}
                          onClick={() => void run(message.question ?? '')}
                        >
                          {formatMessage({ id: `${pluginId}.page.retry`, defaultMessage: 'Retry' })}
                        </Button>
                      </Flex>
                    )}
                  </Box>
                )
              )}
            </Box>
            <Box paddingTop={4}>
              <Field.Root name="question">
                <Field.Input
                  id="question-input"
                  placeholder={formatMessage({
                    id: `${pluginId}.input.placeholder`,
                    defaultMessage: 'Ask a question about your content…',
                  })}
                  value={input}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setInput(event.target.value)
                  }
                  onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void run(input);
                    }
                  }}
                  disabled={running}
                />
              </Field.Root>
              <Flex justifyContent="flex-end" paddingTop={2}>
                <Button startIcon={<Magic />} loading={running} onClick={() => void run(input)}>
                  {formatMessage({ id: `${pluginId}.input.submit`, defaultMessage: 'Ask' })}
                </Button>
              </Flex>
            </Box>
          </Box>
          <Box width="300px">
            <SavedQueriesPanel
              queries={queries}
              loading={queriesLoading}
              onRun={(query) => void run(query.question, String(query.id))}
              onTogglePin={(query) => void togglePin(query)}
              onDelete={(query) => void removeQuery(query)}
            />
          </Box>
        </Flex>
      </Layouts.Content>
    </Layouts.Root>
  );
}
