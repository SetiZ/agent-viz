import type { BarChartBlock as BarChartBlockType } from '../../spec';

export function BarChartBlock({ block }: { block: BarChartBlockType }) {
  const { title, x, series } = block;
  const max = Math.max(...series.flatMap((entry) => entry.data), 1);

  return (
    <figure data-testid="bar-chart">
      {title && <figcaption>{title}</figcaption>}
      <div data-testid="bar-chart-plot">
        {x.map((category, categoryIndex) => (
          <div key={String(category)} data-testid="bar-category" data-label={String(category)}>
            {series.map((entry) => {
              const value = entry.data[categoryIndex] ?? 0;
              return (
                <div
                  key={entry.name}
                  data-testid="bar"
                  data-series={entry.name}
                  data-label={String(category)}
                  data-value={value}
                  role="img"
                  aria-label={`${entry.name}: ${value}`}
                  style={{ height: `${Math.round((value / max) * 100)}%` }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </figure>
  );
}
