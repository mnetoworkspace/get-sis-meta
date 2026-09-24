import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

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

  let query = supabase
    .from("deposits")
    .select("created_at, amount, currency, status, is_ftd")
    .eq("status", "COMPLETED")
    .eq("test_user", false);

  if (since) query = query.gte("created_at", `${since}T00:00:00`);
  if (until) query = query.lte("created_at", `${until}T23:59:59`);

  const { data, error } = await query.returns<DepositRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byCurrencyDate = new Map<string, Map<string, { amount: number; count: number; ftdCount: number }>>();

  for (const row of data || []) {
    const date = row.created_at.slice(0, 10);
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
