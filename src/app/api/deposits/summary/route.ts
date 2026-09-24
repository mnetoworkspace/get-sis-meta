import { NextResponse } from "next/server";
import { createSupabaseAdminClient, fetchAllRows } from "@/lib/supabase";
import { bogotaDateBoundary } from "@/lib/payments";

export const dynamic = "force-dynamic";

interface DepositRow {
  amount: number;
  currency: string;
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
        .select("amount, currency, is_ftd")
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

  const byCurrency = new Map<string, { amount: number; count: number; ftdCount: number }>();
  for (const row of data) {
    const bucket = byCurrency.get(row.currency) || { amount: 0, count: 0, ftdCount: 0 };
    bucket.amount += Number(row.amount || 0);
    bucket.count += 1;
    if (row.is_ftd) bucket.ftdCount += 1;
    byCurrency.set(row.currency, bucket);
  }

  const result = Array.from(byCurrency.entries()).map(([currency, b]) => ({
    currency,
    amount: b.amount,
    count: b.count,
    ftdCount: b.ftdCount,
    avgTicket: b.count > 0 ? b.amount / b.count : 0,
  }));

  return NextResponse.json({ data: result });
}
