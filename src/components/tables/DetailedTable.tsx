"use client";

import { useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { applySort, nextSortState, NO_SORT, type SortState } from "@/lib/sort";
import { SortableTh } from "@/components/ui/sortable-th";

export interface DetailedRow {
  id: string;
  ad_account_id: string;
  date: string;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  results: number | null;
  result_type: string | null;
  cost_per_result: number | null;
  currency: string | null;
  ad_accounts?: { name: string; currency: string | null } | null;
}

interface Props {
  rows: DetailedRow[];
}

export function DetailedTable({ rows }: Props) {
  const [sort, setSort] = useState<SortState>(NO_SORT);

  const getters: Record<string, (r: DetailedRow) => string | number | null> = {
    date: (r) => r.date,
    account: (r) => r.ad_accounts?.name || "",
    campaign: (r) => r.campaign_name || "",
    adset: (r) => r.adset_name || "",
    ad: (r) => r.ad_name || "",
    spend: (r) => r.spend,
    impressions: (r) => r.impressions,
    clicks: (r) => r.clicks,
    ctr: (r) => r.ctr,
    results: (r) => r.results,
    cost_per_result: (r) => r.cost_per_result,
  };

  // Ordem padrão: alfanumérico pela conta, depois campanha, depois data mais recente.
  const defaultCompare = (a: DetailedRow, b: DetailedRow) => {
    const accA = a.ad_accounts?.name || "";
    const accB = b.ad_accounts?.name || "";
    const byAcc = accA.localeCompare(accB, "pt-BR", { numeric: true });
    if (byAcc !== 0) return byAcc;
    const campA = a.campaign_name || "";
    const campB = b.campaign_name || "";
    const byCamp = campA.localeCompare(campB, "pt-BR", { numeric: true });
    if (byCamp !== 0) return byCamp;
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

  return (
    <div className="table-shell table-scroll">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-[var(--text-muted)]">
          <tr className="border-b border-[var(--border)]">
            <SortableTh label="Data" sortKey="date" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
            <SortableTh label="Conta" sortKey="account" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
            <SortableTh label="Campanha" sortKey="campaign" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
            <SortableTh label="Conjunto" sortKey="adset" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
            <SortableTh label="Anúncio" sortKey="ad" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
            <SortableTh label="Gasto" sortKey="spend" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
            <SortableTh label="Impressões" sortKey="impressions" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
            <SortableTh label="Cliques" sortKey="clicks" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
            <SortableTh label="CTR" sortKey="ctr" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
            <SortableTh label="Resultados" sortKey="results" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
            <SortableTh label="Custo/Resultado" sortKey="cost_per_result" activeKey={sort.key} dir={sort.dir} align="right" onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-muted)]">
              <td className="px-4 py-2.5 text-[var(--text-muted)]">{row.date}</td>
              <td className="px-4 py-2.5">{row.ad_accounts?.name || row.ad_account_id}</td>
              <td className="px-4 py-2.5">{row.campaign_name || "-"}</td>
              <td className="px-4 py-2.5">{row.adset_name || "-"}</td>
              <td className="px-4 py-2.5">{row.ad_name || "-"}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-[var(--text)]">
                {formatCurrency(row.spend, row.currency)}
              </td>
              <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">{formatNumber(row.impressions)}</td>
              <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">{formatNumber(row.clicks)}</td>
              <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">
                {row.ctr ? `${Number(row.ctr).toFixed(2)}%` : "-"}
              </td>
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
              <td colSpan={11} className="px-4 py-10 text-center text-[var(--text-muted)]">
                Nenhum dado no período. Clique em &quot;Sincronizar agora&quot;.
              </td>
            </tr>
          )}
        </tbody>
        {sortedRows.length > 0 && (
          <tfoot>
            <tr className="border-t border-[var(--border-strong)] bg-[var(--surface-muted)] font-semibold">
              <td className="px-4 py-3" colSpan={5}>
                Total
              </td>
              <td className="px-4 py-3 text-right text-[var(--accent-strong)]">{formatCurrency(total, currency)}</td>
              <td colSpan={5} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
