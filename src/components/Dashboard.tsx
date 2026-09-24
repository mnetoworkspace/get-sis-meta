"use client";

import Image from "next/image";
import Link from "next/link";
import { RefreshCw, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { daysAgoISO, previousPeriod, todayISO } from "@/lib/format";
import { QuickDateRange } from "@/components/ui/quick-date-range";
import { SpendTable, type SpendRow } from "@/components/tables/SpendTable";
import { DetailedTable, type DetailedRow } from "@/components/tables/DetailedTable";
import { LogoutButton } from "@/components/LogoutButton";
import { StatsSummary, type PeriodTotals } from "@/components/StatsSummary";
import { TrafficTab } from "@/components/tables/TrafficTab";

type Tab = "bm" | "account" | "detailed" | "traffic";

interface AdAccountOption {
  id: string;
  name: string;
  currency: string | null;
  business_managers?: { name: string } | null;
}

interface BmOption {
  id: string;
  name: string;
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

const TABS: { key: Tab; label: string }[] = [
  { key: "bm", label: "Por BM" },
  { key: "account", label: "Por Conta" },
  { key: "detailed", label: "Detalhado (campanha / conjunto / anúncio)" },
  { key: "traffic", label: "Tráfego" },
];

function aggregateTotals(rows: SpendRow[]): PeriodTotals {
  let spend = 0;
  let results = 0;
  let hasResults = false;
  let ftd = 0;
  let hasFtd = false;

  for (const r of rows) {
    spend += Number(r.spend || 0);
    if (r.results != null) {
      results += r.results;
      hasResults = true;
    }
    if (r.ftd != null) {
      ftd += r.ftd;
      hasFtd = true;
    }
  }

  return {
    spend,
    results: hasResults ? results : null,
    costPerResult: hasResults && results > 0 ? spend / results : null,
    ftd: hasFtd ? ftd : null,
    costPerFtd: hasFtd && ftd > 0 ? spend / ftd : null,
  };
}

function formatShortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("account");
  const [since, setSince] = useState(daysAgoISO(30));
  const [until, setUntil] = useState(todayISO());
  const [bmFilter, setBmFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [bms, setBms] = useState<BmOption[]>([]);
  const [accounts, setAccounts] = useState<AdAccountOption[]>([]);
  const [bmRows, setBmRows] = useState<SpendRow[]>([]);
  const [accountRows, setAccountRows] = useState<SpendRow[]>([]);
  const [detailedRows, setDetailedRows] = useState<DetailedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncLog | null>(null);
  const [compare, setCompare] = useState<{ current: PeriodTotals; previous: PeriodTotals; currency: string | null } | null>(
    null,
  );

  const loadFilters = useCallback(async () => {
    const [accRes, bmRes] = await Promise.all([fetch("/api/ad-accounts"), fetch("/api/bms")]);
    setAccounts((await accRes.json()).data || []);
    const bmData = (await bmRes.json()).data || [];
    setBms(bmData.map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })));
  }, []);

  const loadLastSync = useCallback(async () => {
    const res = await fetch("/api/sync-logs");
    const json = await res.json();
    setLastSync(json.data?.[0] || null);
  }, []);

  const loadData = useCallback(async () => {
    if (tab === "traffic") return;
    setLoading(true);
    try {
      if (tab === "detailed") {
        const params = new URLSearchParams({ since, until });
        if (accountFilter) params.set("ad_account_id", accountFilter);
        const res = await fetch(`/api/spend/detailed?${params.toString()}`);
        const json = await res.json();
        setDetailedRows(json.data || []);
      } else if (tab === "bm") {
        const params = new URLSearchParams({ since, until, group_by: "bm" });
        if (bmFilter) params.set("bm_id", bmFilter);
        const res = await fetch(`/api/spend/overview?${params.toString()}`);
        const json = await res.json();
        setBmRows(json.data || []);
      } else {
        const params = new URLSearchParams({ since, until });
        if (accountFilter) params.set("ad_account_id", accountFilter);
        const res = await fetch(`/api/spend/overview?${params.toString()}`);
        const json = await res.json();
        setAccountRows(json.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, since, until, accountFilter, bmFilter]);

  const loadCompare = useCallback(async () => {
    const prev = previousPeriod(since, until);
    const filterParam: Record<string, string> =
      tab === "bm" ? (bmFilter ? { bm_id: bmFilter } : {}) : accountFilter ? { ad_account_id: accountFilter } : {};

    async function fetchPeriod(s: string, u: string) {
      const params = new URLSearchParams({ since: s, until: u, ...filterParam });
      const res = await fetch(`/api/spend/overview?${params.toString()}`);
      const json = await res.json();
      const rows: SpendRow[] = json.data || [];
      return { totals: aggregateTotals(rows), currency: rows[0]?.currency ?? null };
    }

    const [curr, prevTotals] = await Promise.all([
      fetchPeriod(since, until),
      fetchPeriod(prev.since, prev.until),
    ]);

    setCompare({
      current: curr.totals,
      previous: prevTotals.totals,
      currency: curr.currency || prevTotals.currency,
    });
  }, [since, until, tab, accountFilter, bmFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFilters();
    loadLastSync();
  }, [loadFilters, loadLastSync]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    loadCompare();
  }, [loadData, loadCompare]);

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
        await loadCompare();
        await loadLastSync();
      }
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/80 backdrop-blur">
        <div className="page-shell flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Image src="/logo-rakebet-icon.png" alt="Rakebet" width={36} height={36} className="rounded-lg" />
            <div>
              <h1 className="text-lg font-semibold text-[var(--text)]">Gastos Meta Ads</h1>
              <p className="text-xs text-[var(--text-muted)]">
                Gastos consolidados por BM / conta de anúncio
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin" className="btn-secondary flex items-center gap-1.5 text-sm">
              <Settings size={14} />
              Gerenciar BMs e contas
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="page-shell px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center gap-3 card p-4">
          <QuickDateRange since={since} until={until} onChange={(s, u) => { setSince(s); setUntil(u); }} />

          {tab === "bm" ? (
            <select value={bmFilter} onChange={(e) => setBmFilter(e.target.value)} className="input">
              <option value="">Todos os BMs</option>
              {bms.map((bm) => (
                <option key={bm.id} value={bm.id}>
                  {bm.name}
                </option>
              ))}
            </select>
          ) : tab !== "traffic" ? (
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="input">
              <option value="">Todas as contas</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.business_managers?.name || acc.id})
                </option>
              ))}
            </select>
          ) : null}

          <div className="ml-auto flex flex-col items-end gap-1">
            <button onClick={handleSync} disabled={syncing} className="btn-primary flex items-center gap-2">
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

        {compare && (
          <StatsSummary
            current={compare.current}
            previous={compare.previous}
            currency={compare.currency}
            previousLabel={`${formatShortDate(previousPeriod(since, until).since)}–${formatShortDate(previousPeriod(since, until).until)}`}
          />
        )}

        <div className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-4 py-1.5 text-sm font-medium transition-all ${
                tab === t.key
                  ? "bg-gradient-to-br from-[var(--accent-2)] to-[var(--accent)] text-white shadow"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Mantém a tabela montada durante o loading (só reduz opacidade) —
            desmontar aqui reseta a config de colunas (ordem/visibilidade)
            porque o efeito que carrega do localStorage não chega a assentar
            antes do remount seguinte. */}
        {tab === "traffic" ? (
          <TrafficTab since={since} until={until} />
        ) : (
          <div className={loading ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"}>
            {tab === "bm" ? (
              <SpendTable key="bm" rows={bmRows} mode="bm" />
            ) : tab === "account" ? (
              <SpendTable key="account" rows={accountRows} mode="account" />
            ) : (
              <DetailedTable rows={detailedRows} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
