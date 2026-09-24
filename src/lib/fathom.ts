// Cliente para a Fathom Analytics API (tráfego do site).
const FATHOM_BASE = "https://api.usefathom.com/v1";

export class FathomApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "FathomApiError";
  }
}

function getToken(): string {
  const token = process.env.FATHOM_API_TOKEN;
  if (!token) throw new Error("FATHOM_API_TOKEN não configurado");
  return token;
}

export function getFathomSiteId(): string {
  const siteId = process.env.FATHOM_SITE_ID;
  if (!siteId) throw new Error("FATHOM_SITE_ID não configurado");
  return siteId;
}

async function fathomGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${FATHOM_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${getToken()}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.error || body?.message;
    throw new FathomApiError(
      detail ? `Erro na Fathom API: ${detail}` : `Erro ao chamar Fathom API (${res.status})`,
      res.status,
    );
  }

  return res.json() as Promise<T>;
}

export interface FathomHourlyRow {
  visits: string;
  pageviews: string;
  avg_duration?: string;
  date: string; // "YYYY-MM-DD HH:00:00"
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// A Fathom só aceita date_grouping=hour em janelas de até 7 dias, então
// quebramos o período pedido em blocos de 7 dias e juntamos os resultados.
export async function fetchHourlyTraffic(
  siteId: string,
  since: string,
  until: string,
): Promise<FathomHourlyRow[]> {
  const chunks: { since: string; until: string }[] = [];
  let chunkStart = since;
  while (chunkStart <= until) {
    const chunkEnd = addDays(chunkStart, 6) > until ? until : addDays(chunkStart, 6);
    chunks.push({ since: chunkStart, until: chunkEnd });
    chunkStart = addDays(chunkEnd, 1);
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      fathomGet<FathomHourlyRow[]>("/aggregations", {
        entity: "pageview",
        entity_id: siteId,
        aggregates: "visits,pageviews,avg_duration",
        date_grouping: "hour",
        date_from: `${chunk.since}T00:00:00+00:00`,
        date_to: `${chunk.until}T23:59:59+00:00`,
      }),
    ),
  );

  return results.flat();
}

export async function fetchCurrentVisitors(siteId: string): Promise<number> {
  const json = await fathomGet<{ total: number }>("/current_visitors", { site_id: siteId });
  return json.total;
}
