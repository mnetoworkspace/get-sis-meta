"use client";

import { useMemo, type ReactNode } from "react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { applySort, nextSortState, usePersistedSort } from "@/lib/sort";
import { SortableTh } from "@/components/ui/sortable-th";
import { ColumnManagerButton } from "@/components/ui/column-manager";
import { useColumnConfig, type ColumnDef } from "@/lib/column-config";

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
  ftd?: number | null;
  cost_per_ftd?: number | null;
  leads?: number | null;
  cost_per_lead?: number | null;
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

type ColKey =
  | "bm"
  | "spend"
  | "impressions"
  | "clicks"
  | "cpc"
  | "cpm"
  | "ctr"
  | "frequency"
  | "inline_link_clicks"
  | "results"
  | "cost_per_result"
  | "ftd"
  | "cost_per_ftd";

const ALL_COLUMNS: ColumnDef<ColKey>[] = [
  { key: "bm", label: "BM", defaultOn: true },
  { key: "spend", label: "Gasto", defaultOn: true },
  { key: "impressions", label: "Impressões", defaultOn: true },
  { key: "clicks", label: "Cliques", defaultOn: true },
  { key: "cpc", label: "CPC", defaultOn: true },
  { key: "cpm", label: "CPM", defaultOn: true },
  { key: "ctr", label: "CTR", defaultOn: true },
  { key: "frequency", label: "Freq.", defaultOn: true },
  { key: "inline_link_clicks", label: "Cliques no link", defaultOn: true },
  { key: "results", label: "Resultados", defaultOn: true },
  { key: "cost_per_result", label: "Custo/Resultado", defaultOn: true },
  { key: "ftd", label: "FTD", defaultOn: true },
  { key: "cost_per_ftd", label: "Custo/FTD", defaultOn: true },
];

const BM_COLUMNS = ALL_COLUMNS.filter((c) => !["bm", "frequency", "inline_link_clicks"].includes(c.key));
const ACCOUNT_COLUMNS = ALL_COLUMNS;

const ALIGN_LEFT: ColKey[] = ["bm"];

export function SpendTable({ rows, mode }: Props) {
  const [sort, setSort] = usePersistedSort(`spend-table-${mode}-v1`);
  const columns = mode === "bm" ? BM_COLUMNS : ACCOUNT_COLUMNS;
  const { visibleCols, colOrder, orderedVisible, toggle, resetToDefault, dragStart, dragOver, dragEnd } =
    useColumnConfig<ColKey>(`spend-table-${mode}-v1`, columns);

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
    ftd: (r) => r.ftd ?? null,
    cost_per_ftd: (r) => r.cost_per_ftd ?? null,
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

  const cellRenderers: Record<ColKey, (row: SpendRow) => ReactNode> = {
    bm: (row) => row.ad_accounts?.business_managers?.name || "-",
    spend: (row) => (
      <span className="font-semibold text-[var(--text)]">{formatCurrency(row.spend, row.currency)}</span>
    ),
    impressions: (row) => formatNumber(row.impressions),
    clicks: (row) => formatNumber(row.clicks),
    cpc: (row) => formatCurrency(row.cpc, row.currency),
    cpm: (row) => formatCurrency(row.cpm, row.currency),
    ctr: (row) => (row.ctr ? `${Number(row.ctr).toFixed(2)}%` : "-"),
    frequency: (row) => (row.frequency ? Number(row.frequency).toFixed(2) : "-"),
    inline_link_clicks: (row) => (row.inline_link_clicks != null ? formatNumber(row.inline_link_clicks) : "-"),
    results: (row) => (
      <>
        {row.results != null ? formatNumber(row.results) : "-"}
        {row.result_type ? <span className="ml-1 text-[10px] text-[var(--text-muted)]">({row.result_type})</span> : null}
      </>
    ),
    cost_per_result: (row) => (row.cost_per_result != null ? formatCurrency(row.cost_per_result, row.currency) : "-"),
    ftd: (row) => (row.ftd != null ? formatNumber(row.ftd) : "-"),
    cost_per_ftd: (row) => (row.cost_per_ftd != null ? formatCurrency(row.cost_per_ftd, row.currency) : "-"),
  };

  const colCount = 2 + orderedVisible.length;

  return (
    <div className="table-shell">
      <div className="flex items-center justify-start border-b border-[var(--border)] px-3 py-2">
        <ColumnManagerButton
          panelId={`spend-col-panel-${mode}`}
          columns={columns}
          colOrder={colOrder}
          visibleCols={visibleCols}
          onToggle={toggle}
          onDragStart={dragStart}
          onDragOver={dragOver}
          onDragEnd={dragEnd}
          onReset={resetToDefault}
        />
      </div>
      <div className="table-scroll">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-[var(--text-muted)]">
          <tr className="border-b border-[var(--border)]">
            <SortableTh label="Data" sortKey="date" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
            <SortableTh label={mode === "bm" ? "BM" : "Conta"} sortKey="label" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
            {orderedVisible.map((key) => {
              const col = columns.find((c) => c.key === key)!;
              return (
                <SortableTh
                  key={key}
                  label={col.label}
                  sortKey={key}
                  activeKey={sort.key}
                  dir={sort.dir}
                  align={ALIGN_LEFT.includes(key) ? "left" : "right"}
                  onSort={onSort}
                />
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-muted)]">
              <td className="px-4 py-2.5 text-[var(--text-muted)]">{row.date}</td>
              <td className="px-4 py-2.5">{row.ad_accounts?.name || "-"}</td>
              {orderedVisible.map((key) => (
                <td
                  key={key}
                  className={`px-4 py-2.5 text-[var(--text-muted)] ${ALIGN_LEFT.includes(key) ? "text-left" : "text-right"}`}
                >
                  {cellRenderers[key](row)}
                </td>
              ))}
            </tr>
          ))}
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={colCount} className="px-4 py-10 text-center text-[var(--text-muted)]">
                Nenhum dado no período. Clique em &quot;Sincronizar agora&quot;.
              </td>
            </tr>
          )}
        </tbody>
        {sortedRows.length > 0 && (() => {
          const spendIdx = orderedVisible.indexOf("spend");
          if (spendIdx === -1) {
            return (
              <tfoot>
                <tr className="border-t border-[var(--border-strong)] bg-[var(--surface-muted)] font-semibold">
                  <td className="px-4 py-3" colSpan={2}>
                    Total: {formatCurrency(total, currency)}
                  </td>
                  <td colSpan={orderedVisible.length} />
                </tr>
              </tfoot>
            );
          }
          return (
            <tfoot>
              <tr className="border-t border-[var(--border-strong)] bg-[var(--surface-muted)] font-semibold">
                <td className="px-4 py-3" colSpan={2 + spendIdx}>
                  Total
                </td>
                <td className="px-4 py-3 text-right text-[var(--accent-strong)]">{formatCurrency(total, currency)}</td>
                <td colSpan={Math.max(orderedVisible.length - spendIdx - 1, 0)} />
              </tr>
            </tfoot>
          );
        })()}
      </table>
      </div>
    </div>
  );
}
