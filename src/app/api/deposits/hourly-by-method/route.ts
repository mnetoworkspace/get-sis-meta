import { NextResponse } from "next/server";
import { createSupabaseAdminClient, fetchAllRows } from "@/lib/supabase";
import { bogotaDateBoundary, toBogotaHour } from "@/lib/payments";

export const dynamic = "force-dynamic";

interface DepositRow {
  amount: number;
  currency: string;
  payment_method: string;
  payment_method_name: string;
  gateway: string;
  created_at: string;
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
        .select("amount, currency, payment_method, payment_method_name, gateway, created_at")
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

  const methodsByCurrency = new Map<string, Map<string, { methodName: string; gateway: string }>>();
  const cells = new Map<string, { amount: number; count: number }[]>(); // key: `${currency}|${method}` -> 24 buckets

  for (const row of data) {
    if (!methodsByCurrency.has(row.currency)) methodsByCurrency.set(row.currency, new Map());
    methodsByCurrency.get(row.currency)!.set(row.payment_method, {
      methodName: row.payment_method_name,
      gateway: row.gateway,
    });

    const key = `${row.currency}|${row.payment_method}`;
    if (!cells.has(key)) cells.set(key, Array.from({ length: 24 }, () => ({ amount: 0, count: 0 })));
    const hour = toBogotaHour(row.created_at);
    const buckets = cells.get(key)!;
    buckets[hour].amount += Number(row.amount || 0);
    buckets[hour].count += 1;
  }

  const result: Record<
    string,
    {
      series: {
        method: string;
        methodName: string;
        gateway: string;
        points: { hour: number; amount: number; count: number }[];
      }[];
    }
  > = {};

  for (const [currency, methods] of methodsByCurrency) {
    const series = Array.from(methods.entries()).map(([method, meta]) => {
      const buckets = cells.get(`${currency}|${method}`) || Array.from({ length: 24 }, () => ({ amount: 0, count: 0 }));
      return {
        method,
        methodName: meta.methodName,
        gateway: meta.gateway,
        points: buckets.map((b, hour) => ({ hour, amount: b.amount, count: b.count })),
      };
    });
    result[currency] = { series };
  }

  return NextResponse.json({ data: result });
}
