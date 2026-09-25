"use client";

import Link from "next/link";
import { Menu, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface Props {
  items: NavItem[];
}

// Menu hambúrguer só pra telas pequenas — os mesmos links do header
// aparecem inline (com label) em telas >= sm; aqui, iguais mas dentro de um
// painel que abre/fecha, pra não espremer ícone atrás de ícone no mobile.
export function MobileNavMenu({ items }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Abrir menu"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        {open ? <X size={16} /> : <Menu size={16} />}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-1.5 shadow-xl animate-fade-in">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-muted)]"
              >
                <Icon size={15} className="text-[var(--text-muted)]" />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
