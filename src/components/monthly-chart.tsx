interface ChartSeries {
  label: string;
  color: string;
  values: number[];
}

interface MonthlyChartProps {
  title: string;
  unit: string;
  series: ChartSeries[];
}

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export function MonthlyChart({ title, unit, series }: MonthlyChartProps) {
  const maximum = Math.max(0, ...series.flatMap((item) => item.values));
  const safeMaximum = maximum > 0 ? maximum : 1;
  const width = 760;
  const height = 280;
  const plotTop = 24;
  const plotBottom = 230;
  const plotHeight = plotBottom - plotTop;
  const groupWidth = 56;
  const startX = 56;
  const barWidth = Math.min(18, 40 / Math.max(series.length, 1));
  return (
    <figure className="chart-card">
      <figcaption>
        <span>{title}</span>
        <small>{unit}</small>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}, measured in ${unit}`}>
        <line x1="48" y1={plotBottom} x2="740" y2={plotBottom} className="chart-axis" />
        {[0, 0.5, 1].map((fraction) => {
          const y = plotBottom - plotHeight * fraction;
          return (
            <g key={fraction}>
              <line x1="48" y1={y} x2="740" y2={y} className="chart-grid" />
              <text x="42" y={y + 4} textAnchor="end" className="chart-tick">
                {(safeMaximum * fraction).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </text>
            </g>
          );
        })}
        {MONTHS.map((month, monthIndex) => {
          const center = startX + monthIndex * groupWidth + groupWidth / 2;
          return (
            <g key={month}>
              {series.map((item, seriesIndex) => {
                const value = item.values[monthIndex] ?? 0;
                const barHeight = value / safeMaximum * plotHeight;
                const x = center - (series.length * barWidth) / 2 + seriesIndex * barWidth;
                return (
                  <rect
                    key={item.label}
                    x={x}
                    y={plotBottom - barHeight}
                    width={barWidth - 2}
                    height={barHeight}
                    rx="2"
                    fill={item.color}
                  >
                    <title>{`Month ${month} ${item.label}: ${value.toFixed(2)} ${unit}`}</title>
                  </rect>
                );
              })}
              <text x={center} y="251" textAnchor="middle" className="chart-month">{month}</text>
            </g>
          );
        })}
      </svg>
      <div className="chart-legend" aria-label="Chart legend">
        {series.map((item) => (
          <span key={item.label}><i style={{ backgroundColor: item.color }} />{item.label}</span>
        ))}
      </div>
    </figure>
  );
}
