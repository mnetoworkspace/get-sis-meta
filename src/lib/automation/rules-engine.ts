import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  fetchAdSetDailyInsights,
  fetchAdSetLifetimeInsights,
  fetchAdSetStatus,
  pauseAdSet,
  type AdSetDailyInsight,
} from "@/lib/meta";
import { pickFtd } from "@/lib/results";
import { fetchExchangeRate } from "@/lib/fx";
import { sendPushToAll } from "@/lib/push/send";
import { todayISO } from "@/lib/format";
import type { AdAccount, AutomationRule, MetaCredential } from "@/types/db";

const PAUSED_STATUSES = new Set(["PAUSED", "ARCHIVED", "DELETED", "CAMPAIGN_PAUSED"]);

function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === "23505";
}

// Cache simples por execução — evita pedir a mesma cotação de câmbio várias
// vezes se várias regras/conjuntos usarem a mesma moeda na mesma checagem.
const fxCache = new Map<string, number | null>();

async function convertToBrl(amount: number, currency: string | null): Promise<number | null> {
  if (!currency || currency === "BRL") return amount;

  if (!fxCache.has(currency)) {
    fxCache.set(currency, await fetchExchangeRate(currency, "BRL"));
  }
  const rate = fxCache.get(currency);
  return rate != null ? amount * rate : null;
}

async function evaluateRule(
  rule: AutomationRule,
  account: AdAccount,
  token: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  let rows: AdSetDailyInsight[];
  if (rule.window === "lifetime") {
    rows = await fetchAdSetLifetimeInsights(account.id, token);
  } else {
    const today = todayISO();
    rows = await fetchAdSetDailyInsights(account.id, token, today, today);
  }

  for (const row of rows) {
    const spend = Number(row.spend || 0);
    const { ftd } = pickFtd(row.actions, row.cost_per_action_type, spend);

    // Condição v1: "no_ftd" — se um dia a regra ganhar outras condições,
    // este é o ponto que vira um switch(rule.condition).
    if (ftd) continue; // já teve FTD, regra não se aplica

    const spendBrl = await convertToBrl(spend, account.currency);
    if (spendBrl == null || spendBrl < rule.threshold) continue;

    const dedupeSuffix = rule.window === "lifetime" ? "lifetime" : todayISO();
    const dedupeKey = `RULE_PAUSE:${rule.id}:${row.adset_id}:${dedupeSuffix}`;

    // Registra a tentativa ANTES de checar o status atual, pra nunca reavaliar
    // o mesmo conjunto duas vezes no mesmo dia (mesmo que já esteja pausado
    // manualmente) — economiza chamada de API e evita notificação repetida.
    const { error: insertError } = await supabase.from("notifications").insert({
      type: "adset_paused",
      title: `Conjunto pausado: ${row.adset_name || row.adset_id}`,
      body: `Regra "${rule.name}": gastou ${spendBrl.toFixed(2)} (BRL) sem FTD.`,
      metadata: {
        rule_id: rule.id,
        adset_id: row.adset_id,
        adset_name: row.adset_name,
        campaign_id: row.campaign_id,
        ad_account_id: account.id,
        spend,
        spend_brl: spendBrl,
        currency: account.currency,
      },
      dedupe_key: dedupeKey,
    });

    if (insertError) {
      if (!isUniqueViolation(insertError)) {
        console.error("[rules-engine] falha ao registrar notificação:", insertError);
      }
      continue;
    }

    try {
      const status = await fetchAdSetStatus(row.adset_id, token);
      if (PAUSED_STATUSES.has(status)) continue;

      await pauseAdSet(row.adset_id, token);

      await sendPushToAll({
        title: "⏸️ Conjunto pausado automaticamente",
        body: `${row.adset_name || row.adset_id} — regra "${rule.name}" (gasto sem FTD).`,
        url: "/",
      });
    } catch (err) {
      console.error(`[rules-engine] falha ao pausar adset ${row.adset_id}:`, err);
    }
  }
}

export async function runAutomationRules(): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: rules, error: rulesError } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("is_active", true)
    .returns<AutomationRule[]>();

  if (rulesError) {
    console.error("[rules-engine] falha ao carregar regras:", rulesError);
    return;
  }
  if (!rules || rules.length === 0) return;

  const { data: credentials, error: credError } = await supabase
    .from("meta_credentials")
    .select("*")
    .returns<MetaCredential[]>();

  if (credError || !credentials) {
    console.error("[rules-engine] falha ao carregar credenciais:", credError);
    return;
  }

  for (const rule of rules) {
    const targetCredentials =
      rule.bm_ids.length > 0 ? credentials.filter((c) => rule.bm_ids.includes(c.bm_id)) : credentials;

    for (const credential of targetCredentials) {
      const { data: accounts, error: accError } = await supabase
        .from("ad_accounts")
        .select("*")
        .eq("bm_id", credential.bm_id)
        .eq("is_active", true)
        .returns<AdAccount[]>();

      if (accError || !accounts) {
        console.error(`[rules-engine] falha ao carregar contas do BM ${credential.bm_id}:`, accError);
        continue;
      }

      for (const account of accounts) {
        try {
          await evaluateRule(rule, account, credential.system_user_token);
        } catch (err) {
          console.error(`[rules-engine] falha ao avaliar regra ${rule.id} na conta ${account.id}:`, err);
        }
      }
    }
  }
}
