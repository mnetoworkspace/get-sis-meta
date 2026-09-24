import { NextResponse } from "next/server";
import { createSupabaseAdminClient, fetchAllRows } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface HourlyRow {
  ad_account_id: string;
  date: string;
  hour: number;
  spend: number;
  impressions: number;
  clicks: number;
  results: number | null;
  currency: string | null;
  ad_accounts: { bm_id: string } | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  const adAccountId = searchParams.get("ad_account_id");
  const bmId = searchParams.get("bm_id");

  const supabase = createSupabaseAdminClient();

  let rows: HourlyRow[];
  try {
    rows = await fetchAllRows<HourlyRow>((from, to) => {
      let query = supabase.from("insights_account_hourly").select("*, ad_accounts(bm_id)");

      if (since) query = query.gte("date", since);
      if (until) query = query.lte("date", until);
      if (adAccountId) query = query.eq("ad_account_id", adAccountId);

      return query.range(from, to).returns<HourlyRow[]>();
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (bmId) rows = rows.filter((r) => r.ad_accounts?.bm_id === bmId);

  // Agrega por hora do dia (0-23), somando todas as datas/contas do período.
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    spend: 0,
    impressions: 0,
    clicks: 0,
    results: 0,
    hasResults: false,
  }));

  for (const row of rows) {
    const bucket = buckets[row.hour];
    if (!bucket) continue;
    bucket.spend += Number(row.spend || 0);
    bucket.impressions += Number(row.impressions || 0);
    bucket.clicks += Number(row.clicks || 0);
    if (row.results != null) {
      bucket.results += row.results;
      bucket.hasResults = true;
    }
  }

  const currency = rows[0]?.currency ?? null;

  return NextResponse.json({
    data: buckets.map((b) => ({
      hour: b.hour,
      spend: b.spend,
      impressions: b.impressions,
      clicks: b.clicks,
      results: b.hasResults ? b.results : null,
    })),
    currency,
  });
}
