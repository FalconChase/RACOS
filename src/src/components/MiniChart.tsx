// Small hand-rolled SVG charts — line + bar — so Analytics doesn't pull in
// a charting library. Same spirit as icons.tsx (avoid an extra dependency
// for something this app can render itself) and CarActivity.tsx (which
// already hand-rolls its own Gantt-style grid). Deliberately simple: fixed
// viewBox, no zoom/pan/tooltip-follow — just enough to show a trend at a
// glance.

export interface ChartPoint {
  label: string;
  value: number;
}

const WIDTH = 600;
const HEIGHT = 180;
const PAD_LEFT = 44;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

// Thins out x-axis labels so they don't overlap when there are many
// points — shows at most ~8, always including the first and last.
function labelIndices(count: number, maxLabels = 8): Set<number> {
  if (count <= maxLabels) return new Set(Array.from({ length: count }, (_, i) => i));
  const step = (count - 1) / (maxLabels - 1);
  const indices = new Set<number>();
  for (let i = 0; i < maxLabels; i++) indices.add(Math.round(i * step));
  return indices;
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-md text-sm"
      style={{ height: HEIGHT, color: "var(--text-muted)", background: "var(--surface-1)" }}
    >
      {message}
    </div>
  );
}

export function MiniLineChart({
  data,
  color = "#378ADD",
  valueFormatter = (n: number) => String(n),
  emptyMessage = "No data yet.",
}: {
  data: ChartPoint[];
  color?: string;
  valueFormatter?: (n: number) => string;
  emptyMessage?: string;
}) {
  if (data.length === 0) return <EmptyChart message={emptyMessage} />;

  const values = data.map((d) => d.value);
  const maxValue = niceMax(Math.max(...values, 0));
  const minValue = Math.min(0, ...values);
  const range = maxValue - minValue || 1;
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xFor = (i: number) => PAD_LEFT + (data.length === 1 ? plotWidth / 2 : (i / (data.length - 1)) * plotWidth);
  const yFor = (v: number) => PAD_TOP + plotHeight - ((v - minValue) / range) * plotHeight;

  const linePoints = data.map((d, i) => `${xFor(i)},${yFor(d.value)}`).join(" ");
  const areaPoints = `${xFor(0)},${yFor(minValue)} ${linePoints} ${xFor(data.length - 1)},${yFor(minValue)}`;
  const shownLabels = labelIndices(data.length);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" style={{ height: HEIGHT }}>
      {/* Gridlines + y-axis labels: 0%, 50%, 100% of the max */}
      {[0, 0.5, 1].map((frac) => {
        const y = PAD_TOP + plotHeight * (1 - frac);
        const value = minValue + range * frac;
        return (
          <g key={frac}>
            <line x1={PAD_LEFT} y1={y} x2={WIDTH - PAD_RIGHT} y2={y} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD_LEFT - 6} y={y + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">
              {valueFormatter(value)}
            </text>
          </g>
        );
      })}

      <polygon points={areaPoints} fill={color} opacity={0.12} />
      <polyline points={linePoints} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(d.value)} r={3} fill={color}>
          <title>{`${d.label}: ${valueFormatter(d.value)}`}</title>
        </circle>
      ))}

      {data.map((d, i) =>
        shownLabels.has(i) ? (
          <text key={i} x={xFor(i)} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
            {d.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function MiniBarChart({
  data,
  color = "#378ADD",
  valueFormatter = (n: number) => String(n),
  emptyMessage = "No data yet.",
}: {
  data: ChartPoint[];
  color?: string;
  valueFormatter?: (n: number) => string;
  emptyMessage?: string;
}) {
  if (data.length === 0) return <EmptyChart message={emptyMessage} />;

  const maxValue = niceMax(Math.max(...data.map((d) => d.value), 0));
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slot = plotWidth / data.length;
  const barWidth = Math.min(36, slot * 0.6);
  const shownLabels = labelIndices(data.length);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" style={{ height: HEIGHT }}>
      {[0, 0.5, 1].map((frac) => {
        const y = PAD_TOP + plotHeight * (1 - frac);
        return (
          <g key={frac}>
            <line x1={PAD_LEFT} y1={y} x2={WIDTH - PAD_RIGHT} y2={y} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD_LEFT - 6} y={y + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">
              {valueFormatter(maxValue * frac)}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const barHeight = maxValue === 0 ? 0 : (d.value / maxValue) * plotHeight;
        const x = PAD_LEFT + i * slot + (slot - barWidth) / 2;
        const y = PAD_TOP + plotHeight - barHeight;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barHeight} fill={color} rx={2}>
              <title>{`${d.label}: ${valueFormatter(d.value)}`}</title>
            </rect>
            {shownLabels.has(i) && (
              <text x={x + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
