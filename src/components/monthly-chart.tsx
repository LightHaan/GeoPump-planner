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

const MONTHS = [
  { key: "1", short: "Jan", long: "January" },
  { key: "2", short: "Feb", long: "February" },
  { key: "3", short: "Mar", long: "March" },
  { key: "4", short: "Apr", long: "April" },
  { key: "5", short: "May", long: "May" },
  { key: "6", short: "Jun", long: "June" },
  { key: "7", short: "Jul", long: "July" },
  { key: "8", short: "Aug", long: "August" },
  { key: "9", short: "Sep", long: "September" },
  { key: "10", short: "Oct", long: "October" },
  { key: "11", short: "Nov", long: "November" },
  { key: "12", short: "Dec", long: "December" },
] as const;

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
            <g key={month.key}>
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
                    <title>{`${month.long} ${item.label}: ${value.toFixed(2)} ${unit}`}</title>
                  </rect>
                );
              })}
              <text x={center} y="251" textAnchor="middle" className="chart-month">{month.short}</text>
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
