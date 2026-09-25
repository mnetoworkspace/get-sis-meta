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

interface SummaryRow {
  currency: string;
  amount: number;
  count: number;
  ftdCount: number;
  avgTicket: number;
}

interface DailyBucket {
  date: string;
  amount: number;
  count: number;
  ftdCount: number;
}

interface HourlyBucket {
  hour: number;
  amount: number;
  count: number;
}

function formatDateShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

interface FxRate {
  base_currency: string;
  quote_currency: string;
  rate: number;
}

export function DepositsTab({ since, until }: Props) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [daily, setDaily] = useState<Record<string, DailyBucket[]>>({});
  const [hourly, setHourly] = useState<Record<string, HourlyBucket[]>>({});
  const [fxRates, setFxRates] = useState<FxRate[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ since, until });
        const [summaryRes, dailyRes, hourlyRes, fxRes] = await Promise.all([
          fetch(`/api/deposits/summary?${params.toString()}`),
          fetch(`/api/deposits/daily?${params.toString()}`),
          fetch(`/api/deposits/hourly?${params.toString()}`),
          fetch(`/api/fx`),
        ]);
        const summaryJson = await summaryRes.json();
        const dailyJson = await dailyRes.json();
        const hourlyJson = await hourlyRes.json();
        const fxJson = await fxRes.json();
        if (cancelled) return;

        setSummary(summaryJson.data || []);
        setDaily(dailyJson.data || {});
        setHourly(hourlyJson.data || {});
        setFxRates(fxJson.data || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [since, until]);

  function toBrl(amount: number, currency: string): string | null {
    if (currency === "BRL") return null;
    const fx = fxRates.find((r) => r.base_currency === currency && r.quote_currency === "BRL");
    if (!fx) return null;
    return formatCurrency(amount * fx.rate, "BRL");
  }

  const currencies = Array.from(new Set([...Object.keys(daily), ...Object.keys(hourly)])).sort();

  return (
    <div className={loading ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"}>
      {summary.length === 0 && !loading && (
        <div className="soft-panel mb-4 px-4 py-3 text-sm text-[var(--text-muted)]">
          Nenhum depósito no período. Clique em &quot;Sincronizar agora&quot;.
        </div>
      )}

      {/* A API de pagamentos hoje só emite depósitos FTD nesse endpoint — o
          redepósito ainda não está incluído (o time deles vai adicionar no
          mesmo endpoint depois). Por isso o total aqui é rotulado como FTD,
          não "total geral". Quando o redepósito chegar, revisar esses rótulos
          e voltar a somar os dois pra um "Total depositado" de verdade. */}
      {summary.map((s) => (
        <div key={s.currency} className="mb-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Moeda: {s.currency}
          </p>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="stat-card">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Total depositado FTD
              </p>
              <p className="mt-1.5 text-xl font-semibold text-[var(--text)]">{formatCurrency(s.amount, s.currency)}</p>
              {toBrl(s.amount, s.currency) && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">≈ {toBrl(s.amount, s.currency)}</p>
              )}
            </div>
            <div className="stat-card">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Depósitos</p>
              <p className="mt-1.5 text-xl font-semibold text-[var(--text)]">{formatNumber(s.count)}</p>
            </div>
            <div className="stat-card">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">FTDs</p>
              <p className="mt-1.5 text-xl font-semibold text-[var(--text)]">{formatNumber(s.ftdCount)}</p>
            </div>
            <div className="stat-card">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Ticket médio
              </p>
              <p className="mt-1.5 text-xl font-semibold text-[var(--text)]">{formatCurrency(s.avgTicket, s.currency)}</p>
              {toBrl(s.avgTicket, s.currency) && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">≈ {toBrl(s.avgTicket, s.currency)}</p>
              )}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LineTrendChart
              title={`Depósitos por dia (${s.currency})`}
              data={(daily[s.currency] || []).map((d) => ({ x: d.date, y: d.amount }))}
              color={PINK}
              formatValue={(v) => formatCurrency(v, s.currency)}
              formatX={formatDateShort}
            />
            <LineTrendChart
              title={`FTDs por dia (${s.currency})`}
              data={(daily[s.currency] || []).map((d) => ({ x: d.date, y: d.ftdCount }))}
              color={PURPLE}
              formatValue={(v) => formatNumber(v)}
              formatX={formatDateShort}
            />
          </div>

          <div className="grid grid-cols-1 gap-4">
            <HourBarChart
              title={`Depósitos por hora do dia (${s.currency})`}
              data={(hourly[s.currency] || []).map((h) => ({ hour: h.hour, value: h.amount }))}
              color={PINK}
              formatValue={(v) => formatCurrency(v, s.currency)}
            />
          </div>
        </div>
      ))}

      {currencies.length === 0 && summary.length > 0 && (
        <p className="text-sm text-[var(--text-muted)]">Sem dados suficientes para os gráficos ainda.</p>
      )}
    </div>
  );
}
