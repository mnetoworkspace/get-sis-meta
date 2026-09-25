// Cliente para a Meta Marketing API (Graph API).
// Usa tokens de System User já gerados (não faz OAuth flow).

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class MetaApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

async function graphGet<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), { method: "GET" });
  const json = await res.json();

  if (!res.ok) {
    const message =
      json?.error?.message || `Erro ao chamar Meta Graph API (${res.status})`;
    throw new MetaApiError(message, res.status, json);
  }

  return json as T;
}

async function graphPost<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), { method: "POST" });
  const json = await res.json();

  if (!res.ok) {
    const message =
      json?.error?.message || `Erro ao chamar Meta Graph API (${res.status})`;
    throw new MetaApiError(message, res.status, json);
  }

  return json as T;
}

async function graphGetAllPages<T>(
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = null;
  let first = true;

  while (first || nextUrl) {
    first = false;
    let page: { data: T[]; paging?: { next?: string } };

    if (nextUrl) {
      const res = await fetch(nextUrl);
      const json = await res.json();
      if (!res.ok) {
        const message =
          json?.error?.message ||
          `Erro ao paginar Meta Graph API (${res.status})`;
        throw new MetaApiError(message, res.status, json);
      }
      page = json;
    } else {
      page = await graphGet<{ data: T[]; paging?: { next?: string } }>(
        path,
        params,
      );
    }

    results.push(...page.data);
    nextUrl = page.paging?.next || null;
  }

  return results;
}

export interface MetaAdAccountSummary {
  id: string; // "act_123456789"
  name: string;
  currency: string;
  account_status: number;
}

/**
 * Lista as contas de anúncio às quais o token (System User) tem acesso,
 * associadas a um Business Manager específico.
 */
export async function fetchOwnedAdAccounts(
  bmId: string,
  token: string,
): Promise<MetaAdAccountSummary[]> {
  return graphGetAllPages<MetaAdAccountSummary>(`/${bmId}/owned_ad_accounts`, {
    fields: "id,name,currency,account_status",
    access_token: token,
    limit: "200",
  });
}

/**
 * Lista as contas de anúncio às quais um System User tem acesso direto,
 * como fallback caso "owned_ad_accounts" não retorne nada (contas
 * compartilhadas/client accounts em vez de owned).
 */
export async function fetchClientAdAccounts(
  bmId: string,
  token: string,
): Promise<MetaAdAccountSummary[]> {
  return graphGetAllPages<MetaAdAccountSummary>(`/${bmId}/client_ad_accounts`, {
    fields: "id,name,currency,account_status",
    access_token: token,
    limit: "200",
  });
}

/**
 * Cartão/fonte de pagamento vinculada à conta na Meta (ex: "Mastercard *7617").
 * Retorna null se a conta não tiver um funding source configurado.
 */
export async function fetchFundingSource(adAccountId: string, token: string): Promise<string | null> {
  const json = await graphGet<{ funding_source_details?: { display_string?: string } }>(`/${adAccountId}`, {
    fields: "funding_source_details",
    access_token: token,
  });
  return json.funding_source_details?.display_string ?? null;
}

export interface MetaAction {
  action_type: string;
  value: string;
}

const ACCOUNT_INSIGHT_FIELDS =
  "spend,impressions,clicks,reach,frequency,inline_link_clicks,cpc,cpm,ctr,actions,cost_per_action_type";

const AD_INSIGHT_FIELDS =
  "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name," +
  "spend,impressions,clicks,reach,frequency,inline_link_clicks,cpc,cpm,ctr,actions,cost_per_action_type";

export interface AccountDailyInsight {
  account_id: string;
  date_start: string;
  date_stop: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  frequency?: string;
  inline_link_clicks?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
}

export async function fetchAccountDailyInsights(
  adAccountId: string,
  token: string,
  since: string,
  until: string,
): Promise<AccountDailyInsight[]> {
  return graphGetAllPages<AccountDailyInsight>(`/${adAccountId}/insights`, {
    level: "account",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields: ACCOUNT_INSIGHT_FIELDS,
    access_token: token,
    limit: "500",
  });
}

export interface AccountHourlyInsight {
  date_start: string;
  date_stop: string;
  hourly_stats_aggregated_by_advertiser_time_zone: string; // ex: "00:00:00 - 00:59:59"
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
}

export async function fetchAccountHourlyInsights(
  adAccountId: string,
  token: string,
  since: string,
  until: string,
): Promise<AccountHourlyInsight[]> {
  return graphGetAllPages<AccountHourlyInsight>(`/${adAccountId}/insights`, {
    level: "account",
    time_increment: "1",
    breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
    time_range: JSON.stringify({ since, until }),
    fields: "spend,impressions,clicks,actions,cost_per_action_type",
    access_token: token,
    limit: "500",
  });
}

export interface AdDailyInsight {
  date_start: string;
  date_stop: string;
  campaign_id: string;
  campaign_name?: string;
  adset_id: string;
  adset_name?: string;
  ad_id: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  frequency?: string;
  inline_link_clicks?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
}

export async function fetchAdLevelDailyInsights(
  adAccountId: string,
  token: string,
  since: string,
  until: string,
): Promise<AdDailyInsight[]> {
  return graphGetAllPages<AdDailyInsight>(`/${adAccountId}/insights`, {
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields: AD_INSIGHT_FIELDS,
    access_token: token,
    limit: "500",
  });
}

const ADSET_INSIGHT_FIELDS =
  "campaign_id,campaign_name,adset_id,adset_name,spend,actions,cost_per_action_type";

export interface AdSetDailyInsight {
  date_start: string;
  date_stop: string;
  campaign_id: string;
  campaign_name?: string;
  adset_id: string;
  adset_name?: string;
  spend?: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
}

// Usado pelo motor de regras de automação (ver src/lib/automation/rules-engine.ts) —
// nível "adset" traz só o necessário pra avaliar a condição, bem mais leve que
// puxar todos os anúncios da conta a cada checagem.
export async function fetchAdSetDailyInsights(
  adAccountId: string,
  token: string,
  since: string,
  until: string,
): Promise<AdSetDailyInsight[]> {
  return graphGetAllPages<AdSetDailyInsight>(`/${adAccountId}/insights`, {
    level: "adset",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields: ADSET_INSIGHT_FIELDS,
    access_token: token,
    limit: "500",
  });
}

// Totais acumulados desde sempre (uma linha por adset, sem quebra diária) —
// usado por regras com window="lifetime".
export async function fetchAdSetLifetimeInsights(
  adAccountId: string,
  token: string,
): Promise<AdSetDailyInsight[]> {
  return graphGetAllPages<AdSetDailyInsight>(`/${adAccountId}/insights`, {
    level: "adset",
    date_preset: "maximum",
    fields: ADSET_INSIGHT_FIELDS,
    access_token: token,
    limit: "500",
  });
}

export type AdSetEffectiveStatus =
  | "ACTIVE"
  | "PAUSED"
  | "DELETED"
  | "ARCHIVED"
  | "CAMPAIGN_PAUSED"
  | string;

// Status atual do conjunto — checado antes de pausar pra não gastar chamada
// de API repausando algo que já está pausado/arquivado/deletado.
export async function fetchAdSetStatus(adSetId: string, token: string): Promise<AdSetEffectiveStatus> {
  const json = await graphGet<{ effective_status: AdSetEffectiveStatus }>(`/${adSetId}`, {
    fields: "effective_status",
    access_token: token,
  });
  return json.effective_status;
}

export async function pauseAdSet(adSetId: string, token: string): Promise<void> {
  await graphPost<{ success: boolean }>(`/${adSetId}`, {
    status: "PAUSED",
    access_token: token,
  });
}
