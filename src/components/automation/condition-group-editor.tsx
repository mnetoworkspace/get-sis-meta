"use client";

import { Plus, X } from "lucide-react";
import {
  FIELD_OPTIONS,
  OPERATOR_OPTIONS,
  emptyCondition,
  type RuleCondition,
  type RuleConditionGroup,
  type RuleField,
  type RuleOperator,
} from "@/lib/automation/rule-types";

interface Props {
  group: RuleConditionGroup;
  onChange: (group: RuleConditionGroup) => void;
}

// Editor de condições da regra — campo + operador + valor, combinadas com
// TODAS/QUALQUER (AND/OR). Mesmo padrão visual do construtor de públicos do
// tracking-sales-system, só que sem sub-grupos aninhados (não precisa ainda).
export function ConditionGroupEditor({ group, onChange }: Props) {
  function toggleOperator() {
    onChange({ ...group, operator: group.operator === "AND" ? "OR" : "AND" });
  }

  function addCondition() {
    onChange({ ...group, conditions: [...group.conditions, emptyCondition()] });
  }

  function updateCondition(id: string, patch: Partial<RuleCondition>) {
    onChange({
      ...group,
      conditions: group.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }

  function removeCondition(id: string) {
    onChange({ ...group, conditions: group.conditions.filter((c) => c.id !== id) });
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--text-muted)]">Disparar quando</span>
        <button
          type="button"
          onClick={toggleOperator}
          disabled={group.conditions.length < 2}
          className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--accent-soft)] disabled:hover:text-[var(--accent)]"
          title={group.conditions.length < 2 ? "Adicione uma 2ª condição pra escolher TODAS/QUALQUER" : undefined}
        >
          {group.operator === "AND" ? "TODAS" : "QUALQUER"}
        </button>
        <span className="text-sm text-[var(--text-muted)]">as condições abaixo forem verdadeiras</span>
      </div>

      {group.conditions.length === 0 && (
        <p className="text-sm italic text-[var(--text-muted)]">Nenhuma condição — adicione pelo menos uma.</p>
      )}

      <div className="space-y-2">
        {group.conditions.map((condition) => (
          <div
            key={condition.id}
            className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 sm:flex-row sm:items-center"
          >
            <select
              value={condition.field}
              onChange={(e) => updateCondition(condition.id, { field: e.target.value as RuleField })}
              className="input flex-1 py-1.5 text-sm"
            >
              {FIELD_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              value={condition.operator}
              onChange={(e) => updateCondition(condition.id, { operator: e.target.value as RuleOperator })}
              className="input py-1.5 text-sm sm:w-44"
            >
              {OPERATOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Valor"
              value={condition.value}
              onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
              className="input py-1.5 text-sm sm:w-28"
              required
            />
            <button
              type="button"
              onClick={() => removeCondition(condition.id)}
              title="Remover condição"
              className="flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-lg text-[var(--text-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] sm:self-auto"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addCondition}
        className="flex items-center gap-1.5 text-sm text-[var(--accent)] hover:text-[var(--accent-strong)]"
      >
        <Plus size={13} />
        Adicionar condição
      </button>
    </div>
  );
}
