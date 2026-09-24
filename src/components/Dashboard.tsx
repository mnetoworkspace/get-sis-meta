"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency, formatNumber, daysAgoISO, todayISO } from "@/lib/format";

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
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Gastos Meta Ads</h1>
            <p className="text-sm text-neutral-500">
              Gastos consolidados por BM / conta de anúncio
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            Gerenciar BMs e contas
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">De</label>
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Até</label>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Conta</label>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="">Todas as contas</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.business_managers?.name || acc.id})
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex flex-col items-end gap-1">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {syncing ? "Sincronizando..." : "Sincronizar agora"}
            </button>
            {lastSync && (
              <span className="text-xs text-neutral-400">
                Última sync: {new Date(lastSync.started_at).toLocaleString("pt-BR")} (
                {lastSync.status})
              </span>
            )}
          </div>
        </div>

        {syncMessage && (
          <div className="mb-4 rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm">
            {syncMessage}
          </div>
        )}

        <div className="mb-4 flex gap-2 border-b border-neutral-200">
          <button
            onClick={() => setTab("overview")}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === "overview"
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-400"
            }`}
          >
            Visão geral
          </button>
          <button
            onClick={() => setTab("detailed")}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === "detailed"
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-400"
            }`}
          >
            Detalhado (campanha / conjunto / anúncio)
          </button>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-neutral-400">Carregando...</p>
        ) : tab === "overview" ? (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">BM</th>
                  <th className="px-4 py-2">Conta</th>
                  <th className="px-4 py-2 text-right">Gasto</th>
                  <th className="px-4 py-2 text-right">Impressões</th>
                  <th className="px-4 py-2 text-right">Cliques</th>
                  <th className="px-4 py-2 text-right">CPC</th>
                  <th className="px-4 py-2 text-right">CPM</th>
                  <th className="px-4 py-2 text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {overviewRows.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-100">
                    <td className="px-4 py-2">{row.date}</td>
                    <td className="px-4 py-2">
                      {row.ad_accounts?.business_managers?.name || "-"}
                    </td>
                    <td className="px-4 py-2">{row.ad_accounts?.name || row.ad_account_id}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatCurrency(row.spend, row.currency)}
                    </td>
                    <td className="px-4 py-2 text-right">{formatNumber(row.impressions)}</td>
                    <td className="px-4 py-2 text-right">{formatNumber(row.clicks)}</td>
                    <td className="px-4 py-2 text-right">
                      {formatCurrency(row.cpc, row.currency)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatCurrency(row.cpm, row.currency)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {row.ctr ? `${Number(row.ctr).toFixed(2)}%` : "-"}
                    </td>
                  </tr>
                ))}
                {overviewRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-neutral-400">
                      Nenhum dado no período. Clique em &quot;Sincronizar agora&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
              {overviewRows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold">
                    <td className="px-4 py-2" colSpan={3}>
                      Total
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatCurrency(overviewTotal, overviewRows[0]?.currency)}
                    </td>
                    <td colSpan={5} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Conta</th>
                  <th className="px-4 py-2">Campanha</th>
                  <th className="px-4 py-2">Conjunto</th>
                  <th className="px-4 py-2">Anúncio</th>
                  <th className="px-4 py-2 text-right">Gasto</th>
                  <th className="px-4 py-2 text-right">Impressões</th>
                  <th className="px-4 py-2 text-right">Cliques</th>
                  <th className="px-4 py-2 text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {detailedRows.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-100">
                    <td className="px-4 py-2">{row.date}</td>
                    <td className="px-4 py-2">{row.ad_accounts?.name || row.ad_account_id}</td>
                    <td className="px-4 py-2">{row.campaign_name || "-"}</td>
                    <td className="px-4 py-2">{row.adset_name || "-"}</td>
                    <td className="px-4 py-2">{row.ad_name || "-"}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatCurrency(row.spend, row.currency)}
                    </td>
                    <td className="px-4 py-2 text-right">{formatNumber(row.impressions)}</td>
                    <td className="px-4 py-2 text-right">{formatNumber(row.clicks)}</td>
                    <td className="px-4 py-2 text-right">
                      {row.ctr ? `${Number(row.ctr).toFixed(2)}%` : "-"}
                    </td>
                  </tr>
                ))}
                {detailedRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-neutral-400">
                      Nenhum dado no período. Clique em &quot;Sincronizar agora&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
              {detailedRows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold">
                    <td className="px-4 py-2" colSpan={5}>
                      Total
                    </td>
                    <td className="px-4 py-2 text-right">
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
