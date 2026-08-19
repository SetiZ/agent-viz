import type { PieChartBlock as PieChartBlockType } from '../../spec';

const COLORS = ['#4945ff', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#64748b'];
const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PieChartBlock({ block }: { block: PieChartBlockType }) {
  const { title, data } = block;
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  let offset = 0;

  return (
    <figure data-testid="pie-chart">
      {title && <figcaption>{title}</figcaption>}
      <svg viewBox="0 0 200 200" role="img" aria-label={title ?? 'Pie chart'}>
        <g transform="translate(100,100)">
          {total > 0 &&
            data.map((slice, index) => {
              const fraction = slice.value / total;
              const dash = `${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
              const element = (
                <circle
                  key={slice.name}
                  data-testid="pie-slice"
                  data-name={slice.name}
                  data-value={slice.value}
                  r={RADIUS}
                  fill="none"
                  stroke={COLORS[index % COLORS.length] ?? COLORS[0]}
                  strokeWidth="40"
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                />
              );
              offset += fraction * CIRCUMFERENCE;
              return element;
            })}
        </g>
      </svg>
    </figure>
  );
}
