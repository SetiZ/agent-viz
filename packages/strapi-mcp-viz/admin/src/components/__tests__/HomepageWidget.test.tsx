// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { DesignSystemProvider, lightTheme } from '@strapi/design-system';
import { HomepageWidget } from '../HomepageWidget';
import type { SavedQuery } from '../../api/types';

vi.mock('react-intl', () => ({
  IntlProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) => defaultMessage,
  }),
}));

vi.mock('../../api/client', () => ({
  listQueries: vi.fn(async () => []),
}));

import { listQueries } from '../../api/client';

const LocationProbe = () => {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
};

const wrap = (ui: React.ReactNode) => (
  <DesignSystemProvider theme={lightTheme} locale="en">
    <MemoryRouter initialEntries={['/']}>
      {ui}
      <LocationProbe />
    </MemoryRouter>
  </DesignSystemProvider>
);

const pinned: SavedQuery = {
  id: 7,
  title: 'Published count',
  question: 'how many articles are published?',
  resultBlocks: null,
  isPinned: true,
};

describe('HomepageWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when there are no pinned queries', async () => {
    vi.mocked(listQueries).mockResolvedValue([]);
    render(wrap(<HomepageWidget />));
    expect(
      await screen.findByText('Pin a saved answer from the plugin to run it here.')
    ).toBeTruthy();
  });

  it('lists pinned queries and navigates to run them', async () => {
    vi.mocked(listQueries).mockResolvedValue([
      pinned,
      { ...pinned, id: 8, title: 'Drafts', isPinned: false },
    ]);
    render(wrap(<HomepageWidget />));

    expect(await screen.findByText('Published count')).toBeTruthy();
    expect(screen.queryByText('Drafts')).toBeNull();

    fireEvent.click(screen.getByText('Published count'));
    expect((await screen.findByTestId('location')).textContent).toBe(
      '/plugins/strapi-mcp-viz?question=how%20many%20articles%20are%20published%3F&savedQueryId=7'
    );
  });
});
