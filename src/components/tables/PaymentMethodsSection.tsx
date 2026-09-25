"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { MultiLineTrendChart, type MultiLineSeries } from "@/components/charts/MultiLineTrendChart";
import { formatCurrency, formatNumber } from "@/lib/format";

interface Props {
  since: string;
  until: string;
}

// Paleta categórica validada (8 matizes distinguíveis, inclusive daltonismo)
// — atribuída por volume (maior gasto primeiro), nunca por posição num
// filtro, então a cor de um método não muda quando outros são
// ligados/desligados. Além do 8º método, reaproveita o cinza neutro em vez
// de inventar mais matizes.
const CATEGORICAL_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];
const OVERFLOW_COLOR = "#8a8a86";

function colorForIndex(i: number): string {
  return CATEGORICAL_COLORS[i] ?? OVERFLOW_COLOR;
}

interface MethodSummary {
  method: string;
  methodName: string;
  gateway: string;
  amount: number;
  count: number;
  ftdCount: number;
  avgTicket: number;
  avgApprovalMinutes: number | null;
}

interface DailyResponse {
  dates: string[];
  series: { method: string; methodName: string; gateway: string; points: { date: string; amount: number; count: number }[] }[];
}

interface HourlyResponse {
  series: { method: string; methodName: string; gateway: string; points: { hour: number; amount: number; count: number }[] }[];
}

function methodLabel(m: { methodName: string; gateway: string }): string {
  return `${m.methodName} (${m.gateway})`;
}

function formatMinutes(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return `${hours}h ${rest}min`;
}

function formatDateShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function PaymentMethodsSection({ since, until }: Props) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Record<string, MethodSummary[]>>({});
  const [daily, setDaily] = useState<Record<string, DailyResponse>>({});
  const [hourly, setHourly] = useState<Record<string, HourlyResponse>>({});
  const [selected, setSelected] = useState<string[] | null>(null); // null = ainda não inicializado (todos selecionados por padrão)
  const [metric, setMetric] = useState<"count" | "amount">("count");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ since, until });
        const [summaryRes, dailyRes, hourlyRes] = await Promise.all([
          fetch(`/api/deposits/by-method?${params.toString()}`),
          fetch(`/api/deposits/daily-by-method?${params.toString()}`),
          fetch(`/api/deposits/hourly-by-method?${params.toString()}`),
        ]);
        const summaryJson = await summaryRes.json();
        const dailyJson = await dailyRes.json();
        const hourlyJson = await hourlyRes.json();
        if (cancelled) return;

        setSummary(summaryJson.data || {});
        setDaily(dailyJson.data || {});
        setHourly(hourlyJson.data || {});
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [since, until]);

  const currencies = useMemo(
    () => Array.from(new Set([...Object.keys(summary), ...Object.keys(daily), ...Object.keys(hourly)])).sort(),
    [summary, daily, hourly],
  );

  // Cor fixa por método, atribuída por ranking de volume total (maior gasto
  // primeiro) — estável entre trocas de filtro, dentro de uma mesma carga.
  const colorByMethod = useMemo(() => {
    const allMethods = Object.values(summary).flat();
    const sorted = [...allMethods].sort((a, b) => b.amount - a.amount);
    const map = new Map<string, string>();
    sorted.forEach((m, i) => map.set(m.method, colorForIndex(i)));
    return map;
  }, [summary]);

  const allMethodKeys = useMemo(() => Object.values(summary).flat().map((m) => m.method), [summary]);
  const effectiveSelected = selected ?? allMethodKeys;

  function toggleMethod(method: string) {
    const current = selected ?? allMethodKeys;
    setSelected(current.includes(method) ? current.filter((m) => m !== method) : [...current, method]);
  }

  if (currencies.length === 0 && !loading) {
    return <p className="text-sm text-[var(--text-muted)]">Sem dados de método de pagamento no período.</p>;
  }

  return (
    <div className={loading ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"}>
      {currencies.map((currency) => {
        const methods = (summary[currency] || []).slice().sort((a, b) => b.amount - a.amount);
        const dailyData = daily[currency];
        const hourlyData = hourly[currency];

        const dailySeries: MultiLineSeries[] = (dailyData?.series || [])
          .filter((s) => effectiveSelected.includes(s.method))
          .map((s) => ({
            key: s.method,
            label: methodLabel(s),
            color: colorByMethod.get(s.method) || OVERFLOW_COLOR,
            data: s.points.map((p) => ({ x: p.date, y: metric === "count" ? p.count : p.amount })),
          }));

        const hourlySeries: MultiLineSeries[] = (hourlyData?.series || [])
          .filter((s) => effectiveSelected.includes(s.method))
          .map((s) => ({
            key: s.method,
            label: methodLabel(s),
            color: colorByMethod.get(s.method) || OVERFLOW_COLOR,
            data: s.points.map((p) => ({ x: String(p.hour), y: metric === "count" ? p.count : p.amount })),
          }));

        return (
          <div key={currency} className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Métodos de pagamento — {currency}
              </p>
              <div className="flex overflow-hidden rounded-lg border border-[var(--border)] text-xs">
                <button
                  onClick={() => setMetric("count")}
                  className={`px-2.5 py-1 font-medium ${metric === "count" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-muted)] text-[var(--text-muted)]"}`}
                >
                  Quantidade
                </button>
                <button
                  onClick={() => setMetric("amount")}
                  className={`px-2.5 py-1 font-medium ${metric === "amount" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-muted)] text-[var(--text-muted)]"}`}
                >
                  Valor
                </button>
              </div>
            </div>

            {/* Filtro por método — chips, todos ligados por padrão */}
            <div className="mb-4 flex flex-wrap gap-1.5">
              {methods.map((m) => {
                const on = effectiveSelected.includes(m.method);
                const color = colorByMethod.get(m.method) || OVERFLOW_COLOR;
                return (
                  <button
                    key={m.method}
                    type="button"
                    onClick={() => toggleMethod(m.method)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      on
                        ? "border-[var(--border-strong)] bg-[var(--surface-muted)] text-[var(--text)]"
                        : "border-[var(--border)] text-[var(--text-muted)] opacity-50"
                    }`}
                  >
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: on ? color : "transparent", border: on ? "none" : `1.5px solid ${color}` }}>
                      {on && <Check size={9} className="text-white" />}
                    </span>
                    {methodLabel(m)}
                  </button>
                );
              })}
            </div>

            {/* Tabela-resumo — sempre mostra todos os métodos, independente do filtro dos gráficos */}
            <div className="mb-4 overflow-x-auto rounded-2xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    <th className="px-3 py-2">Método</th>
                    <th className="px-3 py-2 text-right">Depósitos</th>
                    <th className="px-3 py-2 text-right">Valor total</th>
                    <th className="px-3 py-2 text-right">Ticket médio</th>
                    <th className="px-3 py-2 text-right">FTDs</th>
                    <th className="px-3 py-2 text-right">Tempo médio de aprovação</th>
                    <th className="px-3 py-2 text-right">% do total</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const totalAmount = methods.reduce((sum, m) => sum + m.amount, 0);
                    return methods.map((m) => (
                      <tr key={m.method} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorByMethod.get(m.method) || OVERFLOW_COLOR }} />
                            {methodLabel(m)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">{formatNumber(m.count)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(m.amount, currency)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(m.avgTicket, currency)}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(m.ftdCount)}</td>
                        <td className="px-3 py-2 text-right">{formatMinutes(m.avgApprovalMinutes)}</td>
                        <td className="px-3 py-2 text-right">{totalAmount > 0 ? `${((m.amount / totalAmount) * 100).toFixed(1)}%` : "—"}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <MultiLineTrendChart
                title={`Depósitos por dia, por método (${metric === "count" ? "quantidade" : "valor"})`}
                series={dailySeries}
                formatValue={(v) => (metric === "count" ? formatNumber(v) : formatCurrency(v, currency))}
                formatX={formatDateShort}
              />
              <MultiLineTrendChart
                title={`Depósitos por hora do dia, por método (${metric === "count" ? "quantidade" : "valor"})`}
                series={hourlySeries}
                formatValue={(v) => (metric === "count" ? formatNumber(v) : formatCurrency(v, currency))}
                formatX={(v) => `${v}h`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
