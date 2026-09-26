"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, PlayCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { QuickDateRange } from "@/components/ui/quick-date-range";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { daysAgoISO, formatCurrency, todayISO } from "@/lib/format";

interface StatusAccount {
  id: string;
  name: string;
  status: string | null;
  is_active: boolean;
  currency: string | null;
  funding_source: string | null;
  spend: number;
}

// Cópia local do mapa de src/lib/meta.ts — esse arquivo é client-side e
// puxar lib/meta.ts inteiro (que faz chamadas à Graph API) só pra pegar
// esses rótulos infla o bundle à toa.
const STATUS_DESCRIPTIONS: Record<string, string> = {
  DISABLED: "Desabilitada pela Meta — geralmente por violação de política.",
  UNSETTLED: "Falha de pagamento — a cobrança não foi processada.",
  PENDING_RISK_REVIEW: "Em revisão de risco pela Meta.",
  PENDING_SETTLEMENT: "Pagamento pendente de processamento.",
  IN_GRACE_PERIOD: "Em período de carência, normalmente após falha de pagamento.",
  PENDING_CLOSURE: "Em processo de fechamento.",
  CLOSED: "Fechada.",
};

interface StatusBm {
  id: string;
  name: string;
  is_active: boolean;
  meta_status: string | null;
  meta_status_detail: string | null;
  status_checked_at: string | null;
  ad_accounts: StatusAccount[];
}

function formatCheckedAt(value: string | null): string {
  if (!value) return "nunca verificado";
  return new Date(value).toLocaleString("pt-BR");
}

function BmBadge({ bm }: { bm: StatusBm }) {
  if (!bm.meta_status) {
    return <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]">Não verificado</span>;
  }
  if (bm.meta_status === "ACTIVE") {
    return <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-500">BM ativa</span>;
  }
  return <span className="rounded-full bg-[var(--danger-soft)] px-2.5 py-1 text-xs font-medium text-[var(--danger)]">Possível bloqueio</span>;
}

function AccountBadge({ account }: { account: StatusAccount }) {
  const status = account.status;
  if (!status) {
    return <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">—</span>;
  }
  const isActive = status === "ACTIVE";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        isActive ? "bg-emerald-500/15 text-emerald-500" : "bg-[var(--danger-soft)] text-[var(--danger)]"
      }`}
    >
      {status}
    </span>
  );
}

export default function StatusPanel() {
  const [bms, setBms] = useState<StatusBm[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [since, setSince] = useState(daysAgoISO(30));
  const [until, setUntil] = useState(todayISO());

  useEffect(() => {
    const params = new URLSearchParams({ since, until });
    fetch(`/api/status?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => setBms(json.data))
      .catch(() => setMessage("Falha ao carregar status."));
  }, [since, until]);

  async function runCheckNow() {
    setChecking(true);
    setMessage(null);
    try {
      const res = await fetch("/api/account-status/run", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao verificar");
      setMessage("Verificação concluída.");
      const params = new URLSearchParams({ since, until });
      const statusRes = await fetch(`/api/status?${params.toString()}`);
      const statusJson = await statusRes.json();
      if (statusRes.ok) setBms(statusJson.data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao verificar");
    } finally {
      setChecking(false);
    }
  }

  const totalAccounts = bms?.reduce((sum, bm) => sum + bm.ad_accounts.length, 0) ?? 0;
  const problemAccounts =
    bms?.reduce((sum, bm) => sum + bm.ad_accounts.filter((a) => a.status && a.status !== "ACTIVE").length, 0) ?? 0;
  const problemBms = bms?.filter((bm) => bm.meta_status === "ERROR").length ?? 0;
  const spendByCurrency = new Map<string, number>();
  for (const bm of bms ?? []) {
    for (const acc of bm.ad_accounts) {
      const currency = acc.currency || "—";
      spendByCurrency.set(currency, (spendByCurrency.get(currency) || 0) + acc.spend);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/80 backdrop-blur">
        <div className="page-shell max-w-4xl flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo-rakebet-icon.png" alt="Rakebet" width={32} height={32} className="rounded-lg" />
            <h1 className="text-lg font-semibold text-[var(--text)]">Status de contas e BMs</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-sm font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] sm:px-3.5"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Voltar ao dashboard</span>
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="page-shell max-w-4xl px-4 py-6 sm:px-6 space-y-6">
        {message && <div className="soft-panel px-4 py-2 text-sm text-[var(--text)]">{message}</div>}

        <div className="flex flex-col gap-3 soft-panel px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span>Status das contas e BMs</span>
            <InfoTooltip>
              Status verificado direto na Meta pela checagem automática (a cada 5 minutos) — BM inteira e cada
              conta individualmente. Uma BM com problema geralmente derruba todas as contas dela de uma vez.
            </InfoTooltip>
          </div>
          <button
            onClick={runCheckNow}
            disabled={checking}
            className="btn-secondary flex shrink-0 items-center justify-center gap-1.5 py-1.5 px-3 text-xs"
          >
            <PlayCircle size={13} className={checking ? "animate-spin" : ""} />
            {checking ? "Verificando..." : "Verificar agora"}
          </button>
        </div>

        <QuickDateRange since={since} until={until} onChange={(s, u) => { setSince(s); setUntil(u); }} />

        {bms && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="card p-4">
              <p className="text-xs text-[var(--text-muted)]">BMs cadastradas</p>
              <p className="text-2xl font-semibold text-[var(--text)]">{bms.length}</p>
              {problemBms > 0 && <p className="mt-1 text-xs text-[var(--danger)]">{problemBms} com problema</p>}
            </div>
            <div className="card p-4">
              <p className="text-xs text-[var(--text-muted)]">Contas de anúncio</p>
              <p className="text-2xl font-semibold text-[var(--text)]">{totalAccounts}</p>
              {problemAccounts > 0 && <p className="mt-1 text-xs text-[var(--danger)]">{problemAccounts} fora do ativo</p>}
            </div>
            <div className="card p-4">
              <p className="text-xs text-[var(--text-muted)]">Gasto no período</p>
              {spendByCurrency.size === 0 ? (
                <p className="text-2xl font-semibold text-[var(--text)]">—</p>
              ) : (
                Array.from(spendByCurrency.entries()).map(([currency, amount]) => (
                  <p key={currency} className="text-lg font-semibold text-[var(--text)]">
                    {formatCurrency(amount, currency === "—" ? undefined : currency)}
                  </p>
                ))
              )}
            </div>
            <div className="card p-4">
              <p className="text-xs text-[var(--text-muted)]">Última verificação</p>
              <p className="text-sm font-medium text-[var(--text)]">
                {formatCheckedAt(bms.find((bm) => bm.status_checked_at)?.status_checked_at ?? null)}
              </p>
            </div>
          </div>
        )}

        {!bms ? (
          <p className="text-sm text-[var(--text-muted)]">Carregando...</p>
        ) : (
          <div className="space-y-4">
            {bms.map((bm) => (
              <section key={bm.id} className="card p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-[var(--text)]">{bm.name}</h2>
                      <BmBadge bm={bm} />
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      Verificado em {formatCheckedAt(bm.status_checked_at)}
                    </p>
                    {bm.meta_status === "ERROR" && bm.meta_status_detail && (
                      <p className="mt-1 text-xs text-[var(--danger)]">{bm.meta_status_detail}</p>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-[var(--border)]">
                  {bm.ad_accounts.length === 0 && (
                    <p className="py-2 text-xs text-[var(--text-muted)]">Nenhuma conta cadastrada.</p>
                  )}
                  {bm.ad_accounts.map((account) => {
                    const description = account.status ? STATUS_DESCRIPTIONS[account.status] : null;
                    return (
                      <div key={account.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span className="text-[var(--text)]">
                          {account.name}
                          {!account.is_active && <span className="ml-2 text-xs text-[var(--text-muted)]">(inativa no painel)</span>}
                          <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                            {formatCurrency(account.spend, account.currency ?? undefined)} no período
                            {" · "}
                            {account.funding_source || "sem cartão cadastrado"}
                          </span>
                          {description && <span className="mt-0.5 block text-xs text-[var(--danger)]">{description}</span>}
                        </span>
                        <AccountBadge account={account} />
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
