"use client";

import { Copy, Pause, Play, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";

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
  spend_today: number;
  purchases_today: number;
}

interface AdSetRow {
  id: string;
  name: string;
  campaign_id: string;
  effective_status: string;
  daily_budget: string | null;
  lifetime_budget: string | null;
  spend_today: number;
  purchases_today: number;
}

interface AdRow {
  id: string;
  name: string;
  adset_id: string;
  effective_status: string;
  spend_today: number;
  purchases_today: number;
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
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-amber-500/15 text-amber-500";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>{status}</span>;
}

function budgetLabel(dailyBudget: string | null, lifetimeBudget: string | null, currency: string | null): string {
  if (dailyBudget) return `${formatCurrency(Number(dailyBudget) / 100, currency)}/dia`;
  if (lifetimeBudget) return `${formatCurrency(Number(lifetimeBudget) / 100, currency)} total`;
  return "orçamento da campanha (CBO)";
}

function costPerPurchase(spend: number, purchases: number, currency: string | null): string {
  if (!purchases) return "—";
  return formatCurrency(spend / purchases, currency);
}

const ICON_BTN =
  "flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:opacity-50";

export function AdsManagerTab({ accounts }: { accounts: AdAccountOption[] }) {
  const [accountId, setAccountId] = useState("");
  const [level, setLevel] = useState<Level>("campaigns");

  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [checkedCampaigns, setCheckedCampaigns] = useState<Set<string>>(new Set());

  const [adsets, setAdsets] = useState<AdSetRow[] | null>(null);
  const [loadingAdsets, setLoadingAdsets] = useState(false);
  const [checkedAdsets, setCheckedAdsets] = useState<Set<string>>(new Set());

  const [ads, setAds] = useState<AdRow[] | null>(null);
  const [loadingAds, setLoadingAds] = useState(false);

  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;
  const currency = selectedAccount?.currency ?? null;

  useEffect(() => {
    if (accounts.length > 0 && !accountId) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  function loadCampaigns() {
    if (!accountId) return;
    setLoadingCampaigns(true);
    setError(null);
    fetch(`/api/meta/accounts/${accountId}/campaigns`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setCampaigns(json.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar campanhas."))
      .finally(() => setLoadingCampaigns(false));
  }

  function loadAdsets() {
    if (!accountId) return;
    setLoadingAdsets(true);
    setError(null);
    const qs = checkedCampaigns.size > 0 ? `?campaignIds=${Array.from(checkedCampaigns).join(",")}` : "";
    fetch(`/api/meta/accounts/${accountId}/adsets${qs}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setAdsets(json.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar conjuntos."))
      .finally(() => setLoadingAdsets(false));
  }

  function loadAds() {
    if (!accountId) return;
    setLoadingAds(true);
    setError(null);
    const qs = checkedAdsets.size > 0 ? `?adsetIds=${Array.from(checkedAdsets).join(",")}` : "";
    fetch(`/api/meta/accounts/${accountId}/ads${qs}`)
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
    setLevel("campaigns");
    setMessage(null);
    loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

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

      {level === "adsets" && (
        <p className="text-xs text-[var(--text-muted)]">
          {checkedCampaigns.size > 0 ? (
            <>
              Mostrando conjuntos de {checkedCampaigns.size} campanha(s) selecionada(s).{" "}
              <button
                onClick={() => { setCheckedCampaigns(new Set()); loadAdsets(); }}
                className="inline-flex items-center gap-1 underline hover:text-[var(--text)]"
              >
                <X size={10} /> limpar filtro
              </button>
            </>
          ) : (
            "Mostrando todos os conjuntos da conta (marque campanhas na aba Campanhas pra filtrar)."
          )}
        </p>
      )}
      {level === "ads" && (
        <p className="text-xs text-[var(--text-muted)]">
          {checkedAdsets.size > 0 ? (
            <>
              Mostrando anúncios de {checkedAdsets.size} conjunto(s) selecionado(s).{" "}
              <button
                onClick={() => { setCheckedAdsets(new Set()); loadAds(); }}
                className="inline-flex items-center gap-1 underline hover:text-[var(--text)]"
              >
                <X size={10} /> limpar filtro
              </button>
            </>
          ) : (
            "Mostrando todos os anúncios da conta (marque conjuntos na aba Conjuntos de anúncio pra filtrar)."
          )}
        </p>
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

      <section className="card divide-y divide-[var(--border)] p-0">
        {level === "campaigns" && (
          <>
            {loadingCampaigns && <p className="p-5 text-sm text-[var(--text-muted)]">Carregando campanhas direto da Meta...</p>}
            {!loadingCampaigns && campaigns?.length === 0 && (
              <p className="p-5 text-sm text-[var(--text-muted)]">Nenhuma campanha ativa ou pausada encontrada nessa conta.</p>
            )}
            {campaigns?.map((campaign) => {
              const isBusy = busyIds.has(campaign.id);
              return (
                <div key={campaign.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex min-w-0 flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checkedCampaigns.has(campaign.id)}
                      onChange={() => toggleChecked(checkedCampaigns, setCheckedCampaigns, campaign.id)}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text)]">{campaign.name}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        {campaign.objective} · {budgetLabel(campaign.daily_budget, campaign.lifetime_budget, currency)}
                      </p>
                    </div>
                  </label>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right text-xs text-[var(--text-muted)]">
                      <p className="text-[var(--text)]">{formatCurrency(campaign.spend_today, currency)} hoje</p>
                      <p>
                        {campaign.purchases_today} compra(s) · {costPerPurchase(campaign.spend_today, campaign.purchases_today, currency)}/compra
                      </p>
                    </div>
                    <StatusBadge status={campaign.effective_status} />
                    <button
                      title={campaign.effective_status === "ACTIVE" ? "Pausar campanha" : "Ativar campanha"}
                      disabled={isBusy}
                      onClick={() => toggleStatus(campaign.id, campaign.effective_status, (s) => setCampaignStatus(campaign.id, s))}
                      className={ICON_BTN}
                    >
                      {campaign.effective_status === "ACTIVE" ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button title="Duplicar campanha" disabled={isBusy} onClick={() => duplicateCampaign(campaign)} className={ICON_BTN}>
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {level === "adsets" && (
          <>
            {loadingAdsets && <p className="p-5 text-sm text-[var(--text-muted)]">Carregando conjuntos direto da Meta...</p>}
            {!loadingAdsets && adsets?.length === 0 && (
              <p className="p-5 text-sm text-[var(--text-muted)]">Nenhum conjunto ativo/pausado encontrado.</p>
            )}
            {adsets?.map((adset) => {
              const isBusy = busyIds.has(adset.id);
              return (
                <div key={adset.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex min-w-0 flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checkedAdsets.has(adset.id)}
                      onChange={() => toggleChecked(checkedAdsets, setCheckedAdsets, adset.id)}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--text)]">{adset.name}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        {budgetLabel(adset.daily_budget, adset.lifetime_budget, currency)}
                      </p>
                    </div>
                  </label>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right text-xs text-[var(--text-muted)]">
                      <p className="text-[var(--text)]">{formatCurrency(adset.spend_today, currency)} hoje</p>
                      <p>
                        {adset.purchases_today} compra(s) · {costPerPurchase(adset.spend_today, adset.purchases_today, currency)}/compra
                      </p>
                    </div>
                    <StatusBadge status={adset.effective_status} />
                    <button
                      title={adset.effective_status === "ACTIVE" ? "Pausar conjunto" : "Ativar conjunto"}
                      disabled={isBusy}
                      onClick={() => toggleStatus(adset.id, adset.effective_status, (s) => setAdsetStatus(adset.id, s))}
                      className={ICON_BTN}
                    >
                      {adset.effective_status === "ACTIVE" ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                    <button title="Duplicar conjunto" disabled={isBusy} onClick={() => duplicateAdset(adset)} className={ICON_BTN}>
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {level === "ads" && (
          <>
            {loadingAds && <p className="p-5 text-sm text-[var(--text-muted)]">Carregando anúncios direto da Meta...</p>}
            {!loadingAds && ads?.length === 0 && (
              <p className="p-5 text-sm text-[var(--text-muted)]">Nenhum anúncio ativo/pausado encontrado.</p>
            )}
            {ads?.map((ad) => {
              const isBusy = busyIds.has(ad.id);
              return (
                <div key={ad.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">{ad.name}</p>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right text-xs text-[var(--text-muted)]">
                      <p className="text-[var(--text)]">{formatCurrency(ad.spend_today, currency)} hoje</p>
                      <p>{ad.purchases_today} compra(s)</p>
                    </div>
                    <StatusBadge status={ad.effective_status} />
                    <button
                      title={ad.effective_status === "ACTIVE" ? "Pausar anúncio" : "Ativar anúncio"}
                      disabled={isBusy}
                      onClick={() => toggleStatus(ad.id, ad.effective_status, (s) => setAdStatus(ad.id, s))}
                      className={ICON_BTN}
                    >
                      {ad.effective_status === "ACTIVE" ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </section>
    </div>
  );
}
