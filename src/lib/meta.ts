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

export type BusinessStatusCheck = { ok: true } | { ok: false; message: string };

// A Meta não expõe um campo "status" simples pra Business Manager (como
// account_status nas contas) — uma BM bloqueada geralmente derruba as
// chamadas feitas com o token dela. Em vez de tentar adivinhar a causa,
// só reporta se a chamada foi bem ou mal, e guarda a mensagem crua da Meta
// pra pessoa julgar o motivo real.
export async function fetchBusinessStatus(bmId: string, token: string): Promise<BusinessStatusCheck> {
  try {
    await graphGet(`/${bmId}`, { fields: "id,name", access_token: token });
    return { ok: true };
  } catch (err) {
    const message = err instanceof MetaApiError ? err.message : err instanceof Error ? err.message : "Erro desconhecido";
    return { ok: false, message };
  }
}

export const ACCOUNT_STATUS_MAP: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
  201: "ANY_ACTIVE",
  202: "ANY_CLOSED",
};

/**
 * Status atual (traduzido) de uma única conta de anúncio na Meta — usado
 * pelo watcher que compara com o status salvo em `ad_accounts` e avisa
 * quando a conta sai de ACTIVE (ex: desabilitada/bloqueada).
 */
export async function fetchAdAccountStatus(adAccountId: string, token: string): Promise<string> {
  const json = await graphGet<{ account_status: number }>(`/${adAccountId}`, {
    fields: "account_status",
    access_token: token,
  });
  return ACCOUNT_STATUS_MAP[json.account_status] || String(json.account_status);
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

// Usado pelo motor de regras de automação (ver src/lib/automation/rules-engine.ts).
// "level" decide se o objeto avaliado/controlado é a campanha, o conjunto de
// anúncios ou o anúncio — a Graph API de insights e a de status/ação
// funcionam do mesmo jeito nos três níveis, só muda o campo de ID e os
// campos extras de contexto que fazem sentido pedir.
export type RuleScope = "campaign" | "adset" | "ad";

const OBJECT_INSIGHT_FIELDS: Record<RuleScope, string> = {
  campaign: "campaign_id,campaign_name,spend,actions,cost_per_action_type",
  adset: "campaign_id,campaign_name,adset_id,adset_name,spend,actions,cost_per_action_type",
  ad: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,actions,cost_per_action_type",
};

export interface ObjectInsight {
  date_start: string;
  date_stop: string;
  campaign_id: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
}

// ID do objeto que essa linha de insight representa, de acordo com o nível
// da regra — é o que vai ser pausado/ativado se a condição bater.
export function objectIdFromInsight(row: ObjectInsight, scope: RuleScope): string | undefined {
  if (scope === "campaign") return row.campaign_id;
  if (scope === "adset") return row.adset_id;
  return row.ad_id;
}

export function objectNameFromInsight(row: ObjectInsight, scope: RuleScope): string | undefined {
  if (scope === "campaign") return row.campaign_name;
  if (scope === "adset") return row.adset_name;
  return row.ad_name;
}

export async function fetchObjectDailyInsights(
  adAccountId: string,
  token: string,
  scope: RuleScope,
  since: string,
  until: string,
): Promise<ObjectInsight[]> {
  return graphGetAllPages<ObjectInsight>(`/${adAccountId}/insights`, {
    level: scope,
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields: OBJECT_INSIGHT_FIELDS[scope],
    access_token: token,
    limit: "500",
  });
}

// Totais acumulados desde sempre (uma linha por objeto, sem quebra diária) —
// usado por regras com time_window="lifetime".
export async function fetchObjectLifetimeInsights(
  adAccountId: string,
  token: string,
  scope: RuleScope,
): Promise<ObjectInsight[]> {
  return graphGetAllPages<ObjectInsight>(`/${adAccountId}/insights`, {
    level: scope,
    date_preset: "maximum",
    fields: OBJECT_INSIGHT_FIELDS[scope],
    access_token: token,
    limit: "500",
  });
}

export type MetaEffectiveStatus =
  | "ACTIVE"
  | "PAUSED"
  | "DELETED"
  | "ARCHIVED"
  | "CAMPAIGN_PAUSED"
  | "ADSET_PAUSED"
  | string;

// Status atual do objeto — checado antes de agir pra não gastar chamada de
// API repetindo uma ação que já está feita (ex: pausar o que já tá pausado).
export async function fetchObjectStatus(objectId: string, token: string): Promise<MetaEffectiveStatus> {
  const json = await graphGet<{ effective_status: MetaEffectiveStatus }>(`/${objectId}`, {
    fields: "effective_status",
    access_token: token,
  });
  return json.effective_status;
}

// Funciona pra campanha, conjunto ou anúncio — o node de update da Graph API
// é o mesmo nos três casos, só muda o ID passado.
export async function setObjectStatus(
  objectId: string,
  status: "PAUSED" | "ACTIVE",
  token: string,
): Promise<void> {
  await graphPost<{ success: boolean }>(`/${objectId}`, {
    status,
    access_token: token,
  });
}

// Orçamento só existe em campanha ou conjunto (anúncio não tem campo de
// orçamento próprio na Meta) — os dois valores vêm em centavos (unidade
// mínima da moeda da conta, ex: R$ 10,00 = 1000); só um dos dois vem
// preenchido por vez, dependendo de qual tipo de orçamento o objeto usa.
export interface ObjectBudget {
  daily_budget: string | null;
  lifetime_budget: string | null;
}

export async function fetchObjectBudget(objectId: string, token: string): Promise<ObjectBudget> {
  const json = await graphGet<{ daily_budget?: string; lifetime_budget?: string }>(`/${objectId}`, {
    fields: "daily_budget,lifetime_budget",
    access_token: token,
  });
  return { daily_budget: json.daily_budget ?? null, lifetime_budget: json.lifetime_budget ?? null };
}

export async function setObjectBudget(
  objectId: string,
  field: "daily_budget" | "lifetime_budget",
  centsValue: number,
  token: string,
): Promise<void> {
  await graphPost<{ success: boolean }>(`/${objectId}`, {
    [field]: String(Math.round(centsValue)),
    access_token: token,
  });
}
