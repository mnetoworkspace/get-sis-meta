import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface AccountDailyRow {
  id: string;
  ad_account_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number | null;
  frequency: number | null;
  inline_link_clicks: number | null;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  results: number | null;
  result_type: string | null;
  cost_per_result: number | null;
  ftd: number | null;
  cost_per_ftd: number | null;
  currency: string | null;
  ad_accounts: {
    name: string;
    currency: string | null;
    bm_id: string;
    business_managers: { name: string } | null;
  } | null;
}

function aggregateByBm(rows: AccountDailyRow[]) {
  const groups = new Map<
    string,
    {
      bm_id: string;
      bm_name: string;
      date: string;
      spend: number;
      impressions: number;
      clicks: number;
      results: number;
      hasResults: boolean;
      ftd: number;
      hasFtd: boolean;
      currency: string | null;
    }
  >();

  for (const row of rows) {
    const bmId = row.ad_accounts?.bm_id || "sem-bm";
    const bmName = row.ad_accounts?.business_managers?.name || bmId;
    const key = `${bmId}__${row.date}`;
    const existing = groups.get(key);
    const results = row.results ?? 0;
    const ftd = row.ftd ?? 0;

    if (existing) {
      existing.spend += Number(row.spend || 0);
      existing.impressions += Number(row.impressions || 0);
      existing.clicks += Number(row.clicks || 0);
      existing.results += results;
      existing.hasResults = existing.hasResults || row.results !== null;
      existing.ftd += ftd;
      existing.hasFtd = existing.hasFtd || row.ftd !== null;
    } else {
      groups.set(key, {
        bm_id: bmId,
        bm_name: bmName,
        date: row.date,
        spend: Number(row.spend || 0),
        impressions: Number(row.impressions || 0),
        clicks: Number(row.clicks || 0),
        results,
        hasResults: row.results !== null,
        ftd,
        hasFtd: row.ftd !== null,
        currency: row.currency,
      });
    }
  }

  return Array.from(groups.values())
    .map((g) => ({
      id: `${g.bm_id}__${g.date}`,
      bm_id: g.bm_id,
      date: g.date,
      spend: g.spend,
      impressions: g.impressions,
      clicks: g.clicks,
      cpc: g.clicks > 0 ? g.spend / g.clicks : null,
      cpm: g.impressions > 0 ? (g.spend / g.impressions) * 1000 : null,
      ctr: g.impressions > 0 ? (g.clicks / g.impressions) * 100 : null,
      results: g.hasResults ? g.results : null,
      cost_per_result: g.hasResults && g.results > 0 ? g.spend / g.results : null,
      ftd: g.hasFtd ? g.ftd : null,
      cost_per_ftd: g.hasFtd && g.ftd > 0 ? g.spend / g.ftd : null,
      currency: g.currency,
      ad_accounts: { name: g.bm_name, currency: g.currency, bm_id: g.bm_id, business_managers: { name: g.bm_name } },
    }))
    .sort((a, b) => (a.date === b.date ? a.bm_id.localeCompare(b.bm_id) : b.date.localeCompare(a.date)));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  const adAccountId = searchParams.get("ad_account_id");
  const bmId = searchParams.get("bm_id");
  const groupBy = searchParams.get("group_by") === "bm" ? "bm" : "account";

  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("insights_account_daily")
    .select("*, ad_accounts(name, currency, bm_id, business_managers(name))")
    .order("date", { ascending: false });

  if (since) query = query.gte("date", since);
  if (until) query = query.lte("date", until);
  if (adAccountId) query = query.eq("ad_account_id", adAccountId);

  const { data, error } = await query.returns<AccountDailyRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = data || [];
  if (bmId) rows = rows.filter((r) => r.ad_accounts?.bm_id === bmId);

  if (groupBy === "bm") {
    return NextResponse.json({ data: aggregateByBm(rows) });
  }

  return NextResponse.json({ data: rows });
}
