import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface DepositRow {
  created_at: string;
  amount: number;
  currency: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const until = searchParams.get("until");

  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("deposits")
    .select("created_at, amount, currency")
    .eq("status", "COMPLETED")
    .eq("test_user", false);

  if (since) query = query.gte("created_at", `${since}T00:00:00`);
  if (until) query = query.lte("created_at", `${until}T23:59:59`);

  const { data, error } = await query.returns<DepositRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byCurrency = new Map<string, { amount: number; count: number }[]>();

  for (const row of data || []) {
    if (!byCurrency.has(row.currency)) {
      byCurrency.set(
        row.currency,
        Array.from({ length: 24 }, () => ({ amount: 0, count: 0 })),
      );
    }
    const hour = new Date(row.created_at).getUTCHours();
    const buckets = byCurrency.get(row.currency)!;
    buckets[hour].amount += Number(row.amount || 0);
    buckets[hour].count += 1;
  }

  const result: Record<string, { hour: number; amount: number; count: number }[]> = {};
  for (const [currency, buckets] of byCurrency) {
    result[currency] = buckets.map((b, hour) => ({ hour, ...b }));
  }

  return NextResponse.json({ data: result, currencies: Array.from(byCurrency.keys()) });
}
