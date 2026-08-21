import type { LineChartBlock as LineChartBlockType } from '../../spec';

const WIDTH = 600;
const HEIGHT = 240;
const PAD = 12;

export function LineChartBlock({ block }: { block: LineChartBlockType }) {
  const { title, x, series } = block;
  const values = series.flatMap((entry) => entry.data);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = x.length > 1 ? (WIDTH - PAD * 2) / (x.length - 1) : 0;
  const y = (value: number) => HEIGHT - PAD - ((value - min) / range) * (HEIGHT - PAD * 2);

  return (
    <figure data-testid="line-chart" style={{ margin: 0 }}>
      {title && <figcaption style={{ marginBottom: 8, fontWeight: 600 }}>{title}</figcaption>}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={title ?? 'Line chart'}
        style={{ width: '100%', height: 'auto', color: '#4945ff' }}
      >
        {series.map((entry) => (
          <g key={entry.name} data-testid="line-series" data-series={entry.name}>
            <polyline
              points={entry.data
                .map((value, index) => `${PAD + index * stepX},${y(value)}`)
                .join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            {entry.data.map((value, index) => (
              <circle
                key={index}
                cx={PAD + index * stepX}
                cy={y(value)}
                r="3"
                data-testid="line-point"
                data-label={String(x[index])}
                data-value={value}
              />
            ))}
          </g>
        ))}
      </svg>
    </figure>
  );
}
