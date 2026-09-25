"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Pencil, PlayCircle, Trash2, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { ConditionGroupEditor } from "@/components/automation/condition-group-editor";
import {
  ACTION_OPTIONS,
  actionLabel,
  describeGroup,
  emptyConditionGroup,
  isBudgetAction,
  type BudgetAdjustmentType,
  type RuleAction,
  type RuleConditionGroup,
} from "@/lib/automation/rule-types";

interface BmOption {
  id: string;
  name: string;
}

type Scope = "campaign" | "adset" | "ad";

interface RuleRow {
  id: string;
  name: string;
  scope: Scope;
  action: RuleAction;
  time_window: "today" | "lifetime";
  rules: RuleConditionGroup;
  budget_adjustment_type: BudgetAdjustmentType | null;
  budget_adjustment_value: number | null;
  bm_ids: string[];
  is_active: boolean;
}

const SCOPE_LABEL: Record<Scope, string> = {
  campaign: "Campanha",
  adset: "Conjunto de anúncios",
  ad: "Anúncio",
};

function emptyForm() {
  return {
    name: "",
    scope: "adset" as Scope,
    action: "pause" as RuleAction,
    time_window: "today" as "today" | "lifetime",
    bm_ids: [] as string[],
    is_active: true,
    rules: emptyConditionGroup(),
    budget_adjustment_type: "percentage" as BudgetAdjustmentType,
    budget_adjustment_value: "",
  };
}

export default function RulesPanel() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [bms, setBms] = useState<BmOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function runCheckNow() {
    setChecking(true);
    setMessage(null);
    try {
      const res = await fetch("/api/automation-rules/run", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const { rulesEvaluated, accountsChecked, objectsActioned, errors } = json as {
        rulesEvaluated: number;
        accountsChecked: number;
        objectsActioned: number;
        errors: string[];
      };
      setMessage(
        `Checagem concluída: ${rulesEvaluated} regra(s), ${accountsChecked} conta(s), ${objectsActioned} objeto(s) alterado(s)` +
          (errors.length > 0 ? ` — ${errors.length} erro(s): ${errors[0]}` : "."),
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setChecking(false);
    }
  }

  async function loadAll() {
    const [rulesRes, bmsRes] = await Promise.all([fetch("/api/automation-rules"), fetch("/api/bms")]);
    setRules((await rulesRes.json()).data || []);
    const bmData = (await bmsRes.json()).data || [];
    setBms(bmData.map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  function toggleBm(id: string) {
    setForm((f) => ({
      ...f,
      bm_ids: f.bm_ids.includes(id) ? f.bm_ids.filter((x) => x !== id) : [...f.bm_ids, id],
    }));
  }

  function editRule(rule: RuleRow) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      scope: rule.scope,
      action: rule.action,
      time_window: rule.time_window,
      bm_ids: rule.bm_ids,
      is_active: rule.is_active,
      rules: rule.rules ?? emptyConditionGroup(),
      budget_adjustment_type: rule.budget_adjustment_type ?? "percentage",
      budget_adjustment_value: rule.budget_adjustment_value != null ? String(rule.budget_adjustment_value) : "",
    });
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const validConditions = form.rules.conditions.filter((c) => c.value.trim() !== "");
    if (validConditions.length === 0) {
      setMessage("Adicione pelo menos uma condição com valor preenchido.");
      return;
    }
    if (isBudgetAction(form.action) && Number(form.budget_adjustment_value) <= 0) {
      setMessage("Informe um valor de ajuste de orçamento maior que zero.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(editingId ? `/api/automation-rules/${editingId}` : "/api/automation-rules", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, rules: { ...form.rules, conditions: validConditions } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessage(editingId ? "Regra atualizada." : "Regra criada.");
      cancelEdit();
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(rule: RuleRow) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/automation-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !rule.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRule(rule: RuleRow) {
    if (!confirm(`Remover a regra "${rule.name}"? Essa ação não pode ser desfeita.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/automation-rules/${rule.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessage("Regra removida.");
      if (editingId === rule.id) cancelEdit();
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }

  function bmScopeLabel(bmIds: string[]) {
    if (bmIds.length === 0) return "Todos os BMs";
    const names = bmIds.map((id) => bms.find((b) => b.id === id)?.name || id);
    return names.join(", ");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/80 backdrop-blur">
        <div className="page-shell max-w-3xl flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo-rakebet-icon.png" alt="Rakebet" width={32} height={32} className="rounded-lg" />
            <h1 className="text-lg font-semibold text-[var(--text)]">Regras de automação</h1>
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

      <main className="page-shell max-w-3xl px-4 py-6 sm:px-6 space-y-6">
        {message && <div className="soft-panel px-4 py-2 text-sm text-[var(--text)]">{message}</div>}

        <div className="flex flex-col gap-3 soft-panel px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            Cada regra escolhe um nível (campanha, conjunto ou anúncio), uma ou mais condições (gasto,
            FTD, custo/FTD, resultados, custo/resultado) e uma ação (pausar ou ativar). A checagem roda
            sozinha no ciclo automático do sistema (a cada 5 minutos por padrão), mas dá pra forçar uma
            checagem na hora sem esperar.
          </p>
          <button
            onClick={runCheckNow}
            disabled={checking}
            className="btn-secondary flex shrink-0 items-center justify-center gap-1.5 py-1.5 px-3 text-xs"
          >
            <PlayCircle size={13} className={checking ? "animate-spin" : ""} />
            {checking ? "Checando..." : "Checar agora"}
          </button>
        </div>

        <section className="card p-5">
          <h2 className="mb-4 flex items-center justify-between text-sm font-semibold text-[var(--text)]">
            <span>{editingId ? "Editar regra" : "Nova regra"}</span>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="flex items-center gap-1 text-xs font-normal text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X size={12} />
                Cancelar edição
              </button>
            )}
          </h2>
          <form onSubmit={submit} className="space-y-3">
            <input
              placeholder="Nome da regra (ex: Pausar conjunto sem FTD)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input w-full"
              required
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Nível
                </label>
                <select
                  value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value as Scope })}
                  className="input w-full"
                >
                  <option value="campaign">Campanha</option>
                  <option value="adset">Conjunto de anúncios</option>
                  <option value="ad">Anúncio</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Ação
                </label>
                <select
                  value={form.action}
                  onChange={(e) => setForm({ ...form, action: e.target.value as RuleAction })}
                  className="input w-full"
                >
                  {ACTION_OPTIONS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Janela
                </label>
                <select
                  value={form.time_window}
                  onChange={(e) => setForm({ ...form, time_window: e.target.value as "today" | "lifetime" })}
                  className="input w-full"
                >
                  <option value="today">Só hoje (reseta todo dia)</option>
                  <option value="lifetime">Acumulado desde sempre</option>
                </select>
              </div>
            </div>

            {isBudgetAction(form.action) && form.scope === "ad" && (
              <p className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--warning)]">
                Anúncio não tem orçamento próprio na Meta (o orçamento fica na campanha ou no conjunto) — essa
                regra não vai encontrar nada pra ajustar. Escolha nível Campanha ou Conjunto.
              </p>
            )}

            {isBudgetAction(form.action) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Ajustar em
                  </label>
                  <select
                    value={form.budget_adjustment_type}
                    onChange={(e) =>
                      setForm({ ...form, budget_adjustment_type: e.target.value as BudgetAdjustmentType })
                    }
                    className="input w-full"
                  >
                    <option value="percentage">Porcentagem (%)</option>
                    <option value="fixed">Valor fixo (R$)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Valor {form.budget_adjustment_type === "percentage" ? "(%)" : "(R$)"}
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder={form.budget_adjustment_type === "percentage" ? "20" : "50"}
                    value={form.budget_adjustment_value}
                    onChange={(e) => setForm({ ...form, budget_adjustment_value: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Condições
              </label>
              <ConditionGroupEditor group={form.rules} onChange={(rules) => setForm({ ...form, rules })} />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Aplicar em quais BMs
              </label>
              <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-xl border border-[var(--border)] p-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, bm_ids: [] })}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                    form.bm_ids.length === 0 ? "text-[var(--accent)]" : "text-[var(--text)]"
                  } hover:bg-[var(--surface-muted)]`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                      form.bm_ids.length === 0 ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)]"
                    }`}
                  >
                    {form.bm_ids.length === 0 && <Check size={10} className="text-white" />}
                  </span>
                  Todos os BMs
                </button>
                {bms.map((bm) => {
                  const on = form.bm_ids.includes(bm.id);
                  return (
                    <button
                      key={bm.id}
                      type="button"
                      onClick={() => toggleBm(bm.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-muted)]"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                          on ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)]"
                        }`}
                      >
                        {on && <Check size={10} className="text-white" />}
                      </span>
                      {bm.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Regra ativa
            </label>

            <button disabled={busy} className="btn-primary w-full">
              {editingId ? "Salvar alterações" : "Criar regra"}
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text)]">Regras cadastradas</h2>
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-col gap-2 soft-panel px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium text-[var(--text)]">
                    <Zap size={13} className={rule.is_active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"} />
                    {rule.name}
                    {!rule.is_active && <span className="text-xs font-normal text-[var(--text-muted)]">(inativa)</span>}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {actionLabel(rule.action)}
                    {isBudgetAction(rule.action) && rule.budget_adjustment_value != null && (
                      <>
                        {" "}
                        {rule.budget_adjustment_type === "percentage"
                          ? `${rule.budget_adjustment_value}%`
                          : `R$ ${rule.budget_adjustment_value.toFixed(2)}`}
                      </>
                    )}{" "}
                    {SCOPE_LABEL[rule.scope].toLowerCase()} quando {describeGroup(rule.rules)}
                    {" "}({rule.time_window === "lifetime" ? "acumulado" : "hoje"}) · {bmScopeLabel(rule.bm_ids)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => toggleActive(rule)}
                    disabled={busy}
                    className="btn-secondary py-1.5 px-3 text-xs"
                  >
                    {rule.is_active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    onClick={() => editRule(rule)}
                    disabled={busy}
                    title="Editar"
                    className="btn-secondary flex items-center gap-1 py-1.5 px-2.5 text-xs"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => deleteRule(rule)}
                    disabled={busy}
                    title="Remover"
                    className="btn-secondary flex items-center gap-1 py-1.5 px-2.5 text-xs text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
            {rules.length === 0 && <p className="text-sm text-[var(--text-muted)]">Nenhuma regra cadastrada ainda.</p>}
          </ul>
        </section>
      </main>
    </div>
  );
}
