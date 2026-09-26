"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/format";

export interface PeriodTotals {
  spend: number;
  leads: number | null;
  costPerLead: number | null;
  ftd: number | null;
  costPerFtd: number | null;
}

interface Props {
  current: PeriodTotals;
  previous: PeriodTotals;
  currency: string | null;
  previousLabel: string;
}

function Delta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null || previous == null || previous === 0) {
    return <span className="text-[11px] text-[var(--text-muted)]">—</span>;
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) {
    return (
      <span className="flex items-center gap-0.5 text-[11px] font-medium text-[var(--text-muted)]">
        <Minus size={11} />
        0%
      </span>
    );
  }
  const up = pct > 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-[11px] font-semibold ${
        up ? "text-[var(--success)]" : "text-[var(--danger)]"
      }`}
    >
      {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function StatsSummary({ current, previous, currency, previousLabel }: Props) {
  const cards = [
    {
      label: "Gasto",
      value: formatCurrency(current.spend, currency),
      current: current.spend,
      previous: previous.spend,
    },
    {
      label: "Cadastro",
      value: current.leads != null ? formatNumber(current.leads) : "-",
      current: current.leads,
      previous: previous.leads,
    },
    {
      label: "Custo/Cadastro",
      value: current.costPerLead != null ? formatCurrency(current.costPerLead, currency) : "-",
      current: current.costPerLead,
      previous: previous.costPerLead,
    },
    {
      label: "FTD",
      value: current.ftd != null ? formatNumber(current.ftd) : "-",
      current: current.ftd,
      previous: previous.ftd,
    },
    {
      label: "Custo/FTD",
      value: current.costPerFtd != null ? formatCurrency(current.costPerFtd, currency) : "-",
      current: current.costPerFtd,
      previous: previous.costPerFtd,
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="stat-card">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{c.label}</p>
          <p className="mt-1.5 text-xl font-semibold text-[var(--text)]">{c.value}</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Delta current={c.current} previous={c.previous} />
            <span className="text-[10px] text-[var(--text-muted)]">vs {previousLabel}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
