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
