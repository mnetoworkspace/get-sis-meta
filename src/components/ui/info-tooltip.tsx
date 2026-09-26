"use client";

import { HelpCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

// Ícone "?" que abre um texto explicativo ao clicar — usado pra tirar
// parágrafos de explicação de dentro da interface e deixar só o essencial
// visível, sem perder a explicação pra quem quiser.
export function InfoTooltip({ children, className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <span ref={ref} className={`relative inline-flex ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Mais informações"
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[var(--text-muted)] transition-colors hover:text-[var(--text)] ${
          open ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--border-strong)]"
        }`}
      >
        <HelpCircle size={11} />
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-30 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3 text-xs font-normal normal-case leading-relaxed tracking-normal text-[var(--text-muted)] shadow-xl animate-fade-in sm:w-80">
          {children}
        </div>
      )}
    </span>
  );
}
