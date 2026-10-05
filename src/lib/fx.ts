// Cotação de câmbio (open.er-api.com — gratuita, sem chave).
export async function fetchExchangeRate(base: string, quote: string): Promise<number | null> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.result !== "success") return null;
    return json.rates?.[quote] ?? null;
  } catch {
    return null;
  }
}

// Monta <moeda> -> cotação BRL a partir das linhas salvas em fx_rates
// (quote_currency = "BRL"), pra converter gasto de contas em dólar (ou
// outra moeda) sem bater na API de câmbio em toda requisição.
export function buildFxRateMap(rows: { base_currency: string; rate: number | string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.base_currency, Number(row.rate));
  return map;
}

// Converte um valor pra BRL usando o mapa de cotações. Já em BRL, ou sem
// cotação disponível ainda (conta nova, primeira sync antes do fetch de
// câmbio rodar), devolve o valor original sem alterar — nunca quebra o
// número por falta de cotação.
export function toBRL(amount: number | null, currency: string | null, rates: Map<string, number>): number | null {
  if (amount == null) return amount;
  if (!currency || currency === "BRL") return amount;
  const rate = rates.get(currency);
  if (rate == null) return amount;
  return amount * rate;
}

interface MoneyRow {
  spend: number | null;
  cpc?: number | null;
  cpm?: number | null;
  cost_per_result?: number | null;
  cost_per_ftd?: number | null;
  cost_per_lead?: number | null;
  currency: string | null;
}

// Converte os campos em dinheiro de uma linha de insight (spend, cpc, cpm,
// custo/resultado, custo/FTD, custo/lead) pra BRL, preservando o valor e a
// moeda originais em *_original pra quem quiser auditar. Sem cotação
// disponível ainda, devolve a linha intacta — nunca mistura moeda sem
// avisar via currency_original.
export function convertMoneyFieldsToBRL<T extends MoneyRow>(
  row: T,
  rates: Map<string, number>,
): T & { currency_original: string | null; spend_original: number | null } {
  const currency_original = row.currency;
  const spend_original = row.spend;
  const rate = currency_original && currency_original !== "BRL" ? rates.get(currency_original) : null;

  if (!rate) {
    return { ...row, currency_original, spend_original };
  }

  return {
    ...row,
    spend: row.spend != null ? row.spend * rate : row.spend,
    cpc: row.cpc != null ? row.cpc * rate : row.cpc,
    cpm: row.cpm != null ? row.cpm * rate : row.cpm,
    cost_per_result: row.cost_per_result != null ? row.cost_per_result * rate : row.cost_per_result,
    cost_per_ftd: row.cost_per_ftd != null ? row.cost_per_ftd * rate : row.cost_per_ftd,
    cost_per_lead: row.cost_per_lead != null ? row.cost_per_lead * rate : row.cost_per_lead,
    currency: "BRL",
    currency_original,
    spend_original,
  };
}
