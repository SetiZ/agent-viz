// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DesignSystemProvider, lightTheme } from '@strapi/design-system';
import { AssistantMessage } from '../AssistantMessage';
import {
  blockEvent,
  doneEvent,
  errorEvent,
  toolCallEvent,
  toolResultEvent,
} from '../../api/__tests__/fixtures';

vi.mock('react-intl', () => ({
  IntlProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) => defaultMessage,
  }),
}));

const wrap = (ui: React.ReactNode) => (
  <DesignSystemProvider theme={lightTheme} locale="en">
    {ui}
  </DesignSystemProvider>
);

describe('AssistantMessage', () => {
  it('shows a thinking placeholder while streaming with no output yet', () => {
    render(wrap(<AssistantMessage message={{ events: [], status: 'streaming' }} />));
    expect(screen.getByText('Thinking…')).toBeTruthy();
  });

  it('renders tool progress lines with completion marks', () => {
    render(
      wrap(
        <AssistantMessage
          message={{
            events: [toolCallEvent('t1', 'list_article'), toolResultEvent('t1')],
            status: 'streaming',
          }}
        />
      )
    );
    expect(screen.getByText(/list_article/)).toBeTruthy();
  });

  it('renders streamed blocks', () => {
    render(
      wrap(
        <AssistantMessage
          message={{ events: [blockEvent({ type: 'text', text: 'hello world' })], status: 'done' }}
        />
      )
    );
    expect(screen.getByTestId('text-block').textContent).toBe('hello world');
  });

  it('renders the summary and sources once done', () => {
    render(
      wrap(
        <AssistantMessage
          message={{
            events: [blockEvent({ type: 'text', text: 'hello world' }), doneEvent()],
            status: 'done',
          }}
        />
      )
    );
    expect(screen.getByText('3 published articles')).toBeTruthy();
  });

  it('renders an error event payload', () => {
    render(
      wrap(
        <AssistantMessage
          message={{
            events: [errorEvent('CONFIG_INCOMPLETE', 'LLM not configured')],
            status: 'error',
          }}
        />
      )
    );
    expect(screen.getByText('LLM not configured')).toBeTruthy();
    expect(screen.getByText('Error: CONFIG_INCOMPLETE')).toBeTruthy();
  });

  it('surfaces a transport-level error from the message model', () => {
    render(
      wrap(
        <AssistantMessage
          message={{
            events: [],
            status: 'error',
            errorMessage: 'Network failure',
            errorCode: 'NETWORK',
          }}
        />
      )
    );
    expect(screen.getByText('Network failure')).toBeTruthy();
  });
});
