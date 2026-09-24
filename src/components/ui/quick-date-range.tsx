"use client";

import { DateRangePicker } from "./date-range-picker";
import { addDaysISO, daysAgoISO, todayISO } from "@/lib/format";

const PRESETS = [
  { label: "Hoje", range: () => ({ since: todayISO(), until: todayISO() }) },
  {
    label: "Ontem",
    range: () => {
      const y = addDaysISO(todayISO(), -1);
      return { since: y, until: y };
    },
  },
  { label: "30 dias", range: () => ({ since: daysAgoISO(30), until: todayISO() }) },
  { label: "90 dias", range: () => ({ since: daysAgoISO(90), until: todayISO() }) },
];

interface Props {
  since: string;
  until: string;
  onChange: (since: string, until: string) => void;
}

export function QuickDateRange({ since, until, onChange }: Props) {
  const matching = PRESETS.find((p) => {
    const r = p.range();
    return r.since === since && r.until === until;
  });

  return (
    <div className="flex flex-wrap gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-1">
      {PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => {
            const r = p.range();
            onChange(r.since, r.until);
          }}
          className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all ${
            matching?.label === p.label
              ? "bg-gradient-to-br from-[var(--accent-2)] to-[var(--accent)] text-white shadow"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          {p.label}
        </button>
      ))}
      <DateRangePicker
        active={!matching}
        value={!matching ? { from: since, to: until } : null}
        onChange={(r) => {
          if (r) onChange(r.from, r.to);
          else onChange(daysAgoISO(30), todayISO());
        }}
        placeholder="Personalizado"
      />
    </div>
  );
}
