import type { BarChartBlock as BarChartBlockType } from '../../spec';

const BAR_COLOR = '#4945ff';

export function BarChartBlock({ block }: { block: BarChartBlockType }) {
  const { title, x, series } = block;
  const max = Math.max(...series.flatMap((entry) => entry.data), 1);

  return (
    <figure data-testid="bar-chart" style={{ margin: 0 }}>
      {title && <figcaption style={{ marginBottom: 8, fontWeight: 600 }}>{title}</figcaption>}
      <div
        data-testid="bar-chart-plot"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
          height: 220,
          padding: '0 4px 4px',
          borderBottom: '1px solid #eaeaef',
        }}
      >
        {x.map((category, categoryIndex) => (
          <div
            key={String(category)}
            data-testid="bar-category"
            data-label={String(category)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              height: '100%',
              gap: 4,
              minWidth: 0,
            }}
          >
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
                  title={`${entry.name}: ${value}`}
                  style={{
                    width: '100%',
                    backgroundColor: BAR_COLOR,
                    borderRadius: 4,
                    minHeight: 2,
                    height: `${Math.round((value / max) * 100)}%`,
                  }}
                />
              );
            })}
            <span
              style={{
                fontSize: 11,
                color: '#666687',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {String(category)}
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}
