import { NextResponse } from "next/server";
import { createSupabaseAdminClient, fetchAllRows } from "@/lib/supabase";
import { bogotaDateBoundary } from "@/lib/payments";

export const dynamic = "force-dynamic";

interface DepositRow {
  amount: number;
  currency: string;
  is_ftd: boolean;
  payment_method: string;
  payment_method_name: string;
  gateway: string;
  created_at: string;
  processed_at: string | null;
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
        .select("amount, currency, is_ftd, payment_method, payment_method_name, gateway, created_at, processed_at")
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

  interface Bucket {
    method: string;
    methodName: string;
    gateway: string;
    amount: number;
    count: number;
    ftdCount: number;
    approvalMinutesSum: number;
    approvalMinutesCount: number;
  }

  const byCurrency = new Map<string, Map<string, Bucket>>();

  for (const row of data) {
    if (!byCurrency.has(row.currency)) byCurrency.set(row.currency, new Map());
    const byMethod = byCurrency.get(row.currency)!;

    const bucket = byMethod.get(row.payment_method) || {
      method: row.payment_method,
      methodName: row.payment_method_name,
      gateway: row.gateway,
      amount: 0,
      count: 0,
      ftdCount: 0,
      approvalMinutesSum: 0,
      approvalMinutesCount: 0,
    };

    bucket.amount += Number(row.amount || 0);
    bucket.count += 1;
    if (row.is_ftd) bucket.ftdCount += 1;

    if (row.processed_at) {
      const minutes = (new Date(row.processed_at).getTime() - new Date(row.created_at).getTime()) / 60000;
      if (Number.isFinite(minutes) && minutes >= 0) {
        bucket.approvalMinutesSum += minutes;
        bucket.approvalMinutesCount += 1;
      }
    }

    byMethod.set(row.payment_method, bucket);
  }

  const result: Record<
    string,
    {
      method: string;
      methodName: string;
      gateway: string;
      amount: number;
      count: number;
      ftdCount: number;
      avgTicket: number;
      avgApprovalMinutes: number | null;
    }[]
  > = {};

  for (const [currency, byMethod] of byCurrency) {
    result[currency] = Array.from(byMethod.values())
      .map((b) => ({
        method: b.method,
        methodName: b.methodName,
        gateway: b.gateway,
        amount: b.amount,
        count: b.count,
        ftdCount: b.ftdCount,
        avgTicket: b.count > 0 ? b.amount / b.count : 0,
        avgApprovalMinutes: b.approvalMinutesCount > 0 ? b.approvalMinutesSum / b.approvalMinutesCount : null,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  return NextResponse.json({ data: result });
}
