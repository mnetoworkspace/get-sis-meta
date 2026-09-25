"use client";

import { useEffect, useState } from "react";
import { LineTrendChart } from "@/components/charts/LineTrendChart";
import { HourBarChart } from "@/components/charts/HourBarChart";
import { formatCurrency, formatNumber } from "@/lib/format";

interface Props {
  since: string;
  until: string;
}

const PINK = "#e6007a";
const PURPLE = "#8b2fe0";

function formatDateShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function TrafficTab({ since, until }: Props) {
  const [loading, setLoading] = useState(false);
  const [dailySpend, setDailySpend] = useState<{ x: string; y: number }[]>([]);
  const [dailyVisits, setDailyVisits] = useState<{ x: string; y: number }[]>([]);
  const [hourlySpend, setHourlySpend] = useState<{ hour: number; value: number }[]>([]);
  const [hourlyVisits, setHourlyVisits] = useState<{ hour: number; value: number }[]>([]);
  const [hourlyCostPerFtd, setHourlyCostPerFtd] = useState<{ x: string; y: number | null }[]>([]);
  const [currency, setCurrency] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ since, until });
        const [overviewRes, trafficDailyRes, spendHourlyRes, trafficHourlyRes] = await Promise.all([
          fetch(`/api/spend/overview?${params.toString()}`),
          fetch(`/api/traffic/daily?${params.toString()}`),
          fetch(`/api/spend/hourly?${params.toString()}`),
          fetch(`/api/traffic/hourly?${params.toString()}`),
        ]);
        const overview = await overviewRes.json();
        const trafficDaily = await trafficDailyRes.json();
        const spendHourly = await spendHourlyRes.json();
        const trafficHourly = await trafficHourlyRes.json();
        if (cancelled) return;

        interface OverviewRow {
          date: string;
          spend: number;
          currency: string | null;
        }
        const rows: OverviewRow[] = overview.data || [];
        const byDate = new Map<string, number>();
        for (const row of rows) {
          byDate.set(row.date, (byDate.get(row.date) || 0) + Number(row.spend || 0));
        }
        const sortedDates = Array.from(byDate.keys()).sort();
        setDailySpend(sortedDates.map((d) => ({ x: d, y: byDate.get(d) || 0 })));
        setCurrency(rows[0]?.currency ?? null);

        interface TrafficDailyRow {
          date: string;
          visits: number;
        }
        setDailyVisits((trafficDaily.data || []).map((r: TrafficDailyRow) => ({ x: r.date, y: r.visits })));

        interface SpendHourlyRow {
          hour: number;
          spend: number;
          cost_per_ftd: number | null;
        }
        const spendHourlyRows: SpendHourlyRow[] = spendHourly.data || [];
        setHourlySpend(spendHourlyRows.map((r) => ({ hour: r.hour, value: r.spend })));
        // null (não 0) nas horas sem FTD — custo/FTD é indefinido ali, não
        // "grátis"; o gráfico mostra um vazio em vez de um "R$ 0,00" enganoso.
        setHourlyCostPerFtd(spendHourlyRows.map((r) => ({ x: String(r.hour), y: r.cost_per_ftd })));

        interface TrafficHourlyRow {
          hour: number;
          visits: number;
        }
        setHourlyVisits((trafficHourly.data || []).map((r: TrafficHourlyRow) => ({ hour: r.hour, value: r.visits })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [since, until]);

  return (
    <div className={loading ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"}>
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LineTrendChart
          title="Gasto por dia"
          data={dailySpend}
          color={PINK}
          formatValue={(v) => formatCurrency(v, currency)}
          formatX={formatDateShort}
        />
        <LineTrendChart
          title="Visitas ao site por dia"
          data={dailyVisits}
          color={PURPLE}
          formatValue={(v) => formatNumber(v)}
          formatX={formatDateShort}
        />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HourBarChart
          title="Gasto por hora do dia"
          data={hourlySpend}
          color={PINK}
          formatValue={(v) => formatCurrency(v, currency)}
        />
        <HourBarChart
          title="Visitas por hora do dia"
          data={hourlyVisits}
          color={PURPLE}
          formatValue={(v) => formatNumber(v)}
        />
      </div>
      <div className="grid grid-cols-1 gap-4">
        <LineTrendChart
          title="Custo/FTD por hora do dia"
          data={hourlyCostPerFtd}
          color={PINK}
          formatValue={(v) => formatCurrency(v, currency)}
          formatX={(v) => `${v}h`}
        />
      </div>
    </div>
  );
}
