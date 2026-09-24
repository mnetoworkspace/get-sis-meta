"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";

export interface AccountOption {
  id: string;
  name: string;
  business_managers?: { name: string } | null;
}

interface Props {
  accounts: AccountOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function AccountMultiSelect({ accounts, selected, onChange }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [query, setQuery] = useState("");

  function openPanel() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.bottom + 8, left: Math.max(8, rect.left) });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const panel = document.getElementById("account-multi-select-panel");
      if (panel && !panel.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const filtered = accounts.filter((acc) => {
    const label = `${acc.name} ${acc.business_managers?.name || ""}`.toLowerCase();
    return label.includes(query.toLowerCase());
  });

  const label =
    selected.length === 0
      ? "Todas as contas"
      : selected.length === 1
        ? accounts.find((a) => a.id === selected[0])?.name || "1 conta"
        : `${selected.length} contas selecionadas`;

  const panel =
    open && pos
      ? createPortal(
          <div
            id="account-multi-select-panel"
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
            className="card w-72 p-3 shadow-xl animate-fade-in"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conta..."
              className="input mb-2 w-full"
              autoFocus
            />
            <div className="mb-2 flex gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => onChange(accounts.map((a) => a.id))}
                className="link-accent"
              >
                Selecionar todas
              </button>
              <button type="button" onClick={() => onChange([])} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                Limpar
              </button>
            </div>
            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {filtered.map((acc) => {
                const on = selected.includes(acc.id);
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => toggle(acc.id)}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-muted)]"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                        on ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)]"
                      }`}
                    >
                      {on && <Check size={10} className="text-white" />}
                    </span>
                    <span className="truncate">
                      {acc.name}
                      <span className="text-[var(--text-muted)]"> ({acc.business_managers?.name || acc.id})</span>
                    </span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="px-2 py-2 text-sm text-[var(--text-muted)]">Nenhuma conta encontrada.</p>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open ? () => setOpen(false) : openPanel}
        className={`input flex items-center gap-2 text-left ${selected.length > 0 ? "border-[var(--accent)] text-[var(--text)]" : ""}`}
      >
        <span className="flex-1 truncate">{label}</span>
        {selected.length > 0 && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="opacity-70 hover:opacity-100"
          >
            <X size={12} />
          </span>
        )}
        <ChevronDown size={14} className="text-[var(--text-muted)]" />
      </button>
      {panel}
    </>
  );
}
