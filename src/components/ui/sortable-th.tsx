"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDir } from "@/lib/sort";

interface Props {
  label: string;
  sortKey: string;
  activeKey: string | null;
  dir: SortDir;
  align?: "left" | "right";
  onSort: (key: string) => void;
}

export function SortableTh({ label, sortKey, activeKey, dir, align = "left", onSort }: Props) {
  const active = activeKey === sortKey;
  return (
    <th
      className={`px-4 py-3 select-none cursor-pointer hover:text-[var(--text)] ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        {active && dir === "desc" && <ArrowDown size={11} className="text-[var(--accent)]" />}
        {active && dir === "asc" && <ArrowUp size={11} className="text-[var(--accent)]" />}
        {!active && <ArrowUpDown size={11} className="opacity-30" />}
      </span>
    </th>
  );
}
