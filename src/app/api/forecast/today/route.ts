import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { fetchActiveAdSetsWithBudget, fetchActiveCampaignsWithBudget, MetaApiError } from "@/lib/meta";
import { nowHourInBrazil, todayISO } from "@/lib/format";
import type { AdAccount, MetaCredential } from "@/types/db";

export const dynamic = "force-dynamic";

interface HourlySpendRow {
  hour: number;
  spend: number;
}

interface AccountForecast {
  ad_account_id: string;
  ad_account_name: string;
  currency: string | null;
  ceiling_cents: number;
  spend_today_cents: number;
  projection_cents: number;
  lifetime_only_objects: number;
}

// Previsão de gasto do dia, com dois números:
// - "teto": soma dos orçamentos diários de campanhas/conjuntos ATIVOS, em
//   contas com status ACTIVE de verdade (uma conta com falha de pagamento
//   ou desabilitada não gasta nada, mesmo que a campanha dentro dela
//   apareça como ativa — não entra na soma).
// - "projeção": gasto já feito hoje + estimativa do que falta, baseada no
//   ritmo real de gasto das últimas horas de HOJE (não um histórico de
//   dias) — assim uma campanha recém-ativada não infla a projeção, porque
//   ela ainda não tem gasto recente que sustente uma extrapolação alta.
//   Nunca ultrapassa o teto (não faz sentido prever mais do que o
//   orçamento permite gastar).
export async function GET() {
  const supabase = createSupabaseAdminClient();

  const { data: accounts, error: accError } = await supabase
    .from("ad_accounts")
    .select("*")
    .eq("is_active", true)
    .eq("status", "ACTIVE")
    .returns<AdAccount[]>();

  if (accError || !accounts) {
    return NextResponse.json({ error: accError?.message ?? "falha ao carregar contas" }, { status: 500 });
  }

  const { data: credentials, error: credError } = await supabase
    .from("meta_credentials")
    .select("*")
    .returns<MetaCredential[]>();

  if (credError || !credentials) {
    return NextResponse.json({ error: credError?.message ?? "falha ao carregar credenciais" }, { status: 500 });
  }
  const tokenByBm = new Map(credentials.map((c) => [c.bm_id, c.system_user_token]));

  const today = todayISO();
  const currentHour = nowHourInBrazil();
  const hoursRemaining = Math.max(0, 24 - currentHour);

  const errors: string[] = [];

  const results = await Promise.all(
    accounts.map(async (account): Promise<AccountForecast | null> => {
      const token = tokenByBm.get(account.bm_id);
      if (!token) return null;

      let campaigns, adsets;
      try {
        [campaigns, adsets] = await Promise.all([
          fetchActiveCampaignsWithBudget(account.id, token),
          fetchActiveAdSetsWithBudget(account.id, token),
        ]);
      } catch (err) {
        const message = err instanceof MetaApiError ? err.message : err instanceof Error ? err.message : "erro desconhecido";
        errors.push(`${account.name}: ${message}`);
        return null;
      }

      const campaignIdsWithOwnBudget = new Set(campaigns.filter((c) => c.daily_budget != null).map((c) => c.id));

      let ceilingCents = 0;
      let lifetimeOnlyObjects = 0;

      for (const c of campaigns) {
        if (c.daily_budget != null) ceilingCents += Number(c.daily_budget);
        else if (c.lifetime_budget != null) lifetimeOnlyObjects += 1;
      }
      for (const a of adsets) {
        if (campaignIdsWithOwnBudget.has(a.campaign_id)) continue; // já contado na campanha (CBO)
        if (a.daily_budget != null) ceilingCents += Number(a.daily_budget);
        else if (a.lifetime_budget != null) lifetimeOnlyObjects += 1;
      }

      const { data: hourlyRows } = await supabase
        .from("insights_account_hourly")
        .select("hour, spend")
        .eq("ad_account_id", account.id)
        .eq("date", today)
        .returns<HourlySpendRow[]>();

      const rows = hourlyRows ?? [];
      const spendTodayCents = Math.round(rows.reduce((sum, r) => sum + Number(r.spend || 0), 0) * 100);

      // Ritmo recente: média das últimas horas já fechadas de hoje (até 3),
      // não um histórico de dias — uma campanha nova ainda não tem gasto
      // recente que sustente uma extrapolação alta.
      const recentHours = rows
        .filter((r) => r.hour < currentHour)
        .sort((a, b) => b.hour - a.hour)
        .slice(0, 3);
      const recentAvgCentsPerHour =
        recentHours.length > 0
          ? Math.round((recentHours.reduce((sum, r) => sum + Number(r.spend || 0), 0) / recentHours.length) * 100)
          : 0;

      const headroomCents = Math.max(0, ceilingCents - spendTodayCents);
      const projectedRemainingCents = Math.min(recentAvgCentsPerHour * hoursRemaining, headroomCents);
      const projectionCents = spendTodayCents + Math.max(0, projectedRemainingCents);

      return {
        ad_account_id: account.id,
        ad_account_name: account.name,
        currency: account.currency,
        ceiling_cents: ceilingCents,
        spend_today_cents: spendTodayCents,
        projection_cents: projectionCents,
        lifetime_only_objects: lifetimeOnlyObjects,
      };
    }),
  );

  const perAccount = results.filter((r): r is AccountForecast => r !== null);

  const byCurrency = new Map<
    string,
    { ceiling_cents: number; spend_today_cents: number; projection_cents: number; lifetime_only_objects: number }
  >();
  for (const r of perAccount) {
    const currency = r.currency || "—";
    const bucket = byCurrency.get(currency) || {
      ceiling_cents: 0,
      spend_today_cents: 0,
      projection_cents: 0,
      lifetime_only_objects: 0,
    };
    bucket.ceiling_cents += r.ceiling_cents;
    bucket.spend_today_cents += r.spend_today_cents;
    bucket.projection_cents += r.projection_cents;
    bucket.lifetime_only_objects += r.lifetime_only_objects;
    byCurrency.set(currency, bucket);
  }

  return NextResponse.json({
    hour: currentHour,
    totals: Object.fromEntries(byCurrency),
    accounts: perAccount,
    errors,
  });
}
