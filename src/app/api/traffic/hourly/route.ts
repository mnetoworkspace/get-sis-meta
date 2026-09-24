import { NextResponse } from "next/server";
import { createSupabaseAdminClient, fetchAllRows } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface TrafficRow {
  date: string;
  hour: number;
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
      let query = supabase.from("traffic_hourly").select("date, hour, visits, pageviews");
      if (since) query = query.gte("date", since);
      if (until) query = query.lte("date", until);
      return query.range(from, to).returns<TrafficRow[]>();
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, visits: 0, pageviews: 0 }));

  for (const row of data) {
    const bucket = buckets[row.hour];
    if (!bucket) continue;
    bucket.visits += Number(row.visits || 0);
    bucket.pageviews += Number(row.pageviews || 0);
  }

  return NextResponse.json({ data: buckets });
}
