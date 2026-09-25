"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { formatAxisNumber } from "@/lib/format";

export interface MultiLineSeries {
  key: string;
  label: string;
  color: string;
  data: { x: string; y: number }[];
}

interface Props {
  title: string;
  series: MultiLineSeries[];
  formatValue: (v: number) => string;
  formatX?: (v: string) => string;
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
  name: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  formatX,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  formatValue: (v: number) => string;
  formatX?: (v: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const sorted = [...payload].sort((a, b) => b.value - a.value);
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-[var(--text-muted)]">{formatX && label ? formatX(label) : label}</p>
      <div className="space-y-0.5">
        {sorted.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-semibold text-[var(--text)]">{formatValue(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Junta N séries (uma por método de pagamento) num único dataset por ponto
// x — o LineChart do Recharts espera uma linha por ponto com uma chave por
// série, não uma lista de séries separadas.
function mergeSeries(series: MultiLineSeries[]): Record<string, string | number>[] {
  const xValues = series[0]?.data.map((p) => p.x) ?? [];
  return xValues.map((x, i) => {
    const row: Record<string, string | number> = { x };
    for (const s of series) row[s.key] = s.data[i]?.y ?? 0;
    return row;
  });
}

export function MultiLineTrendChart({ title, series, formatValue, formatX }: Props) {
  const chartData = mergeSeries(series);

  return (
    <div className="stat-card">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{title}</p>
      {series.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--text-muted)]">Nenhum método selecionado.</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
                width={52}
                tickFormatter={formatAxisNumber}
              />
              <Tooltip
                content={<ChartTooltip formatValue={formatValue} formatX={formatX} />}
                cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }}
                formatter={(value) => <span style={{ color: "var(--text-muted)" }}>{value}</span>}
              />
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
