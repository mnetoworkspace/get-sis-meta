"use client";

import { useEffect, useState } from "react";
import { CreditCard, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface Card {
  id: string;
  funding_source: string;
  currency: string | null;
  balance_cents: number;
  balance_set_at: string;
  low_balance_threshold_cents: number | null;
  current_balance_cents: number;
  spend_since_cents: number;
  accounts: string[];
}

interface Unregistered {
  funding_source: string;
  currency: string | null;
  accounts: string[];
}

interface CardsResponse {
  data: Card[];
  unregistered: Unregistered[];
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function ReloadForm({
  fundingSource,
  currency,
  defaultThreshold,
  onSaved,
  onCancel,
}: {
  fundingSource: string;
  currency: string | null;
  defaultThreshold?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [threshold, setThreshold] = useState(defaultThreshold ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (Number(amount) <= 0) {
      setError("Informe um valor de recarga maior que zero.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          funding_source: fundingSource,
          amount: Number(amount),
          currency,
          low_balance_threshold: threshold === "" ? null : Number(threshold),
          note: note || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
      {error && <p className="w-full text-xs text-[var(--danger)]">{error}</p>}
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Novo saldo ({currency || "moeda"})
        </label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input w-32"
          placeholder="1000"
          required
          autoFocus
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Avisar quando restar
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          className="input w-32"
          placeholder="opcional"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Nota
        </label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="input w-40" placeholder="opcional" />
      </div>
      <button disabled={busy} className="btn-primary py-1.5 px-3 text-xs">
        {busy ? "Salvando..." : "Salvar"}
      </button>
      <button type="button" onClick={onCancel} className="btn-secondary py-1.5 px-3 text-xs">
        Cancelar
      </button>
    </form>
  );
}

export default function CardsSection() {
  const [data, setData] = useState<CardsResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<string | null>(null);

  function load() {
    fetch("/api/cards")
      .then((r) => r.json())
      .then((json) => setData(json))
      .catch(() => setMessage("Falha ao carregar cartões."));
  }

  useEffect(() => {
    load();
  }, []);

  function onSaved() {
    setOpenForm(null);
    load();
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--text)]">
        <CreditCard size={15} className="text-[var(--accent)]" />
        Cartões
        <InfoTooltip>
          Saldo cadastrado manualmente (a Meta não expõe saldo de cartão via API) — funciona como uma
          carteira pré-paga: você informa o saldo quando recarrega, e o valor mostrado aqui vai
          descontando o gasto real sincronizado das contas que usam esse cartão, até a próxima recarga.
          Um cartão pode ser usado por várias contas ao mesmo tempo.
        </InfoTooltip>
      </h2>

      {message && <p className="mb-2 text-xs text-[var(--danger)]">{message}</p>}

      {!data ? (
        <p className="text-sm text-[var(--text-muted)]">Carregando...</p>
      ) : (
        <div className="space-y-2">
          {data.data.map((card) => {
            const isLow =
              card.low_balance_threshold_cents != null && card.current_balance_cents <= card.low_balance_threshold_cents;
            const isNegative = card.current_balance_cents < 0;
            return (
              <div key={card.id} className="soft-panel px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-[var(--text)]">
                      {card.funding_source}
                      {(isLow || isNegative) && (
                        <span className="ml-2 rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--danger)]">
                          {isNegative ? "saldo negativo" : "saldo baixo"}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {card.accounts.length > 0 ? card.accounts.join(", ") : "nenhuma conta ativa usando esse cartão"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      Recarregado em {formatDateTime(card.balance_set_at)} com{" "}
                      {formatCurrency(card.balance_cents / 100, card.currency)} · gastou{" "}
                      {formatCurrency(card.spend_since_cents / 100, card.currency)} desde então
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[11px] text-[var(--text-muted)]">Saldo estimado</p>
                      <p className={`text-lg font-semibold ${isLow || isNegative ? "text-[var(--danger)]" : "text-[var(--text)]"}`}>
                        {formatCurrency(card.current_balance_cents / 100, card.currency)}
                      </p>
                    </div>
                    <button
                      onClick={() => setOpenForm(openForm === card.funding_source ? null : card.funding_source)}
                      className="btn-secondary flex items-center gap-1 py-1.5 px-3 text-xs"
                    >
                      <RefreshCw size={12} />
                      Recarregar
                    </button>
                  </div>
                </div>
                {openForm === card.funding_source && (
                  <ReloadForm
                    fundingSource={card.funding_source}
                    currency={card.currency}
                    defaultThreshold={card.low_balance_threshold_cents != null ? String(card.low_balance_threshold_cents / 100) : ""}
                    onSaved={onSaved}
                    onCancel={() => setOpenForm(null)}
                  />
                )}
              </div>
            );
          })}

          {data.unregistered.map((u) => (
            <div key={u.funding_source} className="soft-panel px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-[var(--text)]">{u.funding_source}</p>
                  <p className="text-xs text-[var(--text-muted)]">{u.accounts.join(", ")}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--warning)]">Saldo ainda não cadastrado.</p>
                </div>
                <button
                  onClick={() => setOpenForm(openForm === u.funding_source ? null : u.funding_source)}
                  className="btn-primary py-1.5 px-3 text-xs"
                >
                  Configurar saldo
                </button>
              </div>
              {openForm === u.funding_source && (
                <ReloadForm fundingSource={u.funding_source} currency={u.currency} onSaved={onSaved} onCancel={() => setOpenForm(null)} />
              )}
            </div>
          ))}

          {data.data.length === 0 && data.unregistered.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">Nenhum cartão encontrado nas contas ativas ainda.</p>
          )}
        </div>
      )}
    </section>
  );
}
