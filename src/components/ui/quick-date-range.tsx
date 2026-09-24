"use client";

import { DateRangePicker } from "./date-range-picker";
import { daysAgoISO, todayISO } from "@/lib/format";

const PRESETS = [
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

interface Props {
  since: string;
  until: string;
  onChange: (since: string, until: string) => void;
}

export function QuickDateRange({ since, until, onChange }: Props) {
  const TODAY = todayISO();
  const matching = PRESETS.find((p) => since === daysAgoISO(p.days) && until === TODAY);

  return (
    <div className="flex gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-1">
      {PRESETS.map((p) => (
        <button
          key={p.days}
          type="button"
          onClick={() => onChange(daysAgoISO(p.days), TODAY)}
          className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all ${
            matching?.days === p.days
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
          else onChange(daysAgoISO(30), TODAY);
        }}
        placeholder="Personalizado"
      />
    </div>
  );
}
