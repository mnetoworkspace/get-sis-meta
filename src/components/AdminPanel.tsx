"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface BmRow {
  id: string;
  name: string;
  meta_credentials: { id: string; label: string | null; app_id: string | null }[];
  ad_accounts: { id: string }[];
}

interface AdAccountRow {
  id: string;
  bm_id: string;
  name: string;
  currency: string | null;
  status: string | null;
  business_managers?: { name: string } | null;
}

export default function AdminPanel() {
  const [bms, setBms] = useState<BmRow[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccountRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [bmForm, setBmForm] = useState({
    id: "",
    name: "",
    system_user_token: "",
    app_id: "",
    app_secret: "",
    label: "",
  });

  const [accountForm, setAccountForm] = useState({
    id: "",
    bm_id: "",
    name: "",
    currency: "",
  });

  async function loadAll() {
    const [bmsRes, accRes] = await Promise.all([
      fetch("/api/bms"),
      fetch("/api/ad-accounts"),
    ]);
    setBms((await bmsRes.json()).data || []);
    setAdAccounts((await accRes.json()).data || []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  async function submitBm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/bms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bmForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessage("BM e credencial salvos.");
      setBmForm({ id: "", name: "", system_user_token: "", app_id: "", app_secret: "", label: "" });
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }

  async function submitAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ad-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessage("Conta de anúncio salva.");
      setAccountForm({ id: "", bm_id: "", name: "", currency: "" });
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }

  async function importAccounts(bmId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ad-accounts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bm_id: bmId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessage(`Importadas ${json.imported} conta(s) automaticamente via Meta API.`);
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold">Gerenciar BMs e contas</h1>
          <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
            ← Voltar ao dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-6 space-y-8">
        {message && (
          <div className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm">
            {message}
          </div>
        )}

        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold">1. Adicionar Business Manager + token</h2>
          <form onSubmit={submitBm} className="grid grid-cols-2 gap-3">
            <input
              placeholder="BM ID"
              value={bmForm.id}
              onChange={(e) => setBmForm({ ...bmForm, id: e.target.value })}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              required
            />
            <input
              placeholder="Nome do BM"
              value={bmForm.name}
              onChange={(e) => setBmForm({ ...bmForm, name: e.target.value })}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              required
            />
            <input
              placeholder="System User Token"
              value={bmForm.system_user_token}
              onChange={(e) => setBmForm({ ...bmForm, system_user_token: e.target.value })}
              className="col-span-2 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              required
            />
            <input
              placeholder="App ID (opcional)"
              value={bmForm.app_id}
              onChange={(e) => setBmForm({ ...bmForm, app_id: e.target.value })}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <input
              placeholder="App Secret (opcional)"
              value={bmForm.app_secret}
              onChange={(e) => setBmForm({ ...bmForm, app_secret: e.target.value })}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              type="password"
            />
            <input
              placeholder="Label (opcional)"
              value={bmForm.label}
              onChange={(e) => setBmForm({ ...bmForm, label: e.target.value })}
              className="col-span-2 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <button
              disabled={busy}
              className="col-span-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              Salvar BM
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold">BMs cadastrados</h2>
          <ul className="space-y-2">
            {bms.map((bm) => (
              <li
                key={bm.id}
                className="flex items-center justify-between rounded-md border border-neutral-100 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{bm.name}</p>
                  <p className="text-xs text-neutral-500">
                    {bm.id} · {bm.meta_credentials.length > 0 ? "token configurado" : "sem token"} ·{" "}
                    {bm.ad_accounts.length} conta(s)
                  </p>
                </div>
                <button
                  onClick={() => importAccounts(bm.id)}
                  disabled={busy}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 disabled:opacity-50"
                >
                  Importar contas da Meta
                </button>
              </li>
            ))}
            {bms.length === 0 && (
              <p className="text-sm text-neutral-400">Nenhum BM cadastrado ainda.</p>
            )}
          </ul>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold">2. Adicionar conta de anúncio manualmente</h2>
          <form onSubmit={submitAccount} className="grid grid-cols-2 gap-3">
            <input
              placeholder="Ad Account ID (act_123... ou só o número)"
              value={accountForm.id}
              onChange={(e) => setAccountForm({ ...accountForm, id: e.target.value })}
              className="col-span-2 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              required
            />
            <select
              value={accountForm.bm_id}
              onChange={(e) => setAccountForm({ ...accountForm, bm_id: e.target.value })}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              required
            >
              <option value="">Selecione o BM</option>
              {bms.map((bm) => (
                <option key={bm.id} value={bm.id}>
                  {bm.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Nome da conta"
              value={accountForm.name}
              onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              required
            />
            <input
              placeholder="Moeda (ex: BRL, USD)"
              value={accountForm.currency}
              onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })}
              className="col-span-2 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <button
              disabled={busy}
              className="col-span-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              Salvar conta
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold">Contas de anúncio cadastradas</h2>
          <ul className="space-y-1">
            {adAccounts.map((acc) => (
              <li key={acc.id} className="flex justify-between text-sm">
                <span>{acc.name}</span>
                <span className="text-neutral-400">
                  {acc.id} · {acc.business_managers?.name || acc.bm_id} · {acc.currency || "-"}
                </span>
              </li>
            ))}
            {adAccounts.length === 0 && (
              <p className="text-sm text-neutral-400">Nenhuma conta cadastrada ainda.</p>
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
