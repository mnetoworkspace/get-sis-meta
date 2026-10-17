"use client";

import { Copy, Pause, Play, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatCurrency, todayISO } from "@/lib/format";
import { applySort, nextSortState, usePersistedSort } from "@/lib/sort";
import { SortableTh } from "@/components/ui/sortable-th";
import { ColumnManagerButton } from "@/components/ui/column-manager";
import { useColumnConfig, type ColumnDef } from "@/lib/column-config";
import { QuickDateRange } from "@/components/ui/quick-date-range";

interface AdAccountOption {
  id: string;
  name: string;
  currency: string | null;
  business_managers?: { name: string } | null;
}

interface CampaignRow {
  id: string;
  name: string;
  objective: string;
  effective_status: string;
  daily_budget: string | null;
  lifetime_budget: string | null;
  spend: number;
  purchases: number;
}

interface AdSetRow {
  id: string;
  name: string;
  campaign_id: string;
  campaign_name: string | null;
  effective_status: string;
  daily_budget: string | null;
  lifetime_budget: string | null;
  spend: number;
  purchases: number;
}

interface AdRow {
  id: string;
  name: string;
  adset_id: string;
  adset_name: string | null;
  effective_status: string;
  spend: number;
  purchases: number;
}

type Level = "campaigns" | "adsets" | "ads";

const LEVELS: { key: Level; label: string }[] = [
  { key: "campaigns", label: "Campanhas" },
  { key: "adsets", label: "Conjuntos de anúncio" },
  { key: "ads", label: "Anúncios" },
];

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-500",
  PAUSED: "bg-[var(--surface-muted)] text-[var(--text-muted)]",
  CAMPAIGN_PAUSED: "bg-[var(--surface-muted)] text-[var(--text-muted)]",
  ADSET_PAUSED: "bg-[var(--surface-muted)] text-[var(--text-muted)]",
  ARCHIVED: "bg-amber-500/15 text-amber-500",
  DELETED: "bg-[var(--danger-soft)] text-[var(--danger)]",
};

// Não dá pra pausar/ativar um objeto arquivado ou excluído — a Meta
// recusa a chamada (só deixa renomear ou, no caso de arquivado, duplicar
// pra criar uma cópia nova). Ver investigação do conjunto arquivado da
// conta LCF.
const STATUS_LOCKED = new Set(["ARCHIVED", "DELETED"]);

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-amber-500/15 text-amber-500";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>{status}</span>;
}

function budgetValue(dailyBudget: string | null, lifetimeBudget: string | null): number | null {
  if (dailyBudget) return Number(dailyBudget) / 100;
  if (lifetimeBudget) return Number(lifetimeBudget) / 100;
  return null;
}

function budgetLabel(dailyBudget: string | null, lifetimeBudget: string | null, currency: string | null): string {
  if (dailyBudget) return `${formatCurrency(Number(dailyBudget) / 100, currency)}/dia`;
  if (lifetimeBudget) return `${formatCurrency(Number(lifetimeBudget) / 100, currency)} total`;
  return "CBO (orçamento da campanha)";
}

function costPerPurchaseValue(spend: number, purchases: number): number | null {
  return purchases > 0 ? spend / purchases : null;
}

const ICON_BTN =
  "flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:opacity-40";

// Filtro de status (chips que marcam/desmarcam) — conjunto vazio = mostra
// tudo. As opções vêm dos status que realmente aparecem nos dados
// carregados, não de uma lista fixa, porque cada conta/nível tem um
// subconjunto diferente (ex: CAMPAIGN_PAUSED só existe em conjunto/anúncio).
function StatusFilterChips({
  rows,
  selected,
  onToggle,
  onClear,
}: {
  rows: { effective_status: string }[];
  selected: Set<string>;
  onToggle: (status: string) => void;
  onClear: () => void;
}) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.effective_status, (map.get(r.effective_status) || 0) + 1);
    return map;
  }, [rows]);
  const statuses = Array.from(counts.keys()).sort();

  if (statuses.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-[var(--text-muted)]">Status:</span>
      {statuses.map((status) => {
        const active = selected.has(status);
        return (
          <button
            key={status}
            onClick={() => onToggle(status)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {status} ({counts.get(status)})
          </button>
        );
      })}
      {selected.size > 0 && (
        <button onClick={onClear} className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] underline hover:text-[var(--text)]">
          <X size={10} /> limpar
        </button>
      )}
    </div>
  );
}

type CampaignColKey = "status" | "objective" | "budget" | "spend" | "purchases" | "cpa";
const CAMPAIGN_COLUMNS: ColumnDef<CampaignColKey>[] = [
  { key: "status", label: "Status", defaultOn: true },
  { key: "objective", label: "Objetivo", defaultOn: true },
  { key: "budget", label: "Orçamento", defaultOn: true },
  { key: "spend", label: "Gasto", defaultOn: true },
  { key: "purchases", label: "Compras", defaultOn: true },
  { key: "cpa", label: "Custo/Compra", defaultOn: true },
];
const CAMPAIGN_ALIGN_LEFT: CampaignColKey[] = ["status", "objective", "budget"];

type AdSetColKey = "campaign" | "status" | "budget" | "spend" | "purchases" | "cpa";
const ADSET_COLUMNS: ColumnDef<AdSetColKey>[] = [
  { key: "campaign", label: "Campanha", defaultOn: true },
  { key: "status", label: "Status", defaultOn: true },
  { key: "budget", label: "Orçamento", defaultOn: true },
  { key: "spend", label: "Gasto", defaultOn: true },
  { key: "purchases", label: "Compras", defaultOn: true },
  { key: "cpa", label: "Custo/Compra", defaultOn: true },
];
const ADSET_ALIGN_LEFT: AdSetColKey[] = ["campaign", "status", "budget"];

type AdColKey = "adset" | "status" | "spend" | "purchases" | "cpa";
const AD_COLUMNS: ColumnDef<AdColKey>[] = [
  { key: "adset", label: "Conjunto", defaultOn: true },
  { key: "status", label: "Status", defaultOn: true },
  { key: "spend", label: "Gasto", defaultOn: true },
  { key: "purchases", label: "Compras", defaultOn: true },
  { key: "cpa", label: "Custo/Compra", defaultOn: true },
];
const AD_ALIGN_LEFT: AdColKey[] = ["adset", "status"];

export function AdsManagerTab({ accounts }: { accounts: AdAccountOption[] }) {
  const [accountId, setAccountId] = useState("");
  const [level, setLevel] = useState<Level>("campaigns");
  const [since, setSince] = useState(todayISO());
  const [until, setUntil] = useState(todayISO());

  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [checkedCampaigns, setCheckedCampaigns] = useState<Set<string>>(new Set());
  const [statusFilterCampaigns, setStatusFilterCampaigns] = useState<Set<string>>(new Set());

  const [adsets, setAdsets] = useState<AdSetRow[] | null>(null);
  const [loadingAdsets, setLoadingAdsets] = useState(false);
  const [checkedAdsets, setCheckedAdsets] = useState<Set<string>>(new Set());
  const [statusFilterAdsets, setStatusFilterAdsets] = useState<Set<string>>(new Set());

  const [ads, setAds] = useState<AdRow[] | null>(null);
  const [loadingAds, setLoadingAds] = useState(false);
  const [statusFilterAds, setStatusFilterAds] = useState<Set<string>>(new Set());

  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sortCampaigns, setSortCampaigns] = usePersistedSort("ads-mgr-campaigns-v1");
  const campaignCols = useColumnConfig<CampaignColKey>("ads-mgr-campaigns-v1", CAMPAIGN_COLUMNS);
  const [sortAdsets, setSortAdsets] = usePersistedSort("ads-mgr-adsets-v1");
  const adsetCols = useColumnConfig<AdSetColKey>("ads-mgr-adsets-v1", ADSET_COLUMNS);
  const [sortAds, setSortAds] = usePersistedSort("ads-mgr-ads-v1");
  const adCols = useColumnConfig<AdColKey>("ads-mgr-ads-v1", AD_COLUMNS);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;
  const currency = selectedAccount?.currency ?? null;

  useEffect(() => {
    if (accounts.length > 0 && !accountId) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  function loadCampaigns(rangeSince = since, rangeUntil = until) {
    if (!accountId) return;
    setLoadingCampaigns(true);
    setError(null);
    fetch(`/api/meta/accounts/${accountId}/campaigns?since=${rangeSince}&until=${rangeUntil}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setCampaigns(json.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar campanhas."))
      .finally(() => setLoadingCampaigns(false));
  }

  function loadAdsets(rangeSince = since, rangeUntil = until) {
    if (!accountId) return;
    setLoadingAdsets(true);
    setError(null);
    const campaignFilter = checkedCampaigns.size > 0 ? `&campaignIds=${Array.from(checkedCampaigns).join(",")}` : "";
    fetch(`/api/meta/accounts/${accountId}/adsets?since=${rangeSince}&until=${rangeUntil}${campaignFilter}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setAdsets(json.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar conjuntos."))
      .finally(() => setLoadingAdsets(false));
  }

  function loadAds(rangeSince = since, rangeUntil = until) {
    if (!accountId) return;
    setLoadingAds(true);
    setError(null);
    const adsetFilter = checkedAdsets.size > 0 ? `&adsetIds=${Array.from(checkedAdsets).join(",")}` : "";
    fetch(`/api/meta/accounts/${accountId}/ads?since=${rangeSince}&until=${rangeUntil}${adsetFilter}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setAds(json.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar anúncios."))
      .finally(() => setLoadingAds(false));
  }

  useEffect(() => {
    if (!accountId) return;
    setCampaigns(null);
    setAdsets(null);
    setAds(null);
    setCheckedCampaigns(new Set());
    setCheckedAdsets(new Set());
    setStatusFilterCampaigns(new Set());
    setStatusFilterAdsets(new Set());
    setStatusFilterAds(new Set());
    setLevel("campaigns");
    setMessage(null);
    loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  function onDateRangeChange(s: string, u: string) {
    setSince(s);
    setUntil(u);
    if (level === "campaigns") loadCampaigns(s, u);
    else if (level === "adsets") loadAdsets(s, u);
    else loadAds(s, u);
  }

  function goToLevel(next: Level) {
    setLevel(next);
    setMessage(null);
    if (next === "adsets") loadAdsets();
    if (next === "ads") loadAds();
  }

  function refreshCurrentLevel() {
    if (level === "campaigns") loadCampaigns();
    else if (level === "adsets") loadAdsets();
    else loadAds();
  }

  function toggleChecked(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  }

  async function toggleStatus(objectId: string, currentStatus: string, onDone: (newStatus: string) => void) {
    const newStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setBusyIds((prev) => new Set(prev).add(objectId));
    setMessage(null);
    try {
      const res = await fetch(`/api/meta/objects/${objectId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao mudar status");
      onDone(newStatus);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao mudar status");
    } finally {
      setBusyIds((prev) => { const s = new Set(prev); s.delete(objectId); return s; });
    }
  }

  function setCampaignStatus(id: string, status: string) {
    setCampaigns((prev) => prev?.map((c) => (c.id === id ? { ...c, effective_status: status } : c)) ?? null);
  }
  function setAdsetStatus(id: string, status: string) {
    setAdsets((prev) => prev?.map((a) => (a.id === id ? { ...a, effective_status: status } : a)) ?? null);
  }
  function setAdStatus(id: string, status: string) {
    setAds((prev) => prev?.map((a) => (a.id === id ? { ...a, effective_status: status } : a)) ?? null);
  }

  async function duplicateCampaign(campaign: CampaignRow) {
    if (!confirm(`Duplicar a campanha "${campaign.name}" inteira (todos os conjuntos e anúncios dela) e já deixar ativa?`)) {
      return;
    }
    setBusyIds((prev) => new Set(prev).add(campaign.id));
    setMessage(null);
    try {
      const res = await fetch(`/api/meta/campaigns/${campaign.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao duplicar campanha");
      setMessage(`Campanha duplicada com sucesso (${json.data.adSets.length} conjunto(s) copiado(s)).`);
      loadCampaigns();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao duplicar campanha");
    } finally {
      setBusyIds((prev) => { const s = new Set(prev); s.delete(campaign.id); return s; });
    }
  }

  async function duplicateAdset(adset: AdSetRow) {
    if (!confirm(`Duplicar o conjunto "${adset.name}" e já deixar ativo?`)) return;
    setBusyIds((prev) => new Set(prev).add(adset.id));
    setMessage(null);
    try {
      const res = await fetch(`/api/meta/adsets/${adset.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao duplicar conjunto");
      setMessage("Conjunto duplicado com sucesso.");
      loadAdsets();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao duplicar conjunto");
    } finally {
      setBusyIds((prev) => { const s = new Set(prev); s.delete(adset.id); return s; });
    }
  }

  function toggleStatusFilter(set: Set<string>, setSet: (s: Set<string>) => void, status: string) {
    const next = new Set(set);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setSet(next);
  }

  const visibleCampaigns = useMemo(
    () => (statusFilterCampaigns.size > 0 ? (campaigns ?? []).filter((c) => statusFilterCampaigns.has(c.effective_status)) : campaigns ?? []),
    [campaigns, statusFilterCampaigns],
  );
  const visibleAdsets = useMemo(
    () => (statusFilterAdsets.size > 0 ? (adsets ?? []).filter((a) => statusFilterAdsets.has(a.effective_status)) : adsets ?? []),
    [adsets, statusFilterAdsets],
  );
  const visibleAds = useMemo(
    () => (statusFilterAds.size > 0 ? (ads ?? []).filter((a) => statusFilterAds.has(a.effective_status)) : ads ?? []),
    [ads, statusFilterAds],
  );

  const campaignGetters: Record<string, (r: CampaignRow) => string | number | null> = {
    name: (r) => r.name,
    status: (r) => r.effective_status,
    objective: (r) => r.objective,
    budget: (r) => budgetValue(r.daily_budget, r.lifetime_budget),
    spend: (r) => r.spend,
    purchases: (r) => r.purchases,
    cpa: (r) => costPerPurchaseValue(r.spend, r.purchases),
  };
  const campaignDefaultCompare = (a: CampaignRow, b: CampaignRow) =>
    b.spend - a.spend || a.name.localeCompare(b.name, "pt-BR", { numeric: true });
  const sortedCampaigns = useMemo(
    () => applySort(visibleCampaigns, sortCampaigns, campaignGetters, campaignDefaultCompare),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleCampaigns, sortCampaigns],
  );

  const adsetGetters: Record<string, (r: AdSetRow) => string | number | null> = {
    name: (r) => r.name,
    campaign: (r) => r.campaign_name || "",
    status: (r) => r.effective_status,
    budget: (r) => budgetValue(r.daily_budget, r.lifetime_budget),
    spend: (r) => r.spend,
    purchases: (r) => r.purchases,
    cpa: (r) => costPerPurchaseValue(r.spend, r.purchases),
  };
  const adsetDefaultCompare = (a: AdSetRow, b: AdSetRow) =>
    b.spend - a.spend || a.name.localeCompare(b.name, "pt-BR", { numeric: true });
  const sortedAdsets = useMemo(
    () => applySort(visibleAdsets, sortAdsets, adsetGetters, adsetDefaultCompare),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleAdsets, sortAdsets],
  );

  const adGetters: Record<string, (r: AdRow) => string | number | null> = {
    name: (r) => r.name,
    adset: (r) => r.adset_name || "",
    status: (r) => r.effective_status,
    spend: (r) => r.spend,
    purchases: (r) => r.purchases,
    cpa: (r) => costPerPurchaseValue(r.spend, r.purchases),
  };
  const adDefaultCompare = (a: AdRow, b: AdRow) =>
    b.spend - a.spend || a.name.localeCompare(b.name, "pt-BR", { numeric: true });
  const sortedAds = useMemo(
    () => applySort(visibleAds, sortAds, adGetters, adDefaultCompare),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleAds, sortAds],
  );

  const campaignCellRenderers: Record<CampaignColKey, (r: CampaignRow) => ReactNode> = {
    status: (r) => <StatusBadge status={r.effective_status} />,
    objective: (r) => r.objective,
    budget: (r) => budgetLabel(r.daily_budget, r.lifetime_budget, currency),
    spend: (r) => formatCurrency(r.spend, currency),
    purchases: (r) => r.purchases,
    cpa: (r) => {
      const v = costPerPurchaseValue(r.spend, r.purchases);
      return v != null ? formatCurrency(v, currency) : "—";
    },
  };

  const adsetCellRenderers: Record<AdSetColKey, (r: AdSetRow) => ReactNode> = {
    campaign: (r) => r.campaign_name || "—",
    status: (r) => <StatusBadge status={r.effective_status} />,
    budget: (r) => budgetLabel(r.daily_budget, r.lifetime_budget, currency),
    spend: (r) => formatCurrency(r.spend, currency),
    purchases: (r) => r.purchases,
    cpa: (r) => {
      const v = costPerPurchaseValue(r.spend, r.purchases);
      return v != null ? formatCurrency(v, currency) : "—";
    },
  };

  const adCellRenderers: Record<AdColKey, (r: AdRow) => ReactNode> = {
    adset: (r) => r.adset_name || "—",
    status: (r) => <StatusBadge status={r.effective_status} />,
    spend: (r) => formatCurrency(r.spend, currency),
    purchases: (r) => r.purchases,
    cpa: (r) => {
      const v = costPerPurchaseValue(r.spend, r.purchases);
      return v != null ? formatCurrency(v, currency) : "—";
    },
  };

  function onSortCampaigns(key: string) {
    setSortCampaigns((s) => nextSortState(s, key));
  }
  function onSortAdsets(key: string) {
    setSortAdsets((s) => nextSortState(s, key));
  }
  function onSortAds(key: string) {
    setSortAds((s) => nextSortState(s, key));
  }

  const loading = level === "campaigns" ? loadingCampaigns : level === "adsets" ? loadingAdsets : loadingAds;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="input max-w-sm" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.business_managers?.name ? `[${a.business_managers.name}] ` : ""}
              {a.name}
            </option>
          ))}
        </select>
        <QuickDateRange since={since} until={until} onChange={onDateRangeChange} />
        <button onClick={refreshCurrentLevel} disabled={loading || !accountId} className="btn-secondary flex items-center gap-1.5 py-1.5 px-3 text-xs">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-1">
        {LEVELS.map((l) => (
          <button
            key={l.key}
            onClick={() => goToLevel(l.key)}
            className={`whitespace-nowrap rounded-xl px-4 py-1.5 text-sm font-medium transition-all ${
              level === l.key
                ? "bg-gradient-to-br from-[var(--accent-2)] to-[var(--accent)] text-white shadow"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {level === "campaigns" && campaigns && (
        <StatusFilterChips
          rows={campaigns}
          selected={statusFilterCampaigns}
          onToggle={(s) => toggleStatusFilter(statusFilterCampaigns, setStatusFilterCampaigns, s)}
          onClear={() => setStatusFilterCampaigns(new Set())}
        />
      )}

      {level === "adsets" && (
        <>
          <p className="text-xs text-[var(--text-muted)]">
            {checkedCampaigns.size > 0 ? (
              <>
                Mostrando conjuntos de {checkedCampaigns.size} campanha(s) selecionada(s).{" "}
                <button
                  onClick={() => { setCheckedCampaigns(new Set()); loadAdsets(); }}
                  className="inline-flex items-center gap-1 underline hover:text-[var(--text)]"
                >
                  <X size={10} /> limpar filtro de campanha
                </button>
              </>
            ) : (
              "Mostrando todos os conjuntos da conta (marque campanhas na aba Campanhas pra filtrar)."
            )}
          </p>
          {adsets && (
            <StatusFilterChips
              rows={adsets}
              selected={statusFilterAdsets}
              onToggle={(s) => toggleStatusFilter(statusFilterAdsets, setStatusFilterAdsets, s)}
              onClear={() => setStatusFilterAdsets(new Set())}
            />
          )}
        </>
      )}
      {level === "ads" && (
        <>
          <p className="text-xs text-[var(--text-muted)]">
            {checkedAdsets.size > 0 ? (
              <>
                Mostrando anúncios de {checkedAdsets.size} conjunto(s) selecionado(s).{" "}
                <button
                  onClick={() => { setCheckedAdsets(new Set()); loadAds(); }}
                  className="inline-flex items-center gap-1 underline hover:text-[var(--text)]"
                >
                  <X size={10} /> limpar filtro de conjunto
                </button>
              </>
            ) : (
              "Mostrando todos os anúncios da conta (marque conjuntos na aba Conjuntos de anúncio pra filtrar)."
            )}
          </p>
          {ads && (
            <StatusFilterChips
              rows={ads}
              selected={statusFilterAds}
              onToggle={(s) => toggleStatusFilter(statusFilterAds, setStatusFilterAds, s)}
              onClear={() => setStatusFilterAds(new Set())}
            />
          )}
        </>
      )}

      {message && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-[var(--text)]">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {level === "campaigns" && (
        <div className="table-shell">
          <div className="flex items-center justify-start border-b border-[var(--border)] px-3 py-2">
            <ColumnManagerButton
              panelId="ads-mgr-campaigns-col-panel"
              columns={CAMPAIGN_COLUMNS}
              colOrder={campaignCols.colOrder}
              visibleCols={campaignCols.visibleCols}
              onToggle={campaignCols.toggle}
              onDragStart={campaignCols.dragStart}
              onDragOver={campaignCols.dragOver}
              onDragEnd={campaignCols.dragEnd}
              onReset={campaignCols.resetToDefault}
            />
          </div>
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="w-8 px-3 py-3" />
                  <SortableTh label="Nome" sortKey="name" activeKey={sortCampaigns.key} dir={sortCampaigns.dir} onSort={onSortCampaigns} />
                  {campaignCols.orderedVisible.map((key) => (
                    <SortableTh
                      key={key}
                      label={CAMPAIGN_COLUMNS.find((c) => c.key === key)!.label}
                      sortKey={key}
                      activeKey={sortCampaigns.key}
                      dir={sortCampaigns.dir}
                      align={CAMPAIGN_ALIGN_LEFT.includes(key) ? "left" : "right"}
                      onSort={onSortCampaigns}
                    />
                  ))}
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loadingCampaigns && (
                  <tr>
                    <td colSpan={3 + campaignCols.orderedVisible.length} className="px-4 py-10 text-center text-[var(--text-muted)]">
                      Carregando campanhas direto da Meta...
                    </td>
                  </tr>
                )}
                {!loadingCampaigns && sortedCampaigns.length === 0 && (
                  <tr>
                    <td colSpan={3 + campaignCols.orderedVisible.length} className="px-4 py-10 text-center text-[var(--text-muted)]">
                      Nenhuma campanha encontrada nessa conta/período.
                    </td>
                  </tr>
                )}
                {sortedCampaigns.map((campaign) => {
                  const isBusy = busyIds.has(campaign.id);
                  const locked = STATUS_LOCKED.has(campaign.effective_status);
                  return (
                    <tr key={campaign.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-muted)]">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={checkedCampaigns.has(campaign.id)}
                          onChange={() => toggleChecked(checkedCampaigns, setCheckedCampaigns, campaign.id)}
                        />
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[var(--text)]">{campaign.name}</td>
                      {campaignCols.orderedVisible.map((key) => (
                        <td key={key} className={`px-4 py-2.5 text-[var(--text-muted)] ${CAMPAIGN_ALIGN_LEFT.includes(key) ? "text-left" : "text-right"}`}>
                          {campaignCellRenderers[key](campaign)}
                        </td>
                      ))}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            title={locked ? "Status trava edição — use duplicar" : campaign.effective_status === "ACTIVE" ? "Pausar campanha" : "Ativar campanha"}
                            disabled={isBusy || locked}
                            onClick={() => toggleStatus(campaign.id, campaign.effective_status, (s) => setCampaignStatus(campaign.id, s))}
                            className={ICON_BTN}
                          >
                            {campaign.effective_status === "ACTIVE" ? <Pause size={13} /> : <Play size={13} />}
                          </button>
                          <button title="Duplicar campanha" disabled={isBusy} onClick={() => duplicateCampaign(campaign)} className={ICON_BTN}>
                            <Copy size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {level === "adsets" && (
        <div className="table-shell">
          <div className="flex items-center justify-start border-b border-[var(--border)] px-3 py-2">
            <ColumnManagerButton
              panelId="ads-mgr-adsets-col-panel"
              columns={ADSET_COLUMNS}
              colOrder={adsetCols.colOrder}
              visibleCols={adsetCols.visibleCols}
              onToggle={adsetCols.toggle}
              onDragStart={adsetCols.dragStart}
              onDragOver={adsetCols.dragOver}
              onDragEnd={adsetCols.dragEnd}
              onReset={adsetCols.resetToDefault}
            />
          </div>
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="w-8 px-3 py-3" />
                  <SortableTh label="Nome" sortKey="name" activeKey={sortAdsets.key} dir={sortAdsets.dir} onSort={onSortAdsets} />
                  {adsetCols.orderedVisible.map((key) => (
                    <SortableTh
                      key={key}
                      label={ADSET_COLUMNS.find((c) => c.key === key)!.label}
                      sortKey={key}
                      activeKey={sortAdsets.key}
                      dir={sortAdsets.dir}
                      align={ADSET_ALIGN_LEFT.includes(key) ? "left" : "right"}
                      onSort={onSortAdsets}
                    />
                  ))}
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loadingAdsets && (
                  <tr>
                    <td colSpan={3 + adsetCols.orderedVisible.length} className="px-4 py-10 text-center text-[var(--text-muted)]">
                      Carregando conjuntos direto da Meta...
                    </td>
                  </tr>
                )}
                {!loadingAdsets && sortedAdsets.length === 0 && (
                  <tr>
                    <td colSpan={3 + adsetCols.orderedVisible.length} className="px-4 py-10 text-center text-[var(--text-muted)]">
                      Nenhum conjunto encontrado.
                    </td>
                  </tr>
                )}
                {sortedAdsets.map((adset) => {
                  const isBusy = busyIds.has(adset.id);
                  const locked = STATUS_LOCKED.has(adset.effective_status);
                  return (
                    <tr key={adset.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-muted)]">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={checkedAdsets.has(adset.id)}
                          onChange={() => toggleChecked(checkedAdsets, setCheckedAdsets, adset.id)}
                        />
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[var(--text)]">{adset.name}</td>
                      {adsetCols.orderedVisible.map((key) => (
                        <td key={key} className={`px-4 py-2.5 text-[var(--text-muted)] ${ADSET_ALIGN_LEFT.includes(key) ? "text-left" : "text-right"}`}>
                          {adsetCellRenderers[key](adset)}
                        </td>
                      ))}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            title={locked ? "Status trava edição — use duplicar" : adset.effective_status === "ACTIVE" ? "Pausar conjunto" : "Ativar conjunto"}
                            disabled={isBusy || locked}
                            onClick={() => toggleStatus(adset.id, adset.effective_status, (s) => setAdsetStatus(adset.id, s))}
                            className={ICON_BTN}
                          >
                            {adset.effective_status === "ACTIVE" ? <Pause size={12} /> : <Play size={12} />}
                          </button>
                          <button title="Duplicar conjunto" disabled={isBusy} onClick={() => duplicateAdset(adset)} className={ICON_BTN}>
                            <Copy size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {level === "ads" && (
        <div className="table-shell">
          <div className="flex items-center justify-start border-b border-[var(--border)] px-3 py-2">
            <ColumnManagerButton
              panelId="ads-mgr-ads-col-panel"
              columns={AD_COLUMNS}
              colOrder={adCols.colOrder}
              visibleCols={adCols.visibleCols}
              onToggle={adCols.toggle}
              onDragStart={adCols.dragStart}
              onDragOver={adCols.dragOver}
              onDragEnd={adCols.dragEnd}
              onReset={adCols.resetToDefault}
            />
          </div>
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border)]">
                  <SortableTh label="Nome" sortKey="name" activeKey={sortAds.key} dir={sortAds.dir} onSort={onSortAds} />
                  {adCols.orderedVisible.map((key) => (
                    <SortableTh
                      key={key}
                      label={AD_COLUMNS.find((c) => c.key === key)!.label}
                      sortKey={key}
                      activeKey={sortAds.key}
                      dir={sortAds.dir}
                      align={AD_ALIGN_LEFT.includes(key) ? "left" : "right"}
                      onSort={onSortAds}
                    />
                  ))}
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loadingAds && (
                  <tr>
                    <td colSpan={2 + adCols.orderedVisible.length} className="px-4 py-10 text-center text-[var(--text-muted)]">
                      Carregando anúncios direto da Meta...
                    </td>
                  </tr>
                )}
                {!loadingAds && sortedAds.length === 0 && (
                  <tr>
                    <td colSpan={2 + adCols.orderedVisible.length} className="px-4 py-10 text-center text-[var(--text-muted)]">
                      Nenhum anúncio encontrado.
                    </td>
                  </tr>
                )}
                {sortedAds.map((ad) => {
                  const isBusy = busyIds.has(ad.id);
                  const locked = STATUS_LOCKED.has(ad.effective_status);
                  return (
                    <tr key={ad.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-muted)]">
                      <td className="px-4 py-2.5 font-medium text-[var(--text)]">{ad.name}</td>
                      {adCols.orderedVisible.map((key) => (
                        <td key={key} className={`px-4 py-2.5 text-[var(--text-muted)] ${AD_ALIGN_LEFT.includes(key) ? "text-left" : "text-right"}`}>
                          {adCellRenderers[key](ad)}
                        </td>
                      ))}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            title={locked ? "Status trava edição" : ad.effective_status === "ACTIVE" ? "Pausar anúncio" : "Ativar anúncio"}
                            disabled={isBusy || locked}
                            onClick={() => toggleStatus(ad.id, ad.effective_status, (s) => setAdStatus(ad.id, s))}
                            className={ICON_BTN}
                          >
                            {ad.effective_status === "ACTIVE" ? <Pause size={12} /> : <Play size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
