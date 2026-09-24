"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, GripVertical, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ColumnDef } from "@/lib/column-config";

interface Props<K extends string> {
  panelId: string;
  columns: ColumnDef<K>[];
  colOrder: K[];
  visibleCols: Set<K>;
  onToggle: (key: K) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (idx: number) => void;
  onDragEnd: () => void;
  onReset: () => void;
}

export function ColumnManagerButton<K extends string>({
  panelId,
  columns,
  colOrder,
  visibleCols,
  onToggle,
  onDragStart,
  onDragOver,
  onDragEnd,
  onReset,
}: Props<K>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function openPanel() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(rect.right - 240, window.innerWidth - 260);
    setPos({ top: rect.bottom + 8, left: Math.max(8, left) });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const panel = document.getElementById(panelId);
      if (panel && !panel.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [open, panelId]);

  const byKey = new Map(columns.map((c) => [c.key, c]));

  const panel = open && pos
    ? createPortal(
        <div
          id={panelId}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="card w-60 p-3 shadow-xl animate-fade-in"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Colunas — arraste para reordenar
            </p>
            <button
              type="button"
              onClick={onReset}
              title="Restaurar padrão"
              className="text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <RotateCcw size={12} />
            </button>
          </div>
          <div className="space-y-0.5 max-h-80 overflow-y-auto">
            {colOrder.map((key, idx) => {
              const col = byKey.get(key);
              if (!col) return null;
              const on = visibleCols.has(key);
              return (
                <div
                  key={key}
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    onDragOver(idx);
                  }}
                  onDragEnd={onDragEnd}
                  className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 cursor-grab active:cursor-grabbing hover:bg-[var(--surface-muted)] transition-colors"
                >
                  <GripVertical size={12} className="shrink-0 text-[var(--text-muted)] opacity-40" />
                  <button
                    type="button"
                    onClick={() => onToggle(key)}
                    className="flex flex-1 items-center gap-2 text-sm text-[var(--text)]"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                        on ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)]"
                      }`}
                    >
                      {on && <Check size={10} className="text-white" />}
                    </span>
                    {col.label}
                  </button>
                </div>
              );
            })}
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
        title="Editar colunas"
        className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
          open
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
            : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)] hover:text-[var(--text)]"
        }`}
      >
        <SlidersHorizontal size={15} />
      </button>
      {panel}
    </>
  );
}
