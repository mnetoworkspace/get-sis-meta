import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  fetchObjectDailyInsights,
  fetchObjectLifetimeInsights,
  fetchObjectStatus,
  setObjectStatus,
  objectIdFromInsight,
  objectNameFromInsight,
  type ObjectInsight,
  type RuleScope,
} from "@/lib/meta";
import { pickFtd, pickResult } from "@/lib/results";
import { fetchExchangeRate } from "@/lib/fx";
import { sendPushToAll } from "@/lib/push/send";
import { todayISO } from "@/lib/format";
import { evaluateGroup, type RuleMetrics } from "@/lib/automation/rule-types";
import type { AdAccount, AutomationRule, MetaCredential } from "@/types/db";

const PAUSED_STATUSES = new Set(["PAUSED", "ARCHIVED", "DELETED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"]);
const ACTIVE_STATUSES = new Set(["ACTIVE"]);

const SCOPE_LABEL: Record<RuleScope, string> = {
  campaign: "Campanha",
  adset: "Conjunto",
  ad: "Anúncio",
};

function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === "23505";
}

// Cache simples por execução — evita pedir a mesma cotação de câmbio várias
// vezes se várias regras/objetos usarem a mesma moeda na mesma checagem.
const fxCache = new Map<string, number | null>();

async function convertToBrl(amount: number, currency: string | null): Promise<number | null> {
  if (!currency || currency === "BRL") return amount;

  if (!fxCache.has(currency)) {
    fxCache.set(currency, await fetchExchangeRate(currency, "BRL"));
  }
  const rate = fxCache.get(currency);
  return rate != null ? amount * rate : null;
}

// Monta as métricas que as condições da regra podem referenciar, a partir de
// uma linha de insight crua da Meta. Gasto é convertido pra BRL antes de
// comparar com o limite da condição — as contas podem estar em moedas
// diferentes, mas a regra é definida num valor só.
async function buildMetrics(row: ObjectInsight, currency: string | null): Promise<RuleMetrics | null> {
  const spend = Number(row.spend || 0);
  const spendBrl = await convertToBrl(spend, currency);
  if (spendBrl == null) return null;

  const { ftd, costPerFtd } = pickFtd(row.actions, row.cost_per_action_type, spendBrl);
  const { results, costPerResult } = pickResult(row.actions, row.cost_per_action_type, spendBrl);

  return {
    spend: spendBrl,
    ftd,
    cost_per_ftd: costPerFtd,
    results,
    cost_per_result: costPerResult,
  };
}

async function evaluateRule(
  rule: AutomationRule,
  account: AdAccount,
  token: string,
): Promise<number> {
  const supabase = createSupabaseAdminClient();
  let actioned = 0;

  let rows: ObjectInsight[];
  if (rule.time_window === "lifetime") {
    rows = await fetchObjectLifetimeInsights(account.id, token, rule.scope);
  } else {
    const today = todayISO();
    rows = await fetchObjectDailyInsights(account.id, token, rule.scope, today, today);
  }

  for (const row of rows) {
    const objectId = objectIdFromInsight(row, rule.scope);
    if (!objectId) continue;

    const metrics = await buildMetrics(row, account.currency);
    if (!metrics) continue;
    if (!evaluateGroup(rule.rules, metrics)) continue;

    const objectName = objectNameFromInsight(row, rule.scope) || objectId;
    const dedupeSuffix = rule.time_window === "lifetime" ? "lifetime" : todayISO();
    const dedupeKey = `RULE_${rule.action.toUpperCase()}:${rule.id}:${objectId}:${dedupeSuffix}`;

    // Registra a tentativa ANTES de checar o status atual, pra nunca
    // reavaliar o mesmo objeto duas vezes no mesmo dia — economiza chamada
    // de API e evita notificação repetida.
    const { error: insertError } = await supabase.from("notifications").insert({
      type: rule.action === "pause" ? "rule_paused" : "rule_activated",
      title: `${SCOPE_LABEL[rule.scope]} ${rule.action === "pause" ? "pausado" : "ativado"}: ${objectName}`,
      body: `Regra "${rule.name}".`,
      metadata: {
        rule_id: rule.id,
        scope: rule.scope,
        object_id: objectId,
        object_name: objectName,
        campaign_id: row.campaign_id,
        ad_account_id: account.id,
        metrics,
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
      const status = await fetchObjectStatus(objectId, token);
      const alreadyDone = rule.action === "pause" ? PAUSED_STATUSES.has(status) : ACTIVE_STATUSES.has(status);
      if (alreadyDone) continue;
      // Não reativa algo apagado/arquivado — só o que está genuinamente pausado.
      if (rule.action === "activate" && (status === "DELETED" || status === "ARCHIVED")) continue;

      await setObjectStatus(objectId, rule.action === "pause" ? "PAUSED" : "ACTIVE", token);
      actioned += 1;

      await sendPushToAll({
        title: rule.action === "pause" ? "⏸️ Pausado automaticamente" : "▶️ Ativado automaticamente",
        body: `${SCOPE_LABEL[rule.scope]} "${objectName}" — regra "${rule.name}".`,
        url: "/",
      });
    } catch (err) {
      console.error(`[rules-engine] falha ao aplicar ação em ${objectId}:`, err);
    }
  }

  return actioned;
}

export interface RulesRunSummary {
  rulesEvaluated: number;
  accountsChecked: number;
  objectsActioned: number;
  errors: string[];
}

// Executado pelo agendador automático (instrumentation.ts, a cada N minutos)
// e também sob demanda pelo botão "Checar agora" da tela de Regras
// (POST /api/automation-rules/run) — mesma lógica nos dois casos, só muda
// quem chama.
export async function runAutomationRules(): Promise<RulesRunSummary> {
  const summary: RulesRunSummary = { rulesEvaluated: 0, accountsChecked: 0, objectsActioned: 0, errors: [] };
  const supabase = createSupabaseAdminClient();

  const { data: rules, error: rulesError } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("is_active", true)
    .returns<AutomationRule[]>();

  if (rulesError) {
    console.error("[rules-engine] falha ao carregar regras:", rulesError);
    summary.errors.push(`Falha ao carregar regras: ${rulesError.message}`);
    return summary;
  }
  if (!rules || rules.length === 0) return summary;

  const { data: credentials, error: credError } = await supabase
    .from("meta_credentials")
    .select("*")
    .returns<MetaCredential[]>();

  if (credError || !credentials) {
    console.error("[rules-engine] falha ao carregar credenciais:", credError);
    summary.errors.push(`Falha ao carregar credenciais: ${credError?.message ?? "desconhecida"}`);
    return summary;
  }

  for (const rule of rules) {
    summary.rulesEvaluated += 1;
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
        summary.errors.push(`BM ${credential.bm_id}: ${accError?.message ?? "falha ao carregar contas"}`);
        continue;
      }

      for (const account of accounts) {
        summary.accountsChecked += 1;
        try {
          summary.objectsActioned += await evaluateRule(rule, account, credential.system_user_token);
        } catch (err) {
          const message = err instanceof Error ? err.message : "erro desconhecido";
          console.error(`[rules-engine] falha ao avaliar regra ${rule.id} na conta ${account.id}:`, err);
          summary.errors.push(`Conta ${account.id} (regra "${rule.name}"): ${message}`);
        }
      }
    }
  }

  return summary;
}
