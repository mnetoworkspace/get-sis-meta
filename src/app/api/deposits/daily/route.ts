import { NextResponse } from "next/server";
import { createSupabaseAdminClient, fetchAllRows } from "@/lib/supabase";
import { bogotaDateBoundary, toBogotaDate } from "@/lib/payments";

export const dynamic = "force-dynamic";

interface DepositRow {
  created_at: string;
  amount: number;
  currency: string;
  status: string;
  is_ftd: boolean;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const until = searchParams.get("until");

  const supabase = createSupabaseAdminClient();

  let data: DepositRow[];
  try {
    data = await fetchAllRows<DepositRow>((from, to) => {
      let query = supabase
        .from("deposits")
        .select("created_at, amount, currency, status, is_ftd")
        .eq("status", "COMPLETED")
        .eq("test_user", false);

      if (since) query = query.gte("created_at", bogotaDateBoundary(since, false));
      if (until) query = query.lte("created_at", bogotaDateBoundary(until, true));

      return query.range(from, to).returns<DepositRow[]>();
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const byCurrencyDate = new Map<string, Map<string, { amount: number; count: number; ftdCount: number }>>();

  for (const row of data) {
    const date = toBogotaDate(row.created_at);
    if (!byCurrencyDate.has(row.currency)) byCurrencyDate.set(row.currency, new Map());
    const byDate = byCurrencyDate.get(row.currency)!;
    const bucket = byDate.get(date) || { amount: 0, count: 0, ftdCount: 0 };
    bucket.amount += Number(row.amount || 0);
    bucket.count += 1;
    if (row.is_ftd) bucket.ftdCount += 1;
    byDate.set(date, bucket);
  }

  const result: Record<string, { date: string; amount: number; count: number; ftdCount: number }[]> = {};
  for (const [currency, byDate] of byCurrencyDate) {
    result[currency] = Array.from(byDate.entries())
      .map(([date, b]) => ({ date, ...b }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return NextResponse.json({ data: result, currencies: Array.from(byCurrencyDate.keys()) });
}
