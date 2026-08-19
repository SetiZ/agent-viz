// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DesignSystemProvider, lightTheme } from '@strapi/design-system';
import { SavedQueriesPanel } from '../SavedQueriesPanel';
import type { SavedQuery } from '../../api/types';

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

const query: SavedQuery = {
  id: 7,
  title: 'Published count',
  question: 'how many articles are published?',
  resultBlocks: null,
  isPinned: true,
};

describe('SavedQueriesPanel', () => {
  it('renders each saved query with its question', () => {
    render(
      wrap(
        <SavedQueriesPanel
          queries={[query]}
          loading={false}
          onRun={vi.fn()}
          onTogglePin={vi.fn()}
          onDelete={vi.fn()}
        />
      )
    );
    expect(screen.getByText('Published count')).toBeTruthy();
    expect(screen.getByText('how many articles are published?')).toBeTruthy();
  });

  it('shows an empty state when there are no queries', () => {
    render(
      wrap(
        <SavedQueriesPanel
          queries={[]}
          loading={false}
          onRun={vi.fn()}
          onTogglePin={vi.fn()}
          onDelete={vi.fn()}
        />
      )
    );
    expect(screen.getByText('No saved queries yet. Run a question, then save it.')).toBeTruthy();
  });
});
