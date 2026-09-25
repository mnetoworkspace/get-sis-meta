import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  fetchObjectDailyInsights,
  fetchObjectLifetimeInsights,
  fetchObjectStatus,
  setObjectStatus,
  fetchObjectBudget,
  setObjectBudget,
  objectIdFromInsight,
  objectNameFromInsight,
  type ObjectInsight,
  type RuleScope,
} from "@/lib/meta";
import { pickFtd, pickResult } from "@/lib/results";
import { fetchExchangeRate } from "@/lib/fx";
import { sendPushToAll } from "@/lib/push/send";
import { todayISO } from "@/lib/format";
import { evaluateGroup, isBudgetAction, type RuleMetrics } from "@/lib/automation/rule-types";
import { notificationDecision } from "@/lib/notifications/settings";
import type { AdAccount, AutomationRule, MetaCredential } from "@/types/db";

const PAUSED_STATUSES = new Set(["PAUSED", "ARCHIVED", "DELETED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"]);
const ACTIVE_STATUSES = new Set(["ACTIVE"]);

// Nunca deixa um ajuste automático de orçamento derrubar o valor abaixo
// disso (R$ 5,00, em centavos) — trava de segurança contra regra mal
// configurada zerar o orçamento sem querer.
const MIN_BUDGET_CENTS = 500;

const SCOPE_LABEL: Record<RuleScope, string> = {
  campaign: "Campanha",
  adset: "Conjunto",
  ad: "Anúncio",
};

function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === "23505";
}

interface BudgetTarget {
  targetId: string;
  field: "daily_budget" | "lifetime_budget";
  currentCents: number;
  fellBackToCampaign: boolean;
}

// Acha ONDE o orçamento de verdade está. Um conjunto sem orçamento próprio
// normalmente significa que a campanha dele usa orçamento otimizado (CBO)
// — o valor real está na campanha, não no conjunto. Sem esse fallback, uma
// regra de orçamento nível "conjunto" numa campanha CBO nunca encontraria
// nada pra ajustar e ficaria silenciosamente inútil (sem erro, sem
// notificação — pior tipo de falha).
async function resolveBudgetTarget(
  objectId: string,
  scope: RuleScope,
  campaignId: string | undefined,
  token: string,
): Promise<BudgetTarget | null> {
  const own = await fetchObjectBudget(objectId, token);
  if (own.daily_budget != null) {
    return { targetId: objectId, field: "daily_budget", currentCents: Number(own.daily_budget), fellBackToCampaign: false };
  }
  if (own.lifetime_budget != null) {
    return { targetId: objectId, field: "lifetime_budget", currentCents: Number(own.lifetime_budget), fellBackToCampaign: false };
  }

  if (scope === "adset" && campaignId) {
    const campaign = await fetchObjectBudget(campaignId, token);
    if (campaign.daily_budget != null) {
      return { targetId: campaignId, field: "daily_budget", currentCents: Number(campaign.daily_budget), fellBackToCampaign: true };
    }
    if (campaign.lifetime_budget != null) {
      return {
        targetId: campaignId,
        field: "lifetime_budget",
        currentCents: Number(campaign.lifetime_budget),
        fellBackToCampaign: true,
      };
    }
  }

  return null;
}

// Calcula o novo valor e aplica — recebe o alvo já resolvido (objeto ou a
// campanha, no caso de fallback de CBO) pra não precisar buscar o
// orçamento de novo.
async function applyBudgetAdjustment(rule: AutomationRule, target: BudgetTarget, token: string): Promise<string | null> {
  const { currentCents, field, fellBackToCampaign } = target;
  if (!Number.isFinite(currentCents) || currentCents <= 0) return null;

  const adjustmentValue = rule.budget_adjustment_value ?? 0;
  if (adjustmentValue <= 0) return null;

  const deltaCents =
    rule.budget_adjustment_type === "percentage" ? currentCents * (adjustmentValue / 100) : adjustmentValue * 100;

  const rawNewCents = rule.action === "increase_budget" ? currentCents + deltaCents : currentCents - deltaCents;
  const newCents = Math.max(MIN_BUDGET_CENTS, Math.round(rawNewCents));
  if (newCents === currentCents) return null;

  await setObjectBudget(target.targetId, field, newCents, token);

  const fieldLabel = field === "daily_budget" ? "diário" : "vitalício";
  const note = fellBackToCampaign
    ? " (conjunto está numa campanha com orçamento otimizado/CBO, sem orçamento próprio — ajustei o orçamento da campanha)"
    : "";
  return `Orçamento ${fieldLabel} de R$ ${(currentCents / 100).toFixed(2)} para R$ ${(newCents / 100).toFixed(2)}.${note}`;
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
  const { enabled: pushEnabled, silent } = await notificationDecision("rules");

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

    // Pra ações de orçamento, resolve ANTES do dedupe qual objeto vai ser
    // alterado de verdade — se cair no fallback de campanha (CBO), o
    // dedupe precisa ser pela campanha, não pelo conjunto, senão N
    // conjuntos da mesma campanha CBO cada um dispararia um ajuste
    // separado nela dentro da mesma checagem.
    let budgetTarget: BudgetTarget | null = null;
    if (isBudgetAction(rule.action)) {
      budgetTarget = await resolveBudgetTarget(objectId, rule.scope, row.campaign_id, token);
      if (!budgetTarget) continue; // nem o objeto nem a campanha (fallback) têm orçamento próprio
    }

    const dedupeObjectId = budgetTarget ? budgetTarget.targetId : objectId;
    const dedupeSuffix = rule.time_window === "lifetime" ? "lifetime" : todayISO();
    const dedupeKey = `RULE_${rule.action.toUpperCase()}:${rule.id}:${dedupeObjectId}:${dedupeSuffix}`;

    // Registra a tentativa ANTES de agir, pra nunca reavaliar o mesmo alvo
    // duas vezes no mesmo dia — economiza chamada de API e evita ação/
    // notificação repetida (crítico pra orçamento: sem isso, cada checagem
    // de 5 min aumentaria/diminuiria de novo).
    const { error: insertError } = await supabase.from("notifications").insert({
      type: `rule_${rule.action}`,
      title: `${SCOPE_LABEL[rule.scope]} · ${objectName}`,
      body: `Regra "${rule.name}".`,
      metadata: {
        rule_id: rule.id,
        scope: rule.scope,
        action: rule.action,
        object_id: objectId,
        object_name: objectName,
        budget_target_id: budgetTarget?.targetId,
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
      let description: string;

      if (budgetTarget) {
        const result = await applyBudgetAdjustment(rule, budgetTarget, token);
        if (!result) continue; // delta zerado ou orçamento atual inválido
        description = result;
      } else {
        const status = await fetchObjectStatus(objectId, token);
        const alreadyDone = rule.action === "pause" ? PAUSED_STATUSES.has(status) : ACTIVE_STATUSES.has(status);
        if (alreadyDone) continue;
        // Não reativa algo apagado/arquivado — só o que está genuinamente pausado.
        if (rule.action === "activate" && (status === "DELETED" || status === "ARCHIVED")) continue;

        await setObjectStatus(objectId, rule.action === "pause" ? "PAUSED" : "ACTIVE", token);
        description = rule.action === "pause" ? "Pausado." : "Ativado.";
      }

      actioned += 1;

      if (pushEnabled) {
        const emoji =
          rule.action === "pause" ? "⏸️" : rule.action === "activate" ? "▶️" : rule.action === "increase_budget" ? "📈" : "📉";
        await sendPushToAll({
          title: `${emoji} Regra aplicada automaticamente`,
          body: `${SCOPE_LABEL[rule.scope]} "${objectName}" — "${rule.name}". ${description}`,
          url: "/",
          silent,
        });
      }
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
