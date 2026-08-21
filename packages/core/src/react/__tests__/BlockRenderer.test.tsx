// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Block, SourceMetadata } from '../../spec';
import { BlockRenderer } from '../BlockRenderer';

const source: SourceMetadata = {
  contentType: { uid: 'api::article.article', label: 'Article' },
  tool: 'find_article',
  filters: { op: 'and', children: [{ field: 'status', op: 'eq', value: 'published' }] },
  dateRange: { start: '2026-08-01T00:00:00Z', end: '2026-08-31T23:59:59Z', granularity: 'month' },
  recordsReturned: 3,
  recordsMatching: 3,
  truncated: false,
  retrievedAt: '2026-08-16T10:00:00Z',
  user: { id: 1, roles: ['Super Admin'] },
  permission: 'plugin::mcp-viz.run',
};

describe('BlockRenderer', () => {
  it('renders a text block as plain text', () => {
    render(<BlockRenderer blocks={[{ type: 'text', text: 'Hello world' }]} sources={[]} />);
    expect(screen.getByTestId('text-block').textContent).toBe('Hello world');
  });

  it('never interprets text blocks as HTML', () => {
    const payload = '<img src=x onerror="globalThis.pwned=1"><script>1</script>';
    render(<BlockRenderer blocks={[{ type: 'text', text: payload }]} sources={[]} />);
    expect(screen.queryByTestId('text-block')).not.toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByTestId('text-block').textContent).toContain('<img src=x');
  });

  it('renders a KPI with a formatted value and delta', () => {
    render(
      <BlockRenderer
        blocks={[
          { type: 'kpi', label: 'Articles', value: 1234.5, delta: -2, deltaDirection: 'down' },
        ]}
        sources={[]}
      />,
    );
    expect(screen.getByTestId('kpi-value').textContent).toBe('1,234.5');
    expect(screen.getByTestId('kpi-delta').getAttribute('data-direction')).toBe('down');
    expect(screen.getByTestId('kpi-delta').textContent).toContain('2');
  });

  it('renders a table and escapes cell values', () => {
    const block: Block = {
      type: 'table',
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'title', label: 'Title' },
      ],
      rows: [{ id: 1, title: '<b>sneaky</b>' }],
    };
    render(<BlockRenderer blocks={[block]} sources={[]} />);
    expect(screen.getByTestId('table')).not.toBeNull();
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getByText('<b>sneaky</b>')).not.toBeNull();
  });

  it('renders a bar chart with aligned bars', () => {
    const block: Block = {
      type: 'bar_chart',
      x: ['published', 'draft'],
      series: [{ name: 'Articles', data: [2, 1] }],
    };
    render(<BlockRenderer blocks={[block]} sources={[]} />);
    const bars = screen.getAllByTestId('bar');
    expect(bars).toHaveLength(2);
    expect(bars[0]!.getAttribute('data-value')).toBe('2');
    expect(bars[1]!.getAttribute('data-value')).toBe('1');
  });

  it('renders a bar chart with visibly styled bars', () => {
    const block: Block = {
      type: 'bar_chart',
      x: ['published', 'draft'],
      series: [{ name: 'Articles', data: [2, 1] }],
    };
    render(<BlockRenderer blocks={[block]} sources={[]} />);
    const plot = screen.getByTestId('bar-chart-plot');
    expect(plot).not.toBeNull();
    expect(plot.getAttribute('style')).toContain('display: flex');
    const bars = screen.getAllByTestId('bar');
    expect(bars).toHaveLength(2);
    expect(bars[0]!.getAttribute('style')).toContain('background-color');
    expect(bars[0]!.getAttribute('style')).toContain('width: 100%');
  });

  it('renders a line chart with data points', () => {
    const block: Block = {
      type: 'line_chart',
      x: ['2026-08-10', '2026-08-16', '2026-09-01'],
      series: [{ name: 'Views', data: [1, 3, 2] }],
    };
    render(<BlockRenderer blocks={[block]} sources={[]} />);
    const chart = screen.getByTestId('line-chart');
    expect(chart).not.toBeNull();
    const svg = chart.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('style')).toContain('width: 100%');
    expect(screen.getAllByTestId('line-point')).toHaveLength(3);
  });

  it('renders a pie chart with explicit dimensions', () => {
    const block: Block = {
      type: 'pie_chart',
      data: [
        { name: 'published', value: 2 },
        { name: 'draft', value: 1 },
      ],
    };
    render(<BlockRenderer blocks={[block]} sources={[]} />);
    const chart = screen.getByTestId('pie-chart');
    const svg = chart.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('width')).toBe('200');
    expect(svg!.getAttribute('height')).toBe('200');
  });

  it('renders a pie chart with one slice per value', () => {
    const block: Block = {
      type: 'pie_chart',
      data: [
        { name: 'published', value: 2 },
        { name: 'draft', value: 1 },
      ],
    };
    render(<BlockRenderer blocks={[block]} sources={[]} />);
    const slices = screen.getAllByTestId('pie-slice');
    expect(slices).toHaveLength(2);
    expect(slices[0]!.getAttribute('data-name')).toBe('published');
  });

  it('renders an error block', () => {
    render(
      <BlockRenderer
        blocks={[{ type: 'error', code: 'E_NO_DATA', message: 'nothing' }]}
        sources={[]}
      />,
    );
    expect(screen.getByTestId('error-block').textContent).toMatch(/E_NO_DATA/);
  });

  it('renders the sources footer with provenance', () => {
    render(<BlockRenderer blocks={[{ type: 'kpi', label: 'A', value: 1 }]} sources={[source]} />);
    expect(screen.getByTestId('sources-footer')).not.toBeNull();
    expect(screen.getByText(/Article · find_article/)).not.toBeNull();
    expect(screen.getByText(/plugin::mcp-viz.run/)).not.toBeNull();
  });

  it('renders multiple block kinds together', () => {
    const blocks: Block[] = [
      { type: 'text', text: 'Here are the numbers' },
      { type: 'kpi', label: 'Articles', value: 42 },
    ];
    render(<BlockRenderer blocks={blocks} sources={[]} />);
    expect(screen.getByTestId('text-block')).not.toBeNull();
    expect(screen.getByTestId('kpi')).not.toBeNull();
  });
});
