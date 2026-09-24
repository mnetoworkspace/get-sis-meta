export function formatCurrency(value: number | null | undefined, currency?: string | null) {
  const amount = value ?? 0;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(dateISO: string, days: number) {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Quantidade de dias entre since/until, incluindo os dois extremos.
export function daySpan(since: string, until: string) {
  const a = new Date(`${since}T00:00:00`);
  const b = new Date(`${until}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

// Período imediatamente anterior, com a mesma duração — usado para comparar
// "hoje" com "ontem", "15 dias" com os 15 dias anteriores, etc.
export function previousPeriod(since: string, until: string) {
  const span = daySpan(since, until);
  const prevUntil = addDaysISO(since, -1);
  const prevSince = addDaysISO(prevUntil, -(span - 1));
  return { since: prevSince, until: prevUntil };
}
