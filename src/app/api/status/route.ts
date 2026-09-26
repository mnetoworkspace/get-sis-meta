import { NextResponse } from "next/server";
import { createSupabaseAdminClient, fetchAllRows } from "@/lib/supabase";
import { daysAgoISO, todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

interface DailySpendRow {
  ad_account_id: string;
  spend: number;
  currency: string | null;
}

// Visão dedicada pro painel de status (BM + contas) — separado de
// /api/bms (que é usado pelo CRUD de gerenciar BMs/contas) pra não mexer
// no formato que o AdminPanel já espera. Inclui gasto no período (pra dar
// um panorama financeiro, não só operacional) e o cartão/fonte de
// pagamento cadastrado em cada conta.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since") || daysAgoISO(30);
  const until = searchParams.get("until") || todayISO();

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("business_managers")
    .select(
      "id, name, is_active, meta_status, meta_status_detail, status_checked_at, ad_accounts(id, name, status, is_active, currency, funding_source)",
    )
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let spendRows: DailySpendRow[];
  try {
    spendRows = await fetchAllRows<DailySpendRow>((from, to) =>
      supabase
        .from("insights_account_daily")
        .select("ad_account_id, spend, currency")
        .gte("date", since)
        .lte("date", until)
        .range(from, to)
        .returns<DailySpendRow[]>(),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const spendByAccount = new Map<string, number>();
  for (const row of spendRows) {
    spendByAccount.set(row.ad_account_id, (spendByAccount.get(row.ad_account_id) || 0) + Number(row.spend || 0));
  }

  const enriched = (data || []).map((bm) => ({
    ...bm,
    ad_accounts: (bm.ad_accounts as { id: string }[]).map((acc) => ({
      ...acc,
      spend: spendByAccount.get(acc.id) || 0,
    })),
  }));

  return NextResponse.json({ data: enriched, since, until });
}
