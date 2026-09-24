"use client";

import { useEffect, useRef, useState } from "react";

export interface ColumnDef<K extends string = string> {
  key: K;
  label: string;
  defaultOn: boolean;
}

function defaultVisible<K extends string>(columns: ColumnDef<K>[]): Set<K> {
  return new Set(columns.filter((c) => c.defaultOn).map((c) => c.key));
}

function defaultOrder<K extends string>(columns: ColumnDef<K>[]): K[] {
  return columns.map((c) => c.key);
}

// Persiste visibilidade/ordem de colunas no localStorage do navegador (por tabela,
// via storageKey). Carrega os padrões primeiro (server-safe) e sincroniza com o
// que estiver salvo assim que montar no client, pra evitar mismatch de hidratação.
export function useColumnConfig<K extends string>(storageKey: string, columns: ColumnDef<K>[]) {
  const allKeys = columns.map((c) => c.key);
  const [visibleCols, setVisibleCols] = useState<Set<K>>(() => defaultVisible(columns));
  const [colOrder, setColOrder] = useState<K[]>(() => defaultOrder(columns));
  const dragIdx = useRef<number | null>(null);
  // As tabelas desmontam/remontam a cada reload de dados (troca de aba, período,
  // sync). Sem essas flags, o efeito de gravação roda no mount com o estado
  // padrão (antes do efeito de carregamento aplicar o que está salvo) e
  // sobrescreve o localStorage com o padrão — perdendo a config do usuário
  // sempre que o remount acontece antes do 2º render corrigir isso.
  const skipVisibleWrite = useRef(true);
  const skipOrderWrite = useRef(true);

  useEffect(() => {
    try {
      const storedVisible = localStorage.getItem(`${storageKey}:visible`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storedVisible) setVisibleCols(new Set(JSON.parse(storedVisible) as K[]));

      const storedOrder = localStorage.getItem(`${storageKey}:order`);
      if (storedOrder) {
        const parsed = (JSON.parse(storedOrder) as K[]).filter((k) => allKeys.includes(k));
        const missing = allKeys.filter((k) => !parsed.includes(k));
        setColOrder([...parsed, ...missing]);
      }
    } catch {
      // localStorage indisponível (modo privado, etc.) — segue com os padrões.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (skipVisibleWrite.current) {
      skipVisibleWrite.current = false;
      return;
    }
    try {
      localStorage.setItem(`${storageKey}:visible`, JSON.stringify([...visibleCols]));
    } catch {}
  }, [storageKey, visibleCols]);

  useEffect(() => {
    if (skipOrderWrite.current) {
      skipOrderWrite.current = false;
      return;
    }
    try {
      localStorage.setItem(`${storageKey}:order`, JSON.stringify(colOrder));
    } catch {}
  }, [storageKey, colOrder]);

  function toggle(key: K) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resetToDefault() {
    setVisibleCols(defaultVisible(columns));
    setColOrder(defaultOrder(columns));
  }

  function dragStart(idx: number) {
    dragIdx.current = idx;
  }
  function dragOver(idx: number) {
    if (dragIdx.current === null || dragIdx.current === idx) return;
    setColOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragIdx.current!, 1);
      next.splice(idx, 0, item);
      dragIdx.current = idx;
      return next;
    });
  }
  function dragEnd() {
    dragIdx.current = null;
  }

  const orderedVisible = colOrder.filter((k) => visibleCols.has(k));

  return { visibleCols, colOrder, orderedVisible, toggle, resetToDefault, dragStart, dragOver, dragEnd };
}
