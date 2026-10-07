import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { nowHourInBrazil, todayISO, toBrazilDateHour } from "@/lib/format";
import { recentAvgCentsPerHour } from "@/lib/pacing";

export const dynamic = "force-dynamic";

interface CardRow {
  id: string;
  funding_source: string;
  currency: string | null;
  balance_cents: number;
  balance_set_at: string;
  low_balance_threshold_cents: number | null;
}

interface AccountRow {
  id: string;
  name: string;
  funding_source: string | null;
  currency: string | null;
}

interface HourlyRow {
  hour: number;
  spend: number;
}

interface DailyRow {
  spend: number;
}

// Saldo do cartão é "carteira pré-paga": a pessoa informa o saldo quando
// recarrega (balance_cents/balance_set_at) e aqui a gente desconta o gasto
// real sincronizado desde então — soma o gasto de TODAS as contas que usam
// esse mesmo cartão (funding_source). Usa dado por hora só no dia exato da
// recarga (só conta as horas depois do momento em que recarregou) e dado
// diário pros dias seguintes inteiros — mesma técnica já usada na previsão
// de gasto do dia.
async function spendSinceCents(accountIds: string[], balanceSetAt: string): Promise<number> {
  if (accountIds.length === 0) return 0;
  const supabase = createSupabaseAdminClient();
  const { date: splitDate, hour: splitHour } = toBrazilDateHour(balanceSetAt);

  const [{ data: hourlyRows }, { data: dailyRows }] = await Promise.all([
    supabase
      .from("insights_account_hourly")
      .select("hour, spend")
      .in("ad_account_id", accountIds)
      .eq("date", splitDate)
      .gte("hour", splitHour)
      .returns<HourlyRow[]>(),
    supabase
      .from("insights_account_daily")
      .select("spend")
      .in("ad_account_id", accountIds)
      .gt("date", splitDate)
      .returns<DailyRow[]>(),
  ]);

  const hourlySum = (hourlyRows ?? []).reduce((sum, r) => sum + Number(r.spend || 0), 0);
  const dailySum = (dailyRows ?? []).reduce((sum, r) => sum + Number(r.spend || 0), 0);
  return Math.round((hourlySum + dailySum) * 100);
}

interface DepletionEstimate {
  pace_cents_per_hour: number;
  hours_until_empty: number | null;
  estimated_empty_at: string | null;
  already_empty: boolean;
}

// Previsão de quando o saldo do cartão deve zerar: pega o ritmo real de
// gasto das últimas horas fechadas de HOJE (mesma técnica da previsão de
// gasto diário, ver lib/pacing.ts) somado entre todas as contas que usam
// esse cartão, e projeta quantas horas o saldo atual aguenta nesse ritmo.
// É só uma extrapolação do ritmo recente, não considera orçamento
// configurado nem mudança de ritmo ao longo do dia — contas paradas ou sem
// gasto nas últimas horas entram com ritmo zero (não é descartada, só não
// empurra a previsão).
async function estimateDepletion(accountIds: string[], currentBalanceCents: number, currentHour: number): Promise<DepletionEstimate> {
  if (currentBalanceCents <= 0) {
    return { pace_cents_per_hour: 0, hours_until_empty: null, estimated_empty_at: null, already_empty: true };
  }
  if (accountIds.length === 0) {
    return { pace_cents_per_hour: 0, hours_until_empty: null, estimated_empty_at: null, already_empty: false };
  }

  const supabase = createSupabaseAdminClient();
  const { data: hourlyRows } = await supabase
    .from("insights_account_hourly")
    .select("hour, spend")
    .in("ad_account_id", accountIds)
    .eq("date", todayISO())
    .returns<HourlyRow[]>();

  // Soma hora a hora entre contas (não dá pra usar recentAvgCentsPerHour
  // direto em cada conta e depois somar as médias — precisa agregar o
  // gasto por hora primeiro pra não distorcer o ritmo combinado).
  const spendByHour = new Map<number, number>();
  for (const row of hourlyRows ?? []) {
    spendByHour.set(row.hour, (spendByHour.get(row.hour) || 0) + Number(row.spend || 0));
  }
  const combinedRows = Array.from(spendByHour.entries()).map(([hour, spend]) => ({ hour, spend }));

  const pace = recentAvgCentsPerHour(combinedRows, currentHour);
  if (pace <= 0) {
    return { pace_cents_per_hour: 0, hours_until_empty: null, estimated_empty_at: null, already_empty: false };
  }

  const hoursUntilEmpty = currentBalanceCents / pace;
  const estimatedEmptyAt = new Date(Date.now() + hoursUntilEmpty * 3_600_000).toISOString();

  return { pace_cents_per_hour: pace, hours_until_empty: hoursUntilEmpty, estimated_empty_at: estimatedEmptyAt, already_empty: false };
}

export async function GET() {
  const supabase = createSupabaseAdminClient();

  const [{ data: cards, error: cardsError }, { data: accounts, error: accountsError }] = await Promise.all([
    supabase.from("cards").select("*").order("funding_source").returns<CardRow[]>(),
    supabase
      .from("ad_accounts")
      .select("id, name, funding_source, currency")
      .eq("is_active", true)
      .returns<AccountRow[]>(),
  ]);

  if (cardsError || !cards) {
    return NextResponse.json({ error: cardsError?.message ?? "falha ao carregar cartões" }, { status: 500 });
  }
  if (accountsError || !accounts) {
    return NextResponse.json({ error: accountsError?.message ?? "falha ao carregar contas" }, { status: 500 });
  }

  const accountsByFundingSource = new Map<string, AccountRow[]>();
  for (const acc of accounts) {
    if (!acc.funding_source) continue;
    const list = accountsByFundingSource.get(acc.funding_source) ?? [];
    list.push(acc);
    accountsByFundingSource.set(acc.funding_source, list);
  }

  const currentHour = nowHourInBrazil();

  const cardsWithBalance = await Promise.all(
    cards.map(async (card) => {
      const relatedAccounts = accountsByFundingSource.get(card.funding_source) ?? [];
      const accountIds = relatedAccounts.map((a) => a.id);
      const spendSince = await spendSinceCents(accountIds, card.balance_set_at);
      const currentBalanceCents = card.balance_cents - spendSince;
      const depletion = await estimateDepletion(accountIds, currentBalanceCents, currentHour);
      return {
        ...card,
        current_balance_cents: currentBalanceCents,
        spend_since_cents: spendSince,
        accounts: relatedAccounts.map((a) => a.name),
        depletion,
      };
    }),
  );

  // Cartões que aparecem em alguma conta mas ainda não foram cadastrados —
  // pra UI oferecer "configurar saldo" direto.
  const registeredSources = new Set(cards.map((c) => c.funding_source));
  const unregistered = Array.from(accountsByFundingSource.entries())
    .filter(([source]) => !registeredSources.has(source))
    .map(([source, accs]) => ({
      funding_source: source,
      currency: accs[0]?.currency ?? null,
      accounts: accs.map((a) => a.name),
    }));

  return NextResponse.json({ data: cardsWithBalance, unregistered });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { funding_source, amount, currency, low_balance_threshold, note } = body;

  if (!funding_source || typeof funding_source !== "string") {
    return NextResponse.json({ error: "funding_source é obrigatório" }, { status: 400 });
  }
  const amountCents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    return NextResponse.json({ error: "informe um valor de recarga válido" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const thresholdCents =
    low_balance_threshold !== undefined && low_balance_threshold !== null && low_balance_threshold !== ""
      ? Math.round(Number(low_balance_threshold) * 100)
      : null;

  const { data: card, error: upsertError } = await supabase
    .from("cards")
    .upsert(
      {
        funding_source,
        currency: currency || null,
        balance_cents: amountCents,
        balance_set_at: new Date().toISOString(),
        low_balance_threshold_cents: thresholdCents,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "funding_source" },
    )
    .select()
    .single();

  if (upsertError || !card) {
    return NextResponse.json({ error: upsertError?.message ?? "falha ao salvar cartão" }, { status: 500 });
  }

  const { error: historyError } = await supabase.from("card_reloads").insert({
    card_id: card.id,
    amount_cents: amountCents,
    note: note || null,
  });
  if (historyError) {
    console.error("[cards] falha ao registrar histórico de recarga:", historyError);
  }

  return NextResponse.json({ ok: true, data: card });
}
