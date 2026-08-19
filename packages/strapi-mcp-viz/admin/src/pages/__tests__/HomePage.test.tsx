// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DesignSystemProvider, lightTheme } from '@strapi/design-system';
import { HomePage } from '../HomePage';
import { blockEvent } from '../../api/__tests__/fixtures';
import * as client from '../../api/client';

vi.mock('react-intl', () => ({
  IntlProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) => defaultMessage,
  }),
}));

vi.mock('../../api/client', () => ({
  listQueries: vi.fn(async () => []),
  createQuery: vi.fn(async () => ({})),
  deleteQuery: vi.fn(async () => {}),
  updateQuery: vi.fn(async () => ({})),
  streamRun: vi.fn(async (_payload: unknown, handlers: client.RunHandlers) => {
    handlers.onEvent(blockEvent({ type: 'text', text: 'hello world' }));
    handlers.onDone();
  }),
}));

vi.mock('@strapi/admin/strapi-admin', () => ({
  Layouts: {
    Root: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Header: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    BaseHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Content: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  },
}));

const wrap = (ui: React.ReactNode) => (
  <DesignSystemProvider theme={lightTheme} locale="en">
    <MemoryRouter initialEntries={['/plugins/strapi-mcp-viz']}>{ui}</MemoryRouter>
  </DesignSystemProvider>
);

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.strapi = {
      flags: { docLinks: true },
      backendURL: 'http://localhost:1337',
    } as unknown as typeof window.strapi;
    window.matchMedia =
      window.matchMedia ??
      ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }));
  });

  it('renders an empty state before any question', async () => {
    render(wrap(<HomePage />));
    expect(await screen.findByText('Ask your first question to get started.')).toBeTruthy();
  });

  it('runs a question and renders the streamed answer', async () => {
    render(wrap(<HomePage />));
    await screen.findByText('Ask your first question to get started.');

    const input = screen.getByPlaceholderText('Ask a question about your content…');
    fireEvent.change(input, { target: { value: 'how many articles?' } });
    fireEvent.click(screen.getByText('Ask'));

    expect(await screen.findByTestId('text-block')).toBeTruthy();
    expect(screen.getByText('hello world')).toBeTruthy();
    expect(client.streamRun).toHaveBeenCalledTimes(1);
    expect(client.streamRun).toHaveBeenCalledWith(
      { question: 'how many articles?', savedQueryId: undefined },
      expect.anything(),
      expect.anything()
    );
  });

  it('offers a retry button after a failed run and re-runs the question', async () => {
    vi.mocked(client.streamRun).mockImplementationOnce(
      async (_payload: unknown, handlers: client.RunHandlers) => {
        handlers.onError('LLM unreachable', 'LLM_ERROR');
      }
    );

    render(wrap(<HomePage />));
    await screen.findByText('Ask your first question to get started.');

    const input = screen.getByPlaceholderText('Ask a question about your content…');
    fireEvent.change(input, { target: { value: 'how many articles?' } });
    fireEvent.click(screen.getByText('Ask'));

    expect(await screen.findByText('LLM unreachable')).toBeTruthy();
    expect(screen.getByText('Error: LLM_ERROR')).toBeTruthy();

    const retry = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retry);

    expect(await screen.findByTestId('text-block')).toBeTruthy();
    expect(client.streamRun).toHaveBeenCalledTimes(2);
    expect(client.streamRun).toHaveBeenLastCalledWith(
      { question: 'how many articles?', savedQueryId: undefined },
      expect.anything(),
      expect.anything()
    );
  });

  it('auto-runs a question when arriving from the homepage widget', async () => {
    const { container } = render(
      <DesignSystemProvider theme={lightTheme} locale="en">
        <MemoryRouter
          initialEntries={[
            '/plugins/strapi-mcp-viz?question=how%20many%20articles%3F&savedQueryId=5',
          ]}
        >
          <HomePage />
        </MemoryRouter>
      </DesignSystemProvider>
    );
    void container;

    expect(await screen.findByTestId('text-block')).toBeTruthy();
    expect(screen.getByText('hello world')).toBeTruthy();
    expect(client.streamRun).toHaveBeenCalledWith(
      { question: 'how many articles?', savedQueryId: '5' },
      expect.anything(),
      expect.anything()
    );
  });
});
