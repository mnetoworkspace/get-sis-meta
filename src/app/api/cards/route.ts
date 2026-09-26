import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { toBrazilDateHour } from "@/lib/format";

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

  const cardsWithBalance = await Promise.all(
    cards.map(async (card) => {
      const relatedAccounts = accountsByFundingSource.get(card.funding_source) ?? [];
      const spendSince = await spendSinceCents(
        relatedAccounts.map((a) => a.id),
        card.balance_set_at,
      );
      return {
        ...card,
        current_balance_cents: card.balance_cents - spendSince,
        spend_since_cents: spendSince,
        accounts: relatedAccounts.map((a) => a.name),
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
