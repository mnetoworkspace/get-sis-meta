"use client";

import { useEffect, useRef, useState } from "react";

export type SortDir = "asc" | "desc" | null;

export interface SortState {
  key: string | null;
  dir: SortDir;
}

export const NO_SORT: SortState = { key: null, dir: null };

// 3 estados por coluna: clique 1 = desc, clique 2 = asc, clique 3 = volta
// pra ordenação padrão (default_compare, ex: alfanumérico pela conta).
export function nextSortState(current: SortState, key: string): SortState {
  if (current.key !== key) return { key, dir: "desc" };
  if (current.dir === "desc") return { key, dir: "asc" };
  return NO_SORT;
}

export function applySort<T>(
  rows: T[],
  state: SortState,
  getters: Record<string, (row: T) => string | number | null>,
  defaultCompare: (a: T, b: T) => number,
): T[] {
  if (!state.key || !state.dir) {
    return [...rows].sort(defaultCompare);
  }
  const getter = getters[state.key];
  if (!getter) return rows;
  const dir = state.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getter(a);
    const bv = getter(b);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv) * dir;
    }
    return ((av as number) - (bv as number)) * dir;
  });
}

// Persiste a ordenação da tabela no localStorage (por tabela, via storageKey)
// — mesmo padrão de useColumnConfig (lib/column-config.ts): carrega o padrão
// primeiro, sincroniza com o salvo assim que montar, e só passa a escrever
// depois do primeiro efeito pra não sobrescrever o salvo com o padrão sempre
// que a tabela remonta (troca de aba, período, sync).
export function usePersistedSort(storageKey: string, defaultSort: SortState = NO_SORT) {
  const [sort, setSort] = useState<SortState>(defaultSort);
  const skipWrite = useRef(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`${storageKey}:sort`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSort(JSON.parse(saved) as SortState);
    } catch {
      // localStorage indisponível (modo privado, etc.) — segue com o padrão.
    }
  }, [storageKey]);

  useEffect(() => {
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    try {
      localStorage.setItem(`${storageKey}:sort`, JSON.stringify(sort));
    } catch {}
  }, [storageKey, sort]);

  return [sort, setSort] as const;
}
