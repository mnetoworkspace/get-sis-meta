"use client";

import Image from "next/image";
import Link from "next/link";
import { RefreshCw, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency, formatNumber, daysAgoISO, todayISO } from "@/lib/format";
import { QuickDateRange } from "@/components/ui/quick-date-range";

type Tab = "overview" | "detailed";

interface AdAccountOption {
  id: string;
  name: string;
  currency: string | null;
  business_managers?: { name: string } | null;
}

interface OverviewRow {
  id: string;
  ad_account_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  currency: string | null;
  ad_accounts?: {
    name: string;
    currency: string | null;
    business_managers?: { name: string } | null;
  } | null;
}

interface DetailedRow {
  id: string;
  ad_account_id: string;
  date: string;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  currency: string | null;
  ad_accounts?: { name: string; currency: string | null } | null;
}

interface SyncLog {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  accounts_synced: number;
  accounts_failed: number;
  error_message: string | null;
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [since, setSince] = useState(daysAgoISO(30));
  const [until, setUntil] = useState(todayISO());
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [accounts, setAccounts] = useState<AdAccountOption[]>([]);
  const [overviewRows, setOverviewRows] = useState<OverviewRow[]>([]);
  const [detailedRows, setDetailedRows] = useState<DetailedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncLog | null>(null);

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/ad-accounts");
    const json = await res.json();
    setAccounts(json.data || []);
  }, []);

  const loadLastSync = useCallback(async () => {
    const res = await fetch("/api/sync-logs");
    const json = await res.json();
    setLastSync(json.data?.[0] || null);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ since, until });
      if (accountFilter) params.set("ad_account_id", accountFilter);

      if (tab === "overview") {
        const res = await fetch(`/api/spend/overview?${params.toString()}`);
        const json = await res.json();
        setOverviewRows(json.data || []);
      } else {
        const res = await fetch(`/api/spend/detailed?${params.toString()}`);
        const json = await res.json();
        setDetailedRows(json.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, since, until, accountFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAccounts();
    loadLastSync();
  }, [loadAccounts, loadLastSync]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since, until }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSyncMessage(`Erro: ${json.error || "falha desconhecida"}`);
      } else {
        setSyncMessage(
          `Sincronizado: ${json.accounts_synced} conta(s) ok, ${json.accounts_failed} falha(s).`,
        );
        await loadData();
        await loadLastSync();
      }
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setSyncing(false);
    }
  }

  const overviewTotal = useMemo(
    () => overviewRows.reduce((sum, r) => sum + Number(r.spend || 0), 0),
    [overviewRows],
  );

  const detailedTotal = useMemo(
    () => detailedRows.reduce((sum, r) => sum + Number(r.spend || 0), 0),
    [detailedRows],
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/80 backdrop-blur">
        <div className="page-shell flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Image src="/logo-rakebet.png" alt="Rakebet" width={36} height={36} className="rounded-lg" />
            <div>
              <h1 className="text-lg font-semibold text-[var(--text)]">Gastos Meta Ads</h1>
              <p className="text-xs text-[var(--text-muted)]">
                Gastos consolidados por BM / conta de anúncio
              </p>
            </div>
          </div>
          <Link href="/admin" className="btn-secondary flex items-center gap-1.5 text-sm">
            <Settings size={14} />
            Gerenciar BMs e contas
          </Link>
        </div>
      </header>

      <main className="page-shell px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center gap-3 card p-4">
          <QuickDateRange since={since} until={until} onChange={(s, u) => { setSince(s); setUntil(u); }} />

          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="input"
          >
            <option value="">Todas as contas</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({acc.business_managers?.name || acc.id})
              </option>
            ))}
          </select>

          <div className="ml-auto flex flex-col items-end gap-1">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-primary flex items-center gap-2"
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Sincronizando..." : "Sincronizar agora"}
            </button>
            {lastSync && (
              <span className="text-xs text-[var(--text-muted)]">
                Última sync: {new Date(lastSync.started_at).toLocaleString("pt-BR")} ({lastSync.status})
              </span>
            )}
          </div>
        </div>

        {syncMessage && (
          <div className="mb-4 soft-panel px-4 py-2 text-sm text-[var(--text)]">{syncMessage}</div>
        )}

        <div className="mb-4 flex gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-1 w-fit">
          <button
            onClick={() => setTab("overview")}
            className={`rounded-xl px-4 py-1.5 text-sm font-medium transition-all ${
              tab === "overview"
                ? "bg-gradient-to-br from-[var(--accent-2)] to-[var(--accent)] text-white shadow"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Visão geral
          </button>
          <button
            onClick={() => setTab("detailed")}
            className={`rounded-xl px-4 py-1.5 text-sm font-medium transition-all ${
              tab === "detailed"
                ? "bg-gradient-to-br from-[var(--accent-2)] to-[var(--accent)] text-white shadow"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Detalhado (campanha / conjunto / anúncio)
          </button>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-[var(--text-muted)]">Carregando...</p>
        ) : tab === "overview" ? (
          <div className="table-shell table-scroll">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">BM</th>
                  <th className="px-4 py-3">Conta</th>
                  <th className="px-4 py-3 text-right">Gasto</th>
                  <th className="px-4 py-3 text-right">Impressões</th>
                  <th className="px-4 py-3 text-right">Cliques</th>
                  <th className="px-4 py-3 text-right">CPC</th>
                  <th className="px-4 py-3 text-right">CPM</th>
                  <th className="px-4 py-3 text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {overviewRows.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-muted)]">
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{row.date}</td>
                    <td className="px-4 py-2.5">{row.ad_accounts?.business_managers?.name || "-"}</td>
                    <td className="px-4 py-2.5">{row.ad_accounts?.name || row.ad_account_id}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-[var(--text)]">
                      {formatCurrency(row.spend, row.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">{formatNumber(row.impressions)}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">{formatNumber(row.clicks)}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">
                      {formatCurrency(row.cpc, row.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">
                      {formatCurrency(row.cpm, row.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">
                      {row.ctr ? `${Number(row.ctr).toFixed(2)}%` : "-"}
                    </td>
                  </tr>
                ))}
                {overviewRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-[var(--text-muted)]">
                      Nenhum dado no período. Clique em &quot;Sincronizar agora&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
              {overviewRows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-[var(--border-strong)] bg-[var(--surface-muted)] font-semibold">
                    <td className="px-4 py-3" colSpan={3}>
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--accent-strong)]">
                      {formatCurrency(overviewTotal, overviewRows[0]?.currency)}
                    </td>
                    <td colSpan={5} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : (
          <div className="table-shell table-scroll">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Conta</th>
                  <th className="px-4 py-3">Campanha</th>
                  <th className="px-4 py-3">Conjunto</th>
                  <th className="px-4 py-3">Anúncio</th>
                  <th className="px-4 py-3 text-right">Gasto</th>
                  <th className="px-4 py-3 text-right">Impressões</th>
                  <th className="px-4 py-3 text-right">Cliques</th>
                  <th className="px-4 py-3 text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {detailedRows.map((row) => (
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
                  </tr>
                ))}
                {detailedRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-[var(--text-muted)]">
                      Nenhum dado no período. Clique em &quot;Sincronizar agora&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
              {detailedRows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-[var(--border-strong)] bg-[var(--surface-muted)] font-semibold">
                    <td className="px-4 py-3" colSpan={5}>
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--accent-strong)]">
                      {formatCurrency(detailedTotal, detailedRows[0]?.currency)}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
