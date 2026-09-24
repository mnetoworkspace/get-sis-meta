"use client";

import { useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { applySort, nextSortState, NO_SORT, type SortState } from "@/lib/sort";
import { SortableTh } from "@/components/ui/sortable-th";

export interface SpendRow {
  id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  reach?: number | null;
  frequency?: number | null;
  inline_link_clicks?: number | null;
  results: number | null;
  result_type?: string | null;
  cost_per_result: number | null;
  currency: string | null;
  ad_accounts?: {
    name: string;
    currency: string | null;
    bm_id: string;
    business_managers?: { name: string } | null;
  } | null;
}

interface Props {
  rows: SpendRow[];
  mode: "bm" | "account";
}

export function SpendTable({ rows, mode }: Props) {
  const [sort, setSort] = useState<SortState>(NO_SORT);

  const getters: Record<string, (r: SpendRow) => string | number | null> = {
    date: (r) => r.date,
    label: (r) => r.ad_accounts?.name || "",
    bm: (r) => r.ad_accounts?.business_managers?.name || "",
    spend: (r) => r.spend,
    impressions: (r) => r.impressions,
    clicks: (r) => r.clicks,
    cpc: (r) => r.cpc,
    cpm: (r) => r.cpm,
    ctr: (r) => r.ctr,
    frequency: (r) => r.frequency ?? null,
    inline_link_clicks: (r) => r.inline_link_clicks ?? null,
    results: (r) => r.results,
    cost_per_result: (r) => r.cost_per_result,
  };

  // Ordem padrão: alfanumérico pelo rótulo principal (BM ou Conta), depois data mais recente.
  const defaultCompare = (a: SpendRow, b: SpendRow) => {
    const labelA = a.ad_accounts?.name || "";
    const labelB = b.ad_accounts?.name || "";
    const byLabel = labelA.localeCompare(labelB, "pt-BR", { numeric: true });
    if (byLabel !== 0) return byLabel;
    return b.date.localeCompare(a.date);
  };

  const sortedRows = useMemo(
    () => applySort(rows, sort, getters, defaultCompare),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sort],
  );

  const total = useMemo(() => rows.reduce((sum, r) => sum + Number(r.spend || 0), 0), [rows]);
  const currency = rows[0]?.currency;

  function onSort(key: string) {
    setSort((s) => nextSortState(s, key));
  }

  const colSpan = mode === "bm" ? 8 : 11;

  return (
    <div className="table-shell table-scroll">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-[var(--text-muted)]">
          <tr className="border-b border-[var(--border)]">
            <SortableTh label="Data" sortKey="date" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
            {mode === "account" && (
              <SortableTh label="BM" sortKey="bm" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
            )}
            <SortableTh label={mode === "bm" ? "BM" : "Conta"} sortKey="label" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
            <SortableTh label="Gasto" sortKey="spend" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
            <SortableTh label="Impressões" sortKey="impressions" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
            <SortableTh label="Cliques" sortKey="clicks" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
            <SortableTh label="CPC" sortKey="cpc" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
            <SortableTh label="CPM" sortKey="cpm" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
            <SortableTh label="CTR" sortKey="ctr" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
            {mode === "account" && (
              <>
                <SortableTh label="Freq." sortKey="frequency" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
                <SortableTh label="Cliques no link" sortKey="inline_link_clicks" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
              </>
            )}
            <SortableTh label="Resultados" sortKey="results" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
            <SortableTh label="Custo/Resultado" sortKey="cost_per_result" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-muted)]">
              <td className="px-4 py-2.5 text-[var(--text-muted)]">{row.date}</td>
              {mode === "account" && (
                <td className="px-4 py-2.5">{row.ad_accounts?.business_managers?.name || "-"}</td>
              )}
              <td className="px-4 py-2.5">{row.ad_accounts?.name || "-"}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-[var(--text)]">
                {formatCurrency(row.spend, row.currency)}
              </td>
              <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">{formatNumber(row.impressions)}</td>
              <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">{formatNumber(row.clicks)}</td>
              <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">{formatCurrency(row.cpc, row.currency)}</td>
              <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">{formatCurrency(row.cpm, row.currency)}</td>
              <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">
                {row.ctr ? `${Number(row.ctr).toFixed(2)}%` : "-"}
              </td>
              {mode === "account" && (
                <>
                  <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">
                    {row.frequency ? Number(row.frequency).toFixed(2) : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">
                    {row.inline_link_clicks != null ? formatNumber(row.inline_link_clicks) : "-"}
                  </td>
                </>
              )}
              <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">
                {row.results != null ? formatNumber(row.results) : "-"}
                {row.result_type ? <span className="ml-1 text-[10px] text-[var(--text-muted)]">({row.result_type})</span> : null}
              </td>
              <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">
                {row.cost_per_result != null ? formatCurrency(row.cost_per_result, row.currency) : "-"}
              </td>
            </tr>
          ))}
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="px-4 py-10 text-center text-[var(--text-muted)]">
                Nenhum dado no período. Clique em &quot;Sincronizar agora&quot;.
              </td>
            </tr>
          )}
        </tbody>
        {sortedRows.length > 0 && (
          <tfoot>
            <tr className="border-t border-[var(--border-strong)] bg-[var(--surface-muted)] font-semibold">
              <td className="px-4 py-3" colSpan={mode === "account" ? 3 : 2}>
                Total
              </td>
              <td className="px-4 py-3 text-right text-[var(--accent-strong)]">{formatCurrency(total, currency)}</td>
              <td colSpan={colSpan - (mode === "account" ? 4 : 3)} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
