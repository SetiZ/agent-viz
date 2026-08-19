import type { KpiBlock as KpiBlockType } from '../../spec';

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function formatValue(value: number | string): string {
  return typeof value === 'number' ? numberFormat.format(value) : value;
}

function arrow(direction: 'up' | 'down' | 'flat'): string {
  switch (direction) {
    case 'up':
      return '\u2191';
    case 'down':
      return '\u2193';
    case 'flat':
      return '\u2192';
  }
}

export function KpiBlock({ block }: { block: KpiBlockType }) {
  const { label, value, delta, deltaDirection } = block;
  return (
    <div data-testid="kpi">
      <span data-testid="kpi-label">{label}</span>
      <strong data-testid="kpi-value">{formatValue(value)}</strong>
      {delta !== undefined && deltaDirection !== undefined && (
        <span data-testid="kpi-delta" data-direction={deltaDirection}>
          {arrow(deltaDirection)} {numberFormat.format(delta)}
        </span>
      )}
    </div>
  );
}
