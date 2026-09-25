"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Download, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";

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
  funding_source: string | null;
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
  const [editingBmId, setEditingBmId] = useState<string | null>(null);

  const [accountForm, setAccountForm] = useState({
    id: "",
    bm_id: "",
    name: "",
    currency: "",
  });
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

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
        body: JSON.stringify({ ...bmForm, is_edit: Boolean(editingBmId) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessage(editingBmId ? "BM atualizado." : "BM e credencial salvos.");
      cancelEditBm();
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }

  function editBm(bm: BmRow) {
    setEditingBmId(bm.id);
    setBmForm({
      id: bm.id,
      name: bm.name,
      system_user_token: "",
      app_id: bm.meta_credentials?.app_id || "",
      app_secret: "",
      label: bm.meta_credentials?.label || "",
    });
    setMessage(null);
  }

  function cancelEditBm() {
    setEditingBmId(null);
    setBmForm({ id: "", name: "", system_user_token: "", app_id: "", app_secret: "", label: "" });
  }

  async function deleteBm(bm: BmRow) {
    if (
      !confirm(
        `Remover o BM "${bm.name}"? Isso apaga também ${bm.ad_accounts.length} conta(s) de anúncio e todo o histórico de dados associado. Essa ação não pode ser desfeita.`,
      )
    )
      return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/bms/${bm.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessage("BM removido.");
      if (editingBmId === bm.id) cancelEditBm();
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
      setMessage(editingAccountId ? "Conta atualizada." : "Conta de anúncio salva.");
      cancelEditAccount();
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }

  function editAccount(acc: AdAccountRow) {
    setEditingAccountId(acc.id);
    setAccountForm({
      id: acc.id,
      bm_id: acc.bm_id,
      name: acc.name,
      currency: acc.currency || "",
    });
    setMessage(null);
  }

  function cancelEditAccount() {
    setEditingAccountId(null);
    setAccountForm({ id: "", bm_id: "", name: "", currency: "" });
  }

  async function deleteAccount(acc: AdAccountRow) {
    if (
      !confirm(
        `Remover a conta "${acc.name}"? Isso apaga todo o histórico de gastos, tráfego e depósitos associado a ela. Essa ação não pode ser desfeita.`,
      )
    )
      return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/ad-accounts/${acc.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessage("Conta removida.");
      if (editingAccountId === acc.id) cancelEditAccount();
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
        <div className="page-shell max-w-3xl flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo-rakebet-icon.png" alt="Rakebet" width={32} height={32} className="rounded-lg" />
            <h1 className="text-lg font-semibold text-[var(--text)]">Gerenciar BMs e contas</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Voltar ao dashboard</span>
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="page-shell max-w-3xl px-4 py-6 sm:px-6 space-y-6">
        {message && <div className="soft-panel px-4 py-2 text-sm text-[var(--text)]">{message}</div>}

        <section className="card p-5">
          <h2 className="mb-4 flex items-center justify-between text-sm font-semibold text-[var(--text)]">
            <span>1. {editingBmId ? "Editar Business Manager" : "Adicionar Business Manager + token"}</span>
            {editingBmId && (
              <button
                type="button"
                onClick={cancelEditBm}
                className="flex items-center gap-1 text-xs font-normal text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X size={12} />
                Cancelar edição
              </button>
            )}
          </h2>
          <form onSubmit={submitBm} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              placeholder="BM ID"
              value={bmForm.id}
              onChange={(e) => setBmForm({ ...bmForm, id: e.target.value })}
              className="input disabled:opacity-60"
              required
              disabled={Boolean(editingBmId)}
            />
            <input
              placeholder="Nome do BM"
              value={bmForm.name}
              onChange={(e) => setBmForm({ ...bmForm, name: e.target.value })}
              className="input"
              required
            />
            <input
              placeholder={editingBmId ? "System User Token (deixe em branco para manter o atual)" : "System User Token"}
              value={bmForm.system_user_token}
              onChange={(e) => setBmForm({ ...bmForm, system_user_token: e.target.value })}
              className="input col-span-2"
              required={!editingBmId}
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
              {editingBmId ? "Salvar alterações" : "Salvar BM"}
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text)]">BMs cadastrados</h2>
          <ul className="space-y-2">
            {bms.map((bm) => (
              <li
                key={bm.id}
                className="flex flex-col gap-2 soft-panel px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[var(--text)]">{bm.name}</p>
                  <p className="text-xs text-[var(--text-muted)] break-all">
                    {bm.id} · {bm.meta_credentials ? "token configurado" : "sem token"} ·{" "}
                    {bm.ad_accounts.length} conta(s)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => importAccounts(bm.id)}
                    disabled={busy}
                    className="btn-secondary flex items-center gap-1.5 py-1.5 px-3 text-xs"
                  >
                    <Download size={12} />
                    Importar contas da Meta
                  </button>
                  <button
                    onClick={() => editBm(bm)}
                    disabled={busy}
                    title="Editar"
                    className="btn-secondary flex items-center gap-1 py-1.5 px-2.5 text-xs"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => deleteBm(bm)}
                    disabled={busy}
                    title="Remover"
                    className="btn-secondary flex items-center gap-1 py-1.5 px-2.5 text-xs text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
            {bms.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">Nenhum BM cadastrado ainda.</p>
            )}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 flex items-center justify-between text-sm font-semibold text-[var(--text)]">
            <span>2. {editingAccountId ? "Editar conta de anúncio" : "Adicionar conta de anúncio manualmente"}</span>
            {editingAccountId && (
              <button
                type="button"
                onClick={cancelEditAccount}
                className="flex items-center gap-1 text-xs font-normal text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X size={12} />
                Cancelar edição
              </button>
            )}
          </h2>
          <form onSubmit={submitAccount} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              placeholder="Ad Account ID (act_123... ou só o número)"
              value={accountForm.id}
              onChange={(e) => setAccountForm({ ...accountForm, id: e.target.value })}
              className="input col-span-2 disabled:opacity-60"
              required
              disabled={Boolean(editingAccountId)}
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
              {editingAccountId ? "Salvar alterações" : "Salvar conta"}
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text)]">Contas de anúncio cadastradas</h2>
          <ul className="space-y-1.5">
            {adAccounts.map((acc) => (
              <li
                key={acc.id}
                className="flex flex-col gap-1.5 border-b border-[var(--border)] pb-2 text-sm last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:border-0 sm:pb-0"
              >
                <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 sm:justify-start">
                  <span className="text-[var(--text)]">{acc.name}</span>
                  <span className="text-xs text-[var(--text-muted)] break-all sm:text-sm">
                    {acc.id} · {acc.business_managers?.name || acc.bm_id} · {acc.currency || "-"} ·{" "}
                    {acc.funding_source || "sem cartão"}
                  </span>
                </div>
                <div className="flex items-center gap-1 self-end sm:self-auto">
                  <button
                    onClick={() => editAccount(acc)}
                    disabled={busy}
                    title="Editar"
                    className="btn-secondary flex items-center gap-1 py-1 px-2 text-xs"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => deleteAccount(acc)}
                    disabled={busy}
                    title="Remover"
                    className="btn-secondary flex items-center gap-1 py-1 px-2 text-xs text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
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
