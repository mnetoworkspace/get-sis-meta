import { NextResponse } from "next/server";
import { createSupabaseAdminClient, fetchAllRows } from "@/lib/supabase";
import { bogotaDateBoundary, toBogotaDate } from "@/lib/payments";

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

  // dates -> methods -> {date -> {amount,count}} pra depois preencher com 0
  // (não null) as datas em que um método não teve nenhum depósito — é uma
  // contagem real de zero, não dado faltando.
  const datesByCurrency = new Map<string, Set<string>>();
  const methodsByCurrency = new Map<string, Map<string, { methodName: string; gateway: string }>>();
  const cells = new Map<string, Map<string, { amount: number; count: number }>>(); // key: `${currency}|${method}` -> date -> bucket

  for (const row of data) {
    const date = toBogotaDate(row.created_at);

    if (!datesByCurrency.has(row.currency)) datesByCurrency.set(row.currency, new Set());
    datesByCurrency.get(row.currency)!.add(date);

    if (!methodsByCurrency.has(row.currency)) methodsByCurrency.set(row.currency, new Map());
    methodsByCurrency.get(row.currency)!.set(row.payment_method, {
      methodName: row.payment_method_name,
      gateway: row.gateway,
    });

    const key = `${row.currency}|${row.payment_method}`;
    if (!cells.has(key)) cells.set(key, new Map());
    const byDate = cells.get(key)!;
    const bucket = byDate.get(date) || { amount: 0, count: 0 };
    bucket.amount += Number(row.amount || 0);
    bucket.count += 1;
    byDate.set(date, bucket);
  }

  const result: Record<
    string,
    {
      dates: string[];
      series: {
        method: string;
        methodName: string;
        gateway: string;
        points: { date: string; amount: number; count: number }[];
      }[];
    }
  > = {};

  for (const [currency, dateSet] of datesByCurrency) {
    const dates = Array.from(dateSet).sort();
    const methods = methodsByCurrency.get(currency) || new Map();

    const series = Array.from(methods.entries()).map(([method, meta]) => {
      const byDate = cells.get(`${currency}|${method}`) || new Map();
      return {
        method,
        methodName: meta.methodName,
        gateway: meta.gateway,
        points: dates.map((date) => {
          const b = byDate.get(date);
          return { date, amount: b?.amount ?? 0, count: b?.count ?? 0 };
        }),
      };
    });

    result[currency] = { dates, series };
  }

  return NextResponse.json({ data: result });
}
