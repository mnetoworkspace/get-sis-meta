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
