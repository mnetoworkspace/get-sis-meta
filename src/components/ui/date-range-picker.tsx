"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

const DAYS_LABEL = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function startPadding(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

export interface DateRange {
  from: string;
  to: string;
}

interface Props {
  value?: DateRange | null;
  onChange: (range: DateRange | null) => void;
  placeholder?: string;
  active?: boolean;
}

export function DateRangePicker({ value, onChange, placeholder = "Personalizado", active = false }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [start, setStart] = useState<string | null>(value?.from ?? null);
  const [end, setEnd] = useState<string | null>(value?.to ?? null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStart(value?.from ?? null);
    setEnd(value?.to ?? null);
  }, [value]);

  function openPicker() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(rect.right - 288, window.innerWidth - 300);
    setPos({ top: rect.bottom + 8, left: Math.max(8, left) });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const panel = document.getElementById("drp-generic-panel");
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
  }, [open]);

  const days = daysInMonth(view.year, view.month);
  const padding = startPadding(view.year, view.month);
  const todayYMD = toYMD(today);

  function prevMonth() {
    setView((v) => ({ month: v.month === 0 ? 11 : v.month - 1, year: v.month === 0 ? v.year - 1 : v.year }));
  }
  function nextMonth() {
    setView((v) => ({ month: v.month === 11 ? 0 : v.month + 1, year: v.month === 11 ? v.year + 1 : v.year }));
  }

  function clickDay(ymd: string) {
    if (!start || (start && end)) {
      setStart(ymd);
      setEnd(null);
    } else if (ymd < start) {
      setEnd(start);
      setStart(ymd);
    } else {
      setEnd(ymd);
    }
  }

  function apply() {
    if (!start || !end) return;
    onChange({ from: start, to: end });
    setOpen(false);
  }

  function clear(e?: React.MouseEvent) {
    e?.stopPropagation();
    setStart(null);
    setEnd(null);
    onChange(null);
    setOpen(false);
  }

  function dayClass(ymd: string): string {
    const isStart = ymd === start;
    const isEnd = ymd === end;
    const inRange = start && end && ymd > start && ymd < end;
    const inHover = start && !end && hover && ymd > start && ymd <= hover;
    const isToday = ymd === todayYMD;
    if (isStart || isEnd) return "bg-[var(--accent)] text-white font-bold rounded-lg";
    if (inRange || inHover) return "bg-[var(--accent-soft)] text-[var(--accent)] rounded-lg";
    if (isToday) return "border border-[var(--accent)] text-[var(--accent)] rounded-lg";
    return "text-[var(--text)] hover:bg-[var(--surface-muted)] rounded-lg";
  }

  const hasValue = !!(value?.from && value?.to);
  const label = hasValue
    ? `${parseYMD(value!.from).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} → ${parseYMD(value!.to).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
    : placeholder;

  const panel = open && pos
    ? createPortal(
        <div
          id="drp-generic-panel"
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="card p-4 w-72 shadow-xl animate-fade-in"
        >
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[var(--surface-muted)] text-[var(--text-muted)]">
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold text-[var(--text)]">
              {MONTHS_PT[view.month]} {view.year}
            </span>
            <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[var(--surface-muted)] text-[var(--text-muted)]">
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DAYS_LABEL.map((l) => (
              <div key={l} className="text-center text-[10px] font-semibold text-[var(--text-muted)] py-1">
                {l}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: padding }).map((_, i) => (
              <div key={`p${i}`} />
            ))}
            {days.map((day) => {
              const ymd = toYMD(day);
              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={ymd > todayYMD}
                  onClick={() => clickDay(ymd)}
                  onMouseEnter={() => setHover(ymd)}
                  onMouseLeave={() => setHover(null)}
                  className={`text-center text-xs py-1.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed ${dayClass(ymd)}`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-[var(--text-muted)] text-center mt-3">
            {!start ? "Clique para definir o início" : !end ? "Clique para definir o fim" : `${start} → ${end}`}
          </p>

          <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-xl border border-[var(--border)] py-2 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!(start && end)}
              className="flex-1 rounded-xl bg-[var(--accent)] py-2 text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Aplicar
            </button>
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
        onClick={open ? () => setOpen(false) : openPicker}
        className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all whitespace-nowrap ${
          hasValue || active
            ? "bg-gradient-to-br from-[var(--accent-2)] to-[var(--accent)] text-white shadow"
            : "text-[var(--text-muted)] hover:text-[var(--text)]"
        }`}
      >
        <Calendar size={13} />
        {label}
        {hasValue && (
          <span role="button" onClick={clear} className="ml-0.5 opacity-70 hover:opacity-100">
            <X size={11} />
          </span>
        )}
      </button>
      {panel}
    </>
  );
}
