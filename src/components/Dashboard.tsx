"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, RefreshCw, Settings, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { daysAgoISO, previousPeriod, todayISO } from "@/lib/format";
import { QuickDateRange } from "@/components/ui/quick-date-range";
import { SpendTable, type SpendRow } from "@/components/tables/SpendTable";
import { DetailedTable, type DetailedRow } from "@/components/tables/DetailedTable";
import { LogoutButton } from "@/components/LogoutButton";
import { StatsSummary, type PeriodTotals } from "@/components/StatsSummary";
import { TrafficTab } from "@/components/tables/TrafficTab";
import { DepositsTab } from "@/components/tables/DepositsTab";
import { AccountMultiSelect } from "@/components/ui/account-multi-select";
import { PushNotificationToggle } from "@/components/push/push-notification-toggle";

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

const TABS: { key: Tab; label: string; shortLabel?: string }[] = [
  { key: "bm", label: "Por BM" },
  { key: "account", label: "Por Conta" },
  { key: "detailed", label: "Detalhado (campanha / conjunto / anúncio)", shortLabel: "Detalhado" },
  { key: "traffic", label: "Tráfego e Depósitos", shortLabel: "Tráfego" },
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
  const [accountFilters, setAccountFilters] = useState<string[]>([]);
  const [bms, setBms] = useState<BmOption[]>([]);
  const [accounts, setAccounts] = useState<AdAccountOption[]>([]);
  const [bmRows, setBmRows] = useState<SpendRow[]>([]);
  const [accountRows, setAccountRows] = useState<SpendRow[]>([]);
  const [detailedRows, setDetailedRows] = useState<DetailedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncHadErrors, setSyncHadErrors] = useState(false);
  const [lastSync, setLastSync] = useState<SyncLog | null>(null);
  const [compare, setCompare] = useState<{ current: PeriodTotals; previous: PeriodTotals; currency: string | null } | null>(
    null,
  );
  // Evita sobrescrever o localStorage com o estado padrão no primeiro efeito,
  // antes do efeito de carregamento aplicar o que estava salvo (mesmo padrão
  // usado em useColumnConfig/usePersistedSort).
  const skipDashboardStateWrite = useRef(true);

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
        if (accountFilters.length > 0) params.set("ad_account_ids", accountFilters.join(","));
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
        if (accountFilters.length > 0) params.set("ad_account_ids", accountFilters.join(","));
        const res = await fetch(`/api/spend/overview?${params.toString()}`);
        const json = await res.json();
        setAccountRows(json.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, since, until, accountFilters, bmFilter]);

  const loadCompare = useCallback(async () => {
    const prev = previousPeriod(since, until);
    const filterParam: Record<string, string> =
      tab === "bm"
        ? bmFilter
          ? { bm_id: bmFilter }
          : {}
        : accountFilters.length > 0
          ? { ad_account_ids: accountFilters.join(",") }
          : {};

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
  }, [since, until, tab, accountFilters, bmFilter]);

  // Restaura aba/período/filtros salvos deste navegador — roda uma vez no
  // mount, antes do sync abaixo tentar escrever o estado padrão.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rakebet-dashboard-state");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<{
          tab: Tab;
          since: string;
          until: string;
          bmFilter: string;
          accountFilters: string[];
        }>;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed.tab) setTab(parsed.tab);
        if (parsed.since) setSince(parsed.since);
        if (parsed.until) setUntil(parsed.until);
        if (parsed.bmFilter !== undefined) setBmFilter(parsed.bmFilter);
        if (Array.isArray(parsed.accountFilters)) setAccountFilters(parsed.accountFilters);
      }
    } catch {
      // localStorage indisponível (modo privado, etc.) — segue com os padrões.
    }
  }, []);

  useEffect(() => {
    if (skipDashboardStateWrite.current) {
      skipDashboardStateWrite.current = false;
      return;
    }
    try {
      localStorage.setItem(
        "rakebet-dashboard-state",
        JSON.stringify({ tab, since, until, bmFilter, accountFilters }),
      );
    } catch {}
  }, [tab, since, until, bmFilter, accountFilters]);

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
    setSyncHadErrors(false);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since, until }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSyncMessage(`Erro: ${json.error || "falha desconhecida"}`);
        setSyncHadErrors(true);
      } else {
        const errs: { ad_account_id: string; message: string }[] = json.errors || [];
        setSyncHadErrors(errs.length > 0);
        let msg = `Sincronizado: ${json.accounts_synced} conta(s) ok, ${json.accounts_failed} falha(s).`;
        if (errs.length > 0) {
          // Agrupa mensagens repetidas (ex: mesma coluna faltando no banco
          // falhando em 8 contas de uma vez) em vez de listar 8x a mesma
          // linha — mostra a causa, não o ruído.
          const grouped = new Map<string, number>();
          for (const e of errs) grouped.set(e.message, (grouped.get(e.message) || 0) + 1);
          const details = Array.from(grouped.entries())
            .map(([message, count]) => `${message}${count > 1 ? ` (${count}x)` : ""}`)
            .join(" · ");
          msg += ` ${details}`;
        }
        setSyncMessage(msg);
        await loadData();
        await loadCompare();
        await loadLastSync();
      }
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Erro desconhecido");
      setSyncHadErrors(true);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/80 backdrop-blur">
        <div className="page-shell flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo-rakebet-icon.png" alt="Rakebet" width={36} height={36} className="rounded-lg" />
            <div>
              <h1 className="text-lg font-semibold text-[var(--text)]">Traffic RakeBet</h1>
              <p className="hidden text-xs text-[var(--text-muted)] sm:block">
                Gastos consolidados por BM / conta de anúncio
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/rules"
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-sm font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] sm:px-3.5"
            >
              <Zap size={14} />
              <span className="hidden sm:inline">Regras</span>
            </Link>
            <Link
              href="/admin"
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-sm font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] sm:px-3.5"
            >
              <Settings size={14} />
              <span className="hidden sm:inline">Gerenciar BMs e contas</span>
            </Link>
            <Link
              href="/notifications"
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-sm font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] sm:px-3.5"
            >
              <Bell size={14} />
              <span className="hidden sm:inline">Notificações</span>
            </Link>
            <PushNotificationToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="page-shell px-4 py-6 sm:px-6">
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
            <AccountMultiSelect accounts={accounts} selected={accountFilters} onChange={setAccountFilters} />
          ) : null}

          <div className="flex w-full flex-col items-end gap-1 sm:ml-auto sm:w-auto">
            <button onClick={handleSync} disabled={syncing} className="btn-primary flex w-full items-center justify-center gap-2 sm:w-auto">
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Sincronizando..." : "Sincronizar agora"}
            </button>
            {lastSync && (
              <span className="text-right text-xs text-[var(--text-muted)]">
                Última sync: {new Date(lastSync.started_at).toLocaleString("pt-BR")} ({lastSync.status})
              </span>
            )}
          </div>
        </div>

        {syncMessage && (
          <div
            className={`mb-4 px-4 py-2 text-sm ${
              syncHadErrors
                ? "rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]"
                : "soft-panel text-[var(--text)]"
            }`}
          >
            {syncMessage}
          </div>
        )}

        {compare && (
          <StatsSummary
            current={compare.current}
            previous={compare.previous}
            currency={compare.currency}
            previousLabel={`${formatShortDate(previousPeriod(since, until).since)}–${formatShortDate(previousPeriod(since, until).until)}`}
          />
        )}

        <div className="mb-4 flex w-fit max-w-full flex-wrap gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-xl px-4 py-1.5 text-sm font-medium transition-all ${
                tab === t.key
                  ? "bg-gradient-to-br from-[var(--accent-2)] to-[var(--accent)] text-white shadow"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {t.shortLabel ? (
                <>
                  <span className="sm:hidden">{t.shortLabel}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                </>
              ) : (
                t.label
              )}
            </button>
          ))}
        </div>

        {/* Mantém a tabela montada durante o loading (só reduz opacidade) —
            desmontar aqui reseta a config de colunas (ordem/visibilidade)
            porque o efeito que carrega do localStorage não chega a assentar
            antes do remount seguinte. */}
        {tab === "traffic" ? (
          <div className="space-y-8">
            <div>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Depósitos
              </h2>
              <DepositsTab since={since} until={until} />
            </div>
            <div>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Tráfego
              </h2>
              <TrafficTab since={since} until={until} />
            </div>
          </div>
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
