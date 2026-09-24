"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import { formatAxisNumber } from "@/lib/format";

interface Point {
  hour: number;
  value: number;
}

interface Props {
  title: string;
  data: Point[];
  color: string;
  formatValue: (v: number) => string;
}

function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: number;
  formatValue: (v: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-xs shadow-lg">
      <p className="mb-0.5 text-[var(--text-muted)]">{String(label).padStart(2, "0")}:00</p>
      <p className="font-semibold text-[var(--text)]">{formatValue(payload[0].value)}</p>
    </div>
  );
}

export function HourBarChart({ title, data, color, formatValue }: Props) {
  const peakHour = data.reduce((best, p) => (p.value > best.value ? p : best), data[0] ?? { hour: 0, value: 0 });

  return (
    <div className="stat-card">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{title}</p>
        {peakHour.value > 0 && (
          <span className="text-[11px] text-[var(--text-muted)]">
            pico: <span className="font-semibold text-[var(--text)]">{String(peakHour.hour).padStart(2, "0")}h</span>
          </span>
        )}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis
              dataKey="hour"
              tickFormatter={(h) => `${h}h`}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              interval={2}
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={formatAxisNumber}
            />
            <Tooltip content={<ChartTooltip formatValue={formatValue} />} cursor={{ fill: "var(--surface-muted)" }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={18}>
              {data.map((p) => (
                <Cell key={p.hour} fill={p.hour === peakHour.hour && p.value > 0 ? color : color} fillOpacity={p.hour === peakHour.hour && p.value > 0 ? 1 : 0.55} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
