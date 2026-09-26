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

// Rótulo curto pra eixos de gráfico (largura apertada) — evita "3068.0k"
// (8 caracteres, clipa) trocando por "3.1M" a partir de 1 milhão.
export function formatAxisNumber(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

// "Hoje"/"N dias atrás" aqui é usado pros dados da Meta (gasto, resultados,
// FTD, regra de automação) — e as contas de anúncio estão configuradas em
// America/Sao_Paulo (UTC-3, sem horário de verão), confirmado direto via
// Graph API (campo timezone_name), não é suposição. "Hoje" calculado em UTC
// puro fica atrasado em relação ao dia real de Brasília por até 3h (ex:
// 01h da manhã já é "hoje" em Brasília/UTC-3, mas ainda "ontem" em UTC) —
// faz o filtro "Hoje" pedir uma data que ainda não tem gasto sincronizado,
// parecendo que não tem dado nenhum.
//
// Os depósitos são uma fonte diferente (API de pagamentos da Rakebet) que
// opera em horário de Bogotá (UTC-5) — ver BOGOTA_OFFSET em lib/payments.ts,
// já validado contra o backoffice deles. NÃO usa este helper.
function nowInBrazil(): Date {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() - 3);
  return d;
}

export function todayISO() {
  return nowInBrazil().toISOString().slice(0, 10);
}

// Hora atual (0-23) no fuso da conta (America/Sao_Paulo) — usado pra saber
// quantas horas já passaram/faltam no dia (ex: previsão de gasto).
export function nowHourInBrazil(): number {
  return nowInBrazil().getUTCHours();
}

export function daysAgoISO(days: number) {
  const d = nowInBrazil();
  d.setUTCDate(d.getUTCDate() - days);
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
