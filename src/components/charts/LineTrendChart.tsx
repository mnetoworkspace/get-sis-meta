"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

interface Point {
  x: string;
  y: number;
}

interface Props {
  title: string;
  data: Point[];
  color: string;
  formatValue: (v: number) => string;
  formatX?: (v: string) => string;
}

function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  formatX,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  formatValue: (v: number) => string;
  formatX?: (v: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-xs shadow-lg">
      <p className="mb-0.5 text-[var(--text-muted)]">{formatX && label ? formatX(label) : label}</p>
      <p className="font-semibold text-[var(--text)]">{formatValue(payload[0].value)}</p>
    </div>
  );
}

export function LineTrendChart({ title, data, color, formatValue, formatX }: Props) {
  return (
    <div className="stat-card">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{title}</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis
              dataKey="x"
              tickFormatter={formatX}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
            />
            <Tooltip
              content={<ChartTooltip formatValue={formatValue} formatX={formatX} />}
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="y"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color, stroke: "var(--surface)", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
