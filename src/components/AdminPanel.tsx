"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { useEffect, useState } from "react";

interface BmRow {
  id: string;
  name: string;
  meta_credentials: { id: string; label: string | null; app_id: string | null } | null;
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
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/80 backdrop-blur">
        <div className="page-shell max-w-3xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Image src="/logo-rakebet-icon.png" alt="Rakebet" width={32} height={32} className="rounded-lg" />
            <h1 className="text-lg font-semibold text-[var(--text)]">Gerenciar BMs e contas</h1>
          </div>
          <Link href="/" className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
            <ArrowLeft size={14} />
            Voltar ao dashboard
          </Link>
        </div>
      </header>

      <main className="page-shell max-w-3xl px-6 py-6 space-y-6">
        {message && <div className="soft-panel px-4 py-2 text-sm text-[var(--text)]">{message}</div>}

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text)]">1. Adicionar Business Manager + token</h2>
          <form onSubmit={submitBm} className="grid grid-cols-2 gap-3">
            <input
              placeholder="BM ID"
              value={bmForm.id}
              onChange={(e) => setBmForm({ ...bmForm, id: e.target.value })}
              className="input"
              required
            />
            <input
              placeholder="Nome do BM"
              value={bmForm.name}
              onChange={(e) => setBmForm({ ...bmForm, name: e.target.value })}
              className="input"
              required
            />
            <input
              placeholder="System User Token"
              value={bmForm.system_user_token}
              onChange={(e) => setBmForm({ ...bmForm, system_user_token: e.target.value })}
              className="input col-span-2"
              required
            />
            <input
              placeholder="App ID (opcional)"
              value={bmForm.app_id}
              onChange={(e) => setBmForm({ ...bmForm, app_id: e.target.value })}
              className="input"
            />
            <input
              placeholder="App Secret (opcional)"
              value={bmForm.app_secret}
              onChange={(e) => setBmForm({ ...bmForm, app_secret: e.target.value })}
              className="input"
              type="password"
            />
            <input
              placeholder="Label (opcional)"
              value={bmForm.label}
              onChange={(e) => setBmForm({ ...bmForm, label: e.target.value })}
              className="input col-span-2"
            />
            <button disabled={busy} className="btn-primary col-span-2">
              Salvar BM
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text)]">BMs cadastrados</h2>
          <ul className="space-y-2">
            {bms.map((bm) => (
              <li
                key={bm.id}
                className="flex items-center justify-between soft-panel px-3 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium text-[var(--text)]">{bm.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {bm.id} · {bm.meta_credentials ? "token configurado" : "sem token"} ·{" "}
                    {bm.ad_accounts.length} conta(s)
                  </p>
                </div>
                <button
                  onClick={() => importAccounts(bm.id)}
                  disabled={busy}
                  className="btn-secondary flex items-center gap-1.5 py-1.5 px-3 text-xs"
                >
                  <Download size={12} />
                  Importar contas da Meta
                </button>
              </li>
            ))}
            {bms.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">Nenhum BM cadastrado ainda.</p>
            )}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text)]">2. Adicionar conta de anúncio manualmente</h2>
          <form onSubmit={submitAccount} className="grid grid-cols-2 gap-3">
            <input
              placeholder="Ad Account ID (act_123... ou só o número)"
              value={accountForm.id}
              onChange={(e) => setAccountForm({ ...accountForm, id: e.target.value })}
              className="input col-span-2"
              required
            />
            <select
              value={accountForm.bm_id}
              onChange={(e) => setAccountForm({ ...accountForm, bm_id: e.target.value })}
              className="input"
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
              className="input"
              required
            />
            <input
              placeholder="Moeda (ex: BRL, USD)"
              value={accountForm.currency}
              onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })}
              className="input col-span-2"
            />
            <button disabled={busy} className="btn-primary col-span-2">
              Salvar conta
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text)]">Contas de anúncio cadastradas</h2>
          <ul className="space-y-1.5">
            {adAccounts.map((acc) => (
              <li key={acc.id} className="flex justify-between text-sm">
                <span className="text-[var(--text)]">{acc.name}</span>
                <span className="text-[var(--text-muted)]">
                  {acc.id} · {acc.business_managers?.name || acc.bm_id} · {acc.currency || "-"}
                </span>
              </li>
            ))}
            {adAccounts.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">Nenhuma conta cadastrada ainda.</p>
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
