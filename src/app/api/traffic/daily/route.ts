import { NextResponse } from "next/server";
import { createSupabaseAdminClient, fetchAllRows } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface TrafficRow {
  date: string;
  visits: number;
  pageviews: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const until = searchParams.get("until");

  const supabase = createSupabaseAdminClient();

  let data: TrafficRow[];
  try {
    data = await fetchAllRows<TrafficRow>((from, to) => {
      let query = supabase.from("traffic_hourly").select("date, visits, pageviews");
      if (since) query = query.gte("date", since);
      if (until) query = query.lte("date", until);
      return query.range(from, to).returns<TrafficRow[]>();
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const byDate = new Map<string, { date: string; visits: number; pageviews: number }>();
  for (const row of data) {
    const existing = byDate.get(row.date);
    if (existing) {
      existing.visits += Number(row.visits || 0);
      existing.pageviews += Number(row.pageviews || 0);
    } else {
      byDate.set(row.date, { date: row.date, visits: Number(row.visits || 0), pageviews: Number(row.pageviews || 0) });
    }
  }

  return NextResponse.json({
    data: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
  });
}
